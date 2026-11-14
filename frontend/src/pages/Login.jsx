import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, FileSearch, Lock, Mail, ScanLine, ShieldAlert, User } from 'lucide-react';
import AuroraBackground from '../components/reactbits/AuroraBackground.jsx';
import BlurText from '../components/reactbits/BlurText.jsx';
import SplitText from '../components/reactbits/SplitText.jsx';
import MagnetButton from '../components/reactbits/MagnetButton.jsx';
import ShinyText from '../components/reactbits/ShinyText.jsx';
import ThemeToggle from '../components/layout/ThemeToggle.jsx';
import Logo from '../components/layout/Logo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../api/client.js';

const FEATURES = [
  { icon: ScanLine, title: 'Auto-classify & extract', text: 'POs, GRNs and invoices read by Gemini in seconds.' },
  { icon: FileSearch, title: 'Three-way matching', text: 'Ordered vs received vs billed — line by line.' },
  { icon: ShieldAlert, title: 'Stop overpayments', text: 'Duplicates and over-billing flagged before you pay.' },
];

function Field({ icon: Icon, right, ...props }) {
  return (
    <div className="relative">
      <Icon size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
      <input {...props} className="input h-12 pl-11 pr-11" />
      {right && <div className="absolute right-2 top-1/2 -translate-y-1/2">{right}</div>}
    </div>
  );
}

export default function Login({ mode = 'login' }) {
  const isRegister = mode === 'register';
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isRegister) await register(form.name, form.email, form.password);
      else await login(form.email, form.password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <AuroraBackground />

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6"><ThemeToggle /></div>
      <div className="absolute left-4 top-4 z-20 sm:left-6 sm:top-6"><Logo /></div>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-24 lg:grid-cols-2 lg:px-8">
        {/* Pitch */}
        <div className="hidden lg:block">
          <span className="pill mb-6 bg-white/60 text-emerald-700 ring-1 ring-emerald-500/30 backdrop-blur dark:bg-white/5 dark:text-emerald-300">
            <ShinyText>✦ Invoice Intelligence for small businesses</ShinyText>
          </span>
          <SplitText text="Never pay for goods" className="text-5xl font-extrabold leading-tight xl:text-6xl" />
          <SplitText text="you didn't receive." delay={0.4} className="text-gradient text-5xl font-extrabold leading-tight xl:text-6xl" />
          <BlurText
            delay={0.9}
            className="muted mt-6 max-w-lg text-lg"
            text="DocuMind AI cross-checks every purchase order, delivery receipt and invoice, then tells you exactly which payments to hold."
          />
          <div className="mt-10 space-y-3">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.2 + i * 0.12 }}
                className="glass flex max-w-md items-center gap-4 rounded-2xl p-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-indigo-500 text-white"><f.icon size={18} /></span>
                <div>
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="muted text-xs">{f.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Auth card */}
        <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto w-full max-w-md">
          <div className="glass relative overflow-hidden rounded-[32px] p-6 shadow-2xl sm:p-8 dark:shadow-[0_0_80px_-20px_rgba(16,185,129,.35)]">
            <div className="absolute -right-24 -top-24 h-48 w-48 rounded-full bg-emerald-400/30 blur-3xl" />
            <div className="relative">
              <AnimatePresence mode="wait">
                <motion.div key={mode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <h1 className="text-2xl font-extrabold sm:text-3xl">{isRegister ? 'Create your workspace' : 'Welcome back'}</h1>
                  <p className="muted mt-1.5 text-sm">{isRegister ? 'Start matching documents in under a minute.' : 'Sign in to review today’s invoices.'}</p>
                </motion.div>
              </AnimatePresence>

              <form onSubmit={submit} className="mt-7 space-y-3.5">
                <AnimatePresence initial={false}>
                  {isRegister && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                      <Field icon={User} placeholder="Full name" value={form.name} onChange={set('name')} autoComplete="name" required />
                    </motion.div>
                  )}
                </AnimatePresence>
                <Field icon={Mail} type="email" placeholder="Work email" value={form.email} onChange={set('email')} autoComplete="email" required />
                <Field
                  icon={Lock}
                  type={show ? 'text' : 'password'}
                  placeholder={isRegister ? 'Password (min. 8 characters)' : 'Password'}
                  value={form.password}
                  onChange={set('password')}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  minLength={isRegister ? 8 : undefined}
                  required
                  right={
                    <button type="button" onClick={() => setShow((s) => !s)} className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Toggle password visibility">
                      {show ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  }
                />

                <AnimatePresence>
                  {error && (
                    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl bg-rose-500/10 px-4 py-2.5 text-sm text-rose-600 dark:text-rose-300">
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                <div className="pt-2">
                  <MagnetButton type="submit" disabled={busy} wrapperClassName="w-full" className="btn-primary h-12 w-full text-base">
                    {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <>{isRegister ? 'Create account' : 'Sign in'} <ArrowRight size={18} /></>}
                  </MagnetButton>
                </div>
              </form>

              <p className="muted mt-6 text-center text-sm">
                {isRegister ? 'Already have an account?' : 'New to DocuMind?'}{' '}
                <Link to={isRegister ? '/login' : '/register'} className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                  {isRegister ? 'Sign in' : 'Create an account'}
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
