import {
    CloudFormationCustomResourceCreateEvent,
    CloudFormationCustomResourceDeleteEvent,
    CloudFormationCustomResourceEvent,
    CloudFormationCustomResourceResponse,
    CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import * as AWS from 'aws-sdk';

function* getIpAddresses(networkInterfaces: AWS.EC2.NetworkInterfaceList): Generator<string> {
    for (const i of networkInterfaces) {
        if (i.PrivateIpAddresses) {
            for (const ip of i.PrivateIpAddresses) {
                if (ip.PrivateIpAddress) {
                    yield ip.PrivateIpAddress;
                }
            }
        }
    }
}

// https://aws.amazon.com/premiumsupport/knowledge-center/elb-find-load-balancer-IP/
export const getNLBIpAddresses = async (loadBalancerArn: string): Promise<string[]> => {
    const loadBalancerName = loadBalancerArn.split(':')[5].substr(13, loadBalancerArn.length);
    const ec2 = new AWS.EC2();
    const response = await ec2
        .describeNetworkInterfaces({
            Filters: [
                {
                    Name: 'description',
                    Values: [`ELB ${loadBalancerName}`],
                },
            ],
        })
        .promise();
    if (!response.NetworkInterfaces) {
        return [];
    }
    return [...getIpAddresses(response.NetworkInterfaces)];
};

export const generateIpPermissions = (ipAddresses: string[], port: string): any => [
    {
        IpProtocol: 'tcp',
        FromPort: port,
        ToPort: port,
        IpRanges: ipAddresses.map((x) => ({
            CidrIp: `${x}/32`,
            Description: `Allow access from Network Load Balancer`,
        })),
    },
];

export const onCreate = async (event: CloudFormationCustomResourceCreateEvent): Promise<CloudFormationCustomResourceResponse> => {
    const securityGroupId = event.ResourceProperties.ServiceSecurityGroupId;
    const loadBalancerArn = event.ResourceProperties.LoadBalancerArn;
    const port = event.ResourceProperties.Port;
    const ipAddresses = await getNLBIpAddresses(loadBalancerArn);
    const ec2 = new AWS.EC2();
    await ec2.authorizeSecurityGroupIngress({
        GroupId: securityGroupId,
        IpPermissions: generateIpPermissions(ipAddresses, port),
    }).promise();
    return {
        Status: 'SUCCESS',
        PhysicalResourceId: `${securityGroupId} ${loadBalancerArn}`,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
    };
};

// no-op
export const onDelete = async (event: CloudFormationCustomResourceDeleteEvent): Promise<CloudFormationCustomResourceResponse> => {
    const securityGroupId = event.ResourceProperties.ServiceSecurityGroupId;
    const loadBalancerArn = event.ResourceProperties.LoadBalancerArn;
    const port = event.ResourceProperties.Port;
    const ipAddresses = await getNLBIpAddresses(loadBalancerArn);
    const ec2 = new AWS.EC2();
    await ec2.revokeSecurityGroupIngress({
        GroupId: securityGroupId,
        IpPermissions: generateIpPermissions(ipAddresses, port),
    }).promise();
    return {
        Status: 'SUCCESS',
        RequestId: event.RequestId,
        StackId: event.StackId,
        LogicalResourceId: event.LogicalResourceId,
        PhysicalResourceId: event.PhysicalResourceId,
    };
};

export const onEvent = (event: CloudFormationCustomResourceEvent): Promise<CloudFormationCustomResourceResponse> => {
    console.log(JSON.stringify(event));
    try {
        switch (event.RequestType) {
            case 'Create':
            case 'Update':
                return onCreate(event as CloudFormationCustomResourceCreateEvent);
            case 'Delete':
                return onDelete(event as CloudFormationCustomResourceDeleteEvent);
            default:
                return Promise.reject(`Unknown event type in event ${event}`);
        }
    } catch (err) {
        console.error(err);
        return Promise.reject('Failed');
    }
};
