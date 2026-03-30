#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { ReversiStack } from '../lib/reversi-stack';

const app = new cdk.App();
new ReversiStack(app, 'ReversiStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1',
  },
});
