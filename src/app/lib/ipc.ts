import { invoke, isTauri as tauriIsTauri } from '@tauri-apps/api/core'
import type { DiffLine, FileNode } from '../types'

// ---------------------------------------------------------------------------
// Tauri IPC ラッパー（SPEC.md §6.2 フォルダ比較 + 共通）
// Rust 側コマンドの引数・戻り値を型付けする。戻り値の FileNode / DiffLine は
// Rust 側で serde camelCase にリネームされ、src/app/types.ts と一致する。
// Tauri 外（pnpm dev のブラウザ）では isTauri() が false になるため、
// 呼び出し側でモック動作へフォールバックすること。
// ---------------------------------------------------------------------------

/** バイナリ詳細ビュー用の片側メタデータ（BinaryFileView の BinaryFileInfo と同形） */
export interface BinarySideMeta {
  size: number
  hash: string
  modifiedDate: string
}

export interface BinaryMeta {
  left?: BinarySideMeta
  right?: BinarySideMeta
}

/** Tauri ランタイム内で動作しているか（ブラウザ動作時は false） */
export function isTauri(): boolean {
  return tauriIsTauri()
}

/** invoke のエラー（Rust からは String が返る）を表示用メッセージに変換する */
export function toErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  return String(err)
}

/** 左右ディレクトリを再帰比較し FileNode ツリーを返す */
export function compareDirectories(left: string, right: string): Promise<FileNode[]> {
  return invoke<FileNode[]>('compare_directories', { left, right })
}

/** テキストファイルを読み込む（1MB 超は Rust 側がエラーメッセージを返す） */
export function readFileContent(path: string): Promise<string> {
  return invoke<string>('read_file_content', { path })
}

/** 左右テキストを Myers 差分計算し DiffLine 列を返す */
export function computeDiff(leftText: string, rightText: string): Promise<DiffLine[]> {
  return invoke<DiffLine[]>('compute_diff', { leftText, rightText })
}

/** バイナリファイルの左右メタデータ（サイズ・SHA-256・更新日時）を返す */
export function readBinaryMeta(left?: string, right?: string): Promise<BinaryMeta> {
  return invoke<BinaryMeta>('read_binary_meta', { left: left ?? null, right: right ?? null })
}

/** OS ネイティブのフォルダ選択ダイアログを開く（キャンセル時は null） */
export function openFolderDialog(): Promise<string | null> {
  return invoke<string | null>('open_folder_dialog')
}
