import type { CompareStatus, DiffLine, FileNode } from '../types'
import TextDiffView from './TextDiffView'
import BinaryFileView, { type BinaryFileInfo } from './BinaryFileView'

/**
 * FileDetailView：選択ファイルの差分詳細を表示する右ペイン（SPEC.md §4.6）
 * 上部バー（ファイルパス + ステータスバッジ）+ テキスト/バイナリの出し分け。
 * diff 計算は行わず、DiffLine[] / バイナリ情報は props で受け取る（issue05 で App に組み込み）。
 */

interface FileDetailViewProps {
  file: FileNode | null
  /** テキストファイル用の差分行（file.isText のとき使用） */
  diffLines?: DiffLine[]
  /** バイナリファイル用の左右メタデータ（file.isText でないとき使用） */
  binary?: {
    left?: BinaryFileInfo
    right?: BinaryFileInfo
  }
}

const STATUS_LABEL: Record<CompareStatus, string> = {
  added: '追加',
  deleted: '削除',
  modified: '変更',
  identical: '同一',
}

const STATUS_BADGE_STYLE: Record<
  CompareStatus,
  { color: string; backgroundColor: string; borderColor: string }
> = {
  added: {
    color: 'var(--status-added)',
    backgroundColor: 'rgba(16, 185, 129, 0.10)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  deleted: {
    color: 'var(--status-deleted)',
    backgroundColor: 'rgba(244, 63, 94, 0.10)',
    borderColor: 'rgba(244, 63, 94, 0.35)',
  },
  modified: {
    color: 'var(--status-modified)',
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  identical: {
    color: 'var(--status-identical)',
    backgroundColor: 'rgba(113, 113, 122, 0.10)',
    borderColor: 'rgba(113, 113, 122, 0.35)',
  },
}

function StatusBadge({ status }: { status: CompareStatus }) {
  return (
    <span
      className="shrink-0 rounded border px-2 py-0.5 text-xs font-medium"
      style={STATUS_BADGE_STYLE[status]}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

export default function FileDetailView({ file, diffLines, binary }: FileDetailViewProps) {
  if (!file || file.type !== 'file') {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">
          ファイルを選択すると差分が表示されます
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      {/* 上部バー：ファイルパス + ステータスバッジ */}
      <div
        className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2"
        style={{ backgroundColor: 'var(--panel)' }}
      >
        <span className="min-w-0 truncate font-mono text-sm text-foreground">
          {file.path}
        </span>
        <StatusBadge status={file.status} />
      </div>

      {/* 本体：テキストは Split Diff / バイナリはメタデータカード */}
      <div className="min-h-0 flex-1">
        {file.isText ? (
          <TextDiffView lines={diffLines ?? []} />
        ) : (
          <BinaryFileView left={binary?.left} right={binary?.right} />
        )}
      </div>
    </div>
  )
}
