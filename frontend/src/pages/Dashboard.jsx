import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertOctagon, ArrowRight, CheckCircle2, ClipboardCheck, Clock3, Cpu, FileStack, PauseCircle, ShieldCheck, Sparkles, Trash2, UploadCloud } from 'lucide-react';
import api, { errorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import SpotlightCard from '../components/reactbits/SpotlightCard.jsx';
import TiltedCard from '../components/reactbits/TiltedCard.jsx';
import CountUp from '../components/reactbits/CountUp.jsx';
import MagnetButton from '../components/reactbits/MagnetButton.jsx';
import DocumentCard from '../components/domain/DocumentCard.jsx';
import DiscrepancyBadge from '../components/domain/DiscrepancyBadge.jsx';
import EmptyState from '../components/domain/EmptyState.jsx';
import { DOC_TYPES, money } from '../lib/format.js';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

function Skeleton({ className }) {
  return <div className={`animate-pulse rounded-3xl bg-slate-200/70 dark:bg-white/5 ${className}`} />;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [seeding, setSeeding] = useState(false);

  const loadStats = () =>
    api.get('/documents/stats').then(({ data }) => setStats(data)).catch((e) => setError(errorMessage(e)));

  useEffect(() => {
    loadStats();
  }, []);

  const seedSamples = async () => {
    setSeeding(true);
    try {
      await api.post('/documents/demo-seed');
      await loadStats();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSeeding(false);
    }
  };

  const clearFailed = async () => {
    try {
      await api.delete('/documents/failed/clear');
      await loadStats();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const first = user?.name?.split(' ')[0] || 'there';
  const header = (
    <PageHeader
      eyebrow="Dashboard"
      title={`${greeting()}, ${first}`}
      subtitle="Your accounts-payable health at a glance — every PO, delivery and invoice, cross-checked."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {stats?.failed > 0 && (
            <button onClick={clearFailed} className="btn-ghost h-11 px-4 text-xs text-rose-500">
              <Trash2 size={15} /> Clear {stats.failed} failed
            </button>
          )}
          <button onClick={seedSamples} disabled={seeding} className="btn-indigo h-11 px-4 text-xs sm:text-sm">
            <Cpu size={16} /> {seeding ? 'Seeding…' : 'Load Sample 3-Way Match'}
          </button>
          <MagnetButton onClick={() => navigate('/upload')} className="btn-primary h-11 px-5">
            <UploadCloud size={18} /> Upload documents
          </MagnetButton>
        </div>
      }
    />
  );

  if (error) return <>{header}<div className="card p-6 text-rose-500">{error}</div></>;
  if (!stats) return (
    <>
      {header}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}</div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3"><Skeleton className="h-72 lg:col-span-2" /><Skeleton className="h-72" /></div>
    </>
  );

  if (stats.total === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={FileStack}
          title="Your workspace is empty"
          description="Upload a purchase order, its delivery receipt and the vendor invoice. DocuMind will classify them, extract every field and run a three-way match automatically."
          action={
            <MagnetButton onClick={() => navigate('/upload')} className="btn-primary h-12 px-6 text-base">
              <UploadCloud size={18} /> Upload your first documents
            </MagnetButton>
          }
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[['1', 'Upload', 'Drop PDFs or photos of POs, GRNs and invoices.'], ['2', 'Extract', 'Gemini reads vendors, quantities, prices and tax.'], ['3', 'Match', 'Mismatches are flagged with a clear pay / hold call.']].map(([n, t, d]) => (
            <div key={n} className="card flex gap-3 p-4">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-sm font-bold text-emerald-600 dark:text-emerald-300">{n}</span>
              <div><p className="text-sm font-semibold">{t}</p><p className="muted text-xs">{d}</p></div>
            </div>
          ))}
        </div>
      </>
    );
  }

  const cards = [
    { label: 'Total documents', value: stats.total, icon: FileStack, color: 'rgba(99,102,241,0.25)', grad: 'from-indigo-500 to-violet-500', hint: `${stats.by_type.invoice} invoices · ${stats.by_type.purchase_order} POs` },
    { label: 'Processed', value: stats.processed, icon: CheckCircle2, color: 'rgba(16,185,129,0.25)', grad: 'from-emerald-400 to-teal-500', hint: `${stats.matched} fully matched` },
    { label: 'Pending review', value: stats.pending_review, icon: Clock3, color: 'rgba(245,158,11,0.25)', grad: 'from-amber-400 to-orange-500', hint: 'Low confidence or missing fields', to: '/documents' },
    { label: 'Mismatches', value: stats.mismatches, icon: AlertOctagon, color: 'rgba(244,63,94,0.28)', grad: 'from-rose-500 to-pink-500', hint: `${stats.groups.on_hold} payment${stats.groups.on_hold === 1 ? '' : 's'} on hold`, to: '/validation', glow: stats.mismatches > 0 },
  ];
  const typeTotal = Math.max(1, stats.total);

  return (
    <>
      {header}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
            <SpotlightCard spotlightColor={c.color} className={`h-full cursor-default p-4 sm:p-5 ${c.glow ? 'ring-1 ring-rose-500/40 shadow-glow-red' : ''}`}
              onClick={c.to ? () => navigate(c.to) : undefined} style={c.to ? { cursor: 'pointer' } : undefined}>
              <div className="flex items-start justify-between">
                <span className={`grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${c.grad}`}><c.icon size={19} /></span>
                {c.to && <ArrowRight size={16} className="text-slate-400" />}
              </div>
              <p className="mt-4 font-display text-3xl font-extrabold sm:text-4xl"><CountUp to={c.value} /></p>
              <p className="mt-0.5 text-sm font-semibold">{c.label}</p>
              <p className="muted mt-1 truncate text-xs">{c.hint}</p>
            </SpotlightCard>
          </motion.div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Payment risk hero */}
        <TiltedCard className="rounded-3xl lg:col-span-2" max={4}>
          <div className={`relative h-full overflow-hidden rounded-3xl p-6 text-white sm:p-7 ${stats.amount_on_hold > 0 ? 'bg-gradient-to-br from-rose-600 via-rose-500 to-orange-500' : 'bg-gradient-to-br from-emerald-600 via-teal-500 to-indigo-600'}`}>
            <div className="bg-grid absolute inset-0 opacity-20" />
            <div className="absolute -bottom-20 -right-16 h-64 w-64 rounded-full bg-white/20 blur-3xl" />
            <div className="relative flex h-full flex-col justify-between gap-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
                {stats.amount_on_hold > 0 ? <PauseCircle size={18} /> : <ShieldCheck size={18} />}
                {stats.amount_on_hold > 0 ? 'Payments recommended on hold' : 'No payments at risk'}
              </div>
              <div>
                <p className="font-display text-4xl font-extrabold sm:text-5xl">
                  <CountUp to={stats.amount_on_hold} format={(v) => money(v, stats.currency)} />
                </p>
                <p className="mt-2 max-w-md text-sm text-white/85">
                  {stats.amount_on_hold > 0
                    ? `${stats.groups.on_hold} invoice match${stats.groups.on_hold === 1 ? '' : 'es'} failed three-way validation. Resolve them before releasing payment.`
                    : `${money(stats.invoice_total, stats.currency)} invoiced across ${stats.by_type.invoice} invoice${stats.by_type.invoice === 1 ? '' : 's'} — nothing flagged.`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/validation" className="btn bg-white/95 text-slate-900 hover:bg-white"><ClipboardCheck size={16} /> Open Validation Center</Link>
                <Link to="/insights" className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25"><Sparkles size={16} /> Ask AI</Link>
              </div>
            </div>
          </div>
        </TiltedCard>

        {/* Document mix */}
        <div className="card p-5">
          <h3 className="font-bold">Document mix</h3>
          <p className="muted text-xs">Auto-classified by Gemini</p>
          <div className="mt-5 space-y-4">
            {Object.entries(DOC_TYPES).filter(([k]) => k !== 'unknown' || stats.by_type.unknown).map(([k, t]) => (
              <div key={k}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${t.dot}`} />{t.label}</span>
                  <span className="font-semibold tabular-nums">{stats.by_type[k]}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200/70 dark:bg-white/5">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(stats.by_type[k] / typeTotal) * 100}%` }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} className={`h-full rounded-full ${t.dot}`} />
                </div>
              </div>
            ))}
          </div>
          {stats.top_vendors.length > 0 && (
            <>
              <h4 className="mt-6 text-xs font-bold uppercase tracking-wider text-slate-500">Top vendors by spend</h4>
              <ul className="mt-2 space-y-2">
                {stats.top_vendors.slice(0, 3).map((v) => (
                  <li key={v.vendor} className="flex items-center justify-between text-sm">
                    <span className="truncate pr-2">{v.vendor}</span>
                    <span className="font-semibold tabular-nums">{money(v.total, v.currency)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold">Recent documents</h3>
            <Link to="/documents" className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400">View all</Link>
          </div>
          <div className="space-y-1">{stats.recent.map((d, i) => <DocumentCard key={d.id} doc={d} index={i} />)}</div>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold">Live alerts</h3>
            <Link to="/validation" className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400">Validation Center</Link>
          </div>
          {stats.alerts.length === 0 ? (
            <div className="grid place-items-center py-10 text-center">
              <CheckCircle2 className="text-emerald-500" size={32} />
              <p className="mt-2 text-sm font-semibold">All clear</p>
              <p className="muted text-xs">No discrepancies across your matched documents.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {stats.alerts.map((a, i) => (
                <motion.li key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className="rounded-2xl border border-slate-200/70 p-3 dark:border-white/5">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <DiscrepancyBadge severity={a.severity} type={a.type} ai={a.source === 'ai'} />
                    {a.po_number && <span className="muted text-xs">PO {a.po_number}</span>}
                  </div>
                  <p className="text-sm">{a.message}</p>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
