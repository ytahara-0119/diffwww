import { useEffect, useMemo, useRef, useState } from 'react'
import type { DiffLine } from '../types'

/**
 * ChangeMinimap：変更マーカーバー（SPEC.md §4.6）
 *
 * VS Code のミニマップ変更マーカーのように、差分ビューの右端に
 * ファイル全体の中での変更位置を一覧できる縦バーを表示する。
 *
 * - マーカーは行位置（index / lines.length）比で配置し、行タイプ別の色で描画
 *   （added=emerald / deleted=rose / modified=amber の低彩度。unchanged は描画しない）
 * - 隣接する同タイプ行はマーカーを結合し、最小高さ 2px を保証する
 * - 現在の表示範囲を半透明の「ビューポート窓」として重ね、垂直スクロールに追従する
 * - クリック / ドラッグでその位置へジャンプする。ジャンプは scrollContainer の
 *   scrollTop を設定するだけなので、TextDiffView 既存の左右同期機構
 *   （scroll イベント → syncScroll）にそのまま乗り、両ペインが同期して移動する
 */

type MarkerType = 'added' | 'deleted' | 'modified'

interface Marker {
  type: MarkerType
  start: number // 開始行 index
  count: number // 結合された行数
}

interface ChangeMinimapProps {
  lines: DiffLine[]
  /** 追従対象のスクロールコンテナ（TextDiffView の片側ペイン。垂直は左右同期済み） */
  scrollRef: React.RefObject<HTMLDivElement>
}

/** マーカー色：ステータス色（emerald/rose/amber）の低彩度版 */
const MARKER_COLORS: Record<MarkerType, string> = {
  added: 'rgba(16, 185, 129, 0.5)',
  deleted: 'rgba(244, 63, 94, 0.5)',
  modified: 'rgba(245, 158, 11, 0.5)',
}

/** unchanged を除き、隣接する同タイプ行を1つのマーカーに結合する */
function buildMarkers(lines: DiffLine[]): Marker[] {
  const markers: Marker[] = []
  for (let i = 0; i < lines.length; i++) {
    const type = lines[i].type
    if (type === 'unchanged') continue
    const last = markers[markers.length - 1]
    if (last && last.type === type && last.start + last.count === i) {
      last.count++
    } else {
      markers.push({ type, start: i, count: 1 })
    }
  }
  return markers
}

export default function ChangeMinimap({ lines, scrollRef }: ChangeMinimapProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  // ビューポート窓の位置・高さ（バー高さに対する 0〜1 の比率）
  const [viewport, setViewport] = useState({ top: 0, height: 1 })

  const markers = useMemo(() => buildMarkers(lines), [lines])
  const total = lines.length || 1

  // スクロール・リサイズに追従してビューポート窓を更新する
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      if (scrollHeight <= 0) return
      setViewport({
        top: scrollTop / scrollHeight,
        height: clientHeight / scrollHeight,
      })
    }

    update()
    container.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => {
      container.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [scrollRef, lines])

  // バー上の Y 座標に対応する位置へジャンプする（クリック位置が表示範囲の中央に来るように）。
  // scrollTop の設定は scroll イベントを発火させるため、既存の左右同期機構に乗る。
  const jumpTo = (clientY: number) => {
    const container = scrollRef.current
    const bar = barRef.current
    if (!container || !bar) return
    const rect = bar.getBoundingClientRect()
    if (rect.height <= 0) return
    const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    container.scrollTop = ratio * container.scrollHeight - container.clientHeight / 2
  }

  return (
    <div
      ref={barRef}
      className="relative h-full w-[10px] shrink-0 cursor-pointer select-none"
      style={{ backgroundColor: '#15181e' }}
      role="scrollbar"
      aria-label="変更マーカーバー"
      onPointerDown={(e) => {
        draggingRef.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        jumpTo(e.clientY)
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) jumpTo(e.clientY)
      }}
      onPointerUp={() => {
        draggingRef.current = false
      }}
    >
      {/* 変更マーカー：行位置比例配置、最小高さ 2px */}
      {markers.map((marker, index) => (
        <div
          key={index}
          className="pointer-events-none absolute inset-x-px rounded-[1px]"
          style={{
            top: `${(marker.start / total) * 100}%`,
            height: `max(${(marker.count / total) * 100}%, 2px)`,
            backgroundColor: MARKER_COLORS[marker.type],
          }}
        />
      ))}
      {/* ビューポート窓：現在の表示範囲を白の低透過で示す */}
      <div
        className="pointer-events-none absolute inset-x-0 bg-white/10"
        style={{
          top: `${viewport.top * 100}%`,
          height: `${viewport.height * 100}%`,
        }}
      />
    </div>
  )
}
