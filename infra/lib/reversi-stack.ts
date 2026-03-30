import * as cdk from 'aws-cdk-lib/core';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class ReversiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ----------------------------------------
    // VPC
    // ----------------------------------------
    // パブリックサブネット（ALB配置）とプライベートサブネット（ECS・RDS配置）を
    // 2つのアベイラビリティゾーン（AZ）に作成する
    const vpc = new ec2.Vpc(this, 'ReversiVpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // ----------------------------------------
    // セキュリティグループ
    // ----------------------------------------

    // ALB 用: インターネットからの HTTP（80番）を許可
    const albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc,
      description: 'Security group for ALB',
    });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP from internet');

    // ECS 用: ALB からのトラフィックのみ許可
    const ecsSg = new ec2.SecurityGroup(this, 'EcsSg', {
      vpc,
      description: 'Security group for ECS tasks',
    });
    ecsSg.addIngressRule(albSg, ec2.Port.tcp(3000), 'Allow traffic from ALB');

    // RDS 用: ECS からの MySQL（3306番）のみ許可
    const rdsSg = new ec2.SecurityGroup(this, 'RdsSg', {
      vpc,
      description: 'Security group for RDS',
    });
    rdsSg.addIngressRule(ecsSg, ec2.Port.tcp(3306), 'Allow MySQL from ECS');

    // 次のコミットで使うためにプロパティとして保持
    this.vpc = vpc;
    this.albSg = albSg;
    this.ecsSg = ecsSg;
    this.rdsSg = rdsSg;
  }

  // 他のコンストラクトから参照できるよう公開
  public readonly vpc: ec2.Vpc;
  public readonly albSg: ec2.SecurityGroup;
  public readonly ecsSg: ec2.SecurityGroup;
  public readonly rdsSg: ec2.SecurityGroup;
}
