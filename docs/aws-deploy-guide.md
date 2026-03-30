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

## Step 3: ECR リポジトリの URL を確認

```bash
aws ecr describe-repositories --repository-names reversi-app \
  --query 'repositories[0].repositoryUri' --output text
```

出力例：

```
123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/reversi-app
```

> **注意:** ECR リポジトリは `cdk deploy` で作成される。
> まだデプロイ前の場合は Step 6 を先に実行してから戻ってくること。

---

## Step 4: Docker イメージのビルド

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

## Step 5: ECR へのログインとイメージのプッシュ

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

## Step 6: CDK デプロイ

```bash
cd infra
cdk deploy
```

### 実行されること

CDK が CloudFormation を通じて以下のリソースを順番に作成する：

```
1. VPC・サブネット・ルートテーブル・Internet Gateway
2. NAT Gateway（プライベートサブネットからの外向き通信用）
3. セキュリティグループ（ALB用・ECS用・RDS用）
4. RDS MySQL インスタンス（+ Secrets Manager にパスワード自動保存）
5. ECR リポジトリ
6. ECS クラスター・タスク定義・Fargate サービス
7. ALB・リスナー・ターゲットグループ
```

### デプロイ前の差分確認（任意）

```bash
cdk diff
```

現在の AWS 環境と CDK コードの差分を表示する。
実際に変更が加わる前に確認できるので、本番運用では `cdk deploy` 前に実行することを推奨。

### デプロイ完了時の出力

成功すると最後にこのような出力が表示される：

```
✅  ReversiStack

Outputs:
ReversiStack.AlbDnsName = ReversiStack-ReversiAlb-XXXXXXXX.ap-northeast-1.elb.amazonaws.com
```

この `AlbDnsName` の値がアプリの URL になる。

> **注意:** 全リソースの作成に **10〜15分** 程度かかる。

---

## Step 7: DBの初期化

RDS が作成されたら、テーブルを作成する必要がある。
ECS タスクを踏み台として使い、RDS に接続してDDLを流す。

### 接続情報を Secrets Manager から取得

```bash
# シークレットの ARN を確認
aws secretsmanager list-secrets --query 'SecretList[?contains(Name, `ReversiDb`)].ARN' --output text

# パスワードを取得
aws secretsmanager get-secret-value --secret-id <上記のARN> \
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

### DDL の実行

ECS Exec または踏み台サーバーを経由して MySQL に接続し、
`mysql/init.sql` の内容を流す。

```bash
# ECS Exec でコンテナに接続する場合
aws ecs execute-command \
  --cluster ReversiStack-ReversiCluster... \
  --task <タスクID> \
  --container ReversiContainer \
  --interactive \
  --command "/bin/sh"
```

---

## Step 8: 動作確認

```bash
# デプロイ時に表示された ALB の DNS 名でアクセス
curl http://ReversiStack-ReversiAlb-XXXXXXXX.ap-northeast-1.elb.amazonaws.com/health
```

`{"status":"ok"}` が返れば正常に動作している。

ブラウザで以下の URL を開くとゲーム画面が表示される：

```
http://ReversiStack-ReversiAlb-XXXXXXXX.ap-northeast-1.elb.amazonaws.com
```

---

## Step 9: 後片付け（リソースの削除）

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
docker tag reversi-app:latest $ECR_URL:latest
docker push $ECR_URL:latest

# 3. ECS サービスを強制更新（新しいイメージでコンテナを再起動）
aws ecs update-service \
  --cluster <クラスター名> \
  --service <サービス名> \
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
