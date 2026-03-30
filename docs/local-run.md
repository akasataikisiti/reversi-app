# ローカル起動ガイド

このプロジェクトをローカルで動かすための手順をまとめています。

## 前提

- Node.js と npm
- Docker と Docker Compose

## セットアップ手順

1. 依存関係をインストール

```bash
npm install
```

2. MySQL を起動

```bash
docker-compose up -d
```

3. データベース初期化 (DDL の投入)

```bash
bash bin/load_ddl.sh
```

4. アプリを起動

```bash
npm start
```

起動後に `http://localhost:3000` へアクセスします。

## 補足

- MySQL へ接続する場合は以下のスクリプトを使えます。

```bash
bash bin/connect_mysql.sh
```

- アプリの実行は `nodemon` + `ts-node` で行われます（`nodemon.json` 参照）。

