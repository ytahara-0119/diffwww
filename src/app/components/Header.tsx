import {
  Folder,
  FolderGit2,
  GitBranch as GitBranchIcon,
  GitCommitHorizontal,
  ListFilter,
  Search,
} from 'lucide-react'
import type {
  CompareMode,
  CompareStatus,
  GitBranch,
  GitCommit,
  GitRefSelection,
} from '../types'

/**
 * Header（SPEC.md §5.1 / §5.3）
 * AppLogo + モードタブ / パス・ref 入力 / 比較ボタン / プログレスバー /
 * 検索・フィルタ・統計バッジをまとめた上部固定ヘッダー。
 * 状態は持たず、すべて props 経由で App と連携する。
 */

export type StatusFilter = 'all' | CompareStatus

export interface CompareStats {
  added: number
  deleted: number
  modified: number
  identical: number
}

interface HeaderProps {
  mode: CompareMode
  onModeChange: (mode: CompareMode) => void

  /* フォルダ比較モード */
  leftPath: string
  rightPath: string
  onLeftPathChange: (value: string) => void
  onRightPathChange: (value: string) => void

  /* git比較モード */
  repoPath: string
  onRepoPathChange: (value: string) => void
  branches: GitBranch[]
  commits: GitCommit[]
  refA: GitRefSelection
  refB: GitRefSelection
  onRefAChange: (value: GitRefSelection) => void
  onRefBChange: (value: GitRefSelection) => void

  /* フォルダ選択（issue06 で実ダイアログに差し替え。現状はモック動作） */
  onPickFolder: (target: 'left' | 'right' | 'repo') => void

  /* 比較実行 */
  canCompare: boolean
  isComparing: boolean
  progress: number
  onCompare: () => void

  /* 検索・フィルタ・統計 */
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (value: StatusFilter) => void
  stats: CompareStats
}

/** アプリロゴ（ティールのΔ） */
function AppLogo({ size = 22 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-label="diffwww logo"
    >
      <path
        d="M24 8 L42 40 H6 Z"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const MODE_TABS: { mode: CompareMode; label: string }[] = [
  { mode: 'directory', label: 'フォルダ比較' },
  { mode: 'git', label: 'git比較' },
]

function ModeTabs({
  mode,
  onModeChange,
}: {
  mode: CompareMode
  onModeChange: (mode: CompareMode) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="比較モード"
      className="flex shrink-0 rounded-md border border-border bg-muted p-0.5"
    >
      {MODE_TABS.map((tab) => (
        <button
          key={tab.mode}
          type="button"
          role="tab"
          aria-selected={mode === tab.mode}
          onClick={() => onModeChange(tab.mode)}
          className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
            mode === tab.mode
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/** フォルダ/リポジトリのパス入力欄（フォルダ選択ボタン付き） */
function PathInput({
  icon,
  ariaLabel,
  placeholder,
  value,
  onChange,
  onPick,
}: {
  icon: React.ReactNode
  ariaLabel: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  onPick: () => void
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border bg-input px-2 focus-within:ring-1 focus-within:ring-ring">
      <span className="shrink-0 text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <input
        type="text"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="h-8 w-full min-w-0 bg-transparent font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      <button
        type="button"
        onClick={onPick}
        title="フォルダを選択"
        className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        選択
      </button>
    </div>
  )
}

function formatCommitDate(isoDate: string): string {
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return isoDate
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const SELECT_CLASS =
  'h-7 w-full min-w-0 rounded border border-border bg-input px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

/** A/B 各組のブランチ + コミットセレクト（SPEC.md §4.3） */
function GitRefSelector({
  label,
  description,
  branches,
  commits,
  value,
  onChange,
}: {
  label: string
  description: string
  branches: GitBranch[]
  commits: GitCommit[]
  value: GitRefSelection
  onChange: (value: GitRefSelection) => void
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-md border border-border bg-panel p-2">
      <div className="flex items-center gap-1.5">
        <span className="rounded bg-muted px-1.5 font-mono text-xs font-semibold text-primary">
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>

      {/* ブランチセレクト */}
      <div className="flex items-center gap-1.5">
        <GitBranchIcon
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <select
          aria-label={`${label} ブランチ`}
          value={value.branch}
          onChange={(e) => onChange({ branch: e.target.value })}
          className={`${SELECT_CLASS} font-mono`}
          style={{ colorScheme: 'dark' }}
        >
          <option value="">ブランチを選択</option>
          {branches.map((branch) => (
            <option key={branch.name} value={branch.name}>
              {branch.name}
              {branch.isCurrent ? '（現在）' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* コミットセレクト（未選択ならブランチ HEAD） */}
      <div className="flex items-center gap-1.5">
        <GitCommitHorizontal
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <select
          aria-label={`${label} コミット`}
          value={value.commit ?? ''}
          onChange={(e) =>
            onChange({ branch: value.branch, commit: e.target.value || undefined })
          }
          disabled={value.branch === ''}
          className={`${SELECT_CLASS} font-mono`}
          style={{ colorScheme: 'dark' }}
        >
          <option value="">HEAD（最新コミット）</option>
          {commits.map((commit) => (
            <option key={commit.hash} value={commit.hash}>
              {`${commit.shortHash} ${commit.message} · ${formatCommitDate(commit.date)}`}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function CompareButton({
  canCompare,
  isComparing,
  onCompare,
}: {
  canCompare: boolean
  isComparing: boolean
  onCompare: () => void
}) {
  return (
    <button
      type="button"
      onClick={onCompare}
      disabled={!canCompare || isComparing}
      className="h-8 shrink-0 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {isComparing ? '比較中…' : '比較'}
    </button>
  )
}

const BADGE_BASE = 'rounded-full border px-2 py-0.5 font-mono text-xs'

function StatsBadges({ stats, mode }: { stats: CompareStats; mode: CompareMode }) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1.5" aria-label="統計バッジ">
      <span className={`${BADGE_BASE} border-emerald-500/35 bg-emerald-500/10 text-emerald-300`}>
        +{stats.added}
      </span>
      <span className={`${BADGE_BASE} border-rose-500/35 bg-rose-500/10 text-rose-300`}>
        -{stats.deleted}
      </span>
      <span className={`${BADGE_BASE} border-amber-500/35 bg-amber-500/10 text-amber-300`}>
        ~{stats.modified}
      </span>
      {/* =N（同一数）はフォルダ比較のみ（SPEC.md §4.10） */}
      {mode === 'directory' && (
        <span className={`${BADGE_BASE} border-zinc-500/35 bg-zinc-500/10 text-zinc-400`}>
          ={stats.identical}
        </span>
      )}
    </div>
  )
}

export default function Header({
  mode,
  onModeChange,
  leftPath,
  rightPath,
  onLeftPathChange,
  onRightPathChange,
  repoPath,
  onRepoPathChange,
  branches,
  commits,
  refA,
  refB,
  onRefAChange,
  onRefBChange,
  onPickFolder,
  canCompare,
  isComparing,
  progress,
  onCompare,
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  onStatusFilterChange,
  stats,
}: HeaderProps) {
  return (
    <header className="flex shrink-0 flex-col gap-2.5 border-b border-border bg-card px-4 py-3">
      {/* 1段目：ロゴ + アプリ名 + モードタブ */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <AppLogo />
          <h1 className="font-mono text-sm font-semibold tracking-wide text-foreground">
            diffwww
          </h1>
        </div>
        <ModeTabs mode={mode} onModeChange={onModeChange} />
      </div>

      {/* 2段目：モード別の入力 + 比較ボタン */}
      {mode === 'directory' ? (
        <div className="flex items-center gap-2">
          <PathInput
            icon={<Folder className="h-3.5 w-3.5" />}
            ariaLabel="左フォルダパス"
            placeholder="左フォルダパス（A / 比較元）"
            value={leftPath}
            onChange={onLeftPathChange}
            onPick={() => onPickFolder('left')}
          />
          <PathInput
            icon={<Folder className="h-3.5 w-3.5" />}
            ariaLabel="右フォルダパス"
            placeholder="右フォルダパス（B / 比較先）"
            value={rightPath}
            onChange={onRightPathChange}
            onPick={() => onPickFolder('right')}
          />
          <CompareButton
            canCompare={canCompare}
            isComparing={isComparing}
            onCompare={onCompare}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <PathInput
            icon={<FolderGit2 className="h-3.5 w-3.5" />}
            ariaLabel="リポジトリパス"
            placeholder="git リポジトリパス"
            value={repoPath}
            onChange={onRepoPathChange}
            onPick={() => onPickFolder('repo')}
          />
          <div className="flex items-stretch gap-2">
            <GitRefSelector
              label="A"
              description="比較元（old）"
              branches={branches}
              commits={commits}
              value={refA}
              onChange={onRefAChange}
            />
            <GitRefSelector
              label="B"
              description="比較先（new）"
              branches={branches}
              commits={commits}
              value={refB}
              onChange={onRefBChange}
            />
            <div className="flex items-end">
              <CompareButton
                canCompare={canCompare}
                isComparing={isComparing}
                onCompare={onCompare}
              />
            </div>
          </div>
        </div>
      )}

      {/* プログレスバー（比較中のみ、SPEC.md §4.9） */}
      {isComparing && (
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-0.5 w-full overflow-hidden rounded bg-muted"
        >
          <div
            className="h-full bg-primary transition-[width] duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* 3段目：検索 + フィルタ + 統計バッジ */}
      <div className="flex items-center gap-2">
        <div className="flex w-64 items-center gap-1.5 rounded-md border border-border bg-input px-2 focus-within:ring-1 focus-within:ring-ring">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            aria-label="ファイル名で検索"
            placeholder="ファイル名で検索"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            spellCheck={false}
            className="h-7 w-full min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <ListFilter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <select
            aria-label="ステータスフィルタ"
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}
            className="h-7 w-28 rounded border border-border bg-input px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            style={{ colorScheme: 'dark' }}
          >
            <option value="all">すべて</option>
            <option value="added">追加</option>
            <option value="deleted">削除</option>
            <option value="modified">変更</option>
            {/* 「同一」はフォルダ比較のみ（SPEC.md §4.7） */}
            {mode === 'directory' && <option value="identical">同一</option>}
          </select>
        </div>

        <StatsBadges stats={stats} mode={mode} />
      </div>
    </header>
  )
}
