# issue03

## Issue ID
issue03

## Title
DirectoryTree コンポーネント

## Purpose
比較結果ツリー（`FileNode[]`）を表示する左ペインコンポーネントを実装する。フォルダ比較・git比較の両モードで共通利用する。

## Background
SPEC.md §4.5。ビジュアルは Figma Make デザイン Screen 01/02 のツリーペインが正。

## Scope
- `src/app/components/DirectoryTree.tsx` の作成
  - ツリー形式表示（再帰、インデントで階層表現）
  - ステータス別カラー（左ボーダー2px + 低透過背景：added=emerald, deleted=rose, modified=amber, identical=zinc）
  - ディレクトリのクリック開閉（ChevronDown / ChevronRight）
  - ファイル選択のコールバック（`onSelect(node)`）と選択行のハイライト（primary色）
  - ファイルアイコン：テキスト=FileCode2、バイナリ=Binary
  - ペイン上部のバー（「ファイルツリー」ラベル + ファイル数）
- モックデータ（issue02）での表示確認

## Out of Scope
- 検索・フィルタのロジック（issue05。本コンポーネントは受け取った `FileNode[]` を表示するだけ）
- FileDetailView（issue04）
- App への組み込み（issue05）

## Editable Files
- src/app/components/DirectoryTree.tsx

## Do Not Edit
- src/app/App.tsx
- src/app/types.ts
- src/app/utils/mockData.ts
- src/app/components/FileDetailView.tsx
- src/app/components/TextDiffView.tsx
- src/app/components/BinaryFileView.tsx
- src-tauri/

## Dependencies
- issue02

## Branch
feature/issue03-directory-tree

## Implementation Notes
- props: `nodes: FileNode[]`, `selectedPath?: string`, `onSelect: (node: FileNode) => void`
- ファイル名は等幅フォント、行高 h-7、text-xs（Figma Make デザイン準拠）
- 開閉状態はコンポーネント内部の state で管理
- ステータス色クラスは Figma Make の `statusClass` 定義を踏襲する

## Acceptance Criteria
- [ ] モックツリーが階層表示され、ディレクトリが開閉できる
- [ ] 4ステータスすべてが色分け表示される
- [ ] ファイルクリックで onSelect が呼ばれ、選択行が primary 色でハイライトされる
- [ ] バイナリファイルに Binary アイコンが表示される
- [ ] TypeScript コンパイルエラーがない

## Definition of Done
- [ ] 上記 Acceptance Criteria を全項目確認した
- [ ] SPEC.md と矛盾しない
- [ ] 実装内容を簡潔に説明できる
- [ ] Pull Request を作成した
