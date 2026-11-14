import { motion } from 'framer-motion';

/**
 * Reactbits-inspired Aurora background: drifting blurred color fields,
 * aurora light ribbons, flowing waves and a faded grid. Pure CSS/Framer — no WebGL needed.
 */
const BLOBS = [
  { cls: 'from-emerald-400 to-teal-500 w-[42rem] h-[42rem] -top-48 -left-40', x: [0, 140, -40, 0], y: [0, 90, 160, 0], d: 24 },
  { cls: 'from-indigo-500 to-violet-500 w-[38rem] h-[38rem] top-1/4 -right-40', x: [0, -120, 40, 0], y: [0, 120, -60, 0], d: 28 },
  { cls: 'from-cyan-400 to-sky-500 w-[30rem] h-[30rem] bottom-[-10rem] left-1/4', x: [0, 100, -80, 0], y: [0, -80, 20, 0], d: 22 },
  { cls: 'from-fuchsia-500 to-pink-500 w-[22rem] h-[22rem] top-10 left-1/2', x: [0, -60, 80, 0], y: [0, 60, 120, 0], d: 30 },
];

export default function AuroraBackground({ className = '' }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      {BLOBS.map((b, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full bg-gradient-to-br opacity-40 blur-3xl dark:opacity-30 ${b.cls}`}
          animate={{ x: b.x, y: b.y, scale: [1, 1.15, 0.95, 1] }}
          transition={{ duration: b.d, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      {/* Aurora ribbons */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={`r${i}`}
          className="absolute left-[-20%] h-40 w-[140%] rounded-[100%] blur-2xl mix-blend-plus-lighter"
          style={{
            top: `${18 + i * 16}%`,
            background: [
              'linear-gradient(90deg, transparent, rgba(16,185,129,.35), rgba(99,102,241,.35), transparent)',
              'linear-gradient(90deg, transparent, rgba(56,189,248,.3), rgba(16,185,129,.3), transparent)',
              'linear-gradient(90deg, transparent, rgba(168,85,247,.28), rgba(56,189,248,.28), transparent)',
            ][i],
          }}
          animate={{ x: ['-10%', '10%', '-10%'], rotate: [-6 + i * 4, 4 - i * 3, -6 + i * 4], scaleY: [1, 1.6, 1] }}
          transition={{ duration: 16 + i * 5, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      {/* Waves */}
      <svg className="absolute bottom-0 left-0 h-48 w-[200%] opacity-60 dark:opacity-40" viewBox="0 0 2880 320" preserveAspectRatio="none">
        <defs>
          <linearGradient id="wave-a" x1="0" x2="1">
            <stop offset="0" stopColor="#10b981" stopOpacity=".35" />
            <stop offset="1" stopColor="#6366f1" stopOpacity=".35" />
          </linearGradient>
        </defs>
        <motion.path
          fill="url(#wave-a)"
          d="M0,224 C240,160 480,288 720,224 C960,160 1200,288 1440,224 C1680,160 1920,288 2160,224 C2400,160 2640,288 2880,224 L2880,320 L0,320 Z"
          animate={{ x: [0, -1440] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
        />
        <motion.path
          fill="url(#wave-a)"
          opacity=".6"
          d="M0,256 C240,300 480,200 720,256 C960,300 1200,200 1440,256 C1680,300 1920,200 2160,256 C2400,300 2640,200 2880,256 L2880,320 L0,320 Z"
          animate={{ x: [-1440, 0] }}
          transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
        />
      </svg>

      <div className="bg-grid mask-fade absolute inset-0 opacity-60 dark:opacity-40" />
    </div>
  );
}
