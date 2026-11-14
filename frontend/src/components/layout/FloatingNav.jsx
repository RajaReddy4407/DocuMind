import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, LayoutDashboard, ShieldCheck, Sparkles, UploadCloud } from 'lucide-react';

export const NAV = [
  { to: '/', label: 'Home', full: 'Dashboard', icon: LayoutDashboard },
  { to: '/upload', label: 'Upload', full: 'Upload Center', icon: UploadCloud },
  { to: '/documents', label: 'Docs', full: 'Document Intelligence', icon: FileText },
  { to: '/validation', label: 'Match', full: 'Validation Center', icon: ShieldCheck },
  { to: '/insights', label: 'AI', full: 'AI Insights', icon: Sparkles },
];

const isActive = (pathname, to) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

/** Floating navigation: vertical glass rail on desktop, bottom tab bar on mobile. */
export default function FloatingNav() {
  const { pathname } = useLocation();

  return (
    <>
      {/* Desktop rail */}
      <nav className="glass fixed left-4 top-1/2 z-50 hidden -translate-y-1/2 flex-col gap-2 rounded-[28px] p-2 shadow-xl lg:flex dark:shadow-[0_0_40px_-12px_rgba(16,185,129,.35)]">
        {NAV.map(({ to, full, icon: Icon }) => {
          const active = isActive(pathname, to);
          return (
            <NavLink key={to} to={to} className="group relative grid h-12 w-12 place-items-center rounded-2xl" aria-label={full}>
              {active && (
                <motion.span layoutId="nav-desktop" className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-400 to-indigo-500 shadow-glow" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
              )}
              <Icon size={20} className={`relative transition-colors ${active ? 'text-white' : 'text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-white'}`} />
              <span className="glass pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold opacity-0 shadow-lg transition group-hover:translate-x-1 group-hover:opacity-100">
                {full}
              </span>
            </NavLink>
          );
        })}
      </nav>

      {/* Mobile bottom bar */}
      <nav className="glass fixed inset-x-3 bottom-3 z-50 flex justify-around rounded-[26px] p-1.5 shadow-2xl lg:hidden" style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}>
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = isActive(pathname, to);
          return (
            <NavLink key={to} to={to} className="relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2">
              {active && <motion.span layoutId="nav-mobile" className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-indigo-500/20 ring-1 ring-emerald-500/30" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
              <Icon size={20} className={`relative ${active ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`} />
              <span className={`relative text-[10px] font-semibold ${active ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-500'}`}>{label}</span>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}
