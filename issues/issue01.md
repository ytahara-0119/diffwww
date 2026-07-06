# issue01

## Issue ID
issue01

## Title
環境構築（Vite + React + TS + Tailwind + shadcn/ui + Tauri）

## Purpose
以降の全issueが動作する開発基盤を構築する。`pnpm tauri dev` でダークテーマのウィンドウが起動する状態にする。

## Background
SPEC.md §1.2 の技術スタックを使用する。テーマは Figma Make 確定値（SPEC.md §5.2 カラートークン表）をCSS変数として最初から組み込む。

## Scope
- pnpm + Vite + React 18 + TypeScript プロジェクト作成
- Tailwind CSS v4 + shadcn/ui セットアップ
- framer-motion / lucide-react の導入
- Tauri v2 セットアップ（アプリ名 diffwww、最小ウィンドウ 640×500）
- テーマCSS（SPEC.md §5.2 のカラートークンを `:root` / `.dark` に定義、`.dark` をデフォルト適用）
- フォント設定（UI: Inter系 / コード: JetBrains Mono系、フォールバック付き）
- `src/app/App.tsx` にプレースホルダ（AppLogoとアプリ名のみ）を表示

## Out of Scope
- 比較機能・コンポーネント実装（issue02以降）
- アイコン適用・パッケージ化（issue08）

## Editable Files
- package.json
- pnpm-lock.yaml
- pnpm-workspace.yaml
- vite.config.ts
- tsconfig.json
- tsconfig.node.json
- index.html
- components.json
- postcss.config.mjs
- src/main.tsx
- src/styles/globals.css
- src/app/App.tsx
- src-tauri/

## Do Not Edit
- SPEC.md
- CLAUDE.md
- issues/
- docs/

## Dependencies
（なし）

## Branch
feature/issue01-env-setup

## Implementation Notes
- Tauri v2 を使用（`pnpm create tauri-app` 相当の構成）
- `tauri.conf.json`: productName=diffwww, minWidth=640, minHeight=500
- テーマ値は SPEC.md §5.2 の表の値をそのまま使う（--background #1a1d23, --primary #2dd4bf 等）
- shadcn/ui は初期化のみでよい（コンポーネント追加は各issueで必要時に行う）

## Acceptance Criteria
- [ ] `pnpm install` が成功する
- [ ] `pnpm tauri dev` でダーク背景（#1a1d23）のウィンドウが起動する
- [ ] ウィンドウを 640×500 未満に縮小できない
- [ ] `pnpm build`（フロントエンドのみ）が型エラーなく成功する
- [ ] CSS変数に SPEC.md §5.2 のカラートークンが定義されている

## Definition of Done
- [ ] 上記 Acceptance Criteria を全項目確認した
- [ ] SPEC.md と矛盾しない
- [ ] 実装内容を簡潔に説明できる
- [ ] Pull Request を作成した
