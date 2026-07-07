import type { ReactNode } from 'react'

/**
 * BinaryFileView：バイナリファイル比較（SPEC.md §4.6）
 * 左右2枚のカードにサイズ / ハッシュ / 最終更新日時を表示する。
 * ハッシュの相違部分は黄（amber）でハイライトする。
 */

export interface BinaryFileInfo {
  size: number
  hash: string
  modifiedDate: string
}

interface BinaryFileViewProps {
  left?: BinaryFileInfo
  right?: BinaryFileInfo
}

function formatSize(size: number): string {
  return `${(size / 1024).toFixed(1)} KB`
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return isoDate
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * ハッシュを1文字ずつ比較し、相手側と異なる部分を amber でハイライトする。
 * 連続する差分はまとめて1つの span にする。
 */
function renderHash(hash: string, other?: string): ReactNode {
  if (!other) return hash

  const segments: { text: string; diff: boolean }[] = []
  for (let i = 0; i < hash.length; i++) {
    const diff = hash[i] !== other[i]
    const last = segments[segments.length - 1]
    if (last && last.diff === diff) {
      last.text += hash[i]
    } else {
      segments.push({ text: hash[i], diff })
    }
  }

  return segments.map((seg, i) =>
    seg.diff ? (
      <span
        key={i}
        className="rounded-sm"
        style={{
          color: 'var(--status-modified)',
          backgroundColor: 'rgba(245, 158, 11, 0.15)',
        }}
      >
        {seg.text}
      </span>
    ) : (
      <span key={i}>{seg.text}</span>
    ),
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="break-all font-mono text-xs leading-5 text-foreground">
        {children}
      </div>
    </div>
  )
}

function BinaryCard({
  title,
  info,
  otherHash,
}: {
  title: string
  info?: BinaryFileInfo
  otherHash?: string
}) {
  return (
    <div className="flex-1 rounded-md border border-border bg-card p-4">
      <div className="mb-3 border-b border-border pb-2 text-xs font-semibold text-muted-foreground">
        {title}
      </div>
      {info ? (
        <div className="flex flex-col gap-3">
          <InfoRow label="サイズ">{formatSize(info.size)}</InfoRow>
          <InfoRow label="ハッシュ">{renderHash(info.hash, otherHash)}</InfoRow>
          <InfoRow label="最終更新日時">{formatDate(info.modifiedDate)}</InfoRow>
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-muted-foreground">
          このサイドには存在しません
        </div>
      )}
    </div>
  )
}

export default function BinaryFileView({ left, right }: BinaryFileViewProps) {
  return (
    <div className="flex h-full flex-col items-stretch overflow-auto bg-background p-6">
      <div className="mb-4 text-xs text-muted-foreground">
        バイナリファイルのため、メタデータの比較のみ表示します
      </div>
      <div className="flex gap-4">
        <BinaryCard title="A（比較元）" info={left} otherHash={right?.hash} />
        <BinaryCard title="B（比較先）" info={right} otherHash={left?.hash} />
      </div>
    </div>
  )
}
