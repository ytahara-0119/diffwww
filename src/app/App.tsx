import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type {
  CompareMode,
  DiffLine,
  FileNode,
  GitBranch,
  GitCommit,
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
import { getCurrentWebview } from '@tauri-apps/api/webview'
import {
  compareDirectories,
  computeDiff,
  isTauri,
  openFolderDialog,
  readBinaryMeta,
  readFileContent,
  toErrorMessage,
} from './lib/ipc'
import {
  compareGitRefs,
  isGitRepository,
  listBranches,
  listCommits,
  readFileAtRef,
} from './lib/gitIpc'

// ---------------------------------------------------------------------------
// App（SPEC.md §4.1〜4.3, §4.7〜4.10, §5.1）
// モード state・比較実行・検索/フィルタ・統計集計・
// DirectoryTree + FileDetailView 連携をまとめる統合コンポーネント。
// フォルダ比較（issue06）・git比較（issue07）とも Tauri IPC 経由の実データ。
// Tauri 外（pnpm dev のブラウザ）では従来どおり全モードがモック動作する。
// ---------------------------------------------------------------------------

/** 擬似ローディング時間（ms）。ブラウザ動作時のモック比較に使用 */
const MOCK_COMPARE_DURATION = 900

/** リポジトリパス入力の検証を遅らせるデバウンス時間（ms） */
const REPO_VALIDATE_DEBOUNCE = 300

/** フォルダ選択ダイアログのモック値（Tauri 外のブラウザ動作時のフォールバック） */
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

  // git比較モードのブランチ・コミット一覧（Tauri 内では IPC で取得。
  // ブラウザ動作時は Header へ渡す際にモックへフォールバックする）
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [commits, setCommits] = useState<GitCommit[]>([])

  // 比較実行・結果
  const [isComparing, setIsComparing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [tree, setTree] = useState<FileNode[] | null>(null)
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null)
  const [error, setError] = useState<string | null>(null)

  // IPC でフォルダ比較を実行したときの左右ルートパス（モック結果のときは null）。
  // 選択ファイルの実内容読み込み（read_file_content / read_binary_meta）に使う
  const [comparedPaths, setComparedPaths] = useState<{
    left: string
    right: string
  } | null>(null)

  // IPC で git比較を実行したときのリポジトリと ref（モック結果のときは null）。
  // 選択ファイルの実内容読み込み（read_file_at_ref）に使う。
  // oldRef = 左（A）/ newRef = 右（B）（SPEC.md §4.3）
  const [comparedGit, setComparedGit] = useState<{
    repo: string
    oldRef: string
    newRef: string
  } | null>(null)

  // IPC で遅延取得した選択ファイルの詳細（テキスト diff / バイナリメタデータ）
  const [ipcDetail, setIpcDetail] = useState<{
    path: string
    diffLines?: DiffLine[]
    binary?: { left?: BinaryFileInfo; right?: BinaryFileInfo }
  } | null>(null)

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
    setComparedPaths(null)
    setComparedGit(null)
    setBranches([])
    setCommits([])
    setIpcDetail(null)
  }

  /** 入力欄にパスを反映する（ダイアログ・D&D 共通） */
  const applyPickedPath = (target: 'left' | 'right' | 'repo', picked: string) => {
    if (target === 'left') setLeftPath(picked)
    else if (target === 'right') setRightPath(picked)
    else setRepoPath(picked)
  }

  /** フォルダ選択。Tauri 内では open_folder_dialog、ブラウザ動作時はモック値 */
  const handlePickFolder = async (target: 'left' | 'right' | 'repo') => {
    if (!isTauri()) {
      applyPickedPath(target, MOCK_PICKED_PATHS[target])
      return
    }
    try {
      const picked = await openFolderDialog()
      if (picked) applyPickedPath(target, picked)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  /**
   * Finder D&D（SPEC.md §4.2, §6.4）：OS レベルのドラッグは HTML の drag イベントが
   * 発火しないため Tauri の onDragDropEvent を使う。position は論理ピクセルで
   * window.innerWidth と同じ座標系（docs/workflow.md「プラットフォーム固有 API の取り扱い」）。
   * ドロップ位置の左右で振り分け、git比較モードでは位置によらずリポジトリパスにする。
   */
  const modeRef = useRef(mode)
  modeRef.current = mode
  useEffect(() => {
    if (!isTauri()) return
    let disposed = false
    let unlisten: (() => void) | undefined
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        // macOS では leave が drop より先に発火することがあるため drop のみ扱う
        if (event.payload.type !== 'drop') return
        const { paths, position } = event.payload
        const first = paths[0]
        if (!first) return
        if (modeRef.current === 'git') {
          setRepoPath(first)
          return
        }
        if (paths.length >= 2) {
          // 2つ同時ドロップは左右にまとめて割り当てる
          setLeftPath(first)
          setRightPath(paths[1])
          return
        }
        applyPickedPath(position.x < window.innerWidth / 2 ? 'left' : 'right', first)
      })
      .then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  /**
   * リポジトリパス確定時の検証（SPEC.md §4.3）：is_git_repository で検証し、
   * リポジトリならブランチ一覧をセレクトに反映する。非リポジトリはエラー表示。
   * 手入力に追従するため短いデバウンスを挟む（ダイアログ・D&D は1回で確定）。
   */
  useEffect(() => {
    if (mode !== 'git' || !isTauri()) return
    setBranches([])
    setCommits([])
    setRefA(EMPTY_REF)
    setRefB(EMPTY_REF)
    const repo = repoPath.trim()
    if (repo === '') {
      setError(null)
      return
    }
    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const ok = await isGitRepository(repo)
          if (cancelled) return
          if (!ok) {
            setError(`git リポジトリではありません: ${repo}`)
            return
          }
          setError(null)
          const list = await listBranches(repo)
          if (cancelled) return
          setBranches(list)
          if (list.length === 0) {
            setError(
              'ブランチが見つかりません（コミットのない空リポジトリの可能性があります）',
            )
          }
        } catch (err) {
          if (!cancelled) setError(toErrorMessage(err))
        }
      })()
    }, REPO_VALIDATE_DEBOUNCE)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [mode, repoPath])

  /**
   * 選択ブランチのコミット一覧（最大50件）を取得する。
   * Header のコミットセレクトは A/B で一覧を共有するため、
   * A・B 両方の選択ブランチのコミットをハッシュで重複排除して結合する。
   */
  useEffect(() => {
    if (mode !== 'git' || !isTauri()) return
    const repo = repoPath.trim()
    const branchNames = [
      ...new Set([refA.branch, refB.branch].filter((b) => b !== '')),
    ]
    if (repo === '' || branchNames.length === 0) {
      setCommits([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const lists = await Promise.all(
          branchNames.map((branch) => listCommits(repo, branch)),
        )
        if (cancelled) return
        const seen = new Set<string>()
        const merged: GitCommit[] = []
        for (const list of lists) {
          for (const commit of list) {
            if (!seen.has(commit.hash)) {
              seen.add(commit.hash)
              merged.push(commit)
            }
          }
        }
        setCommits(merged)
      } catch (err) {
        if (!cancelled) setError(toErrorMessage(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, repoPath, refA.branch, refB.branch])

  const canCompare =
    mode === 'directory'
      ? leftPath.trim() !== '' && rightPath.trim() !== ''
      : repoPath.trim() !== '' && refA.branch !== '' && refB.branch !== ''

  /** フォルダ比較の実行（Tauri IPC、SPEC.md §4.9・§6.1） */
  const runDirectoryCompare = async () => {
    const left = leftPath.trim()
    const right = rightPath.trim()
    clearTimers()
    setIsComparing(true)
    setProgress(0)
    setError(null)

    // バックエンドは進捗イベントを持たないため、完了まで 90% を上限に進める
    const intervalId = window.setInterval(() => {
      setProgress((prev) => Math.min(prev + 6, 90))
    }, 120)
    timersRef.current.push(intervalId)

    try {
      const result = await compareDirectories(left, right)
      setTree(result)
      setSelectedFile(null)
      setComparedPaths({ left, right })
      setComparedGit(null)
      setIpcDetail(null)
      setProgress(100)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      clearTimers()
      setIsComparing(false)
    }
  }

  /** GitRefSelection を git の ref 文字列へ（コミット未選択ならブランチ HEAD） */
  const refToSpec = (ref: GitRefSelection) => ref.commit ?? ref.branch

  /** git比較の実行（Tauri IPC、SPEC.md §4.3・§6.1）。左=old / 右=new */
  const runGitCompare = async () => {
    const repo = repoPath.trim()
    const oldRef = refToSpec(refA)
    const newRef = refToSpec(refB)
    clearTimers()
    setIsComparing(true)
    setProgress(0)
    setError(null)

    // バックエンドは進捗イベントを持たないため、完了まで 90% を上限に進める
    const intervalId = window.setInterval(() => {
      setProgress((prev) => Math.min(prev + 6, 90))
    }, 120)
    timersRef.current.push(intervalId)

    try {
      const result = await compareGitRefs(repo, oldRef, newRef)
      setTree(result)
      setSelectedFile(null)
      setComparedPaths(null)
      setComparedGit({ repo, oldRef, newRef })
      setIpcDetail(null)
      setProgress(100)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      clearTimers()
      setIsComparing(false)
    }
  }

  /**
   * 比較実行（SPEC.md §4.9）。
   * Tauri 内ではフォルダ比較・git比較とも IPC で実データを取得する。
   * ブラウザ動作時は擬似ローディング → モック結果。
   */
  const handleCompare = () => {
    if (!canCompare || isComparing) return
    if (isTauri()) {
      void (mode === 'directory' ? runDirectoryCompare() : runGitCompare())
      return
    }
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
      setComparedPaths(null)
      setComparedGit(null)
      setIpcDetail(null)
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

  // IPC 比較結果のファイル選択時：実内容を遅延取得して diff / メタデータを組み立てる
  // （フォルダ比較テキスト：read_file_content ×2 → compute_diff / バイナリ：read_binary_meta。
  //  git比較テキスト：read_file_at_ref ×2 → compute_diff / バイナリ：FileNode の
  //  blob ハッシュ等、取得できる範囲のメタデータで表示する）
  useEffect(() => {
    if ((!comparedPaths && !comparedGit) || !selectedFile || selectedFile.type !== 'file') {
      setIpcDetail(null)
      return
    }
    const file = selectedFile
    const leftAbs = `${comparedPaths?.left}/${file.path}`
    const rightAbs = `${comparedPaths?.right}/${file.path}`
    let cancelled = false

    const load = async () => {
      setError(null)
      try {
        if (file.isText) {
          const [leftText, rightText] = await Promise.all(
            comparedGit
              ? [
                  file.status === 'added'
                    ? Promise.resolve('')
                    : readFileAtRef(comparedGit.repo, comparedGit.oldRef, file.path),
                  file.status === 'deleted'
                    ? Promise.resolve('')
                    : readFileAtRef(comparedGit.repo, comparedGit.newRef, file.path),
                ]
              : [
                  file.status === 'added' ? Promise.resolve('') : readFileContent(leftAbs),
                  file.status === 'deleted' ? Promise.resolve('') : readFileContent(rightAbs),
                ],
          )
          const diffLines = await computeDiff(leftText, rightText)
          if (!cancelled) setIpcDetail({ path: file.path, diffLines })
        } else if (comparedGit) {
          // git比較のバイナリ：ツリー取得時の blob ハッシュを取得できる範囲で表示する
          // （サイズ・更新日時は読み取り専用 git コマンドの範囲では取得しない）
          const info: BinaryFileInfo = {
            size: file.size ?? 0,
            hash: file.hash ?? '',
            modifiedDate: file.modifiedDate ?? '',
          }
          const binary =
            file.status === 'added'
              ? { right: info }
              : file.status === 'deleted'
                ? { left: info }
                : { left: info, right: info }
          if (!cancelled) setIpcDetail({ path: file.path, binary })
        } else {
          const meta = await readBinaryMeta(
            file.status === 'added' ? undefined : leftAbs,
            file.status === 'deleted' ? undefined : rightAbs,
          )
          if (!cancelled) setIpcDetail({ path: file.path, binary: meta })
        }
      } catch (err) {
        // 1MB 超・読み込み失敗などはエラーバナーに表示し、詳細ペインは空にする
        if (!cancelled) {
          setIpcDetail({ path: file.path, diffLines: file.isText ? [] : undefined })
          setError(toErrorMessage(err))
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [comparedPaths, comparedGit, selectedFile])

  // 選択ファイルの詳細（テキスト：DiffLine[] / バイナリ：左右メタデータ）。
  // IPC 比較結果は遅延取得した ipcDetail を使い、モック結果は従来のビルダーを使う
  const detail = useMemo(() => {
    if (!selectedFile || selectedFile.type !== 'file') {
      return { diffLines: undefined, binary: undefined }
    }
    if (comparedPaths || comparedGit) {
      if (ipcDetail && ipcDetail.path === selectedFile.path) {
        return { diffLines: ipcDetail.diffLines, binary: ipcDetail.binary }
      }
      // 読み込み中（またはエラー直後）は空表示
      return {
        diffLines: selectedFile.isText ? [] : undefined,
        binary: selectedFile.isText ? undefined : {},
      }
    }
    if (selectedFile.isText) {
      return { diffLines: buildMockDiffLines(selectedFile), binary: undefined }
    }
    return { diffLines: undefined, binary: buildMockBinaryInfo(selectedFile) }
  }, [selectedFile, comparedPaths, comparedGit, ipcDetail])

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
        branches={isTauri() ? branches : mockBranches}
        commits={isTauri() ? commits : mockCommits}
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
