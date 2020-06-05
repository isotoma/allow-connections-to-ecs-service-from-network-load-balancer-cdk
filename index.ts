import * as ecs from '@aws-cdk/aws-ecs';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as cfn from '@aws-cdk/aws-cloudformation';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as cdk from '@aws-cdk/core';
import * as customResource from '@aws-cdk/custom-resources';
import * as path from 'path';

export class AllowConnectionsToECSServiceFromNetworkLoadBalancerProvider extends cdk.Construct {
    public readonly provider: customResource.Provider;

    public static getOrCreate(scope: cdk.Construct): customResource.Provider {
        const stack = cdk.Stack.of(scope);
        const id = 'com.isotoma.cdk.custom-resources.allow-connections-to-ecs-service-from-network-load-balancer';
        const x = (stack.node.tryFindChild(id) as AllowConnectionsToECSServiceFromNetworkLoadBalancerProvider) || new AllowConnectionsToECSServiceFromNetworkLoadBalancerProvider(stack, id);
        return x.provider;
    }
    
    constructor(scope: cdk.Construct, id: string) {
        super(scope, id);
        this.provider = new customResource.Provider(this, 'allow-connections-to-ecs-service-from-network-load-balancer', {
            onEventHandler: new lambda.Function(this, 'allow-connections-to-ecs-service-from-network-load-balancer-event', {
                code: lambda.Code.fromAsset(path.join(__dirname, 'provider')),
                runtime: lambda.Runtime.NODEJS_12_X,
                handler: 'index.onEvent',
                timeout: cdk.Duration.minutes(5),
                initialPolicy: [
                    new iam.PolicyStatement({
                        resources: ['*'],
                        actions: [
                            'ec2:AuthorizeSecurityGroupIngress',
                            'ec2:RevokeSecurityGroupIngress',
                            'ec2:DescribeNetworkInterfaces',
                        ],
                    }),
                ],
            }),
        });
    }
}

export class AllowConnectionsToECSServiceFromNetworkLoadBalancerProps {
    readonly service: ecs.Ec2Service;
    readonly loadBalancer: elbv2.NetworkLoadBalancer;
    readonly port: number;
}

export class AllowConnectionsToECSServiceFromNetworkLoadBalancer extends cdk.Construct {
    public readonly service: ecs.Ec2Service;
    public readonly loadBalancer: elbv2.NetworkLoadBalancer;
    public readonly port: number;
    private resource: cfn.CustomResource;

    constructor(scope: cdk.Construct, id: string, props: AllowConnectionsToECSServiceFromNetworkLoadBalancerProps) {
        super(scope, id);
        if (!props.service) {
            throw new Error('No service specified');
        }
        if (!props.loadBalancer) {
            throw new Error("No load balancer specified");
        }
        if (!props.port) {
            throw new Error("No port specified");
        }
        this.service = props.service;
        this.loadBalancer = props.loadBalancer;
        this.port = props.port;
        this.resource = new cfn.CustomResource(this, 'Resource', {
            provider: AllowConnectionsToECSServiceFromNetworkLoadBalancerProvider.getOrCreate(this),
            resourceType: 'Custom::AllowConnectionsToECSServiceFromNetworkLoadBalancer',
            properties: {
                ServiceSecurityGroupId: this.service.connections.securityGroups[0].securityGroupId,
                LoadBalancerArn: this.loadBalancer.loadBalancerArn,
                Port: this.port,
            }
        });
    }
}
