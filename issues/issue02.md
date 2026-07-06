# issue02

## Issue ID
issue02

## Title
型定義・モックデータ（types.ts / mockData.ts）

## Purpose
アプリ全体で使用するコアデータ型と、フォルダ比較・git比較両モードのモックデータを定義する。
issue03〜05 がこれをインポートしてUIを先行開発できる状態にする。

## Background
SPEC.md §3 のコアデータ型が正。モックデータの内容は Figma Make デザイン（SPEC.md §5.2 記載URL）のサンプルデータに合わせる。

## Scope
- `src/app/types.ts` の作成（SPEC.md §3 の型をそのまま実装）
- `src/app/utils/mockData.ts` の作成：
  - フォルダ比較用ツリー（`FileNode[]`）
  - git比較用の変更ファイルツリー（`FileNode[]`、identicalを含まない）
  - ブランチ一覧（`GitBranch[]`）・コミット一覧（`GitCommit[]`）
  - Split Diff 用の `DiffLine[]` サンプル
  - バイナリファイル比較用データ

## Out of Scope
- React コンポーネント実装（issue03以降）
- Tauri IPC（issue06/07）

## Editable Files
- src/app/types.ts
- src/app/utils/mockData.ts

## Do Not Edit
- src/app/App.tsx
- src/app/components/
- src-tauri/
- SPEC.md

## Dependencies
- issue01

## Branch
feature/issue02-types-mock

## Implementation Notes
- 型定義は SPEC.md §3 と完全一致させる（DiffLine は added/deleted/modified/unchanged の4種、leftContent/rightContent はオプショナル）
- DiffLine サンプルには4種すべてを含め、added では leftContent が undefined、deleted では rightContent が undefined になるケースを必ず含める（プレースホルダ行の描画確認用）
- 水平スクロール検証用に、120文字を超える長い行を必ず1行以上含める
- フォルダ比較ツリーは2階層以上、全 CompareStatus を網羅、テキスト/バイナリ両方を含む
- GitCommit の date は ISO 8601 文字列

## Acceptance Criteria
- [ ] `src/app/types.ts` が SPEC.md §3 の型定義と完全に一致する
- [ ] フォルダ比較用モックが全 CompareStatus を網羅している
- [ ] git比較用モック（ブランチ・コミット・ツリー）が存在する
- [ ] DiffLine サンプルに4種の行タイプと120文字超の長い行が含まれる
- [ ] バイナリファイルエントリに size / hash / modifiedDate が設定されている
- [ ] TypeScript コンパイルエラーがない

## Definition of Done
- [ ] 上記 Acceptance Criteria を全項目確認した
- [ ] SPEC.md と矛盾しない
- [ ] 実装内容を簡潔に説明できる
- [ ] Pull Request を作成した
