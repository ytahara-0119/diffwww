import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type {
  CompareMode,
  DiffLine,
  FileNode,
  GitRefSelection,
} from './types'
import {
  mockBinaryComparison,
  mockBranches,
  mockCommits,
  mockDiffLines,
  mockDirectoryTree,
  mockGitTree,
} from './utils/mockData'
import Header, { type CompareStats, type StatusFilter } from './components/Header'
import EmptyState from './components/EmptyState'
import DirectoryTree from './components/DirectoryTree'
import FileDetailView from './components/FileDetailView'
import type { BinaryFileInfo } from './components/BinaryFileView'

// ---------------------------------------------------------------------------
// App（SPEC.md §4.1〜4.3, §4.7〜4.10, §5.1）
// モード state・比較実行（擬似ローディング）・検索/フィルタ・統計集計・
// DirectoryTree + FileDetailView 連携をまとめる統合コンポーネント。
// 比較結果は現状モックデータ。issue06/07 で Tauri IPC に差し替える。
// ---------------------------------------------------------------------------

/** 擬似ローディング時間（ms）。issue06/07 で実比較に差し替える */
const MOCK_COMPARE_DURATION = 900

/** フォルダ選択ダイアログのモック値（issue06 で open_folder_dialog に差し替え） */
const MOCK_PICKED_PATHS = {
  left: '/Users/dev/projects/renderer-v1',
  right: '/Users/dev/projects/renderer-v2',
  repo: '/Users/dev/projects/renderer',
} as const

const EMPTY_REF: GitRefSelection = { branch: '' }

/**
 * 検索（ファイル名部分一致）+ ステータスフィルタでツリーを再帰的に絞り込む純関数。
 * ディレクトリは子がマッチする場合のみ残す（issue05 Implementation Notes）。
 */
function filterTree(
  nodes: FileNode[],
  query: string,
  filter: StatusFilter,
): FileNode[] {
  const q = query.trim().toLowerCase()
  const result: FileNode[] = []
  for (const node of nodes) {
    if (node.type === 'directory') {
      const children = filterTree(node.children ?? [], query, filter)
      if (children.length > 0) {
        result.push({ ...node, children })
      }
    } else {
      const matchesQuery = q === '' || node.name.toLowerCase().includes(q)
      const matchesFilter = filter === 'all' || node.status === filter
      if (matchesQuery && matchesFilter) {
        result.push(node)
      }
    }
  }
  return result
}

/** 表示中ツリーのファイルをステータス別に集計する（SPEC.md §4.10） */
function countStats(nodes: FileNode[]): CompareStats {
  const stats: CompareStats = { added: 0, deleted: 0, modified: 0, identical: 0 }
  const walk = (items: FileNode[]) => {
    for (const node of items) {
      if (node.type === 'file') {
        stats[node.status] += 1
      } else if (node.children) {
        walk(node.children)
      }
    }
  }
  walk(nodes)
  return stats
}

/**
 * テキストファイル用の DiffLine[] を組み立てる（モック）。
 * added / deleted / identical は leftContent / rightContent から機械的に生成し、
 * modified（および内容未定義の git モック）は代表サンプル mockDiffLines を使う。
 * 実際の Myers 差分計算は issue06 で Rust 側（compute_diff）に委譲する。
 */
function buildMockDiffLines(file: FileNode): DiffLine[] {
  if (file.status === 'identical') {
    const content = file.leftContent ?? file.rightContent
    if (content === undefined) return []
    return content.split('\n').map((line, i) => ({
      type: 'unchanged',
      leftLineNumber: i + 1,
      rightLineNumber: i + 1,
      leftContent: line,
      rightContent: line,
    }))
  }
  if (file.status === 'added' && file.rightContent !== undefined) {
    return file.rightContent.split('\n').map((line, i) => ({
      type: 'added',
      rightLineNumber: i + 1,
      rightContent: line,
    }))
  }
  if (file.status === 'deleted' && file.leftContent !== undefined) {
    return file.leftContent.split('\n').map((line, i) => ({
      type: 'deleted',
      leftLineNumber: i + 1,
      leftContent: line,
    }))
  }
  return mockDiffLines
}

/** バイナリファイル用の左右メタデータを組み立てる（モック） */
function buildMockBinaryInfo(file: FileNode): {
  left?: BinaryFileInfo
  right?: BinaryFileInfo
} {
  if (file.path === mockBinaryComparison.path) {
    return { left: mockBinaryComparison.left, right: mockBinaryComparison.right }
  }
  const info: BinaryFileInfo = {
    size: file.size ?? 0,
    hash: file.hash ?? '',
    modifiedDate: file.modifiedDate ?? '',
  }
  if (file.status === 'added') return { right: info }
  if (file.status === 'deleted') return { left: info }
  return { left: info, right: info }
}

export default function App() {
  const [mode, setMode] = useState<CompareMode>('directory')

  // フォルダ比較モードの入力
  const [leftPath, setLeftPath] = useState('')
  const [rightPath, setRightPath] = useState('')

  // git比較モードの入力
  const [repoPath, setRepoPath] = useState('')
  const [refA, setRefA] = useState<GitRefSelection>(EMPTY_REF)
  const [refB, setRefB] = useState<GitRefSelection>(EMPTY_REF)

  // 比較実行・結果
  const [isComparing, setIsComparing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [tree, setTree] = useState<FileNode[] | null>(null)
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 検索・フィルタ
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  // 擬似ローディングのタイマー管理（モード切り替え・アンマウント時に破棄）
  const timersRef = useRef<number[]>([])
  const clearTimers = () => {
    for (const id of timersRef.current) {
      window.clearInterval(id)
      window.clearTimeout(id)
    }
    timersRef.current = []
  }
  useEffect(() => clearTimers, [])

  /** モード切り替え時は入力・選択 ref・比較結果・エラーをすべてリセット（SPEC.md §4.1） */
  const handleModeChange = (next: CompareMode) => {
    if (next === mode) return
    clearTimers()
    setMode(next)
    setLeftPath('')
    setRightPath('')
    setRepoPath('')
    setRefA(EMPTY_REF)
    setRefB(EMPTY_REF)
    setIsComparing(false)
    setProgress(0)
    setTree(null)
    setSelectedFile(null)
    setError(null)
    setSearchQuery('')
    setStatusFilter('all')
  }

  /** フォルダ選択（モック）。issue06 で Tauri の open_folder_dialog に差し替える */
  const handlePickFolder = (target: 'left' | 'right' | 'repo') => {
    const picked = MOCK_PICKED_PATHS[target]
    if (target === 'left') setLeftPath(picked)
    else if (target === 'right') setRightPath(picked)
    else setRepoPath(picked)
  }

  const canCompare =
    mode === 'directory'
      ? leftPath.trim() !== '' && rightPath.trim() !== ''
      : repoPath.trim() !== '' && refA.branch !== '' && refB.branch !== ''

  /** 比較実行：擬似ローディング（プログレスバー）→ モック結果表示（SPEC.md §4.9） */
  const handleCompare = () => {
    if (!canCompare || isComparing) return
    const compareMode = mode
    clearTimers()
    setIsComparing(true)
    setProgress(0)
    setError(null)

    const intervalId = window.setInterval(() => {
      setProgress((prev) => Math.min(prev + 12, 90))
    }, MOCK_COMPARE_DURATION / 10)
    const timeoutId = window.setTimeout(() => {
      clearTimers()
      setProgress(100)
      setTree(compareMode === 'directory' ? mockDirectoryTree : mockGitTree)
      setSelectedFile(null)
      setIsComparing(false)
    }, MOCK_COMPARE_DURATION)
    timersRef.current.push(intervalId, timeoutId)
  }

  // 検索・フィルタで絞り込んだ表示用ツリーと、その統計
  const filteredTree = useMemo(
    () => (tree ? filterTree(tree, searchQuery, statusFilter) : []),
    [tree, searchQuery, statusFilter],
  )
  const stats = useMemo(() => countStats(filteredTree), [filteredTree])

  // 選択ファイルの詳細（テキスト：DiffLine[] / バイナリ：左右メタデータ）
  const detail = useMemo(() => {
    if (!selectedFile || selectedFile.type !== 'file') {
      return { diffLines: undefined, binary: undefined }
    }
    if (selectedFile.isText) {
      return { diffLines: buildMockDiffLines(selectedFile), binary: undefined }
    }
    return { diffLines: undefined, binary: buildMockBinaryInfo(selectedFile) }
  }, [selectedFile])

  return (
    <div className="flex h-full flex-col bg-background">
      <Header
        mode={mode}
        onModeChange={handleModeChange}
        leftPath={leftPath}
        rightPath={rightPath}
        onLeftPathChange={setLeftPath}
        onRightPathChange={setRightPath}
        repoPath={repoPath}
        onRepoPathChange={setRepoPath}
        branches={mockBranches}
        commits={mockCommits}
        refA={refA}
        refB={refB}
        onRefAChange={setRefA}
        onRefBChange={setRefB}
        onPickFolder={handlePickFolder}
        canCompare={canCompare}
        isComparing={isComparing}
        progress={progress}
        onCompare={handleCompare}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        stats={stats}
      />

      {error && (
        <div className="shrink-0 border-b border-rose-500/35 bg-rose-500/10 px-4 py-2 text-xs text-rose-300">
          {error}
        </div>
      )}

      <main className="flex min-h-0 flex-1">
        {tree === null ? (
          <EmptyState mode={mode} />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex min-h-0 min-w-0 flex-1"
          >
            {/* 左：ファイルツリー（w-[380px]、SPEC.md §5.1） */}
            <aside className="w-[380px] shrink-0 border-r border-border">
              <DirectoryTree
                nodes={filteredTree}
                selectedPath={selectedFile?.path}
                onSelect={setSelectedFile}
              />
            </aside>

            {/* 右：差分詳細（flex-1） */}
            <FileDetailView
              file={selectedFile}
              diffLines={detail.diffLines}
              binary={detail.binary}
            />
          </motion.div>
        )}
      </main>
    </div>
  )
}
