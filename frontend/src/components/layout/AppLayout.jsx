import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Navbar from './Navbar.jsx';
import FloatingNav from './FloatingNav.jsx';

export default function AppLayout() {
  const location = useLocation();
  const section = location.pathname.split('/')[1] || 'home';

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
        <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-500/10" />
        <div className="absolute -right-40 top-1/3 h-[30rem] w-[30rem] rounded-full bg-indigo-400/20 blur-3xl dark:bg-indigo-500/10" />
        <div className="bg-grid mask-fade absolute inset-0 opacity-40 dark:opacity-20" />
      </div>

      <Navbar />
      <FloatingNav />

      <main className="mx-auto max-w-7xl px-4 pb-32 pt-6 sm:px-6 lg:pb-12 lg:pl-28">
        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
