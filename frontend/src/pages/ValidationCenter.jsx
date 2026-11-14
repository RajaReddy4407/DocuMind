import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertOctagon, Check, CheckCircle2, ClipboardList, Copy, Download, Mail, PackageCheck, PauseCircle, Receipt, ShieldAlert, ShieldCheck, Sparkles, UploadCloud, X } from 'lucide-react';
import api, { errorMessage } from '../api/client.js';
import PageHeader from '../components/layout/PageHeader.jsx';
import SpotlightCard from '../components/reactbits/SpotlightCard.jsx';
import MagnetButton from '../components/reactbits/MagnetButton.jsx';
import DiscrepancyBadge from '../components/domain/DiscrepancyBadge.jsx';
import EmptyState from '../components/domain/EmptyState.jsx';
import { RECOMMENDATION, money } from '../lib/format.js';

const FILTERS = [
  { id: 'all', label: 'All groups' },
  { id: 'HOLD_PAYMENT', label: 'Hold payment' },
  { id: 'REVIEW', label: 'Needs review' },
  { id: 'APPROVE', label: 'Approved' },
];

export default function ValidationCenter() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [disputeModal, setDisputeModal] = useState(null);
  const [draftingKey, setDraftingKey] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      const res = await api.get('/documents/validation');
      setData(res.data);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  useEffect(() => { load(); }, []);

  const runDeepAudit = async (groupKey = null) => {
    setRunning(true);
    setError('');
    try {
      const res = await api.post('/documents/validation/run', groupKey ? { group_key: groupKey, force: true } : { force: true });
      setData(res.data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRunning(false);
    }
  };

  const openDisputeDraft = async (groupKey) => {
    setDraftingKey(groupKey);
    setError('');
    try {
      const res = await api.post('/documents/validation/dispute-email', { group_key: groupKey });
      setDisputeModal(res.data);
      setCopied(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDraftingKey(null);
    }
  };

  const exportCsv = () => {
    if (!data?.groups?.length) return;
    const headers = ['PO Number', 'Vendor', 'Status', 'Recommendation', 'Risk Score', 'PO Total', 'Invoice Total', 'Amount at Risk', 'Findings'];
    const rows = data.groups.map((g) => [
      g.po_number || 'Unlinked',
      g.vendor || 'Unknown',
      g.status,
      g.recommendation,
      g.risk_score ?? 0,
      g.po_total ?? 0,
      g.invoice_total ?? 0,
      g.amount_at_risk ?? 0,
      (g.findings || []).map((f) => `[${f.severity}] ${f.message}`).join(' | '),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `documind-3way-match-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const groups = (data?.groups || []).filter((g) => (filter === 'all' ? true : g.recommendation === filter));
  const s = data?.summary;

  return (
    <>
      <PageHeader
        eyebrow="Validation Center · Three-Way Matching"
        title="PO ↔ GRN ↔ Invoice Cross-Check"
        subtitle="Ordered vs. received vs. billed — every discrepancy, missing document and duplicate invoice highlighted with a clear payment recommendation."
        actions={
          data?.groups?.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={exportCsv} className="btn-ghost h-11 px-4 text-xs sm:text-sm">
                <Download size={16} /> Export Audit CSV
              </button>
              <MagnetButton onClick={() => runDeepAudit()} disabled={running} className="btn-indigo h-11 px-5">
                {running ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Sparkles size={17} />}
                {running ? 'Running Deep Audit…' : 'Run Deep Audit'}
              </MagnetButton>
            </div>
          )
        }
      />

      {error && <div className="mb-4 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-500">{error}</div>}

      {s && data.groups.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SpotlightCard spotlightColor="rgba(244,63,94,0.28)" className="p-4">
              <div className="flex items-center justify-between text-rose-500"><PauseCircle size={18} /><span className="text-xs font-bold">HOLD</span></div>
              <p className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">{s.on_hold}</p>
              <p className="muted text-xs">{money(s.amount_at_risk)} at risk</p>
            </SpotlightCard>
            <SpotlightCard spotlightColor="rgba(245,158,11,0.25)" className="p-4">
              <div className="flex items-center justify-between text-amber-500"><AlertOctagon size={18} /><span className="text-xs font-bold">WARNINGS</span></div>
              <p className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">{s.critical + s.warnings}</p>
              <p className="muted text-xs">{s.critical} critical · {s.warnings} warnings</p>
            </SpotlightCard>
            <SpotlightCard spotlightColor="rgba(16,185,129,0.25)" className="p-4">
              <div className="flex items-center justify-between text-emerald-500"><CheckCircle2 size={18} /><span className="text-xs font-bold">APPROVED</span></div>
              <p className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">{s.approved}</p>
              <p className="muted text-xs">Clean 3-way matches</p>
            </SpotlightCard>
            <SpotlightCard spotlightColor="rgba(99,102,241,0.25)" className="p-4">
              <div className="flex items-center justify-between text-indigo-500"><Receipt size={18} /><span className="text-xs font-bold">DUPLICATES</span></div>
              <p className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">{s.duplicates}</p>
              <p className="muted text-xs">Duplicate invoices caught</p>
            </SpotlightCard>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`rounded-2xl px-4 py-2 text-xs font-semibold transition ${filter === f.id ? 'bg-emerald-500 text-white shadow-glow' : 'glass text-slate-600 dark:text-slate-300'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}

      {data && data.groups.length === 0 && (
        <EmptyState icon={ShieldCheck} title="Nothing to validate yet"
          description="Upload a purchase order, delivery receipt (GRN) and invoice referencing the same PO number to see automated three-way matching in action."
          action={<MagnetButton onClick={() => navigate('/upload')} className="btn-primary h-11 px-5"><UploadCloud size={18} /> Upload documents</MagnetButton>} />
      )}

      <div className="mt-4 space-y-4">
        {groups.map((g, gi) => {
          const rec = RECOMMENDATION[g.recommendation] || RECOMMENDATION.REVIEW;
          const border = g.recommendation === 'HOLD_PAYMENT' ? 'ring-1 ring-rose-500/40 shadow-glow-red'
            : g.recommendation === 'REVIEW' ? 'ring-1 ring-amber-400/40' : '';
          return (
            <motion.section key={g.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.05 }}
              className={`card overflow-hidden p-5 sm:p-6 ${border}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`pill ${rec.cls}`}>{rec.label}</span>
                    <h2 className="text-lg font-extrabold sm:text-xl">{g.unlinked ? 'Unlinked Document' : `PO ${g.po_number}`}</h2>
                    {g.vendor && <span className="muted text-sm">· {g.vendor}</span>}
                    {typeof g.risk_score === 'number' && (
                      <span className={`pill ${
                        g.risk_score >= 50
                          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                          : g.risk_score > 0
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      }`}>
                        <ShieldAlert size={11} /> Risk Score: {g.risk_score}/100
                      </span>
                    )}
                    {g.ai && <span className="pill bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"><Sparkles size={11} /> Deep Audit verified</span>}
                  </div>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{g.summary}</p>
                </div>
                <div className="text-right">
                  {g.invoice_total > 0 && <p className="font-display text-xl font-extrabold">{money(g.invoice_total, g.currency)}</p>}
                  {g.po_total !== null && <p className="muted text-xs">PO total: {money(g.po_total, g.currency)}</p>}
                </div>
              </div>

              {/* 3-way document slots */}
              <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                {[
                  { key: 'purchase_order', label: '1. Purchase Order (Ordered)', icon: ClipboardList, ok: g.has.po },
                  { key: 'delivery_receipt', label: '2. Delivery Receipt / GRN (Received)', icon: PackageCheck, ok: g.has.grn },
                  { key: 'invoice', label: '3. Invoice (Billed)', icon: Receipt, ok: g.has.invoice },
                ].map((slot) => {
                  const docsHere = g.documents.filter((d) => d.doc_type === slot.key);
                  return (
                    <div key={slot.key} className={`rounded-2xl border p-3 ${slot.ok ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-dashed border-amber-500/40 bg-amber-500/[0.04]'}`}>
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="flex items-center gap-1.5"><slot.icon size={14} /> {slot.label}</span>
                        <span className={slot.ok ? 'text-emerald-500' : 'text-amber-500'}>{slot.ok ? 'Present' : 'Missing'}</span>
                      </div>
                      {docsHere.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {docsHere.map((d) => (
                            <Link key={d.id} to={`/documents/${d.id}`} className="block truncate text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400">
                              #{d.document_number || '—'} · {d.filename}
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <Link to="/upload" className="muted mt-2 inline-block text-xs hover:underline">+ Upload missing document</Link>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Line-by-line comparison table */}
              {g.line_comparison?.length > 0 && (
                <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200/70 dark:border-white/10">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-slate-900/[0.03] text-[11px] uppercase tracking-wider text-slate-500 dark:bg-white/5">
                      <tr>
                        <th className="px-3.5 py-2.5">Item</th>
                        <th className="px-3.5 py-2.5 text-right">PO Ordered</th>
                        <th className="px-3.5 py-2.5 text-right">GRN Received</th>
                        <th className="px-3.5 py-2.5 text-right">Invoice Billed</th>
                        <th className="px-3.5 py-2.5 text-right">PO Price</th>
                        <th className="px-3.5 py-2.5 text-right">Inv Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/60 dark:divide-white/5">
                      {g.line_comparison.map((r, i) => {
                        const badQty = (r.received !== null && r.billed !== null && r.billed > r.received) || (r.ordered !== null && r.billed !== null && r.billed > r.ordered);
                        const badPrice = r.po_price && r.inv_price && r.inv_price > r.po_price * 1.005;
                        return (
                          <tr key={i} className={badQty || badPrice ? 'bg-rose-500/[0.06]' : ''}>
                            <td className="px-3.5 py-2.5 font-medium">{r.description}</td>
                            <td className="px-3.5 py-2.5 text-right tabular-nums">{r.ordered ?? '—'}</td>
                            <td className="px-3.5 py-2.5 text-right tabular-nums">{r.received ?? '—'}</td>
                            <td className={`px-3.5 py-2.5 text-right font-semibold tabular-nums ${badQty ? 'text-rose-500' : ''}`}>{r.billed ?? '—'}</td>
                            <td className="px-3.5 py-2.5 text-right tabular-nums">{r.po_price !== null ? money(r.po_price, g.currency) : '—'}</td>
                            <td className={`px-3.5 py-2.5 text-right tabular-nums ${badPrice ? 'font-semibold text-rose-500' : ''}`}>{r.inv_price !== null ? money(r.inv_price, g.currency) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Discrepancies */}
              {g.findings?.length > 0 && (
                <div className="mt-4 space-y-2">
                  {g.findings.map((f, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2.5 rounded-2xl bg-slate-900/[0.03] p-3 text-sm dark:bg-white/[0.04]">
                      <DiscrepancyBadge severity={f.severity} type={f.type} ai={f.source === 'ai'} />
                      <span className="flex-1">{f.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Recommended actions */}
              {g.recommended_actions?.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-3 dark:border-white/10">
                  <div className="flex flex-wrap gap-2">
                    {g.recommended_actions.map((a, i) => (
                      <span key={i} className="rounded-xl bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        ✓ {a}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {g.recommendation !== 'APPROVE' && (
                      <button
                        onClick={() => openDisputeDraft(g.key)}
                        disabled={draftingKey === g.key}
                        className="btn-ghost border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-500/20 dark:text-rose-300"
                      >
                        <Mail size={13} /> {draftingKey === g.key ? 'Drafting Dispute…' : 'Draft Vendor Dispute Email'}
                      </button>
                    )}
                    <button onClick={() => runDeepAudit(g.key)} disabled={running} className="btn-ghost px-3 py-1.5 text-xs">
                      <Sparkles size={13} /> Re-verify with AI
                    </button>
                  </div>
                </div>
              )}
            </motion.section>
          );
        })}
      </div>

      {/* Auto-Drafted Vendor Dispute Email Modal */}
      {disputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card max-h-[85vh] w-full max-w-2xl overflow-y-auto p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="pill bg-rose-500/15 text-rose-600 dark:text-rose-300"><Mail size={12} /> Auto-Drafted Vendor Dispute</span>
                <h3 className="mt-1.5 text-lg font-extrabold">{disputeModal.vendor || 'Vendor'} · PO {disputeModal.po_number || '—'}</h3>
              </div>
              <button onClick={() => setDisputeModal(null)} className="btn-ghost p-2"><X size={16} /></button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="label">Subject Line</label>
                <input readOnly value={disputeModal.subject} className="input font-semibold" />
              </div>
              <div>
                <label className="label">Dispute & Credit Note Request Body</label>
                <textarea readOnly rows={12} value={disputeModal.body} className="input font-mono text-xs leading-relaxed" />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`Subject: ${disputeModal.subject}\n\n${disputeModal.body}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="btn-ghost h-10 px-4 text-xs"
              >
                {copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                {copied ? 'Copied to Clipboard!' : 'Copy Email'}
              </button>
              <a
                href={`mailto:?subject=${encodeURIComponent(disputeModal.subject)}&body=${encodeURIComponent(disputeModal.body)}`}
                className="btn-primary h-10 px-5 text-xs"
              >
                <Mail size={15} /> Open in Email Client
              </a>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
