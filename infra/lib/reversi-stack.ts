import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

export class ReversiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ここに各AWSリソースを定義していく
    // 次のコミットでVPC・セキュリティグループを追加する
  }
}
