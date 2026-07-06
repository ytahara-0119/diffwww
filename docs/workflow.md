# docs/workflow.md

## Issue 一覧と状態

| Issue | タイトル | 依存 | 並列グループ | 状態 |
|-------|---------|------|------------|------|
| issue01 | 環境構築（Vite + React + TS + Tailwind + shadcn/ui + Tauri） | なし | Group 1 | 未着手 |
| issue02 | 型定義・モックデータ（types.ts / mockData.ts） | issue01 | Group 2 | 未着手 |
| issue03 | DirectoryTree コンポーネント | issue02 | Group 3 | 未着手 |
| issue04 | FileDetailView コンポーネント（TextDiffView + BinaryFileView） | issue02 | Group 3 | 未着手 |
| issue05 | App 統合（ヘッダー・モードタブ・GitRefSelector・検索・フィルタ） | issue03, issue04 | Group 4 | 未着手 |
| issue06 | Tauri IPC 連携：フォルダ比較 | issue05 | Group 5 | 未着手 |
| issue07 | Tauri IPC 連携：git比較 | issue06 | Group 6 | 未着手 |
| issue08 | アイコン適用・.app パッケージ化・動作確認 | issue07 | Group 7 | 未着手 |

---

## 並列実行グループ

```
Group 1: issue01  （環境構築）
    ↓
Group 2: issue02  （型定義・モックデータ）
    ↓
Group 3: issue03 ┐
         issue04 ┘ 並列実行可（Editable Files が重複しない）
    ↓
Group 4: issue05  （App 統合）
    ↓
Group 5: issue06  （IPC：フォルダ比較）
    ↓
Group 6: issue07  （IPC：git比較）
    ↓
Group 7: issue08  （アイコン・パッケージ化）
```

※ issue06 と issue07 は両方 `App.tsx` と `src-tauri/src/` を編集するため並列化しない（競合回避ルール）。

---

## 依存関係

```
issue01
  └── issue02
        ├── issue03 ──┐
        └── issue04 ──┤
                      └── issue05
                            └── issue06
                                  └── issue07
                                        └── issue08
```

---

## 基本フロー

1. 人間が Supervisor に指示する
2. Supervisor が issue を作成する
3. issue ごとに branch を定義する
4. Implementer が実装する（ブランチは必ず最新 main から作成）
5. 実装完了後に Pull Request を作成する
6. 人間が PR をレビュー・マージする
7. main を最新に更新してから次の issue に進む
8. 完了後、人間確認で停止

---

## ブランチ命名

`feature/issueXX-short-name` 形式とする。

| Issue | ブランチ名 |
|-------|-----------|
| issue01 | feature/issue01-env-setup |
| issue02 | feature/issue02-types-mock |
| issue03 | feature/issue03-directory-tree |
| issue04 | feature/issue04-file-detail-view |
| issue05 | feature/issue05-app-integration |
| issue06 | feature/issue06-ipc-directory |
| issue07 | feature/issue07-ipc-git |
| issue08 | feature/issue08-packaging |

---

## PR 作成ルール

- issue 実装完了後に必ず `gh pr create` で PR を作成する
- base ブランチは常に `main`
- PR タイトルは `feat(issueXX): <タイトル>` 形式
- **PR 作成前に Acceptance Criteria / Definition of Done の全項目を確認する**
- 未完了項目がある場合は PR を作成しない
- 次の issue に着手する前に依存 issue の PR が main にマージ済みであること
- **ブランチは必ず最新 main から作成する**（古い main を起点にすると、前 issue の修正が含まれず再バグが発生する）

---

## issue 分割ルール

- 1 issue = 1責務
- 原則 1〜3 ファイルのみ変更
- 横断変更は禁止

---

## 競合回避ルール

- 同一ファイルを複数 issue で編集しない
- 共通変更は最後にまとめる
- **やむを得ず同一ファイルを複数 issue で触る場合は、1 本マージ完了 → 最新 main から次ブランチ作成 の順序を厳守する**
  - Peekdiff での教訓：3つの issue がすべて `App.tsx` を触った際、マージ順序のズレで import が消えホットフィックスが必要になった

---

## エージェント役割一覧

| 役割 | 定義ファイル | 責務 |
|------|------------|------|
| Supervisor | [`agents/supervisor.md`](../agents/supervisor.md) | issue 分割・依存整理・Implementer 起動・人間確認 |
| Implementer | [`agents/implementer.md`](../agents/implementer.md) | 指定 issue の実装・PR 作成 |

---

## 人間の役割

- issue 完了時の確認のみ行う
- 設計の方向修正を行う
- バグ・仕様ズレの最終判断を行う

---

## プラットフォーム固有 API の取り扱い

Tauri / OS 固有の API を使う issue では、実装前に以下を確認する（Peekdiff での教訓）：

- **座標系**: イベントの `position.x` が物理ピクセル（PhysicalPosition）か論理ピクセル（CSS px）か
  - 例：Tauri v2 の `onDragDropEvent` の `position.x` は論理ピクセル。`* devicePixelRatio` は不要
- **イベント発火順序**: OS によって順序が異なる場合がある
  - 例：macOS では `leave` が `drop` より先に発火することがある
- **HTML イベントの制限**: OS レベルのファイルドラッグは WebView の HTML drag イベント（`ondragenter` 等）が発火しない
  - 例：Finder → Tauri WebView の D&D は `onDragDropEvent` のみ使用可
- 公式ドキュメント・GitHub Issues で既知の挙動を事前確認してから issue を設計する

---

## git 操作の取り扱い（diffwww 固有）

git 連携機能を実装する issue では以下を厳守する：

- 比較対象リポジトリへの**書き込み系コマンドは一切実行しない**（SPEC.md §6.3 の許可コマンドのみ）
- git コマンドは必ず `git -C <repoPath> ...` 形式で実行し、カレントディレクトリに依存しない
- コマンド出力のパースは機械可読フォーマットを使う
  - 例：`git log --format=...`（区切り文字指定）、`git diff --name-status -z`（NUL 区切り、ファイル名に空白・日本語があっても安全）
- detached HEAD・空リポジトリ・ブランチ0個などのエッジケースでクラッシュしない
- テストは一時ディレクトリに `git init` したテスト用リポジトリで行い、開発リポジトリ自体を比較対象にしない
