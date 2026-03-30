# AWS リソースの停止と再開手順

使わない期間は `cdk destroy` でスタックを削除し、コストをゼロにする。
再開時は `cdk deploy` → イメージ push → DB 初期化の順で復元する。

---

## 料金が発生しているリソース

`cdk deploy` 後、以下のリソースが**常時課金**される（トラフィックが 0 でも止まらない）：

| リソース | 概算（月額） | 課金単位 |
|---|---|---|
| NAT Gateway | ~$32 | 時間 + データ転送量 |
| RDS t3.micro | ~$12 | 稼働時間（停止後 7 日で自動再起動） |
| ALB | ~$6 | 時間 + LCU |
| ECS Fargate | ~$2 | タスク稼働時間 |
| **合計** | **~$52 / 月** | |

> ECR・Secrets Manager・CloudWatch Logs は保存量課金のため無視できる金額。

---

## 停止手順（cdk destroy）

```bash
cd infra
npx cdk destroy
```

確認プロンプトが表示されるので `y` を入力する：

```
Are you sure you want to delete: ReversiStack (y/n)? y
```

削除には **5〜10 分**程度かかる。完了すると全リソースが消え、課金もゼロになる。

### 削除されるもの・されないもの

| 項目 | 結果 | 理由 |
|---|---|---|
| VPC・サブネット・SG | 削除される | CDK が管理 |
| ALB | 削除される | CDK が管理 |
| ECS クラスター・サービス | 削除される | CDK が管理 |
| RDS インスタンス | 削除される | `removalPolicy: DESTROY` |
| **RDS のデータ** | **消える** | バックアップ無効、削除保護なし |
| ECR リポジトリ | 削除される | `removalPolicy: DESTROY` |
| **ECR のイメージ** | **消える** | リポジトリごと削除 |
| Secrets Manager のシークレット | 削除される | CDK が管理 |
| CDK Bootstrap リソース（S3・IAM） | **残る** | Bootstrap は別スタック |
| CloudWatch Logs のロググループ | **残る** | CDK の管理外 |

### データを残したい場合

RDS を削除する前にデータをエクスポートしておく：

```bash
# ECS Exec でコンテナに入り mysqldump を実行
TASK_ID=$(aws ecs list-tasks \
  --cluster $(aws ecs list-clusters --query 'clusterArns[0]' --output text) \
  --query 'taskArns[0]' --output text | awk -F/ '{print $NF}')

CLUSTER=$(aws ecs list-clusters --query 'clusterArns[0]' --output text | awk -F/ '{print $NF}')

aws ecs execute-command \
  --cluster $CLUSTER \
  --task $TASK_ID \
  --container ReversiContainer \
  --interactive \
  --command "/bin/sh"

# コンテナ内で実行
mysqldump -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME > /tmp/backup.sql
```

---

## 再開手順

### Step 1: インフラを再デプロイ

```bash
cd infra
npx cdk deploy --require-approval never
```

ECR リポジトリが作成されたタイミング（ターミナルに `44/46` 前後と表示）で
ECS サービスが「イメージがない」と判断して止まる。**Ctrl+C で中断してよい**。

> 詳細は [aws-deploy-guide.md](./aws-deploy-guide.md) の Step 3 を参照。

### Step 2: ECR にイメージを push

```bash
# ECR の URL を取得
ECR_URL=$(aws ecr describe-repositories --repository-names reversi-app \
  --query 'repositories[0].repositoryUri' --output text)

# ECR にログイン
aws ecr get-login-password --region ap-northeast-1 \
  | docker login --username AWS --password-stdin $ECR_URL

# イメージをビルド（プロジェクトルートで実行）
docker build -t reversi-app:latest .

# タグを付けて push
docker tag reversi-app:latest $ECR_URL:latest
docker push $ECR_URL:latest
```

### Step 3: ECS サービスを再デプロイ

```bash
cd infra
npx cdk deploy --require-approval never
```

インフラに変更がなければすぐ完了し、ECS がイメージを取得してコンテナを起動する。

### Step 4: DB を初期化

RDS は `cdk destroy` で削除されているため、テーブルを再作成する必要がある。

```bash
# タスク ID とクラスター名を取得
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

コンテナ内で DDL を実行：

```bash
# コンテナ内で実行（mysql/init.sql の内容を貼り付ける）
mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME < /dev/stdin << 'EOF'
-- mysql/init.sql の内容をここに貼り付ける
EOF
```

### Step 5: 動作確認

```bash
# ALB の DNS 名を確認
aws elbv2 describe-load-balancers \
  --query 'LoadBalancers[?contains(LoadBalancerName, `Revers`)].DNSName' \
  --output text

# ヘルスチェック
curl http://<ALBのDNS名>/health
# → {"status":"ok"} が返れば OK
```

---

## 停止・再開 チェックリスト

### 停止前

- [ ] 残したいデータがあれば `mysqldump` でエクスポート済み
- [ ] `cd infra && npx cdk destroy` を実行
- [ ] AWS コンソールでリソースが消えたことを確認

### 再開前

- [ ] `cd infra && npx cdk deploy` でインフラ再構築
- [ ] ECR にイメージを push
- [ ] `cdk deploy` を再実行して ECS を安定化
- [ ] ECS Exec でコンテナに入り DB の DDL を実行
- [ ] `curl /health` でヘルスチェックが通ることを確認
