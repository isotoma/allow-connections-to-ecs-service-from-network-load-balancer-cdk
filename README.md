# allow-connections-to-ecs-service-from-network-load-balancer-cdk

This CDK Custom Resource Provider patches up a gap in the CDK's use of Network Load Balancers to provide access to ECS Services.

You can see some discussion of the issue here:

https://github.com/aws/aws-cdk/issues/1490

In summary, adding an ECS Service as a target to an ALB Listener automatically alters the destination security group to allow access from the ALB security group.

NLBs do not have security groups, due to the different architecture of the underlying solution, and no similar behaviour takes place.

You must then authorise access yourself, which is in practical terms insane:

https://aws.amazon.com/premiumsupport/knowledge-center/elb-find-load-balancer-IP/

I mean, what.

## Usage

Add this resource after you have added the target:

    new AllowConnectionsToECSServiceFromNetworkLoadBalancer(stack, 'AllowServiceFromNLB', {
        service,
        port: 80,
        loadBalancer: nlb,
    });

For example:

    const listener = nlb.addListener('Listener', {
        port: 443,
        certificates: [ListenerCertificate.fromCertificateManager(certificate)],
    });
    listener.addTargets(serviceName, {
        port: 80,
        targets: [service],
    });
    new AllowConnectionsToECSServiceFromNetworkLoadBalancer(stack, 'AllowServiceFromNLB', {
        service,
        port: 80,
        loadBalancer: nlb,
    });

