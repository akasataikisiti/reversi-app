# セキュリティ改善チェックリスト

このドキュメントは、現在の Reversi App を本番公開に近づけるためのセキュリティ観点の整理メモ。

## 現状の要約

守れている点:

- `RDS` はプライベートサブネットに配置されている
- `ECS` は `ALB` からの `3000` 番のみ受け付ける
- `RDS` は `ECS` からの `3306` 番のみ受け付ける
- DB パスワードは `Secrets Manager` 経由で注入している

弱い点:

- 公開入口が `HTTP` のみ
- API に認証・認可がない
- 入力検証が薄い
- `helmet`、rate limit、`CORS` 制御などの Web 防御がない
- `RDS` のバックアップや削除保護が無効

関連ファイル:

- [infra/lib/reversi-stack.ts](/home/kosuke-ub/work/portfolio/reversi-app/infra/lib/reversi-stack.ts)
- [src/main.ts](/home/kosuke-ub/work/portfolio/reversi-app/src/main.ts)
- [src/presentation/gameRouter.ts](/home/kosuke-ub/work/portfolio/reversi-app/src/presentation/gameRouter.ts)
- [src/presentation/turnRouter.ts](/home/kosuke-ub/work/portfolio/reversi-app/src/presentation/turnRouter.ts)
- [src/infrastructure/connection.ts](/home/kosuke-ub/work/portfolio/reversi-app/src/infrastructure/connection.ts)

## 優先度高

### 1. HTTPS を有効にする

理由:

- 現在は `ALB` が `HTTP:80` のみで公開されている
- 通信の盗聴や改ざんに弱い

対応:

- `ACM` 証明書を発行する
- `ALB` に `443` リスナーを追加する
- `80 -> 443` リダイレクトを設定する

## 2. 認証・認可を入れる

理由:

- 現状は誰でも `POST /api/games` や `POST /api/games/latest/turns` を叩ける
- 公開アプリとしては操作制御がない

対応候補:

- 管理者専用 API にトークン認証を入れる
- ログイン機構を追加する
- 少なくとも書き込み API だけでも保護する

## 3. 入力検証を強化する

理由:

- `turnCount` や `move.x`, `move.y` が十分に検証されていない
- 不正値や想定外リクエストへの耐性が弱い

対応:

- `zod` や `express-validator` でリクエストボディとパラメータを検証する
- 数値範囲、必須項目、型を明示的にチェックする

## 優先度中

### 4. `helmet` を導入する

理由:

- 現状はセキュリティヘッダが特に設定されていない

対応:

- `helmet` を導入して基本的なレスポンスヘッダを付与する

### 5. rate limit を入れる

理由:

- API が無制限に叩ける
- 悪意ある連打や雑な負荷に弱い

対応:

- `express-rate-limit` などを使って API のレート制限を入れる
- 特に `POST` 系 API を優先する

### 6. `CORS` ポリシーを明示する

理由:

- 今は同一オリジン前提で動いているが、今後構成が変わると挙動が曖昧になる

対応:

- 必要なオリジンのみ許可する
- 将来フロント分離するなら必須

### 7. エラーハンドリングとログを見直す

理由:

- 予期しないエラーをそのままログ出力している
- 情報漏えいは今のところ大きくないが、運用時はログ方針を決めた方がよい

対応:

- 本番用ログレベルを決める
- スタックトレースや機微情報をレスポンスに出さない
- 構造化ログを検討する

## 優先度中から低

### 8. `ECS Exec` の扱いを見直す

理由:

- 今は `enableExecuteCommand: true`
- IAM 運用が甘いとコンテナ内部に入れる

対応:

- 必要時のみ有効にする
- 使用者の IAM 権限を絞る

### 9. `RDS` の保護を強化する

理由:

- 現状は削除保護なし
- バックアップ無効
- `multiAz: false`

対応:

- `deletionProtection: true`
- `backupRetention` を設定
- 本番なら `multiAz: true` を検討

### 10. DB 接続管理を見直す

理由:

- 現状は `createConnection()` の単一接続
- 負荷や回復性を考えるとプールの方が自然

対応:

- `createPool()` の利用を検討する

### 11. CloudWatch Logs の保持期間を設定する

理由:

- 現状はロググループの保持方針が明示されていない

対応:

- 保持日数を決める
- 余計な長期保存を避ける

## アプリ側で確認すべきポイント

- [src/main.ts](/home/kosuke-ub/work/portfolio/reversi-app/src/main.ts)
  - `helmet` がない
  - rate limit がない
  - 認証がない
- [src/presentation/gameRouter.ts](/home/kosuke-ub/work/portfolio/reversi-app/src/presentation/gameRouter.ts)
  - `POST /api/games` が無保護
- [src/presentation/turnRouter.ts](/home/kosuke-ub/work/portfolio/reversi-app/src/presentation/turnRouter.ts)
  - `POST /api/games/latest/turns` の入力検証が薄い

## インフラ側で確認すべきポイント

- [infra/lib/reversi-stack.ts](/home/kosuke-ub/work/portfolio/reversi-app/infra/lib/reversi-stack.ts)
  - `80` のみ公開
  - `443` がない
  - `RDS` バックアップ無効
  - `RDS` 削除保護なし
  - `ECS Exec` 有効

## 本番公開前の最低限チェック

- `HTTPS` になっている
- 書き込み API に認証がある
- 入力検証がある
- `helmet` が入っている
- rate limit が入っている
- `RDS` バックアップが有効
- `RDS` 削除保護が有効
- `Secrets Manager` で認証情報を管理している

## このプロジェクトの現時点の評価

- 学習用・個人開発用としては最低限のネットワーク分離はできている
- ただし、本番公開用としては Web アプリ層の防御が不足している
- 最優先は `HTTPS`、認証、入力検証
