# AWS インフラ構成まとめ - Reversi App

リージョン: `ap-northeast-1`（東京）
IaC ツール: AWS CDK (TypeScript)

---

## インスタンス・リソース一覧

### 1. VPC（Virtual Private Cloud）

| 項目 | 値 |
|---|---|
| 最大 AZ 数 | 2（ap-northeast-1a / ap-northeast-1c） |
| NAT Gateway 数 | 1（AZ-A のパブリックサブネットに配置） |
| サブネット構成 | パブリック × 2、プライベート × 2 |

**役割:**
全リソースを収容するネットワーク基盤。外部との通信境界を定義し、リソースをパブリック・プライベートに分離する。

**関係するリソース:** ALB、ECS、RDS、NAT Gateway のすべてを内包する。

---

### 2. NAT Gateway

| 項目 | 値 |
|---|---|
| 配置場所 | パブリックサブネット（AZ-A） |
| 数 | 1 |

**役割:**
プライベートサブネットに置かれた ECS タスクがインターネットへアウトバウンド通信するための出口。ECR からのイメージ pull や外部 API 呼び出しに使用される。インバウンド通信はできない（片方向）。

**関係するリソース:**
- ECS タスク → NAT Gateway → インターネット（アウトバウンドのみ）

---

### 3. Application Load Balancer（ALB）

| 項目 | 値 |
|---|---|
| タイプ | インターネット向け（internet-facing） |
| 配置場所 | パブリックサブネット（AZ-A / AZ-B、マルチAZ） |
| リスナー | HTTP :80 |
| ターゲットポート | :3000（ECS コンテナ） |
| ヘルスチェック | `GET /health` → 200 OK（30 秒間隔） |
| セキュリティグループ | ALB SG（TCP:80 を 0.0.0.0/0 から許可） |

**役割:**
インターネットからのリクエストを受け付け、ECS コンテナへ振り分けるロードバランサー。DNS 名が CloudFormation Output として出力され、これがアプリの公開 URL となる。

**関係するリソース:**
- インターネット → ALB（HTTP :80）
- ALB → ECS タスク（HTTP :3000、ターゲットグループ経由）

---

### 4. Amazon ECR（Elastic Container Registry）

| 項目 | 値 |
|---|---|
| リポジトリ名 | `reversi-app` |
| イメージ保持数 | 最大 5 件（ライフサイクルルールで古いものを自動削除） |
| 削除ポリシー | DESTROY（CDK スタック削除時にリポジトリも削除） |

**役割:**
`docker build & push` したアプリのコンテナイメージを保存するレジストリ。ECS タスク起動時にここから `latest` タグのイメージを取得する。

**関係するリソース:**
- ECS タスク → ECR（イメージ pull、NAT Gateway 経由）
- Task Execution Role がイメージ pull の権限を持つ

---

### 5. ECS クラスター

| 項目 | 値 |
|---|---|
| タイプ | Fargate（サーバーレス） |
| 配置場所 | プライベートサブネット（AZ-A） |

**役割:**
Fargate タスクを管理する論理的なグループ。クラスター自体はリソースを消費せず、タスクの器として機能する。

**関係するリソース:** ECS サービス・タスクを内包する。

---

### 6. ECS タスク定義（Fargate）

| 項目 | 値 |
|---|---|
| CPU | 256（0.25 vCPU） |
| メモリ | 512 MB |
| コンテナポート | 3000 |
| イメージ取得元 | ECR `reversi-app:latest` |
| ログドライバー | awslogs（streamPrefix: `reversi`） |

**コンテナへの環境変数:**

| 変数名 | 取得元 | 内容 |
|---|---|---|
| `DB_NAME` | 直接指定 | `reversi` |
| `DB_USER` | 直接指定 | `admin` |
| `DB_HOST` | Secrets Manager | RDS エンドポイント |
| `DB_PASSWORD` | Secrets Manager | RDS パスワード |

**役割:**
アプリコンテナの設計図。CPU・メモリ・環境変数・ログ設定などを定義する。タスク起動時に Secrets Manager から DB 接続情報を自動的に環境変数へ注入する。

**関係するリソース:**
- ECR からイメージを取得
- Secrets Manager から `DB_HOST`・`DB_PASSWORD` を取得（Task Execution Role 経由）
- RDS へ MySQL 接続（Port :3306）
- CloudWatch Logs へログを送信

---

### 7. ECS サービス

| 項目 | 値 |
|---|---|
| 起動タイプ | Fargate |
| 配置場所 | プライベートサブネット（AZ-A） |
| 起動タスク数 | 1 |
| セキュリティグループ | ECS SG（ALB SG からの TCP:3000 のみ許可） |
| ECS Exec | 有効（コンテナ内でのコマンド実行が可能） |

**役割:**
タスク定義をもとにコンテナを常時 1 台稼働させる。タスクが落ちると自動で再起動する。ECS Exec を有効にすることで、DB の初期化など運用作業をコンテナ内で直接実行できる。

**関係するリソース:**
- ALB のターゲットグループに登録（ALB からトラフィックを受信）
- ECS クラスターの管理下

---

### 8. RDS（MySQL 8.0）

| 項目 | 値 |
|---|---|
| エンジン | MySQL 8.0 |
| インスタンスタイプ | t3.micro |
| 配置場所 | プライベートサブネット（AZ-A / AZ-B、VPC の private サブネット） |
| データベース名 | `reversi` |
| マルチ AZ | 無効（コスト削減） |
| 自動バックアップ | 無効（学習用途） |
| 削除保護 | 無効（学習用途） |
| セキュリティグループ | RDS SG（ECS SG からの TCP:3306 のみ許可） |
| 認証情報管理 | Secrets Manager（CDK が自動生成・保存） |

**役割:**
リバーシゲームのデータ（盤面・対戦結果など）を永続化するデータベース。プライベートサブネットに置かれており、インターネットから直接アクセスできない。ECS タスクからのみアクセス可能。

**関係するリソース:**
- ECS タスク → RDS（MySQL :3306）
- RDS が Secrets Manager にパスワードを自動生成・保存
- Task Execution Role が Secrets Manager の読み取り権限を保有

---

### 9. Secrets Manager

| 項目 | 値 |
|---|---|
| 生成元 | RDS インスタンス作成時に CDK が自動生成 |
| 保存内容 | `host`・`password` 等の DB 接続情報（JSON 形式） |

**役割:**
RDS のパスワードをコードやコンテナイメージに埋め込まずに安全に管理する。ECS タスクの起動時に Task Execution Role 経由で値を取得し、環境変数として注入する。

**関係するリソース:**
- RDS → Secrets Manager（パスワード自動生成・保存）
- Secrets Manager → ECS タスク（`DB_HOST`・`DB_PASSWORD` として注入）
- Task Execution Role（読み取り権限が付与される）

---

### 10. IAM Task Execution Role

| 項目 | 値 |
|---|---|
| 信頼されるサービス | `ecs-tasks.amazonaws.com` |
| 付与ポリシー | `AmazonECSTaskExecutionRolePolicy`（ECR pull・CloudWatch Logs 書き込み） |
| 追加権限 | Secrets Manager の読み取り（DB 接続情報シークレットのみ） |

**役割:**
ECS がコンテナを起動するときに使用するロール。ECR からのイメージ取得・Secrets Manager からの認証情報取得・CloudWatch Logs へのログ書き込みを許可する。アプリコードの実行ロールとは別物。

**関係するリソース:**
- ECR へのイメージ pull を許可
- Secrets Manager からの読み取りを許可
- CloudWatch Logs への書き込みを許可

---

### 11. CloudWatch Logs

| 項目 | 値 |
|---|---|
| ログドライバー | `awslogs` |
| ストリームプレフィックス | `reversi` |

**役割:**
ECS コンテナの標準出力・標準エラーをリアルタイムで収集・保存する。アプリのデバッグや障害調査に使用する。

**関係するリソース:**
- ECS タスク → CloudWatch Logs（コンテナログ）

---

## リソース間の関係図（テキスト版）

```
インターネット
    │
    │ HTTP :80
    ▼
[ALB]（パブリックサブネット、マルチAZ）
    │
    │ HTTP :3000（ECS SG で制限）
    ▼
[ECS Fargate タスク]（プライベートサブネット）
    │   │   │
    │   │   │ MySQL :3306（RDS SG で制限）
    │   │   ▼
    │   │ [RDS MySQL 8.0]（プライベートサブネット）
    │   │       │
    │   │       │ パスワード自動保存
    │   │       ▼
    │   │ [Secrets Manager] ──────────────┐
    │   │                                  │ DB_HOST/DB_PASSWORD 注入
    │   │                                  ▼
    │   │                        [ECS タスク起動時]
    │   │
    │   │ コンテナログ
    │   ▼
    │ [CloudWatch Logs]
    │
    │ アウトバウンド（ECR pull 等）
    ▼
[NAT Gateway]（パブリックサブネット）
    │
    ▼
インターネット
    │
    ▼
[ECR]（reversi-app イメージ）
```

---

## セキュリティグループの多段構成

| SG 名 | インバウンドルール | 目的 |
|---|---|---|
| ALB SG | TCP:80 ← `0.0.0.0/0` | インターネットからの HTTP アクセスを受け付ける |
| ECS SG | TCP:3000 ← ALB SG | ALB 以外からのコンテナへの直接アクセスを拒否する |
| RDS SG | TCP:3306 ← ECS SG | ECS タスク以外からの DB への直接アクセスを拒否する |

この構成により、インターネット → ALB → ECS → RDS という一方向のアクセス経路のみが許可され、各レイヤーへの不正アクセスを防ぐ。
