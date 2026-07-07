import { invoke } from '@tauri-apps/api/core'
import type { FileNode, GitBranch, GitCommit } from '../types'

// ---------------------------------------------------------------------------
// Tauri IPC ラッパー（SPEC.md §6.2 git比較）
// Rust 側 git.rs のコマンド（読み取り専用 git CLI）の引数・戻り値を型付けする。
// 戻り値の GitBranch / GitCommit / FileNode は Rust 側で serde camelCase に
// リネームされ、src/app/types.ts と一致する。
// Tauri 外（pnpm dev のブラウザ）では呼び出し側でモック動作へフォールバックすること。
// ---------------------------------------------------------------------------

/** 指定パスが git リポジトリか判定する */
export function isGitRepository(path: string): Promise<boolean> {
  return invoke<boolean>('is_git_repository', { path })
}

/** ブランチ一覧を返す（空リポジトリでは空配列） */
export function listBranches(repo: string): Promise<GitBranch[]> {
  return invoke<GitBranch[]>('list_branches', { repo })
}

/** 指定ブランチの最新コミット一覧（最大50件）を返す */
export function listCommits(repo: string, branch: string): Promise<GitCommit[]> {
  return invoke<GitCommit[]>('list_commits', { repo, branch })
}

/**
 * 2つの ref（refA = old / 左、refB = new / 右）を比較し、
 * 変更ファイルのみの FileNode ツリーを返す（identical は含まない）
 */
export function compareGitRefs(
  repo: string,
  refA: string,
  refB: string,
): Promise<FileNode[]> {
  return invoke<FileNode[]>('compare_git_refs', { repo, refA, refB })
}

/** `git show REF:PATH` で指定 ref のファイル内容を読み込む（1MB 超はエラー） */
export function readFileAtRef(
  repo: string,
  gitRef: string,
  path: string,
): Promise<string> {
  return invoke<string>('read_file_at_ref', { repo, gitRef, path })
}
