import { useLayoutEffect, useRef } from 'react'
import type { DiffLine } from '../types'
import ChangeMinimap from './ChangeMinimap'

/**
 * TextDiffView：左右2カラムの Split Diff（SPEC.md §4.6）
 *
 * 長い行対策（Peekdiff での教訓）：
 * - 折り返しなし（white-space: pre）で各ペインに水平スクロールを設ける
 * - 左右ペインの水平・垂直スクロールを同期する（rAF フラグでループ防止）
 * - 左右ペインのスクロール幅を最長行に合わせて揃える（片側だけが長い場合でも
 *   両ペインが同じ範囲をスクロールでき、scrollLeft のクランプで同期が切れない）
 * - 行番号ガターは position: sticky で左端に固定する
 * - 行コンテナを width: max-content / min-width: 100% にして、
 *   行背景色がスクロール領域の論理的な全幅まで途切れないようにする
 * - スクロールバーは webkit-scrollbar でスタイルし、overflow 時に常時表示する
 */

type Side = 'left' | 'right'

interface TextDiffViewProps {
  lines: DiffLine[]
}

/** 行タイプ × サイド → 行背景色（Figma Make の低透過ステータス色） */
function rowBackground(line: DiffLine, side: Side): string {
  switch (line.type) {
    case 'added':
      return side === 'right' ? 'rgba(16, 185, 129, 0.10)' : 'transparent'
    case 'deleted':
      return side === 'left' ? 'rgba(244, 63, 94, 0.10)' : 'transparent'
    case 'modified':
      return 'rgba(245, 158, 11, 0.10)'
    default:
      return 'transparent'
  }
}

/** 行番号の文字色（ステータスに合わせて淡く着色） */
function lineNumberColor(line: DiffLine, side: Side): string {
  switch (line.type) {
    case 'added':
      return side === 'right' ? 'rgba(16, 185, 129, 0.8)' : 'var(--muted-foreground)'
    case 'deleted':
      return side === 'left' ? 'rgba(244, 63, 94, 0.8)' : 'var(--muted-foreground)'
    case 'modified':
      return 'rgba(245, 158, 11, 0.8)'
    default:
      return 'var(--muted-foreground)'
  }
}

/** プレースホルダ行の斜線パターン（一段濃い地 + ストライプ） */
const PLACEHOLDER_STRIPES =
  'repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(255, 255, 255, 0.035) 5px, rgba(255, 255, 255, 0.035) 10px)'

function DiffRow({ line, side }: { line: DiffLine; side: Side }) {
  const content = side === 'left' ? line.leftContent : line.rightContent
  const lineNumber = side === 'left' ? line.leftLineNumber : line.rightLineNumber
  // leftContent / rightContent が undefined の側はプレースホルダ行として描画する
  const isPlaceholder = content === undefined

  return (
    <div
      className="flex min-w-full"
      style={
        isPlaceholder
          ? { backgroundColor: '#15181e', backgroundImage: PLACEHOLDER_STRIPES }
          : { backgroundColor: rowBackground(line, side) }
      }
    >
      {/* 行番号ガター：水平スクロール時も左端に固定（sticky） */}
      <div
        className="sticky left-0 z-10 w-12 shrink-0 select-none border-r border-border pr-2 text-right font-mono text-xs leading-6"
        style={{
          backgroundColor: 'var(--gutter)',
          color: lineNumberColor(line, side),
        }}
      >
        {isPlaceholder ? '' : lineNumber}
      </div>
      {/* コード内容：折り返しなし。背景は行コンテナ全幅に効く */}
      <pre className="m-0 flex-1 whitespace-pre pl-3 pr-6 font-mono text-xs leading-6 text-foreground">
        {content === undefined || content === '' ? ' ' : content}
      </pre>
    </div>
  )
}

export default function TextDiffView({ lines }: TextDiffViewProps) {
  const leftPaneRef = useRef<HTMLDivElement>(null)
  const rightPaneRef = useRef<HTMLDivElement>(null)
  const leftContentRef = useRef<HTMLDivElement>(null)
  const rightContentRef = useRef<HTMLDivElement>(null)
  // スクロール同期のループ防止フラグ（同期による scroll イベントを無視する）
  const isSyncingRef = useRef(false)

  // 左右ペインのスクロール幅を最長行に合わせて統一する。
  // 片側にしか長い行がない場合でも、両ペインが同じ scrollLeft 範囲を持ち、
  // 行背景色も両ペインで同じ論理幅（スクロール領域全幅）まで届く。
  useLayoutEffect(() => {
    const leftContent = leftContentRef.current
    const rightContent = rightContentRef.current
    if (!leftContent || !rightContent) return

    const equalizeWidths = () => {
      leftContent.style.minWidth = ''
      rightContent.style.minWidth = ''
      const maxWidth = Math.max(leftContent.scrollWidth, rightContent.scrollWidth)
      leftContent.style.minWidth = `${maxWidth}px`
      rightContent.style.minWidth = `${maxWidth}px`
    }

    equalizeWidths()
    // フォント読み込みで行の実幅が変わった場合に再計算する
    document.fonts?.ready.then(equalizeWidths).catch(() => {})
    // ペイン幅の変化（ウィンドウリサイズ等）でも再計算する
    const observer = new ResizeObserver(equalizeWidths)
    if (leftPaneRef.current) observer.observe(leftPaneRef.current)
    if (rightPaneRef.current) observer.observe(rightPaneRef.current)
    return () => observer.disconnect()
  }, [lines])

  const syncScroll = (source: Side) => {
    const sourceEl = source === 'left' ? leftPaneRef.current : rightPaneRef.current
    const targetEl = source === 'left' ? rightPaneRef.current : leftPaneRef.current
    if (!sourceEl || !targetEl) return
    if (isSyncingRef.current) return
    isSyncingRef.current = true
    targetEl.scrollLeft = sourceEl.scrollLeft
    targetEl.scrollTop = sourceEl.scrollTop
    requestAnimationFrame(() => {
      isSyncingRef.current = false
    })
  }

  const renderPane = (
    side: Side,
    paneRef: React.RefObject<HTMLDivElement>,
    contentRef: React.RefObject<HTMLDivElement>,
  ) => (
    <div
      ref={paneRef}
      onScroll={() => syncScroll(side)}
      className="diff-scroll min-w-0 flex-1 overflow-auto bg-background"
      data-side={side}
    >
      {/* width: max-content + min-width: 100%（+ 左右統一の minWidth）で
          行背景がスクロール領域全幅（最長行の幅）まで続く */}
      <div ref={contentRef} className="w-max min-w-full pb-1">
        {lines.map((line, index) => (
          <DiffRow key={index} line={line} side={side} />
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      {/* スクロールバー：Figma Make の CodeCol 実装を踏襲
          （トラック #15181e / つまみ #3a404a、高さ3） */}
      <style>{`
        .diff-scroll::-webkit-scrollbar {
          height: 3px;
          width: 6px;
        }
        .diff-scroll::-webkit-scrollbar-track {
          background: #15181e;
        }
        .diff-scroll::-webkit-scrollbar-thumb {
          background: #3a404a;
          border-radius: 2px;
        }
        .diff-scroll::-webkit-scrollbar-corner {
          background: #15181e;
        }
      `}</style>
      {renderPane('left', leftPaneRef, leftContentRef)}
      <div className="w-px shrink-0 bg-border" />
      {renderPane('right', rightPaneRef, rightContentRef)}
      {/* 変更マーカーバー：右端に常時表示（SPEC.md §4.6）。
          ジャンプは rightPane の scrollTop 設定で行い、既存の同期機構に乗せる */}
      <div className="w-px shrink-0 bg-border" />
      <ChangeMinimap lines={lines} scrollRef={rightPaneRef} />
    </div>
  )
}
