# issue06

## Issue ID
issue06

## Title
Tauri IPC 連携：フォルダ比較（実フォルダ走査・差分計算）

## Purpose
フォルダ比較モードをモックから実データに差し替える。Rust 側で再帰走査・段階比較・Myers 差分を実装する。

## Background
SPEC.md §6.1〜6.2（フォルダ比較コマンド群）、§6.4〜6.5。

## Scope
- Rust 側（src-tauri）：
  - `compare_directories(left, right) -> Vec<FileNode>`（段階比較：存在 → サイズ → SHA-256 → テキスト判定）
  - `read_file_content(path) -> String`（1MB上限、超過時はエラーメッセージ）
  - `compute_diff(left_text, right_text) -> Vec<DiffLine>`（`similar` クレート。Replace→modified、Insert→added、Delete→deleted にマップ）
  - `open_folder_dialog() -> Option<String>`
  - `.git` / `node_modules` / `target` 等の自動スキップ、アクセス不可ファイルのスキップ
- フロント側：
  - `src/app/lib/ipc.ts`（invoke ラッパー、Rust から返る JSON の型付け）
  - `src/app/App.tsx`：フォルダ比較の実行パスを IPC に差し替え（モックデータ・git比較のモック動作は残す）
  - Finder D&D（`onDragDropEvent`、ウィンドウ左右でパス振り分け）

## Out of Scope
- git比較の IPC（issue07）
- mockData.ts の削除（禁止。git比較がまだモックのため）

## Editable Files
- src-tauri/src/
- src-tauri/Cargo.toml
- src-tauri/capabilities/
- src-tauri/tauri.conf.json
- src/app/lib/ipc.ts
- src/app/App.tsx

## Do Not Edit
- src/app/types.ts
- src/app/utils/mockData.ts
- src/app/components/
- SPEC.md

## Dependencies
- issue05

## Branch
feature/issue06-ipc-directory

## Implementation Notes
- Rust の FileNode / DiffLine は serde で camelCase にリネームし、TypeScript の型（src/app/types.ts）と一致させる
- 比較処理は async コマンドとして実装し、UIをブロックしない
- SHA-256 はストリーム処理（大容量ファイル対応）
- テキスト判定：先頭バイトに NUL を含むか等の簡易判定でよい
- D&D の座標系・イベント順序は docs/workflow.md「プラットフォーム固有 API の取り扱い」を必ず先に読む（Tauri v2 の position は論理ピクセル、macOS では leave が drop より先に発火することがある）
- モードによる D&D の挙動差（SPEC.md §6.4）：フォルダ比較=左右振り分け

## Acceptance Criteria
- [ ] 実フォルダ2つを比較してツリーが表示される（4ステータスが正しく判定される）
- [ ] テキストファイル選択で実内容の Split Diff（modified 行含む）が表示される
- [ ] バイナリファイルでサイズ・SHA-256・更新日時が表示される
- [ ] `.git` / `node_modules` / `target` がスキップされる
- [ ] 1MB 超のテキストファイルでメッセージが表示される
- [ ] フォルダ選択ダイアログと Finder D&D（左右振り分け）でパスを入力できる
- [ ] アクセス不可ファイルがあってもクラッシュしない
- [ ] `cargo check`（または `pnpm tauri build` の Rust コンパイル）が警告なしで通る

## Definition of Done
- [ ] 上記 Acceptance Criteria を全項目確認した
- [ ] SPEC.md と矛盾しない
- [ ] 実装内容を簡潔に説明できる
- [ ] Pull Request を作成した
