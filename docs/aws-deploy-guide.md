# AWS デプロイ手順書

## 前提条件

以下がローカルにインストール済みであること：

| ツール | 確認コマンド | 用途 |
|--------|-------------|------|
| AWS CLI | `aws --version` | AWSをコマンドから操作する |
| AWS CDK | `cdk --version` | インフラをコードからデプロイする |
| Docker | `docker --version` | コンテナイメージをビルドする |
| Node.js | `node --version` | CDKの実行環境 |

---

## Step 1: AWS CLI の設定

```bash
aws configure
```

実行すると以下の入力を求められる：

```
AWS Access Key ID:      # IAMユーザーのアクセスキー
AWS Secret Access Key:  # IAMユーザーのシークレットキー
Default region name:    # ap-northeast-1（東京）を推奨
Default output format:  # json を推奨
```

### アクセスキーの取得方法

1. AWS コンソール → IAM → ユーザー → 自分のユーザーを選択
2. 「セキュリティ認証情報」タブ → 「アクセスキーを作成」

### 設定の確認

```bash
aws sts get-caller-identity
```

以下のようにアカウント情報が返れば設定成功：

```json
{
  "UserId": "AIDAXXX...",
  "Account": "123456789012",
  "Arn": "arn:aws:iam::123456789012:user/your-name"
}
```

---

## Step 2: CDK Bootstrap

```bash
cd infra
cdk bootstrap
```

### Bootstrap とは

CDK を初めて使う AWS アカウント・リージョンに対して、CDK が動作するために必要なリソースを事前に作成するコマンド。

具体的には以下が作成される：

| リソース | 用途 |
|----------|------|
| S3 バケット | CDK がデプロイ時に使うアセット（Lambda のコードなど）の一時置き場 |
| IAM ロール | CDK が CloudFormation を実行するための権限 |
| ECR リポジトリ | CDK が使うコンテナイメージの置き場（今回は不使用） |

> **注意:** Bootstrap は同じアカウント・リージョンに対して**1回だけ**実行すればよい。
> 次回以降のプロジェクトでは不要。

---

## Step 3: CDK デプロイ（第1フェーズ：インフラ作成）

```bash
cd infra
cdk deploy --require-approval never
```

### 実行されること

CDK が CloudFormation を通じて以下のリソースを順番に作成する：

```
1. VPC・サブネット・ルートテーブル・Internet Gateway
2. NAT Gateway（プライベートサブネットからの外向き通信用）
3. セキュリティグループ（ALB用・ECS用・RDS用）
4. RDS MySQL インスタンス（+ Secrets Manager にパスワード自動保存）
5. ECR リポジトリ          ← ここまで完了したら次のステップへ進める
6. ECS クラスター・タスク定義・Fargate サービス
7. ALB・リスナー・ターゲットグループ
```

### なぜ途中でハングするのか

ECS Fargate はコンテナイメージを ECR から取得して起動するが、この時点ではまだイメージをプッシュしていない。
そのため ECS サービスが「コンテナを起動できない → リトライ → 失敗 → …」を繰り返す。

CDK はデフォルトで ECS サービスが安定するまで待機するため、ここで処理が止まる。

```
ReversiStack | 44/46 | CREATE_COMPLETE  | ...IAM::Policy
ReversiStack | 43/46 | CREATE_IN_PROGRESS | ...ECS::Service  ← ここで止まる
```

**ECR リポジトリが作成された時点（44/46 あたり）で Ctrl+C で中断してよい。**
インフラのリソースは作成済みなので、次のステップに進む。

> **注意:** 全リソースの作成に **10〜15分** 程度かかる。

---

## Step 4: ECR リポジトリの URL を確認

```bash
aws ecr describe-repositories --repository-names reversi-app \
  --query 'repositories[0].repositoryUri' --output text
```

出力例：

```
123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/reversi-app
```

---

## Step 5: Docker イメージのビルド

```bash
# プロジェクトルートで実行
cd /path/to/reversi-app
docker build -t reversi-app:latest .
```

### マルチステージビルドの流れ

```
builder ステージ
  └── npm ci（開発依存含む）
  └── tsc（TypeScript → JavaScript にコンパイル）

runner ステージ（本番イメージ）
  └── npm ci --omit=dev（本番依存のみ）
  └── dist/ と static/ をコピー
  └── node dist/main.js で起動
```

ビルド後のイメージサイズを確認：

```bash
docker images reversi-app
```

---

## Step 6: ECR へのログインとイメージのプッシュ

```bash
# 変数に ECR の URL をセット
ECR_URL=$(aws ecr describe-repositories --repository-names reversi-app \
  --query 'repositories[0].repositoryUri' --output text)

# ECR にログイン
aws ecr get-login-password --region ap-northeast-1 \
  | docker login --username AWS --password-stdin $ECR_URL

# イメージにタグをつける
docker tag reversi-app:latest $ECR_URL:latest

# ECR にプッシュ
docker push $ECR_URL:latest
```

### 各コマンドの説明

| コマンド | 説明 |
|----------|------|
| `get-login-password` | ECR への認証トークンを取得する（12時間有効） |
| `docker login` | 取得したトークンで Docker を ECR に認証する |
| `docker tag` | ローカルのイメージに ECR の URL でタグをつける |
| `docker push` | タグをつけたイメージを ECR にアップロードする |

---

## Step 7: CDK デプロイ（第2フェーズ：ECS 安定化）

```bash
cd infra
cdk deploy --require-approval never
```

インフラに変更はないため即完了する（`no changes`）。
ECS サービスはイメージのプッシュを検知し、自動でコンテナを起動する。

ECS サービスの状態を確認：

```bash
aws ecs describe-services \
  --cluster $(aws ecs list-clusters --query 'clusterArns[0]' --output text) \
  --services $(aws ecs list-services \
    --cluster $(aws ecs list-clusters --query 'clusterArns[0]' --output text) \
    --query 'serviceArns[0]' --output text) \
  --query 'services[0].{running:runningCount,desired:desiredCount,events:events[:2]}' \
  --output json
```

`running: 1` かつ `steady state` のメッセージが確認できれば起動完了。

---

## Step 8: DB の初期化

RDS にテーブルを作成する。RDS はプライベートサブネットにあるためローカルから直接接続できない。
ECS Exec を使ってコンテナの中から RDS に接続する。

### 8-1. ECS Exec を有効化する

現在の CDK コードでは ECS Exec が無効になっている。
`infra/lib/reversi-stack.ts` の FargateService に `enableExecuteCommand: true` を追加して再デプロイする。

```bash
cd infra
cdk deploy --require-approval never
```

### 8-2. 接続情報を Secrets Manager から取得

```bash
aws secretsmanager get-secret-value \
  --secret-id $(aws secretsmanager list-secrets \
    --query 'SecretList[?contains(Name, `ReversiDb`)].ARN' --output text) \
  --query SecretString --output text | jq '.'
```

出力例：
```json
{
  "username": "admin",
  "password": "xxxxxxxxxxxxxxxx",
  "host": "reversidb.xxxxxxxxx.ap-northeast-1.rds.amazonaws.com",
  "port": 3306,
  "dbname": "reversi"
}
```

### 8-3. ECS Exec でコンテナに接続して DDL を実行

```bash
# タスク ID を確認
TASK_ID=$(aws ecs list-tasks \
  --cluster $(aws ecs list-clusters --query 'clusterArns[0]' --output text) \
  --query 'taskArns[0]' --output text | awk -F/ '{print $NF}')

CLUSTER=$(aws ecs list-clusters --query 'clusterArns[0]' --output text | awk -F/ '{print $NF}')

# コンテナにシェルで接続
aws ecs execute-command \
  --cluster $CLUSTER \
  --task $TASK_ID \
  --container ReversiContainer \
  --interactive \
  --command "/bin/sh"
```

コンテナ内で MySQL に接続してDDLを実行：

```bash
# コンテナ内で実行
mysql -h <RDSのhost> -u admin -p<password> reversi < /dev/stdin << 'EOF'
-- ここに mysql/init.sql の内容を貼り付ける
EOF
```

---

## Step 9: 動作確認

### ALB の DNS 名を確認

```bash
aws elbv2 describe-load-balancers \
  --query 'LoadBalancers[?contains(LoadBalancerName, `Revers`)].DNSName' \
  --output text
```

### ヘルスチェック

```bash
curl http://<ALBのDNS名>/health
# → {"status":"ok"} が返れば正常
```

### ブラウザでアクセス

```
http://<ALBのDNS名>
```

---

## Step 10: 後片付け（リソースの削除）

使い終わったら必ず削除してコストを止める：

```bash
cd infra
cdk destroy
```

確認プロンプトに `y` を入力すると、作成した全リソースが削除される。

> **注意:**
> - RDS のデータも削除される（`removalPolicy: DESTROY` のため）
> - ECR のイメージも削除される
> - 削除には **5〜10分** 程度かかる

---

## コード変更時の再デプロイ手順

アプリのコードを修正してデプロイし直す場合：

```bash
# 1. イメージを再ビルド
docker build -t reversi-app:latest .

# 2. ECR にプッシュ
ECR_URL=$(aws ecr describe-repositories --repository-names reversi-app \
  --query 'repositories[0].repositoryUri' --output text)
docker tag reversi-app:latest $ECR_URL:latest
docker push $ECR_URL:latest

# 3. ECS サービスを強制更新（新しいイメージでコンテナを再起動）
aws ecs update-service \
  --cluster $(aws ecs list-clusters --query 'clusterArns[0]' --output text) \
  --service $(aws ecs list-services \
    --cluster $(aws ecs list-clusters --query 'clusterArns[0]' --output text) \
    --query 'serviceArns[0]' --output text) \
  --force-new-deployment
```

インフラの定義（`infra/lib/reversi-stack.ts`）を変更した場合は `cdk deploy` を再実行する。

---

## トラブルシューティング

### コンテナが起動しない

CloudWatch Logs でコンテナのログを確認する：

```bash
aws logs tail /ecs/reversi --follow
```

よくある原因：
- DB への接続エラー → Secrets Manager の値・セキュリティグループを確認
- イメージが見つからない → ECR へのプッシュが完了しているか確認

### ヘルスチェックが通らない

ALB のターゲットグループでヘルスチェックの状態を確認：

```
AWS コンソール → EC2 → ターゲットグループ → ヘルスチェックの状態
```

`unhealthy` の場合、コンテナのログを確認してアプリのエラーを特定する。

### cdk deploy がエラーになる

```bash
# CloudFormation のスタックイベントを確認
aws cloudformation describe-stack-events \
  --stack-name ReversiStack \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`].[LogicalResourceId,ResourceStatusReason]' \
  --output table
```
