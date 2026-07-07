# diffwww

macOS 向けの差分比較ツール。ディレクトリ比較に加え、git のコミット間・ブランチ間の比較ができます。

## 機能

- **フォルダ比較モード**：左右2つのディレクトリツリーを再帰的に比較（追加 / 削除 / 変更 / 同一）
- **git比較モード**：1つのリポジトリ内で、2つのブランチまたはコミットを比較（読み取り専用の git CLI 実行）
- テキストファイルの左右 Split Diff 表示（行番号付き・長い行は水平スクロール対応）
- バイナリファイルのサイズ・ハッシュ・更新日時表示
- ファイル名・ステータス（追加 / 削除 / 変更 / 同一）によるフィルタ・検索・統計バッジ
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

## 開発

```bash
pnpm install
pnpm tauri dev    # 開発モードで起動（Vite + Tauri）
```

## ビルド

```bash
pnpm tauri build
```

生成物：

- `.app`: `src-tauri/target/release/bundle/macos/diffwww.app`
- `.dmg`: `src-tauri/target/release/bundle/dmg/diffwww_<version>_aarch64.dmg`

コード署名・公証は行っていないため、初回起動時は Gatekeeper の確認が必要な場合があります。

## アプリアイコンの再生成

リポジトリ直下の `AppIcon.svg` をソースとして、アイコン一式（`src-tauri/icons/`）の再生成からリリースビルド・macOS アイコンキャッシュクリアまでを一括で行います。

```bash
pnpm rebuild:icon
```

- SVG → PNG 変換には `rsvg-convert`（`brew install librsvg`）を優先使用し、なければ macOS 標準の `qlmanage` を使用します
- アイコンキャッシュクリアには sudo が必要です（実行できない環境ではスキップされます）

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
