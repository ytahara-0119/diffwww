# issue04

## Issue ID
issue04

## Title
FileDetailView コンポーネント（TextDiffView + BinaryFileView）

## Purpose
選択ファイルの差分詳細を表示する右ペインを実装する。**Peekdiff の「長い行が右に切れて読めない」問題への対策（SPEC.md §4.6）を本issueで確実に実装する。**

## Background
SPEC.md §4.6。ビジュアルは Figma Make デザイン Screen 01（Split Diff・長い行・水平スクロールバー）と Screen 04（バイナリ）が正。

## Scope
- `src/app/components/FileDetailView.tsx`：上部バー（ファイルパス + ステータスバッジ）+ テキスト/バイナリの出し分け
- `src/app/components/TextDiffView.tsx`：
  - 左右2カラム Split Diff（DiffLine[] を描画）
  - 4種の行タイプ：added=右のみ緑背景 / deleted=左のみ赤背景 / modified=左右同一行位置に黄背景 / unchanged=透明
  - プレースホルダ行（行番号なし・濃い地 + 斜線パターン）で左右の行位置を常に揃える
  - **長い行対策**：折り返しなし、左右ペインの水平・垂直スクロール同期、行番号ガターは sticky で左固定、水平スクロールバー常時表示、行背景色はスクロール領域全幅
- `src/app/components/BinaryFileView.tsx`：左右2枚のカード（サイズ / SHA-256 / 最終更新日時）、ハッシュ相違部分の黄ハイライト

## Out of Scope
- diff 計算ロジック（表示のみ。DiffLine[] は props で受け取る）
- App への組み込み（issue05）

## Editable Files
- src/app/components/FileDetailView.tsx
- src/app/components/TextDiffView.tsx
- src/app/components/BinaryFileView.tsx

## Do Not Edit
- src/app/App.tsx
- src/app/types.ts
- src/app/utils/mockData.ts
- src/app/components/DirectoryTree.tsx
- src-tauri/

## Dependencies
- issue02

## Branch
feature/issue04-file-detail-view

## Implementation Notes
- スクロール同期：一方のペインの scroll イベントでもう一方の scrollLeft / scrollTop を更新する（ループ防止のためフラグかイベント発生元の判定を入れる）
- コード内容は `<pre>` + `white-space: pre`（折り返し禁止）。内側コンテナに十分な min-width を持たせ、行要素の背景がコンテナ全幅に効くようにする
- スクロールバーのスタイルは Figma Make の CodeCol 実装（webkit-scrollbar、トラック #15181e / つまみ #3a404a、高さ3）を踏襲
- プレースホルダ判定：DiffLine の leftContent / rightContent が undefined の側をプレースホルダとして描画

## Acceptance Criteria
- [ ] 4種の行タイプが Figma Make デザイン通りの配色で表示される
- [ ] added / deleted 行の反対側にプレースホルダ行が表示され、左右の行位置が揃う
- [ ] 120文字超の行が折り返されず、水平スクロールで末尾まで読める
- [ ] 左ペインを水平/垂直スクロールすると右ペインが追従する（逆も同様）
- [ ] 水平スクロール中も行番号ガターが左端に固定される
- [ ] 行背景色が水平スクロール領域の全幅まで途切れない
- [ ] バイナリファイルでサイズ・ハッシュ（相違部分ハイライト付き）・更新日時が表示される
- [ ] TypeScript コンパイルエラーがない

## Definition of Done
- [ ] 上記 Acceptance Criteria を全項目確認した
- [ ] SPEC.md と矛盾しない
- [ ] 実装内容を簡潔に説明できる
- [ ] Pull Request を作成した
