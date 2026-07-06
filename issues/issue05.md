# issue05

## Issue ID
issue05

## Title
App 統合（ヘッダー・モードタブ・GitRefSelector・検索・フィルタ・統計バッジ・空状態）

## Purpose
issue03/04 のコンポーネントとモックデータを統合し、モックで全画面遷移が動作するアプリを完成させる。

## Background
SPEC.md §4.1〜4.3, §4.7〜4.10, §5.1。ビジュアルは Figma Make デザイン Screen 01〜04 が正。

## Scope
- `src/app/components/Header.tsx`：
  - AppLogo（ティールのΔ + diffwww）+ モードタブ（フォルダ比較 / git比較）
  - フォルダ比較モード：左右パス入力欄（フォルダ選択ボタン付き）+ 比較ボタン
  - git比較モード：リポジトリパス入力欄 + A/B 各組（ブランチセレクト + コミットセレクト）+ 比較ボタン
  - 検索ボックス・ステータスフィルタ・統計バッジ・プログレスバー
- `src/app/components/EmptyState.tsx`：D&D案内の空状態（Screen 03 準拠）
- `src/app/App.tsx`：全体統合
  - モード state と切り替え時の全リセット（SPEC.md §4.1）
  - 比較ボタン → 擬似ローディング（プログレスバー表示）→ モック結果表示
  - 検索（ファイル名部分一致）・フィルタ（ステータス）によるツリー絞り込み
  - 統計バッジ集計（git比較モードでは =N とフィルタ「同一」を非表示）
  - DirectoryTree + FileDetailView の連携（選択ファイルの詳細表示）

## Out of Scope
- 実際のファイルシステム走査・git 操作（issue06/07。ダイアログ・D&Dもモック動作でよい）

## Editable Files
- src/app/App.tsx
- src/app/components/Header.tsx
- src/app/components/EmptyState.tsx

## Do Not Edit
- src/app/types.ts
- src/app/utils/mockData.ts
- src/app/components/DirectoryTree.tsx
- src/app/components/FileDetailView.tsx
- src/app/components/TextDiffView.tsx
- src/app/components/BinaryFileView.tsx
- src-tauri/

## Dependencies
- issue03
- issue04

## Branch
feature/issue05-app-integration

## Implementation Notes
- 検索・フィルタはツリーを再帰的に絞り込む純関数として App 内に実装（ディレクトリは子がマッチする場合のみ残す）
- コミットセレクトの表示形式：`shortHash メッセージ · 日付`（等幅フォント）
- レイアウト：ツリーペイン w-[380px]、詳細ペイン flex-1（SPEC.md §5.1）
- 統計バッジ・タブ等の細部配色は Figma Make の Header 実装を踏襲

## Acceptance Criteria
- [ ] モードタブ切り替えで入力・結果・エラーがすべてリセットされる
- [ ] フォルダ比較モードで比較実行 → モックツリーと Split Diff が表示される
- [ ] git比較モードでブランチ/コミット選択 → 比較実行 → モック結果が表示される
- [ ] 検索・フィルタでツリーがリアルタイムに絞り込まれる
- [ ] 統計バッジが表示中のツリーと一致し、git比較モードでは =N が非表示になる
- [ ] 未入力時に EmptyState が表示される
- [ ] TypeScript コンパイルエラーがない

## Definition of Done
- [ ] 上記 Acceptance Criteria を全項目確認した
- [ ] SPEC.md と矛盾しない
- [ ] 実装内容を簡潔に説明できる
- [ ] Pull Request を作成した
