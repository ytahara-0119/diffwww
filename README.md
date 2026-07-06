# diffwww

macOS 向けの差分比較ツール。ディレクトリ比較に加え、git のコミット間・ブランチ間の比較ができます。

> **Status: 仕様策定・開発プロセス整備フェーズ**（実装は未着手）

## 機能（予定 / MVP）

- **フォルダ比較モード**：左右2つのディレクトリツリーを再帰的に比較（追加 / 削除 / 変更 / 同一）
- **git比較モード**：1つのリポジトリ内で、2つのブランチまたはコミットを比較
- テキストファイルの左右 Split Diff 表示（行番号付き）
- バイナリファイルのサイズ・ハッシュ・更新日時表示
- ファイル名・ステータスによるフィルタ・検索
- Finder からのドラッグ＆ドロップでパスを入力

詳細は [SPEC.md](SPEC.md) を参照。

## 技術スタック

Tauri (Rust) + React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui / pnpm

## 必要環境

| ツール | バージョン |
|--------|-----------|
| Rust | 1.77 以上 (`rustup` 推奨) |
| Node.js | 18 以上 |
| pnpm | 8 以上 (`npm install -g pnpm`) |
| Xcode Command Line Tools | `xcode-select --install`（git もこれで導入される） |

## 開発プロセス

本プロジェクトは Claude Code の Supervisor / Implementer エージェント体制で開発する。

| ドキュメント | 内容 |
|------------|------|
| [CLAUDE.md](CLAUDE.md) | Claude への指示書（最重要ルール・エージェント運用・禁止事項） |
| [SPEC.md](SPEC.md) | 仕様の正本 |
| [docs/workflow.md](docs/workflow.md) | issue 一覧・ワークフロールール・過去プロジェクトの教訓 |
| [agents/supervisor.md](agents/supervisor.md) | 監督エージェントの定義 |
| [agents/implementer.md](agents/implementer.md) | 作業エージェントの定義 |
| [issues/issue-template.md](issues/issue-template.md) | issue テンプレート |

### スクリプト

```bash
bash scripts/parallel-check.sh    # 並列実行可能な issue グループを表示
bash scripts/workflow-status.sh   # MVP 進捗ダッシュボード
```

## ライセンス

MIT
