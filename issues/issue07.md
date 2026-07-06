# issue07

## Issue ID
issue07

## Title
Tauri IPC 連携：git比較（ブランチ/コミット一覧・ref間差分）

## Purpose
git比較モードをモックから実データに差し替える。Rust 側からシステム `git` CLI を実行し、コミット間・ブランチ間の差分を表示する。

## Background
SPEC.md §4.3, §6.2（git比較コマンド群）, §6.3（git連携方式）。docs/workflow.md「git 操作の取り扱い」を厳守する。

## Scope
- Rust 側（src-tauri、`git.rs` として分離）：
  - `is_git_repository(path) -> bool`（`git -C <path> rev-parse --is-inside-work-tree`）
  - `list_branches(repo) -> Vec<GitBranch>`（`git -C <repo> branch --format=...`）
  - `list_commits(repo, branch) -> Vec<GitCommit>`（`git -C <repo> log <branch> -50 --format=...`、区切り文字指定）
  - `compare_git_refs(repo, ref_a, ref_b) -> Vec<FileNode>`（`git diff --name-status -z A B` をパースしツリー構造に変換）
  - `read_file_at_ref(repo, git_ref, path) -> String`（`git show REF:PATH`、1MB上限）
- フロント側：
  - `src/app/lib/gitIpc.ts`（git系 invoke ラッパー）
  - `src/app/App.tsx`：git比較の実行パスを IPC に差し替え
    - リポジトリパス確定時に is_git_repository 検証 → ブランチ・コミット一覧を取得しセレクトに反映
    - 非リポジトリ時のエラーメッセージ表示
    - git比較モードの D&D はドロップ位置によらずリポジトリパスとして扱う（SPEC.md §6.4）
    - ファイル選択時に `read_file_at_ref` ×2 + `compute_diff` で遅延取得

## Out of Scope
- git への書き込み操作（禁止事項）
- mockData.ts の削除は本issueで実施可（全モードが実データ化されるため）。ただし削除する場合は動作確認後とする

## Editable Files
- src-tauri/src/
- src-tauri/Cargo.toml
- src/app/lib/gitIpc.ts
- src/app/App.tsx

## Do Not Edit
- src/app/types.ts
- src/app/components/
- SPEC.md

## Dependencies
- issue06

## Branch
feature/issue07-ipc-git

## Implementation Notes
- 使用可能な git コマンドは読み取り専用のみ：`diff` / `show` / `branch` / `log` / `rev-parse`（SPEC.md §6.3）
- 必ず `git -C <repoPath>` 形式。カレントディレクトリに依存しない
- `--name-status -z`（NUL区切り）でパースする（ファイル名の空白・日本語対策）。R（リネーム）は D+A のペア、C は A として扱ってよい
- name-status のステータスマップ：A→added, D→deleted, M→modified
- git比較の FileNode には identical を含めない（SPEC.md §4.4）
- git コマンド失敗時は stderr を含むエラーをフロントに返し、UI にエラー表示（クラッシュしない）
- エッジケース：空リポジトリ・detached HEAD・ブランチ0個で落ちないこと
- 動作確認は一時ディレクトリに `git init` したテスト用リポジトリで行う（開発リポジトリを比較対象にしない）

## Acceptance Criteria
- [ ] 実リポジトリのパス入力でブランチ・コミット一覧がセレクトに表示される
- [ ] ブランチ間比較で変更ファイルツリーが表示される（identical が含まれない）
- [ ] コミット間比較（同一ブランチの新旧コミット）が動作する
- [ ] 変更ファイル選択で両 ref の内容による Split Diff が表示される
- [ ] 非 git フォルダを指定するとエラーメッセージが表示される
- [ ] 左=old / 右=new の向きが SPEC.md §4.3 と一致する（featureで追加したファイルが added になる）
- [ ] 実装内に書き込み系 git コマンドが存在しない
- [ ] `cargo check` が警告なしで通る

## Definition of Done
- [ ] 上記 Acceptance Criteria を全項目確認した
- [ ] SPEC.md と矛盾しない
- [ ] 実装内容を簡潔に説明できる
- [ ] Pull Request を作成した
