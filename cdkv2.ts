import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import * as customResource from 'aws-cdk-lib/custom-resources';
import * as path from 'path';

export class AllowConnectionsToECSServiceFromNetworkLoadBalancerProvider extends Construct {
    public readonly provider: customResource.Provider;

    public static getOrCreate(scope: Construct): customResource.Provider {
        const stack = cdk.Stack.of(scope);
        const id = 'com.isotoma.cdk.custom-resources.allow-connections-to-ecs-service-from-network-load-balancer';
        const x = (stack.node.tryFindChild(id) as AllowConnectionsToECSServiceFromNetworkLoadBalancerProvider) || new AllowConnectionsToECSServiceFromNetworkLoadBalancerProvider(stack, id);
        return x.provider;
    }

    constructor(scope: Construct, id: string) {
        super(scope, id);
        this.provider = new customResource.Provider(this, 'allow-connections-to-ecs-service-from-network-load-balancer', {
            onEventHandler: new lambda.Function(this, 'allow-connections-to-ecs-service-from-network-load-balancer-event', {
                code: lambda.Code.fromAsset(path.join(__dirname, 'provider')),
                runtime: lambda.Runtime.NODEJS_16_X,
                handler: 'index.onEvent',
                timeout: cdk.Duration.minutes(5),
                initialPolicy: [
                    new iam.PolicyStatement({
                        resources: ['*'],
                        actions: ['ec2:AuthorizeSecurityGroupIngress', 'ec2:RevokeSecurityGroupIngress', 'ec2:DescribeNetworkInterfaces'],
                    }),
                ],
            }),
        });
    }
}

export class AllowConnectionsToECSServiceFromNetworkLoadBalancerProps {
    readonly service: ecs.Ec2Service;
    readonly loadBalancer: elbv2.NetworkLoadBalancer;
}

export class AllowConnectionsToECSServiceFromNetworkLoadBalancer extends Construct {
    public readonly service: ecs.Ec2Service;
    public readonly loadBalancer: elbv2.NetworkLoadBalancer;
    private resource: cdk.CustomResource;

    constructor(scope: Construct, id: string, props: AllowConnectionsToECSServiceFromNetworkLoadBalancerProps) {
        super(scope, id);
        if (!props.service) {
            throw new Error('No service specified');
        }
        if (!props.loadBalancer) {
            throw new Error('No load balancer specified');
        }
        this.service = props.service;
        this.loadBalancer = props.loadBalancer;
        const provider = AllowConnectionsToECSServiceFromNetworkLoadBalancerProvider.getOrCreate(this);
        this.resource = new cdk.CustomResource(this, 'Resource', {
            serviceToken: provider.serviceToken,
            resourceType: 'Custom::AllowConnectionsToECSServiceFromNetworkLoadBalancer',
            properties: {
                ServiceSecurityGroupId: this.service.connections.securityGroups[0].securityGroupId,
                LoadBalancerArn: this.loadBalancer.loadBalancerArn,
            },
        });
    }
}
