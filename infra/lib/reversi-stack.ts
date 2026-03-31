import * as cdk from 'aws-cdk-lib/core';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
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
    cdk.Tags.of(vpc).add('Name', 'reversi-vpc');

    // ----------------------------------------
    // セキュリティグループ
    // ----------------------------------------

    // ALB 用: インターネットからの HTTP（80番）を許可
    const albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc,
      description: 'Security group for ALB',
    });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP from internet');
    cdk.Tags.of(albSg).add('Name', 'reversi-alb-sg');

    // ECS 用: ALB からのトラフィックのみ許可
    const ecsSg = new ec2.SecurityGroup(this, 'EcsSg', {
      vpc,
      description: 'Security group for ECS tasks',
    });
    ecsSg.addIngressRule(albSg, ec2.Port.tcp(3000), 'Allow traffic from ALB');
    cdk.Tags.of(ecsSg).add('Name', 'reversi-ecs-sg');

    // RDS 用: ECS からの MySQL（3306番）のみ許可
    const rdsSg = new ec2.SecurityGroup(this, 'RdsSg', {
      vpc,
      description: 'Security group for RDS',
    });
    rdsSg.addIngressRule(ecsSg, ec2.Port.tcp(3306), 'Allow MySQL from ECS');
    cdk.Tags.of(rdsSg).add('Name', 'reversi-rds-sg');

    // ----------------------------------------
    // RDS（MySQL）
    // ----------------------------------------
    // CDK が自動で Secrets Manager にパスワードを生成・保存する
    // アプリ側では ECS タスク定義を通じて環境変数として受け取る
    const database = new rds.DatabaseInstance(this, 'ReversiDb', {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO,
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [rdsSg],
      databaseName: 'reversi',
      // スナップショットなしで削除できるようにする（学習・検証用途）
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
      // マルチAZ配置はOFF（コスト削減のため）
      multiAz: false,
      // 自動バックアップは無効（学習用途）
      backupRetention: cdk.Duration.days(0),
    });
    cdk.Tags.of(database).add('Name', 'reversi-db');

    // ----------------------------------------
    // ECR（Dockerイメージの保存場所）
    // ----------------------------------------
    // docker build & push したイメージをここに保存する
    // ECS はここからイメージを取得して起動する
    const repository = new ecr.Repository(this, 'ReversiRepository', {
      repositoryName: 'reversi-app',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      // イメージが蓄積しないよう古いものを自動削除するライフサイクルルール
      lifecycleRules: [
        {
          maxImageCount: 5,
          description: 'Keep only 5 latest images',
        },
      ],
    });
    cdk.Tags.of(repository).add('Name', 'reversi-ecr');

    // ----------------------------------------
    // ECS クラスター
    // ----------------------------------------
    // Fargate タスクを動かす「箱」。クラスター自体はリソースを消費しない
    const cluster = new ecs.Cluster(this, 'ReversiCluster', { vpc });
    cdk.Tags.of(cluster).add('Name', 'reversi-cluster');

    // ----------------------------------------
    // ECS タスク定義
    // ----------------------------------------
    // コンテナの設計図：何のイメージを、どのくらいのCPU/メモリで、
    // どんな環境変数で動かすかを定義する

    // タスク実行ロール：ECS がコンテナを起動するときに必要な権限
    // （ECRからイメージを pull する、Secrets Manager からパスワードを取得するなど）
    const taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });
    cdk.Tags.of(taskExecutionRole).add('Name', 'reversi-task-execution-role');
    // Secrets Manager からシークレットを読み取る権限を追加
    database.secret?.grantRead(taskExecutionRole);

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'ReversiTaskDef', {
      cpu: 256,       // 0.25 vCPU
      memoryLimitMiB: 512,
      executionRole: taskExecutionRole,
    });
    cdk.Tags.of(taskDefinition).add('Name', 'reversi-task-def');

    // タスク定義にコンテナを追加
    taskDefinition.addContainer('ReversiContainer', {
      image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
      portMappings: [{ containerPort: 3000 }],
      // DB 接続情報を環境変数として渡す
      // DB_HOST は RDS のエンドポイント、DB_PASSWORD は Secrets Manager から取得
      environment: {
        DB_NAME: 'reversi',
        DB_USER: 'admin',
      },
      secrets: {
        // Secrets Manager に保存された JSON から各フィールドを取り出して環境変数に注入
        DB_HOST: ecs.Secret.fromSecretsManager(database.secret!, 'host'),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(database.secret!, 'password'),
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'reversi' }),
    });

    // ----------------------------------------
    // ECS サービス
    // ----------------------------------------
    // タスクを常に1台動かし続ける。落ちたら自動で再起動する
    const service = new ecs.FargateService(this, 'ReversiService', {
      cluster,
      taskDefinition,
      securityGroups: [ecsSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      desiredCount: 1,
      // ECS Exec を有効化：コンテナ内でコマンドを実行できる（DB初期化などに使用）
      enableExecuteCommand: true,
    });
    cdk.Tags.of(service).add('Name', 'reversi-service');

    // ----------------------------------------
    // ALB（Application Load Balancer）
    // ----------------------------------------
    // インターネットからのリクエストを受け取り ECS コンテナに転送する
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ReversiAlb', {
      vpc,
      internetFacing: true,  // インターネットに公開する
      securityGroup: albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
    cdk.Tags.of(alb).add('Name', 'reversi-alb');

    // リスナー：ALBがポート80でリクエストを受け付ける
    const listener = alb.addListener('HttpListener', {
      port: 80,
      open: true,
    });

    // ターゲットグループ：ALBのリクエストを転送する先（ECSサービス）を登録
    // ヘルスチェック：/health に GET して 200 が返れば正常と判断
    const targetGroup = listener.addTargets('ReversiTarget', {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(30),
        healthyHttpCodes: '200',
      },
    });
    cdk.Tags.of(targetGroup).add('Name', 'reversi-tg');

    // ALBのURLをCloudFormationのOutputsとして出力する
    // cdk deploy 後にターミナルに表示され、アプリのURLとして使える
    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: alb.loadBalancerDnsName,
      description: 'ALB DNS Name - Use this URL to access the app',
    });

    this.vpc = vpc;
    this.albSg = albSg;
    this.ecsSg = ecsSg;
    this.rdsSg = rdsSg;
    this.database = database;
    this.repository = repository;
    this.service = service;
    this.alb = alb;
  }

  public readonly vpc: ec2.Vpc;
  public readonly albSg: ec2.SecurityGroup;
  public readonly ecsSg: ec2.SecurityGroup;
  public readonly rdsSg: ec2.SecurityGroup;
  public readonly database: rds.DatabaseInstance;
  public readonly repository: ecr.Repository;
  public readonly service: ecs.FargateService;
  public readonly alb: elbv2.ApplicationLoadBalancer;
}
