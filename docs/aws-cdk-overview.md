# AWS CDK によるリバーシアプリのインフラ構築 概念ガイド

## 目次

1. [全体アーキテクチャ](#1-全体アーキテクチャ)
2. [各AWSサービスの役割](#2-各awsサービスの役割)
3. [AWS CDK とは](#3-aws-cdk-とは)
4. [デプロイの流れ](#4-デプロイの流れ)
5. [セキュリティの考え方](#5-セキュリティの考え方)
6. [コスト感](#6-コスト感)
7. [用語集](#7-用語集)

---

## 1. 全体アーキテクチャ

```
[ユーザーのブラウザ]
        |
        | HTTP リクエスト
        ↓
[ALB: Application Load Balancer]   ← インターネットの入り口
        |
        | リクエストを転送
        ↓
[ECS Fargate]                      ← Node.js アプリが動く場所
  └── タスク（コンテナ）
        |
        | SQL クエリ
        ↓
[RDS: MySQL]                       ← データベース
```

これらすべてが **VPC（仮想ネットワーク）** の中に収まっています。

---

## 2. 各AWSサービスの役割

### VPC（Virtual Private Cloud）
AWSクラウド内に作る「自分専用のネットワーク空間」です。

```
VPC（10.0.0.0/16）
├── パブリックサブネット    ← インターネットからアクセスできる領域
│   └── ALB を配置
└── プライベートサブネット  ← インターネットから直接アクセスできない領域
    ├── ECS Fargate を配置
    └── RDS を配置
```

**なぜ分けるのか？**
アプリやDBをインターネットから直接見えない場所に置くことでセキュリティを高めるためです。
外部からのリクエストは必ずALBを経由させます。

---

### ALB（Application Load Balancer）
インターネットからのHTTPリクエストを受け取り、ECSのコンテナに転送する役割です。

- ポート80（HTTP）でリクエストを受け付ける
- 複数のコンテナがある場合は負荷を分散する
- ALBのDNS名（`xxxxx.ap-northeast-1.elb.amazonaws.com`）がアプリのURLになる

---

### ECS Fargate（Elastic Container Service）
Dockerコンテナを動かすサービスです。

**重要な概念：**

| 概念 | 説明 | 例え |
|------|------|------|
| **クラスター** | コンテナの実行環境のまとまり | 工場全体 |
| **タスク定義** | コンテナの設計図（CPU・メモリ・環境変数など） | 作業マニュアル |
| **タスク** | 実際に動いているコンテナ | 働いている作業員 |
| **サービス** | タスクを管理する仕組み（落ちたら自動再起動など） | 工場の管理者 |

**Fargateとは？**
ECSにはEC2モードとFargateモードがあります。
Fargateはサーバー自体の管理が不要な「サーバーレス」なコンテナ実行環境です。
OSのパッチ当てやサーバーのスケールを自分で管理する必要がありません。

---

### ECR（Elastic Container Registry）
DockerイメージをAWSに保存する場所です。

```
ローカル環境
  └── docker build → Dockerイメージ作成
        └── docker push → ECR に保存
                            └── ECS が ECR からイメージを取得して起動
```

DockerHubのAWS版と思えばOKです。

---

### RDS（Relational Database Service）
フルマネージドなMySQLサービスです。

- OSやMySQLのアップデートをAWSが自動で管理
- 自動バックアップ機能あり
- 現在 `docker-compose.yaml` で動かしているMySQLの本番版

---

### Security Group（セキュリティグループ）
各AWSリソースに設定するファイアウォールルールです。

このアプリでは3つのセキュリティグループが必要です：

```
[ALB用 SG]
  受信: 0.0.0.0/0（全インターネット）からポート80を許可
  送信: ECSへのトラフィックを許可

[ECS用 SG]
  受信: ALBのSGからのトラフィックのみ許可
  送信: RDSへの3306ポートを許可

[RDS用 SG]
  受信: ECSのSGからの3306ポートのみ許可
  送信: なし
```

---

## 3. AWS CDK とは

### 概要
**AWS Cloud Development Kit** の略で、AWSのインフラをプログラミング言語で定義するツールです。

```typescript
// CDKのコード例（TypeScriptで書ける）
const vpc = new ec2.Vpc(this, 'ReversiVpc', {
  maxAzs: 2,
});

const database = new rds.DatabaseInstance(this, 'ReversiDB', {
  engine: rds.DatabaseInstanceEngine.mysql({ version: ... }),
  vpc,
});
```

このコードを実行すると、AWSに実際のVPCとRDSが作成されます。

---

### CDKの動作原理

```
CDKコード（TypeScript）
        |
        | cdk synth（合成）
        ↓
CloudFormation テンプレート（YAML）
        |
        | cdk deploy（デプロイ）
        ↓
AWS上にリソースが作成される
```

CDKは内部的にCloudFormationに変換されます。
CloudFormationはAWSネイティブのIaCサービスで、CDKはその上位レイヤーです。

---

### CDKプロジェクトの構造

```
infra/
├── bin/
│   └── app.ts          ← CDKアプリのエントリーポイント
├── lib/
│   └── reversi-stack.ts ← インフラの定義（Stack）
├── cdk.json            ← CDKの設定ファイル
└── package.json
```

**Stackとは？**
関連するAWSリソースをひとまとめにしたものです。
`cdk deploy` でStackごとにデプロイ・削除ができます。

---

### 主要コマンド

| コマンド | 説明 |
|----------|------|
| `cdk bootstrap` | CDKをAWSアカウントで使えるように初期設定（最初の1回だけ） |
| `cdk synth` | CloudFormationテンプレートを生成（確認用） |
| `cdk diff` | 現在のAWS環境との差分を表示 |
| `cdk deploy` | AWSにデプロイ |
| `cdk destroy` | 作成したリソースをすべて削除 |

---

## 4. デプロイの流れ

### 初回デプロイ

```
Step 1: AWS CLI の設定
        aws configure
        （アクセスキー・シークレットキー・リージョンを設定）

Step 2: CDK の初期設定
        cdk bootstrap

Step 3: Dockerイメージのビルド & ECRへpush
        docker build -t reversi-app .
        docker push [ECR_URL]/reversi-app

Step 4: CDKデプロイ
        cdk deploy
        → VPC, ECS, RDS, ALB, Security Group が自動作成

Step 5: DBの初期化
        RDSにSSH経由で接続してDDLを実行
        （bin/load_ddl.sh の内容をRDSに流す）

Step 6: アクセス確認
        ALBのURLをブラウザで開く
```

### コード変更時の更新フロー

```
コードを変更
    ↓
docker build & push（新しいDockerイメージ）
    ↓
cdk deploy（ECSタスク定義が更新される）
    ↓
ECSが新しいコンテナを起動し、古いコンテナを停止（ダウンタイムなし）
```

---

## 5. セキュリティの考え方

### 現在のコードの問題点

`src/infrastructure/connection.ts` にDB接続情報がハードコードされています：

```typescript
// 現在（危険）
password: 'password',
host: 'localhost',
```

### AWS Secrets Manager を使う方法

本番環境では **AWS Secrets Manager** にDBのパスワードを保管し、
アプリは起動時にSecretsManagerから取得します。

```
Secrets Manager（パスワードを安全に保管）
        |
        | 起動時に取得
        ↓
ECS タスク（環境変数としてコンテナに注入）
        |
        ↓
アプリ（process.env.DB_PASSWORD で参照）
```

CDKを使うとRDSとSecretsManagerの連携を自動設定できます。

---

## 6. コスト感

### 無料枠の活用

AWSには **12ヶ月間の無料枠** があります：

| サービス | 無料枠 |
|----------|--------|
| EC2 t2.micro | 750時間/月 |
| RDS db.t3.micro | 750時間/月 |
| ECR | 500MB/月 |

### 無料枠を超えた場合の月額目安（東京リージョン）

| サービス | 月額目安 |
|----------|----------|
| ECS Fargate（0.25vCPU, 0.5GB）| 約 $10 |
| RDS db.t3.micro（MySQL）| 約 $15 |
| ALB | 約 $16 |
| **合計** | **約 $40〜50/月** |

> **注意:** ALBが意外と高いです。開発・検証段階では ALB を使わずに
> ECSのパブリックIPに直接アクセスする構成にすることでコストを下げられます。

### コストを抑えるTips

- 使わないときは `cdk destroy` でリソースを削除する（データは消える）
- RDSのマルチAZ配置はOFFにする（本番では推奨だがコスト2倍）
- Fargateの最小スペックを使う（0.25vCPU / 0.5GB）

---

## 7. 用語集

| 用語 | 説明 |
|------|------|
| **IaC** | Infrastructure as Code。インフラをコードで管理する手法 |
| **VPC** | AWS内の仮想ネットワーク空間 |
| **サブネット** | VPC内をさらに分割したネットワーク区画 |
| **ALB** | Application Load Balancer。HTTPリクエストを振り分ける |
| **ECS** | Elastic Container Service。Dockerコンテナを動かすサービス |
| **Fargate** | サーバー管理不要なコンテナ実行環境 |
| **ECR** | Elastic Container Registry。DockerイメージのAWS版保管場所 |
| **RDS** | Relational Database Service。フルマネージドなDB |
| **Security Group** | AWSリソースへのアクセス制御（ファイアウォール） |
| **CDK** | Cloud Development Kit。TypeScriptでAWSインフラを定義するツール |
| **Stack** | CDKで管理するAWSリソースのまとまり |
| **Bootstrap** | CDKを使うためのAWSアカウントへの初期設定 |
| **Secrets Manager** | APIキーやパスワードを安全に管理するAWSサービス |
| **CloudFormation** | AWSネイティブのIaCサービス。CDKはこれに変換される |
