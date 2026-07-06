import { motion } from 'motion/react'

/** アプリロゴ（ティールのΔ）。issue01 ではプレースホルダとしてのみ使用する */
function AppLogo({ size = 48 }: { size?: number }) {
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

export default function App() {
  return (
    <div className="flex h-full items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center gap-4"
      >
        <AppLogo size={64} />
        <h1 className="font-mono text-3xl font-semibold tracking-wide text-foreground">
          diffwww
        </h1>
      </motion.div>
    </div>
  )
}
