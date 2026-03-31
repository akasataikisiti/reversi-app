# 独自ドメイン設定メモ

このドキュメントは、お名前.com で取得した独自ドメインをこのプロジェクトに設定する際の要点をまとめたもの。

## 現状の前提

- 現在のインフラ定義は HTTP(80) のみ
- `ACM`、`Route 53`、`HTTPS(443)` リスナーの定義は未追加
- 公開入口は `ALB`
- アプリ本体は `ECS Fargate`
- DB は `RDS MySQL`

関連ファイル:

- [infra/lib/reversi-stack.ts](/home/kosuke-ub/work/portfolio/reversi-app/infra/lib/reversi-stack.ts)
- [docs/aws-deploy-guide.md](/home/kosuke-ub/work/portfolio/reversi-app/docs/aws-deploy-guide.md)

## 独自ドメイン対応で必要なこと

1. `ACM` で証明書を発行する
2. お名前.com 側で DNS 検証用 `CNAME` を追加する
3. `ALB` に `HTTPS(443)` リスナーを追加する
4. `HTTP(80)` を `HTTPS(443)` にリダイレクトする
5. お名前.com 側で公開用 DNS レコードを `ALB` に向ける

## 推奨方針

- 最初は `www.example.com` のような `www` サブドメインで公開する
- 理由: apex ドメイン `example.com` は `CNAME` を置けないことが多く、`www` の方が `ALB` に向けやすい
- 証明書は `ap-northeast-1` で発行する

## AWS 側の実装方針

`reversi-stack.ts` に少なくとも次を追加する。

- `aws-certificatemanager` の import
- `ALB` セキュリティグループで `443` を許可
- `443` の `HTTPS` リスナー
- 証明書 ARN の設定
- `80 -> 443` リダイレクト

イメージ:

```ts
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS from internet');

const certificate = acm.Certificate.fromCertificateArn(
  this,
  'AlbCertificate',
  '発行済み証明書のARN'
);

alb.addListener('HttpsListener', {
  port: 443,
  certificates: [certificate],
  open: true,
}).addTargets('HttpsTarget', {
  port: 3000,
  protocol: elbv2.ApplicationProtocol.HTTP,
  targets: [service],
  healthCheck: {
    path: '/health',
    interval: cdk.Duration.seconds(30),
    healthyHttpCodes: '200',
  },
});

alb.addListener('HttpListener', {
  port: 80,
  open: true,
  defaultAction: elbv2.ListenerAction.redirect({
    protocol: 'HTTPS',
    port: '443',
    permanent: true,
  }),
});
```

## お名前.com 側の設定

### DNS 検証用

- `ACM` が表示する DNS 検証用 `CNAME` を追加する
- これで証明書が `Issued` になる

### 公開用

- `www.example.com` を `CNAME` で `ALB` の DNS 名へ向ける
- 例: `dualstack-xxxx.ap-northeast-1.elb.amazonaws.com`

注意:

- `example.com` の apex ドメインには通常 `CNAME` を置けない
- まずは `www` だけを公開するのが安全

## destroy 後の考え方

`cdk destroy` 後に再デプロイすると、`ALB` の DNS 名は変わる可能性が高い。
そのため、お名前.com 側の公開用 `CNAME` は更新が必要になりやすい。

一方で次は再利用しやすい。

- 取得済みドメイン
- 証明書
- 証明書の DNS 検証レコード

ただし、証明書自体を削除した場合は再作成が必要。

## 一度やればよい項目

- お名前.com でドメインを取得する
- 公開ホスト名を決める
- `ACM` 証明書を発行する
- DNS 検証用 `CNAME` を追加する
- CDK に `HTTPS` 対応コードを入れる

前提:

- 証明書を削除しないこと

## 毎回やり直す項目になりやすいもの

- `ALB` の DNS 名を確認する
- お名前.com の公開用 `CNAME` を新しい `ALB` に向け直す
- `https://<domain>` の疎通確認をする
- `/health` の確認をする

## 条件付きで毎回必要になる項目

- `ACM` 証明書の再発行
- DNS 検証用 `CNAME` の再登録
- 証明書 ARN の差し替え

条件:

- 証明書も削除した場合

## ACM 証明書の料金メモ

通常の `ALB` 用の `ACM` 公開証明書は追加料金なしで使える。

参考:

- https://aws.amazon.com/certificate-manager/pricing/
- https://docs.aws.amazon.com/acm/latest/userguide/acm-public-certificates.html

注意:

- `ALB` 自体の料金は別
- exportable certificate や `AWS Private CA` は別料金

## 便利な確認コマンド

### CDK デプロイ

```bash
cd infra
cdk deploy --require-approval never
```

### CloudFormation Output から ALB DNS 名を確認

```bash
aws cloudformation describe-stacks \
  --stack-name ReversiStack \
  --query "Stacks[0].Outputs[?OutputKey=='AlbDnsName'].OutputValue" \
  --output text
```

### ALB 一覧を確認

```bash
aws elbv2 describe-load-balancers \
  --query "LoadBalancers[].{Name:LoadBalancerName,DNS:DNSName}" \
  --output table
```

### ECS サービス状態を確認

```bash
aws ecs describe-services \
  --cluster $(aws ecs list-clusters --query 'clusterArns[0]' --output text) \
  --services $(aws ecs list-services \
    --cluster $(aws ecs list-clusters --query 'clusterArns[0]' --output text) \
    --query 'serviceArns[0]' --output text) \
  --query 'services[0].{running:runningCount,desired:desiredCount,status:status}' \
  --output table
```

### ACM 証明書一覧を確認

```bash
aws acm list-certificates \
  --region ap-northeast-1 \
  --query "CertificateSummaryList[].{Domain:DomainName,Arn:CertificateArn}" \
  --output table
```

### 証明書詳細を確認

```bash
aws acm describe-certificate \
  --region ap-northeast-1 \
  --certificate-arn <CERTIFICATE_ARN>
```

### DNS 確認

```bash
dig www.example.com
```

### HTTPS 確認

```bash
curl -I https://www.example.com
curl https://www.example.com/health
```

## シェル変数を使う例

```bash
STACK=ReversiStack
DOMAIN=www.example.com

ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name $STACK \
  --query "Stacks[0].Outputs[?OutputKey=='AlbDnsName'].OutputValue" \
  --output text)

echo $ALB_DNS
dig $DOMAIN
curl -I https://$DOMAIN
```

## 最短の再設定フロー

1. `cdk deploy`
2. `AlbDnsName` を確認
3. お名前.com の公開用 `CNAME` を更新
4. `ACM` 証明書が残っているか確認
5. `https://<domain>/health` を確認
