import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import Logo from './Logo.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const initials = (user?.name || user?.email || '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <header className="sticky top-0 z-40 px-4 pt-3 sm:px-6 lg:pl-28">
      <div className="glass mx-auto flex h-14 max-w-7xl items-center justify-between rounded-2xl px-3 shadow-soft sm:px-4 dark:shadow-none">
        <Logo />
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 md:inline-flex dark:text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Gemini 2.5 Flash
          </span>
          <ThemeToggle />
          <div className="relative" ref={ref}>
            <button
              onClick={() => setOpen((o) => !o)}
              className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-emerald-500 text-xs font-bold text-white ring-2 ring-white/60 dark:ring-white/10"
              aria-label="Account menu"
            >
              {initials}
            </button>
            <AnimatePresence>
              {open && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  className="glass absolute right-0 mt-2 w-64 origin-top-right rounded-2xl p-2 shadow-xl"
                >
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold">{user?.name}</p>
                    <p className="muted truncate text-xs">{user?.email}</p>
                  </div>
                  <div className="mx-3 my-1 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-2.5 py-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                    <ShieldCheck size={14} /> Your workspace is private to your account
                  </div>
                  <button onClick={logout} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-rose-600 hover:bg-rose-500/10 dark:text-rose-400">
                    <LogOut size={16} /> Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
