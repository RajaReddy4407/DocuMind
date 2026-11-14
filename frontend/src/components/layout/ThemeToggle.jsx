import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext.jsx';

export default function ThemeToggle({ className = '' }) {
  const { isDark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle dark mode"
      className={`relative flex h-9 w-16 items-center rounded-full border p-1 transition-colors duration-500 ${
        isDark ? 'justify-end border-white/10 bg-slate-800/80' : 'justify-start border-slate-200 bg-amber-100/80'
      } ${className}`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={`grid h-7 w-7 place-items-center rounded-full shadow-md ${
          isDark ? 'bg-gradient-to-br from-indigo-400 to-violet-600 text-white' : 'bg-gradient-to-br from-amber-300 to-orange-400 text-white'
        }`}
      >
        <motion.span key={isDark ? 'moon' : 'sun'} initial={{ rotate: -90, scale: 0 }} animate={{ rotate: 0, scale: 1 }}>
          {isDark ? <Moon size={14} /> : <Sun size={14} />}
        </motion.span>
      </motion.span>
    </button>
  );
}
