# issue08

## Issue ID
issue08

## Title
アプリアイコン適用・.app パッケージ化・動作確認

## Purpose
AppIcon.svg を Tauri アイコンとして適用し、配布可能な .app / .dmg を生成して最終動作確認を行う。

## Background
リポジトリ直下の `AppIcon.svg`（Figma Make 生成、squircle + 透明マージンの完成形）をアイコンソースとする。docs/figma-make-prompt.md「アイコンの取り込み状況・使い方」参照。

## Scope
- `scripts/rebuild-icon.sh` の作成：
  1. AppIcon.svg → 1024×1024 PNG 変換
  2. `pnpm tauri icon` で src-tauri/icons/ を生成
  3. リリースビルド + macOS アイコンキャッシュクリア
- `package.json` に `rebuild:icon` スクリプトを追加
- `src-tauri/icons/` の生成物をコミット
- `pnpm tauri build` で .app / .dmg を生成
- README.md の開発・ビルド手順を実態に合わせて更新（Status 表記の削除含む）
- 最終動作確認（フォルダ比較・git比較・D&D・長い行の水平スクロール）

## Out of Scope
- コード署名・公証（MVP外）
- 新機能追加

## Editable Files
- scripts/rebuild-icon.sh
- package.json
- src-tauri/icons/
- src-tauri/tauri.conf.json
- README.md

## Do Not Edit
- src/app/
- src-tauri/src/
- SPEC.md

## Dependencies
- issue07

## Branch
feature/issue08-packaging

## Implementation Notes
- SVG→PNG 変換は macOS 標準ツールで可能（例：`qlmanage -t -s 1024` または `rsvg-convert` があればそちら）。スクリプト内でツールの存在チェックを行う
- `pnpm tauri icon` はマスク処理をしないため、AppIcon.svg 由来の PNG をそのまま渡す
- アイコンキャッシュクリアは Peekdiff の `scripts/rebuild-icon.sh` を参考にする

## Acceptance Criteria
- [ ] `pnpm rebuild:icon` が成功し、src-tauri/icons/ に .icns 等が生成される
- [ ] `pnpm tauri build` が成功し .app / .dmg が生成される
- [ ] 生成された .app を Finder から起動でき、Dock にティールのΔアイコンが表示される
- [ ] フォルダ比較・git比較が .app 上で動作する
- [ ] 長い行の Split Diff が水平スクロールで最後まで読める（Peekdiff 問題の最終確認）
- [ ] README.md のビルド手順通りに再現できる

## Definition of Done
- [ ] 上記 Acceptance Criteria を全項目確認した
- [ ] SPEC.md と矛盾しない
- [ ] 実装内容を簡潔に説明できる
- [ ] Pull Request を作成した
