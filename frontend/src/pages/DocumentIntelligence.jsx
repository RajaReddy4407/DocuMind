import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, FileText, Plus, Save, ScanText, Search, ShieldCheck, Sparkles, Trash2, UploadCloud } from 'lucide-react';
import api, { errorMessage } from '../api/client.js';
import PageHeader from '../components/layout/PageHeader.jsx';
import SpotlightCard from '../components/reactbits/SpotlightCard.jsx';
import MagnetButton from '../components/reactbits/MagnetButton.jsx';
import DocumentCard from '../components/domain/DocumentCard.jsx';
import { StatusPill, TypeBadge } from '../components/domain/Badges.jsx';
import DiscrepancyBadge from '../components/domain/DiscrepancyBadge.jsx';
import EmptyState from '../components/domain/EmptyState.jsx';
import { DOC_TYPES, RECOMMENDATION, money } from '../lib/format.js';

const TABS = [
  { id: '', label: 'All' },
  { id: 'invoice', label: 'Invoices' },
  { id: 'purchase_order', label: 'POs' },
  { id: 'delivery_receipt', label: 'GRNs' },
];

const emptyLine = () => ({ description: '', sku: '', quantity: 1, unit_price: 0, amount: 0 });

export default function DocumentIntelligence() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [query, setQuery] = useState('');
  const [docType, setDocType] = useState('invoice');
  const [fields, setFields] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [error, setError] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [reparsing, setReparsing] = useState(false);
  const [showOcrDrawer, setShowOcrDrawer] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/documents');
      setDocs(data.documents || []);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (typeFilter && d.doc_type !== typeFilter) return false;
      if (!q) return true;
      const e = d.extracted || {};
      return [d.filename, e.vendor_name, e.document_number, e.po_reference].some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [docs, typeFilter, query]);

  const selected = useMemo(() => {
    if (id) return docs.find((d) => d.id === id) || null;
    return filtered[0] || docs[0] || null;
  }, [docs, filtered, id]);

  useEffect(() => {
    if (!selected) { setFields(null); return; }
    const e = selected.extracted || {};
    setDocType(selected.doc_type || 'invoice');
    setOcrText(e.ocr_text ?? '');
    setFields({
      document_number: e.document_number ?? '',
      po_reference: e.po_reference ?? '',
      vendor_name: e.vendor_name ?? '',
      vendor_address: e.vendor_address ?? '',
      buyer_name: e.buyer_name ?? '',
      document_date: e.document_date ?? '',
      due_date: e.due_date ?? '',
      currency: e.currency ?? 'USD',
      payment_terms: e.payment_terms ?? '',
      subtotal: e.subtotal ?? '',
      tax_rate: e.tax_rate ?? '',
      tax_amount: e.tax_amount ?? '',
      total_amount: e.total_amount ?? '',
      notes: e.notes ?? '',
      line_items: Array.isArray(e.line_items) && e.line_items.length ? e.line_items.map((l) => ({
        description: l.description ?? '', sku: l.sku ?? '', quantity: l.quantity ?? '', unit_price: l.unit_price ?? '', amount: l.amount ?? '',
      })) : [],
    });
  }, [selected?.id]);

  const setField = (k) => (e) => setFields((f) => ({ ...f, [k]: e.target.value }));
  const setLine = (idx, k, val) => setFields((f) => {
    const items = f.line_items.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, [k]: val };
      if (k === 'quantity' || k === 'unit_price') {
        const q = Number(next.quantity) || 0;
        const p = Number(next.unit_price) || 0;
        if (q && p) next.amount = Math.round(q * p * 100) / 100;
      }
      return next;
    });
    return { ...f, line_items: items };
  });

  const recalcTotals = () => {
    if (!fields) return;
    const sub = Math.round(fields.line_items.reduce((s, l) => s + (Number(l.amount) || (Number(l.quantity) || 0) * (Number(l.unit_price) || 0)), 0) * 100) / 100;
    const rate = Number(fields.tax_rate) || 0;
    const tax = rate ? Math.round(sub * (rate / 100) * 100) / 100 : Number(fields.tax_amount) || 0;
    setFields((f) => ({ ...f, subtotal: sub, tax_amount: tax, total_amount: Math.round((sub + tax) * 100) / 100 }));
  };

  const save = async () => {
    if (!selected || !fields) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await api.patch(`/documents/${selected.id}`, { doc_type: docType, extracted: fields });
      setDocs((list) => list.map((d) => (d.id === data.document.id ? data.document : d)));
      await load();
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const reparseFromOcr = async () => {
    if (!selected || !ocrText.trim()) return;
    setReparsing(true);
    setError('');
    try {
      const { data } = await api.post(`/documents/${selected.id}/reparse-ocr`, { ocr_text: ocrText });
      setDocs((list) => list.map((d) => (d.id === data.document.id ? data.document : d)));
      await load();
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setReparsing(false);
    }
  };

  const remove = async () => {
    if (!selected || !window.confirm(`Delete "${selected.filename}"? This will also update three-way matching.`)) return;
    try {
      await api.delete(`/documents/${selected.id}`);
      const remaining = docs.filter((d) => d.id !== selected.id);
      setDocs(remaining);
      navigate(remaining[0] ? `/documents/${remaining[0].id}` : '/documents', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!loading && docs.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Document Intelligence" title="Inspect & refine extracted data" subtitle="Every field Gemini extracts is editable and immediately re-runs three-way matching." />
        <EmptyState icon={FileText} title="No documents uploaded yet" description="Upload a PO, delivery receipt or invoice to inspect and edit its extracted fields here."
          action={<MagnetButton onClick={() => navigate('/upload')} className="btn-primary h-11 px-5"><UploadCloud size={18} /> Upload documents</MagnetButton>} />
      </>
    );
  }

  const v = selected?.validation;
  const rec = v?.recommendation ? RECOMMENDATION[v.recommendation] : null;
  const confidence = Math.round(((selected?.extracted?.confidence ?? 0.9) * 100));

  return (
    <>
      <PageHeader
        eyebrow="Document Intelligence"
        title="Inspect & refine extracted data"
        subtitle="Edit any vendor, PO link, quantity or price — three-way matching re-evaluates automatically."
        actions={
          selected && (
            <div className="flex items-center gap-2">
              <button onClick={remove} className="btn-danger h-11"><Trash2 size={16} /> Delete</button>
              <MagnetButton onClick={save} disabled={saving} className="btn-primary h-11 px-5">
                {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : savedToast ? <Check size={17} /> : <Save size={17} />}
                {savedToast ? 'Saved & Re-matched' : 'Save & Re-match'}
              </MagnetButton>
            </div>
          )
        }
      />

      {error && <div className="mb-4 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-500">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Left: Document list */}
        <aside className={`card p-3 sm:p-4 lg:col-span-4 ${id ? 'hidden lg:block' : ''}`}>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vendor, PO#, filename…" className="input h-10 pl-9 text-xs" />
          </div>
          <div className="mt-2.5 flex gap-1 overflow-x-auto no-scrollbar">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTypeFilter(t.id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${typeFilter === t.id ? 'bg-emerald-500 text-white shadow-glow' : 'text-slate-500 hover:bg-slate-200/60 dark:hover:bg-white/5'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="mt-3 max-h-[65vh] space-y-1 overflow-y-auto pr-1">
            {filtered.map((d, i) => <DocumentCard key={d.id} doc={d} active={selected?.id === d.id} index={i} />)}
            {filtered.length === 0 && <p className="muted py-8 text-center text-xs">No matching documents.</p>}
          </div>
        </aside>

        {/* Right: Editable glassmorphic card grid */}
        {selected && fields && (
          <div className="space-y-4 lg:col-span-8">
            <div className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Link to="/documents" className="btn-ghost px-2.5 py-1.5 lg:hidden"><ArrowLeft size={16} /></Link>
                  <div>
                    <h2 className="font-bold sm:text-lg">{selected.filename}</h2>
                    <p className="muted text-xs">
                      Confidence: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{confidence}%</span>
                      {selected.extracted?.ocr_provider && <span> · {selected.extracted.ocr_provider} → LLM Reasoning</span>}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={docType} onChange={(e) => setDocType(e.target.value)} className="input h-9 w-auto py-1 pr-8 text-xs font-semibold">
                    {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <TypeBadge type={docType} />
                  <StatusPill status={selected.status} />
                </div>
              </div>

              {v && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-900/[0.03] p-3 dark:bg-white/5">
                  <div className="flex flex-wrap items-center gap-2">
                    {rec && <span className={`pill ${rec.cls}`}>{rec.label}</span>}
                    <span className="text-xs font-medium">{v.summary}</span>
                  </div>
                  <Link to="/validation" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                    <ShieldCheck size={14} /> Match details
                  </Link>
                </div>
              )}
            </div>

            {/* Glassmorphic card grid: Identity + Counterparty + Financials */}
            <div className="grid gap-4 md:grid-cols-2">
              <SpotlightCard className="p-4 sm:p-5">
                <h3 className="mb-3 text-sm font-bold">Document & PO Link</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">{docType === 'purchase_order' ? 'PO Number' : 'Document #'}</label>
                    <input value={fields.document_number} onChange={setField('document_number')} className="input" placeholder="INV-1042" />
                  </div>
                  <div>
                    <label className="label">PO Reference</label>
                    <input value={fields.po_reference} onChange={setField('po_reference')} className="input" placeholder="PO-1001" />
                  </div>
                  <div>
                    <label className="label">Document Date</label>
                    <input type="date" value={fields.document_date} onChange={setField('document_date')} className="input" />
                  </div>
                  <div>
                    <label className="label">Due Date</label>
                    <input type="date" value={fields.due_date} onChange={setField('due_date')} className="input" />
                  </div>
                </div>
              </SpotlightCard>

              <SpotlightCard spotlightColor="rgba(99, 102, 241, 0.22)" className="p-4 sm:p-5">
                <h3 className="mb-3 text-sm font-bold">Vendor & Terms</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="label">Vendor (Supplier) Name</label>
                    <input value={fields.vendor_name} onChange={setField('vendor_name')} className="input" placeholder="Acme Industrial Supplies" />
                  </div>
                  <div>
                    <label className="label">Currency</label>
                    <input value={fields.currency} onChange={setField('currency')} className="input uppercase" maxLength={5} placeholder="USD" />
                  </div>
                  <div>
                    <label className="label">Payment Terms</label>
                    <input value={fields.payment_terms} onChange={setField('payment_terms')} className="input" placeholder="Net 30" />
                  </div>
                </div>
              </SpotlightCard>
            </div>

            {/* Line items */}
            <div className="card p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold">Line Items ({fields.line_items.length})</h3>
                  <p className="muted text-xs">Quantities & unit prices feed directly into three-way matching.</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={recalcTotals} className="btn-ghost px-3 py-1.5 text-xs">Recalculate totals</button>
                  <button type="button" onClick={() => setFields((f) => ({ ...f, line_items: [...f.line_items, emptyLine()] }))} className="btn-ghost px-3 py-1.5 text-xs">
                    <Plus size={14} /> Add line
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {fields.line_items.map((l, idx) => (
                  <motion.div key={idx} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-12 items-center gap-2 rounded-2xl bg-slate-900/[0.025] p-2.5 dark:bg-white/[0.03]">
                    <input value={l.description} onChange={(e) => setLine(idx, 'description', e.target.value)} placeholder="Item description" className="input col-span-12 sm:col-span-5" />
                    <input value={l.sku} onChange={(e) => setLine(idx, 'sku', e.target.value)} placeholder="SKU" className="input col-span-4 sm:col-span-2" />
                    <input type="number" step="any" value={l.quantity} onChange={(e) => setLine(idx, 'quantity', e.target.value)} placeholder="Qty" className="input col-span-3 sm:col-span-2" />
                    <input type="number" step="any" value={l.unit_price} onChange={(e) => setLine(idx, 'unit_price', e.target.value)} placeholder="Unit price" className="input col-span-3 sm:col-span-2" />
                    <button type="button" onClick={() => setFields((f) => ({ ...f, line_items: f.line_items.filter((_, i) => i !== idx) }))}
                      className="col-span-2 grid h-9 place-items-center rounded-xl text-slate-400 hover:bg-rose-500/10 hover:text-rose-500 sm:col-span-1" aria-label="Remove line">
                      <Trash2 size={15} />
                    </button>
                  </motion.div>
                ))}
                {fields.line_items.length === 0 && <p className="muted py-4 text-center text-xs">No line items — click “Add line” to add one.</p>}
              </div>

              {/* Financial totals */}
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200/70 pt-4 sm:grid-cols-4 dark:border-white/10">
                <div>
                  <label className="label">Subtotal</label>
                  <input type="number" step="any" value={fields.subtotal} onChange={setField('subtotal')} className="input" />
                </div>
                <div>
                  <label className="label">Tax Rate (%)</label>
                  <input type="number" step="any" value={fields.tax_rate} onChange={setField('tax_rate')} className="input" />
                </div>
                <div>
                  <label className="label">Tax Amount</label>
                  <input type="number" step="any" value={fields.tax_amount} onChange={setField('tax_amount')} className="input" />
                </div>
                <div>
                  <label className="label">Total Amount ({money(fields.total_amount, fields.currency)})</label>
                  <input type="number" step="any" value={fields.total_amount} onChange={setField('total_amount')} className="input font-bold" />
                </div>
              </div>
            </div>

            {/* Cloud OCR Raw Text & Live Re-Reason Panel */}
            <div className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ScanText size={17} className="text-emerald-500" />
                  <div>
                    <h3 className="text-sm font-bold">Cloud OCR Raw Text & Live Re-Parse</h3>
                    <p className="muted text-xs">Inspect or edit the raw OCR text and re-run LLM field reasoning.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOcrDrawer((s) => !s)}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  {showOcrDrawer ? 'Hide Raw OCR Text' : 'Inspect / Edit OCR Text'}
                </button>
              </div>
              {showOcrDrawer && (
                <div className="mt-3 space-y-2.5">
                  <textarea
                    rows={7}
                    value={ocrText}
                    onChange={(e) => setOcrText(e.target.value)}
                    placeholder="Paste or edit raw OCR text from the document here (e.g. PO Number: PO-1001, Vendor: Acme Ltd, Line items...)"
                    className="input font-mono text-xs leading-relaxed"
                  />
                  <div className="flex justify-end">
                    <MagnetButton
                      type="button"
                      onClick={reparseFromOcr}
                      disabled={reparsing || !ocrText.trim()}
                      className="btn-indigo h-10 px-4 text-xs"
                    >
                      <Sparkles size={14} /> {reparsing ? 'Re-running OCR + LLM Reasoning…' : 'Re-Run OCR + LLM Extraction'}
                    </MagnetButton>
                  </div>
                </div>
              )}
            </div>

            {v?.findings?.length > 0 && (
              <div className="card p-4 sm:p-5">
                <h3 className="mb-2.5 text-sm font-bold">Validation Findings for this PO Group</h3>
                <ul className="space-y-2">
                  {v.findings.map((f, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/70 p-3 text-sm dark:border-white/10">
                      <DiscrepancyBadge severity={f.severity} type={f.type} ai={f.source === 'ai'} />
                      <span className="flex-1">{f.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
