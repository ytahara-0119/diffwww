import { FolderInput } from 'lucide-react'
import { motion } from 'motion/react'
import type { CompareMode } from '../types'

/**
 * EmptyState（SPEC.md §5.2 Screen 03 準拠）
 * 比較結果がまだない状態で、メインエリア中央に D&D の案内を表示する。
 * D&D の実処理は issue06/07（Tauri IPC）で実装するため、ここでは案内表示のみ。
 */

export default function EmptyState({ mode }: { mode: CompareMode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex h-full flex-1 items-center justify-center bg-background"
    >
      <div className="flex w-[440px] flex-col items-center gap-4 rounded-lg border border-dashed border-border px-10 py-12 text-center">
        <FolderInput
          className="h-10 w-10 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <div>
          <p className="text-sm text-foreground">
            フォルダまたは git リポジトリをドラッグ＆ドロップ
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {mode === 'directory'
              ? '左右のフォルダパスを入力して「比較」を押すこともできます'
              : 'リポジトリパスを入力し、A/B のブランチ・コミットを選択して「比較」を押してください'}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
