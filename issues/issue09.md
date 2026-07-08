# issue09

## Issue ID
issue09

## Title
変更マーカーバー（ChangeMinimap）

## Purpose
VS Code のミニマップ変更マーカーのように、差分ビューの右端に「ファイル全体の中でどこが変更されたか」を一覧できる縦バーを追加し、クリックでその位置へジャンプできるようにする。

## Background
MVP完了後の人間レビューで要望が挙がった機能。SPEC.md §4.6「変更マーカーバー（ChangeMinimap）」として仕様追記済み（この節が正）。

## Scope
- `src/app/components/ChangeMinimap.tsx` の新規作成
  - props 例：`lines: DiffLine[]`, `scrollContainer`（または scrollTop/クライアント高さと onJump コールバック）
  - 行位置比例のマーカー描画（added=緑 / deleted=赤 / modified=黄、unchanged なし、隣接同タイプは結合可）
  - ビューポート窓（表示範囲の半透明ハイライト、垂直スクロール追従）
  - クリック（またはドラッグ）で該当行へジャンプ
- `src/app/components/TextDiffView.tsx` への組み込み
  - 右端に幅 8〜10px で常時表示
  - ジャンプは既存の左右同期スクロール機構を通す（両ペインが移動すること）
  - バイナリ表示時は関与しない（FileDetailView 側の出し分けは変更不要）

## Out of Scope
- ファイルツリー側スクロールバーへのマーカー
- コード内容の縮小描画（本物のミニマップ）
- 水平方向のマーカー

## Editable Files
- src/app/components/ChangeMinimap.tsx
- src/app/components/TextDiffView.tsx

## Do Not Edit
- src/app/App.tsx
- src/app/components/FileDetailView.tsx
- src/app/components/BinaryFileView.tsx
- src/app/types.ts
- src-tauri/
- SPEC.md

## Dependencies
- issue04
- issue08

## Branch
feature/issue09-change-minimap

## Implementation Notes
- 配色：バー背景 `#15181e`、マーカーはステータス色の低彩度版（emerald/rose/amber の /40〜/60 程度）、ビューポート窓は白の低透過（例 `bg-white/10`）
- マーカー位置・高さは `index / lines.length` 比で算出。1行分が細くなりすぎる場合は最小高さ 2px を保証
- TextDiffView の既存スクロール同期（rAF フラグ・幅統一）を壊さないこと。ジャンプは scrollTop 設定で実現し、同期機構に乗せる
- ドラッグ対応は任意（クリックジャンプは必須）

## Acceptance Criteria
- [ ] 差分ビュー右端にマーカーバーが常時表示される
- [ ] added / deleted / modified のマーカーが行位置に比例して正しい色で表示され、unchanged は表示されない
- [ ] ビューポート窓が現在の表示範囲を示し、垂直スクロールに追従する
- [ ] バークリックで該当位置へジャンプし、左右ペインが同期して移動する
- [ ] 既存の水平/垂直スクロール同期・sticky ガター・長い行表示が壊れていない
- [ ] バイナリファイル表示時にはバーが表示されない
- [ ] TypeScript コンパイルエラーがない

## Definition of Done
- [ ] 上記 Acceptance Criteria を全項目確認した
- [ ] SPEC.md と矛盾しない
- [ ] 実装内容を簡潔に説明できる
- [ ] Pull Request を作成した
