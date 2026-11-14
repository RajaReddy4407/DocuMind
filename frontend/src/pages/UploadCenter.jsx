import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertOctagon, ArrowRight, CheckCircle2, Cpu, FileWarning, RotateCcw, ScanText, ShieldCheck, UploadCloud, XCircle } from 'lucide-react';
import api, { errorMessage } from '../api/client.js';
import PageHeader from '../components/layout/PageHeader.jsx';
import Dropzone from '../components/domain/Dropzone.jsx';
import MagnetButton from '../components/reactbits/MagnetButton.jsx';
import ShinyText from '../components/reactbits/ShinyText.jsx';
import { StatusPill, TypeBadge } from '../components/domain/Badges.jsx';
import { RECOMMENDATION, money } from '../lib/format.js';

const STAGES = [
  { icon: UploadCloud, label: 'Uploading securely' },
  { icon: ScanText, label: 'Reading via Cloud OCR & reasoning with LLM' },
  { icon: Cpu, label: 'Running three-way match' },
];

export default function UploadCenter() {
  const [files, setFiles] = useState([]);
  const [phase, setPhase] = useState('idle'); // idle | uploading | processing | done
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [seeding, setSeeding] = useState(false);

  const loadDemoScenarios = async () => {
    setError('');
    setSeeding(true);
    setPhase('processing');
    setProgress(100);
    try {
      const { data } = await api.post('/documents/demo-seed');
      setResult(data);
      setPhase('done');
    } catch (e) {
      setError(errorMessage(e));
      setPhase('idle');
    } finally {
      setSeeding(false);
    }
  };

  const clearFailed = async () => {
    try {
      await api.delete('/documents/failed/clear');
      if (result) {
        setResult((r) => ({ ...r, documents: r.documents.filter((d) => d.status !== 'failed') }));
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const start = async () => {
    if (!files.length) return;
    setError('');
    setPhase('uploading');
    setProgress(0);
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    try {
      const { data } = await api.post('/documents/upload', form, {
        onUploadProgress: (e) => {
          const p = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
          setProgress(p);
          if (p >= 100) setPhase('processing');
        },
      });
      setResult(data);
      setPhase('done');
      setFiles([]);
    } catch (e) {
      setError(errorMessage(e));
      setPhase('idle');
    }
  };

  const reset = () => { setPhase('idle'); setResult(null); setProgress(0); };
  const busy = phase === 'uploading' || phase === 'processing';
  const stageIdx = phase === 'uploading' ? 0 : phase === 'processing' ? 1 : 2;
  const summary = result?.validation?.summary;

  return (
    <>
      <PageHeader
        eyebrow="Upload Center"
        title="Drop in your paperwork"
        subtitle="Batch-upload POs, delivery receipts and invoices. Each file is scanned with Cloud OCR, reasoned over by the LLM, and matched in one pass."
        actions={
          <MagnetButton onClick={loadDemoScenarios} disabled={busy || seeding} className="btn-indigo h-11 px-4 text-xs sm:text-sm">
            <Cpu size={16} /> {seeding ? 'Generating Scenarios…' : 'Load Sample 3-Way Match'}
          </MagnetButton>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {phase !== 'done' ? (
              <motion.div key="drop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -10 }} className="card p-3 sm:p-4">
                <Dropzone files={files} onChange={setFiles} disabled={busy} />

                <AnimatePresence>
                  {busy && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4 rounded-2xl bg-slate-900/[0.03] p-4 dark:bg-white/5">
                      <div className="space-y-3">
                        {STAGES.map((s, i) => (
                          <div key={s.label} className={`flex items-center gap-3 text-sm transition-opacity ${i > stageIdx ? 'opacity-40' : ''}`}>
                            <span className={`grid h-8 w-8 place-items-center rounded-xl ${i < stageIdx ? 'bg-emerald-500 text-white' : i === stageIdx ? 'bg-gradient-to-br from-emerald-400 to-indigo-500 text-white' : 'bg-slate-200 dark:bg-white/10'}`}>
                              {i < stageIdx ? <CheckCircle2 size={16} /> : <s.icon size={16} className={i === stageIdx ? 'animate-pulse' : ''} />}
                            </span>
                            <span className="flex-1 font-medium">{i === stageIdx ? <ShinyText>{s.label}…</ShinyText> : s.label}</span>
                            {i === 0 && <span className="muted tabular-nums text-xs">{progress}%</span>}
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                        {phase === 'uploading'
                          ? <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-indigo-500" animate={{ width: `${progress}%` }} />
                          : <motion.div className="h-full w-1/3 rounded-full bg-gradient-to-r from-emerald-400 to-indigo-500" animate={{ x: ['-100%', '300%'] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} />}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && <p className="mt-4 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">{error}</p>}

                <div className="mt-4 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="muted text-xs">{files.length ? `${files.length} file${files.length > 1 ? 's' : ''} ready` : 'Files are processed in memory and never shared across accounts.'}</p>
                  <div className="flex gap-2">
                    {files.length > 0 && !busy && <button onClick={() => setFiles([])} className="btn-ghost">Clear</button>}
                    <MagnetButton onClick={start} disabled={!files.length || busy} className="btn-primary h-12 px-6 text-base">
                      {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <UploadCloud size={18} />}
                      {busy ? 'Processing…' : `Analyze ${files.length || ''} document${files.length === 1 ? '' : 's'}`}
                    </MagnetButton>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">Batch processed</h2>
                    <p className="muted text-sm">{result.documents.length} document{result.documents.length === 1 ? '' : 's'} classified and extracted</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {result.documents.some((d) => d.status === 'failed') && (
                      <button onClick={clearFailed} className="btn-ghost text-rose-500"><XCircle size={15} /> Clear failed</button>
                    )}
                    <button onClick={reset} className="btn-ghost"><RotateCcw size={16} /> Upload more</button>
                  </div>
                </div>

                <ul className="mt-5 space-y-2">
                  {result.documents.map((d, i) => (
                    <motion.li key={d.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
                      <Link to={`/documents/${d.id}`} className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3 transition hover:border-emerald-500/40">
                        {d.status === 'failed' ? <XCircle className="text-rose-500" size={22} /> : <CheckCircle2 className="text-emerald-500" size={22} />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{d.filename}</p>
                          <p className="muted truncate text-xs">
                            {d.status === 'failed' ? d.error : `${d.extracted?.vendor_name || 'Unknown vendor'} · #${d.extracted?.document_number || '—'} · ${Math.round((d.extracted?.confidence || 0) * 100)}% confidence`}
                          </p>
                        </div>
                        <TypeBadge type={d.doc_type} />
                        <StatusPill status={d.status} />
                      </Link>
                    </motion.li>
                  ))}
                </ul>

                {result.validation.groups.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-2 text-sm font-bold">Three-way match results</h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {result.validation.groups.map((g) => {
                        const r = RECOMMENDATION[g.recommendation];
                        return (
                          <Link key={g.key} to="/validation" className="glass rounded-2xl p-3 transition hover:border-emerald-500/40">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-semibold">{g.unlinked ? 'Unlinked document' : `PO ${g.po_number}`}</p>
                              <span className={`pill ${r.cls}`}>{r.label}</span>
                            </div>
                            <p className="muted mt-1 line-clamp-2 text-xs">{g.summary}</p>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                <Link to="/validation" className={`mt-6 flex items-center justify-between rounded-2xl p-4 text-white ${summary?.on_hold ? 'bg-gradient-to-r from-rose-500 to-orange-500 shadow-glow-red' : 'bg-gradient-to-r from-emerald-500 to-indigo-500 shadow-glow'}`}>
                  <span className="flex items-center gap-3 text-sm font-semibold">
                    {summary?.on_hold ? <AlertOctagon size={20} /> : <ShieldCheck size={20} />}
                    {summary?.on_hold ? `${summary.on_hold} payment${summary.on_hold > 1 ? 's' : ''} to hold · ${money(summary.amount_at_risk)} at risk` : 'No blocking discrepancies in this batch'}
                  </span>
                  <ArrowRight size={18} />
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <h3 className="font-bold">How matching works</h3>
            <ol className="mt-4 space-y-4">
              {[
                ['Purchase Order', 'What you ordered and the agreed price.', 'bg-indigo-500'],
                ['Delivery Receipt (GRN)', 'What actually arrived at your door.', 'bg-sky-500'],
                ['Invoice', 'What the vendor is billing you for.', 'bg-emerald-500'],
              ].map(([t, d, c], i) => (
                <li key={t} className="flex gap-3">
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${c}`}>{i + 1}</span>
                  <div><p className="text-sm font-semibold">{t}</p><p className="muted text-xs">{d}</p></div>
                </li>
              ))}
            </ol>
            <div className="mt-5 rounded-2xl bg-amber-400/10 p-3 text-xs text-amber-800 ring-1 ring-amber-500/20 dark:text-amber-200">
              <FileWarning size={14} className="mb-1" />
              Make sure invoices and receipts show the PO number — that's how DocuMind links them together.
            </div>
          </div>
          <div className="card p-5 text-sm">
            <h3 className="font-bold">Tips for best accuracy</h3>
            <ul className="muted mt-3 list-disc space-y-1.5 pl-4 text-xs">
              <li>Upload original PDFs where possible.</li>
              <li>Photos: flat, well-lit, all four corners visible.</li>
              <li>One document per file.</li>
              <li>You can correct any field afterwards in Document Intelligence.</li>
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}
