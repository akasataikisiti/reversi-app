# 学習用リビルドルール

このプロジェクトでは、完成済み React アプリを学習用に段階的に再構築する。

## 目的
- 初学者がfinished-appディレクトリのReactプロジェクトをgit 履歴を追いながら実装を学べるようにする
- finished-appディレクトリのプロジェクトをカレントディレクトリに一から再構築する
- 各コミットは小さく意味のある単位にする
- コミットメッセージは必ず日本語にする

## 実装ルール
- 一度に大きく作り込みすぎない
- その段階で不要な抽象化は入れない
- 各ステップは動作確認可能な状態にする
- 各ステップの最後に、何を学ぶためのコミットかを短く説明する
- 既存完成版の機能を最終的に再現する
- 各ステップの終了時点で npm run build または npm run lint が通る状態を保つ。途中で壊れたまま次のステップに進まない

## コミットルール
- コミットメッセージは日本語
- タイトルと詳細部を分けて作成する
- 例: (各セクションタイトルなどは今回の作業用にそれぞれふさわしいものを適用してください。)
```
## 学ぶこと
- トグル（オン/オフ切り替え）の state 管理: includes + filter で配列を更新するパターン
- cn() で条件付きスタイルを適用する方法（isActive ? "green styles" : ""）
- Server Component の中に Client Component を埋め込める理由と仕組み
- general-post.tsx は Server Component だが、その中の ReactionPicker は Client Component
- Next.js は自動的に境界を判定して処理を分担する

## 追加ファイル
- src/components/reaction-picker.tsx: 👍❤️ 🚀👀 のリアクション切り替えコンポーネント

## 変更ファイル
- src/components/general-post.tsx: ReactionPicker を組み込み、justify-end → justify-between に変更
- src/components/poll-post.tsx: ReactionPicker を組み込み
- src/components/quiz-post.tsx: 結果画面・進行画面の両方に ReactionPicker を組み込み

## 状態の仕組み
- userReactions: string[] で「自分がリアクション済みのキー一覧」を管理
- ボタンクリック → toggleReaction() → includes で判定 → 追加 or filter で削除
- 表示カウント: reactions[key]（サーバーの値） + (選択中なら +1)
- API 呼び出しなし：クライアント側のみで完結するインタラクション
```

