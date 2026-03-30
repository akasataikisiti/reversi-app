# AWS 料金確認方法

---

## 1. AWS Cost Explorer（おすすめ・一番わかりやすい）

**AWS コンソール → Billing → Cost Explorer**

- サービス別・リソース別に実際の請求額を確認できる
- 「先月いくらかかったか」「今月の日別推移」などをグラフで見られる
- 初回は有効化が必要（無料）

---

## 2. 請求ダッシュボード（今月の概算をすぐ確認）

**AWS コンソール → Billing → Bills**

- 現時点での今月の累計料金が確認できる
- サービスごとの内訳も確認できる

---

## 3. AWS CLI でリソースの存在確認（削除漏れチェック）

「削除したつもりがリソースが残っている」確認に使える：

```bash
# ECS サービスが残っているか
aws ecs list-services \
  --cluster $(aws ecs list-clusters --query 'clusterArns[0]' --output text) 2>/dev/null

# RDS インスタンスが残っているか
aws rds describe-db-instances \
  --query 'DBInstances[*].[DBInstanceIdentifier,DBInstanceStatus]' \
  --output table

# ALB が残っているか
aws elbv2 describe-load-balancers \
  --query 'LoadBalancers[*].[LoadBalancerName,State.Code]' \
  --output table

# NAT Gateway が残っているか（最もコストがかかる）
aws ec2 describe-nat-gateways \
  --query 'NatGateways[?State==`available`].[NatGatewayId,State]' \
  --output table
```

---

## 4. Billing Alert（予算超過をメール通知する）

事前に設定しておくと、指定金額を超えたときにメールで通知が届く。

**AWS コンソール → Billing → Budgets → 予算を作成**

- 月 $10 を超えたらメール通知、のように設定できる
- 学習用途では $5〜$10 を閾値にしておくと気づきやすい

---

## このプロジェクトで cdk destroy 後に確認するコマンド

`cdk destroy` 完了後、主要リソースが消えているか以下で確認する：

```bash
# NAT Gateway の確認（月額 ~$32 と最も高い）
aws ec2 describe-nat-gateways \
  --filter Name=state,Values=available \
  --query 'NatGateways[*].[NatGatewayId,VpcId]' \
  --output table

# RDS の確認（月額 ~$12）
aws rds describe-db-instances \
  --query 'DBInstances[*].[DBInstanceIdentifier,DBInstanceStatus,DBInstanceClass]' \
  --output table
```

どちらも出力が空であれば課金はほぼゼロと判断できる。
