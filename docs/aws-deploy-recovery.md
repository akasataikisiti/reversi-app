# デプロイ失敗時のリカバリガイド

## 結論：手動で消す必要はありません

CDK は内部的に CloudFormation を使っており、CloudFormation には**ロールバック機能**が組み込まれている。
デプロイが途中で失敗しても、作成済みのリソースは自動でクリーンアップされる。

---

## デプロイ失敗時の動作

### 初回デプロイ（スタックが存在しない状態）で失敗した場合

```
cdk deploy 実行
    ↓
リソースを順番に作成していく...
    ↓
途中でエラー発生（例：RDSの作成に失敗）
    ↓
CloudFormation が自動でロールバック開始
    ↓
それまでに作成したリソースを全て自動削除
    ↓
スタックの状態: ROLLBACK_COMPLETE（何も残らない）
```

作成途中のリソースは CloudFormation が自動でクリーンアップするため、手動削除は不要。

### 2回目以降のデプロイ（スタックが既に存在する状態）で失敗した場合

```
cdk deploy 実行（更新）
    ↓
変更部分のみ更新していく...
    ↓
途中でエラー発生
    ↓
CloudFormation が自動でロールバック開始
    ↓
デプロイ前の状態に戻る（既存リソースは保持される）
```

以前の正常な状態に自動で戻る。

---

## ただし、例外があります

### ① ROLLBACK_FAILED 状態になるケース

ロールバック自体が失敗することがある。主な原因：

```
例：S3バケットを作成後、中にオブジェクトが入った状態で
    ロールバックしようとすると削除できずに詰まる
    → ROLLBACK_FAILED
```

この場合は手動での対処が必要：

```bash
# 問題のあるリソースを特定
aws cloudformation describe-stack-events \
  --stack-name ReversiStack \
  --query 'StackEvents[?ResourceStatus==`DELETE_FAILED`]'

# 手動でリソースを削除した後、ロールバックを再試行
aws cloudformation continue-update-rollback \
  --stack-name ReversiStack
```

### ② 今回の構成で起きやすいケース

| リソース | リスク | 理由 |
|----------|--------|------|
| RDS | 低 | CDKが自動管理 |
| ECR | 中 | イメージを先にpushしていると削除できないことがある |
| NAT Gateway | 低 | 自動削除される |
| ECS | 低 | タスクが動いていても停止してから削除される |

---

## 失敗した時の実際の対処フロー

### 1. 失敗の原因を確認

```bash
aws cloudformation describe-stack-events \
  --stack-name ReversiStack \
  --query 'StackEvents[?contains(`["CREATE_FAILED","UPDATE_FAILED"]`, ResourceStatus)].[LogicalResourceId,ResourceStatusReason]' \
  --output table
```

### 2. スタックの現在の状態を確認

```bash
aws cloudformation describe-stacks \
  --stack-name ReversiStack \
  --query 'Stacks[0].StackStatus'
```

### 3. 状態ごとの対応

| スタックの状態 | 意味 | 対応 |
|---------------|------|------|
| `ROLLBACK_COMPLETE` | ロールバック成功・何も残っていない | コードを修正して `cdk deploy` し直す |
| `ROLLBACK_FAILED` | ロールバック失敗 | 原因リソースを手動削除 → `continue-update-rollback` |
| `UPDATE_ROLLBACK_COMPLETE` | 更新失敗・元の状態に戻った | コードを修正して `cdk deploy` し直す |

---

## ROLLBACK_FAILED の対処手順（詳細）

```bash
# 1. 削除できなかったリソースを確認
aws cloudformation describe-stack-events \
  --stack-name ReversiStack \
  --query 'StackEvents[?ResourceStatus==`DELETE_FAILED`].[LogicalResourceId,ResourceStatusReason]' \
  --output table

# 2. AWS コンソールまたは CLI でそのリソースを手動削除

# 3. ロールバックを続行（スキップするリソースを指定することも可能）
aws cloudformation continue-update-rollback \
  --stack-name ReversiStack \
  --resources-to-skip <スキップしたいリソースの論理ID>  # 必要な場合のみ

# 4. ロールバックの完了を待つ
aws cloudformation wait stack-rollback-complete \
  --stack-name ReversiStack
```

---

## CloudFormation コンソールでの確認方法

AWS コンソールから視覚的に確認することもできる：

```
AWS コンソール
  → CloudFormation
  → スタック → ReversiStack
  → 「イベント」タブ
     └── 失敗したリソースが赤く表示される
         └── ステータス理由（エラーメッセージ）を確認できる
```

---

## まとめ

- **基本的には自動でロールバック**されるため手動クリーンアップは不要
- `ROLLBACK_FAILED` になった場合のみ手動対処が必要
- 今回の構成（VPC・RDS・ECS・ALB）はロールバックが素直に効くリソースばかりなので、よほどのことがない限り手動削除は不要
- 失敗してもやり直しが効く設計になっているのが IaC の大きなメリットの一つ
