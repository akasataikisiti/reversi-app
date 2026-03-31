# インフラ質問まとめ 2026-03-31

このファイルは、当日のやりとりで確認した内容をまとめたものです。

## 1. ALB が 2 つあるように見える件

- このプロジェクトの CDK 定義では、ALB は 1 つだけ作成される。
- 実装上は `new elbv2.ApplicationLoadBalancer(this, 'ReversiAlb', ...)` が 1 回だけ呼ばれている。
- 2 つに見える理由は、ALB が 2 つの AZ にまたがるマルチ AZ 構成として図で表現されているため。

関連コード:

- [infra/lib/reversi-stack.ts](/home/kosuke-ub/work/portfolio/reversi-app/infra/lib/reversi-stack.ts)
- [aws-network-diagram.drawio](/home/kosuke-ub/work/portfolio/reversi-app/aws-network-diagram.drawio)

## 2. なぜ ALB をマルチ AZ にするのか

- 目的は可用性の向上。
- 1 つの AZ に障害があっても、ALB の入口が別 AZ 側で受け続けられる可能性が高くなる。
- ユーザは 1 つの ALB の DNS 名にアクセスするだけで、AZ を意識しない。

重要な整理:

- ユーザが「複数 AZ から接続する」というより、「1 つの URL に接続し、その入口が AWS 内部で複数 AZ にまたがっている」が正確。

## 3. VPC とサブネットの構成

- このプロジェクトでは VPC は 1 つだけ。
- `maxAzs: 2` と `subnetConfiguration` により、2AZ にまたがってサブネットが作られる。
- 結果として以下が作られる。

- パブリックサブネット 2 つ
- プライベートサブネット 2 つ

役割:

- パブリックサブネット: ALB、NAT Gateway 用
- プライベートサブネット: ECS、RDS 用

## 4. 各 AZ 上に同じものが作られるのか

リソースごとに異なる。

- ALB: 複数 AZ にまたがる
- NAT Gateway: 1 つだけ
- ECS: 利用可能なサブネットは複数だが、現状タスク数は 1
- RDS: `multiAz: false` なので単一 AZ

つまり、現状は「完全な高可用構成」ではない。

- 入口の ALB は耐障害性がある
- ただし ECS タスクと RDS は単一障害点が残る

## 5. ECS タスクが落ちたら再作成されるか

- 再作成される。
- これは ECS Service の標準機能。
- コードでは `new ecs.FargateService(...)` と `desiredCount: 1` で「常に 1 タスク維持したい」という desired state を宣言している。
- 落ちた場合、ECS Service が 1 に戻そうとして新しいタスクを起動する。

## 6. フロントからの応答に AZ は関係あるか

- フロントエンドやブラウザは AZ を意識しない。
- 接続先は常に ALB の URL。
- ただし、裏側で ECS タスクや RDS が単一 AZ に依存していると、AZ 障害は応答の安定性に影響する。

整理:

- フロントの実装上は AZ を意識しない
- でも可用性には AZ 構成が影響する

## 7. ブラウザから MySQL への通信

- ブラウザは MySQL に直接接続しない。
- 通信経路は次の通り。

```text
ブラウザ
  ↓ HTTP :80
ALB
  ↓ HTTP :3000
ECS アプリ
  ↓ MySQL :3306
RDS
```

条件:

- ブラウザが到達できるのは ALB のみ
- ECS は ALB からの 3000 番だけを受ける
- RDS は ECS からの 3306 番だけを受ける

## 8. この Web アプリはフロントエンド、バックエンド、サーバに分かれているか

- 論理的には分かれている
- ただしデプロイ単位としては一体型

構造:

- フロントエンド: `static/`
- API の入口: `src/presentation/`
- ユースケース: `src/application/`
- ドメイン: `src/domain/`
- DB アクセス: `src/infrastructure/`

ただし `src/main.ts` では、同じ Express アプリが

- `express.static('static')` で静的ファイルを返し
- `gameRouter` / `turnRouter` で API を処理する

ため、フロントと API は同じサーバに載っている。

## 9. `mysql.Connection` とは何か

- `mysql2/promise` ライブラリの MySQL 接続オブジェクト。
- Gateway や Repository はこれを受け取って SQL を実行する。

このプロジェクトでは [src/infrastructure/connection.ts](/home/kosuke-ub/work/portfolio/reversi-app/src/infrastructure/connection.ts) で接続を作る。

```ts
return await mysql.createConnection({
  host: process.env.DB_HOST ?? 'localhost',
  database: process.env.DB_NAME ?? 'reversi',
  user: process.env.DB_USER ?? 'reversi',
  password: process.env.DB_PASSWORD ?? 'password',
})
```

ローカルと本番での違い:

- コード上の使い方は同じ
- 違うのは接続先の値だけ

## 10. 本番時の DB 接続情報はどこで設定されるか

本番では ECS タスク定義でコンテナに注入される。

- `DB_NAME`: `'reversi'`
- `DB_USER`: `'admin'`
- `DB_HOST`: Secrets Manager の `host`
- `DB_PASSWORD`: Secrets Manager の `password`

つまり `connection.ts` は値の利用箇所であり、設定元は `infra/lib/reversi-stack.ts` の ECS タスク定義。

## 11. Secrets Manager に何が入るか

主に RDS の接続情報が入る。

このアプリが実際に使っているのは:

- `host`
- `password`

一般に RDS のシークレットには次のような JSON が入ることが多い。

```json
{
  "host": "xxxx.ap-northeast-1.rds.amazonaws.com",
  "username": "admin",
  "password": "generated-password",
  "dbname": "reversi",
  "port": 3306,
  "engine": "mysql"
}
```

ただしこのコードで ECS に注入しているのは `host` と `password` だけ。

## 12. `ReversiDb` とは何か

- CDK / CloudFormation 上の識別子。
- RDS インスタンスを定義する際の logical ID の元になる名前。

区別:

- `ReversiDb`: AWS リソースを識別するための名前
- `databaseName: 'reversi'`: MySQL 内のデータベース名

## 13. AWS 上の主な識別子一覧

スタックやリソース作成時に使われる主な識別子:

- `ReversiStack`
- `ReversiVpc`
- `AlbSg`
- `EcsSg`
- `RdsSg`
- `ReversiDb`
- `ReversiRepository`
- `ReversiCluster`
- `TaskExecutionRole`
- `ReversiTaskDef`
- `ReversiContainer`
- `ReversiService`
- `ReversiAlb`
- `HttpListener`
- `ReversiTarget`
- `AlbDnsName`

補足:

- これらはタグではなく、CDK 上の識別子であることが多い。
- 物理名は AWS 側で自動生成されることがある。
- ECR は `repositoryName: 'reversi-app'` が明示されている。

## 14. Name タグは使われているか

- 明示的な `Name` タグは使われていない。
- `cdk.Tags.of(...).add(...)` もない。
- したがって、`Name` タグでの整理ではなく、CloudFormation 由来の名前や物理名で見える構成。

タグを付けるなら最低限おすすめ:

- `Project`
- `Environment`
- `ManagedBy`
- `Name`

例:

- `Project=reversi-app`
- `Environment=prod`
- `ManagedBy=cdk`

## 15. フロントエンドと API サーバは AWS 上のどこに配置されるか

- フロントエンドと API サーバは別々の AWS サービスに分かれていない。
- 同じ ECS Fargate コンテナに載る。

構成:

```text
ブラウザ
  ↓
ALB
  ↓
ECS Fargate コンテナ
   ├─ static/ を返す
   └─ /api/... を処理する
  ↓
RDS(MySQL)
```

## 16. フロントエンドは Docker 管理されているか

- フロントエンド専用コンテナではないが、Docker イメージには含まれている。
- `Dockerfile` で `static/` がコンテナにコピーされる。
- Express がその `static/` を配信する。

つまり:

- フロントエンドと API は同じ Docker コンテナ
- MySQL は別リソース

## 17. ローカル実行時の配置

ローカルでは:

- フロントエンドと API サーバは同じ Node.js/Express プロセス
- MySQL は別の Docker コンテナ

構成:

```text
ローカルPC
  ├─ Node.js/Express プロセス
  │   ├─ フロント配信
  │   └─ API処理
  └─ MySQL コンテナ
```

## 18. ローカル検証に 1 つのコンテナだけで足りるか

- 足りない。
- 現状の標準手順では:

- `docker-compose up -d` で MySQL を起動
- `npm start` でアプリをローカル起動

つまり最低でも

- MySQL コンテナ
- Node.js アプリの実行環境

の 2 実体が必要。

## 19. 本番環境では 1 つの Docker コンテナにすべて載るか

- すべては載らない。
- 1 つのコンテナに載るのはフロントエンドと API サーバだけ。
- ALB は別の AWS リソース。
- MySQL は RDS であり、コンテナではない。

## 20. 「フロントエンドの静的ファイル」はビルド成果物か

このプロジェクトでは厳密には違う。

- バックエンドは `src/` から `dist/` にビルドされる
- フロントエンドは `static/` をそのままコピーして配信する

つまり:

- `dist/`: バックエンドのビルド成果物
- `static/`: 生の HTML/CSS/JS をそのまま配信する静的ファイル

## 21. Dockerfile は何のために使われるか

主用途は本番デプロイ用。

流れ:

- Dockerfile でアプリの Docker イメージを作る
- ECR に push する
- ECS Fargate がそのイメージを pull して起動する

ローカルの標準開発手順では、アプリ本体は Dockerfile を使わず `npm start` で起動するため必須ではない。

## 22. 本番で Dockerfile を使っているのはコード上のどこか

CDK が Dockerfile を直接読むわけではない。

関係は次の通り:

- デプロイ手順で `docker build` を実行する
- そのイメージを ECR に `docker push` する
- ECS は `ecs.ContainerImage.fromEcrRepository(repository, 'latest')` でそのイメージを使う

要するに:

- Dockerfile の使用箇所: デプロイ手順
- ECS が使う参照先: ECR 上のイメージ

## 23. MySQL サーバ側の Docker イメージはどう扱われるか

- ローカル開発専用
- `docker-compose.yaml` で `mysql:8.0.29` を起動
- 本番では使わず、RDS MySQL を使う

## 24. ローカルで MySQL を docker-compose で起動する必要性

- 今の用途では `docker-compose` が自然。
- 理由は、MySQL 自体を自作するのではなく、公式イメージを設定付きで起動したいだけだから。

整理:

- `Dockerfile`: 自前イメージを作るためのもの
- `docker-compose.yaml`: 既存イメージをどう起動するか定義するもの

このプロジェクトでは:

- アプリ本体は自前実装なので Dockerfile が必要
- MySQL は公式イメージをそのまま使うので docker-compose で十分

## 25. 全体像のまとめ

ローカル:

```text
ブラウザ
  ↓
Node.js/Express
  ├─ static/
  └─ /api
  ↓
MySQL コンテナ
```

本番:

```text
ブラウザ
  ↓
ALB
  ↓
ECS Fargate コンテナ
  ├─ static/
  └─ /api
  ↓
RDS MySQL
```

## 26. 補足

現状の構成は、学習用途や小規模運用向けとしては分かりやすい一方で、完全な高可用構成ではない。

理由:

- ALB はマルチ AZ
- ECS は `desiredCount: 1`
- RDS は `multiAz: false`

本番向けに高可用性を高めるなら、少なくとも以下を検討する。

- ECS タスク数を 2 以上にする
- 複数 AZ に ECS タスクを分散する
- RDS を Multi-AZ にする
