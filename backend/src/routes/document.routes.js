import { Router } from 'express';
import multer from 'multer';
import { supabase } from '../config/supabase.js';
import { extractDocument, askAssistant, reasonOverOcrText, generateDisputeEmail } from '../services/gemini.service.js';
import { groupKeyFor, num, summarizeDoc } from '../services/matching.service.js';
import { loadUserDocs, validateUser, summarizeGroups } from '../services/validation.service.js';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.param('id', (req, res, next, id) => (UUID_RE.test(id) ? next() : res.status(404).json({ error: 'Document not found' })));
const ALLOWED = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) return cb(null, true);
    const err = new Error(`Unsupported file type for "${file.originalname}". Upload PDF, PNG, JPG or WEBP.`);
    err.status = 400;
    cb(err);
  },
});

const VALID_TYPES = ['purchase_order', 'delivery_receipt', 'invoice', 'unknown'];
const LIST_COLUMNS = 'id, filename, mime_type, file_size, doc_type, status, extracted, validation, error, created_at, updated_at';

/* Run async tasks with limited concurrency (be nice to Gemini rate limits). */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}

/* ---------------- list ---------------- */
router.get('/', async (req, res) => {
  const { type, status, q } = req.query;
  let query = supabase.from('documents').select(LIST_COLUMNS).eq('user_id', req.user.id).order('created_at', { ascending: false });
  if (type && VALID_TYPES.includes(type)) query = query.eq('doc_type', type);
  if (status) query = query.eq('status', String(status));
  const { data, error } = await query;
  if (error) throw error;

  const needle = String(q || '').trim().toLowerCase();
  const docs = needle
    ? data.filter((d) => [d.filename, d.extracted?.vendor_name, d.extracted?.document_number, d.extracted?.po_reference]
        .some((v) => v && String(v).toLowerCase().includes(needle)))
    : data;
  res.json({ documents: docs });
});

/* ---------------- dashboard stats ---------------- */
router.get('/stats', async (req, res) => {
  const docs = await loadUserDocs(req.user.id);
  const by = (s) => docs.filter((d) => d.status === s).length;
  const invoices = docs.filter((d) => d.doc_type === 'invoice' && d.extracted);

  const vendorSpend = new Map();
  for (const d of invoices) {
    const v = d.extracted.vendor_name || 'Unknown vendor';
    const cur = vendorSpend.get(v) || { vendor: v, total: 0, count: 0, currency: d.extracted.currency };
    cur.total += num(d.extracted.total_amount) || 0;
    cur.count += 1;
    vendorSpend.set(v, cur);
  }

  // Unique groups from stored validations → alerts & money on hold
  const groups = new Map();
  for (const d of docs) if (d.validation?.group_key) groups.set(d.validation.group_key, d.validation);
  const gl = [...groups.values()];
  const alerts = gl
    .flatMap((g) => g.findings.filter((f) => f.severity !== 'info').map((f) => ({ ...f, group_key: g.group_key, po_number: g.po_number, vendor: g.vendor })))
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1))
    .slice(0, 6);

  res.json({
    total: docs.length,
    processed: docs.filter((d) => !['processing', 'failed'].includes(d.status)).length,
    pending_review: by('needs_review'),
    mismatches: by('mismatch'),
    matched: by('matched'),
    failed: by('failed'),
    by_type: Object.fromEntries(VALID_TYPES.map((t) => [t, docs.filter((d) => d.doc_type === t).length])),
    invoice_total: Math.round(invoices.reduce((s, d) => s + (num(d.extracted.total_amount) || 0), 0) * 100) / 100,
    currency: invoices[0]?.extracted?.currency || null,
    amount_on_hold: Math.round(gl.filter((g) => g.recommendation === 'HOLD_PAYMENT').reduce((s, g) => s + (num(g.amount_at_risk) || 0), 0) * 100) / 100,
    groups: { total: gl.length, on_hold: gl.filter((g) => g.recommendation === 'HOLD_PAYMENT').length, approved: gl.filter((g) => g.recommendation === 'APPROVE').length },
    top_vendors: [...vendorSpend.values()].sort((a, b) => b.total - a.total).slice(0, 5),
    recent: docs.slice(0, 6).map(summarizeDoc),
    alerts,
  });
});

/* ---------------- batch upload + auto-classify + extract ---------------- */
router.post('/upload', upload.array('files', 10), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Attach at least one file under the "files" field' });

  const results = await mapLimit(files, 3, async (file) => {
    const base = { user_id: req.user.id, filename: file.originalname, mime_type: file.mimetype, file_size: file.size };
    let row;
    try {
      const extracted = await extractDocument(file.buffer, file.mimetype, file.originalname);
      const needsReview = extracted.confidence < 0.75 || extracted.doc_type === 'unknown';
      row = { ...base, doc_type: extracted.doc_type, extracted, status: needsReview ? 'needs_review' : 'processed', error: null };
    } catch (e) {
      if (e.status === 503) throw e; // misconfiguration: fail the whole request clearly
      console.warn(`[upload] extraction failed for ${file.originalname}:`, e.message);
      row = { ...base, doc_type: 'unknown', extracted: null, status: 'failed', error: `AI extraction failed: ${e.message}` };
    }
    const { data, error } = await supabase.from('documents').insert(row).select(LIST_COLUMNS).single();
    if (error) throw error;
    return data;
  });

  // Re-match the PO groups touched by this batch (with Gemini verification).
  const keys = new Set(results.map((d) => groupKeyFor(d) || `UNLINKED-${d.id}`));
  const { groups, docs } = await validateUser(req.user.id, { useAI: true, keys });
  const fresh = new Map(docs.map((d) => [d.id, d]));
  const touched = groups.filter((g) => keys.has(g.key));

  res.status(201).json({
    documents: results.map((d) => fresh.get(d.id) || d),
    validation: { groups: touched, summary: summarizeGroups(touched) },
  });
});

/* ---------------- three-way matching ---------------- */
router.get('/validation', async (req, res) => {
  const { groups } = await validateUser(req.user.id, { useAI: false });
  res.json({ groups, summary: summarizeGroups(groups) });
});

router.post('/validation/run', async (req, res) => {
  const force = Boolean(req.body?.force);
  const key = req.body?.group_key;
  const { groups } = await validateUser(req.user.id, { useAI: true, force: force || Boolean(key), keys: key ? new Set([key]) : null });
  res.json({ groups, summary: summarizeGroups(groups) });
});

router.post('/validation/dispute-email', async (req, res) => {
  const key = req.body?.group_key;
  const { groups } = await validateUser(req.user.id, { useAI: false });
  const group = groups.find((g) => g.key === key) || groups[0];
  if (!group) return res.status(404).json({ error: 'Match group not found' });
  const email = await generateDisputeEmail(group);
  res.json({ ...email, vendor: group.vendor, po_number: group.po_number });
});

/* ---------------- demo scenarios seeder & failed cleanup ---------------- */
router.post('/demo-seed', async (req, res) => {
  const samples = [
    {
      filename: 'PO-2026-104_Apex_Robotics.pdf',
      mime_type: 'application/pdf',
      file_size: 48200,
      ocr_text: [
        'PURCHASE ORDER',
        'PO Number: PO-2026-104',
        'Vendor: Apex Industrial Robotics Ltd',
        'Buyer: Precision Manufacturing Corp',
        'Order Date: 2026-10-15',
        'Currency: USD',
        'Payment Terms: Net 30',
        '',
        'Brushless Servo Motor 750W   50   120.00   6000.00',
        'Optical Encoder Cable 5m     50   18.00    900.00',
        '',
        'Subtotal: $6,900.00',
        'Tax (0%): $0.00',
        'Total Amount: $6,900.00',
      ].join('\n'),
    },
    {
      filename: 'GRN-882_Apex_Delivery_Receipt.pdf',
      mime_type: 'application/pdf',
      file_size: 39100,
      ocr_text: [
        'GOODS RECEIVED NOTE (DELIVERY RECEIPT)',
        'GRN Number: GRN-882',
        'PO Reference: PO-2026-104',
        'Vendor: Apex Industrial Robotics Ltd',
        'Delivery Date: 2026-10-20',
        '',
        'Brushless Servo Motor 750W   50   44',
        'Optical Encoder Cable 5m     50   50',
      ].join('\n'),
    },
    {
      filename: 'INV-9041_Apex_Robotics_Bill.pdf',
      mime_type: 'application/pdf',
      file_size: 52400,
      ocr_text: [
        'TAX INVOICE',
        'Invoice Number: INV-9041',
        'PO Reference: PO-2026-104',
        'Vendor: Apex Industrial Robotics Ltd',
        'Invoice Date: 2026-10-21',
        'Due Date: 2026-11-20',
        'Currency: USD',
        'Payment Terms: Net 15',
        '',
        'Brushless Servo Motor 750W   50   135.00   6750.00',
        'Optical Encoder Cable 5m     50   18.00    900.00',
        '',
        'Subtotal: $7,650.00',
        'Tax (0%): $0.00',
        'Total Amount: $7,650.00',
      ].join('\n'),
    },
    {
      filename: 'PO-2026-209_CloudScale_Hardware.pdf',
      mime_type: 'application/pdf',
      file_size: 44100,
      ocr_text: [
        'PURCHASE ORDER',
        'PO Number: PO-2026-209',
        'Vendor: CloudScale Hardware Co',
        'Order Date: 2026-10-18',
        'Currency: USD',
        'Payment Terms: Net 30',
        '',
        'NVMe Enterprise SSD 2TB   20   180.00   3600.00',
        '',
        'Subtotal: $3,600.00',
        'Tax (0%): $0.00',
        'Total Amount: $3,600.00',
      ].join('\n'),
    },
    {
      filename: 'GRN-910_CloudScale_Receipt.pdf',
      mime_type: 'application/pdf',
      file_size: 36800,
      ocr_text: [
        'DELIVERY RECEIPT',
        'GRN Number: GRN-910',
        'PO Reference: PO-2026-209',
        'Vendor: CloudScale Hardware Co',
        'Delivery Date: 2026-10-22',
        '',
        'NVMe Enterprise SSD 2TB   20   20',
      ].join('\n'),
    },
    {
      filename: 'INV-5512_CloudScale_Invoice.pdf',
      mime_type: 'application/pdf',
      file_size: 49300,
      ocr_text: [
        'TAX INVOICE',
        'Invoice Number: INV-5512',
        'PO Reference: PO-2026-209',
        'Vendor: CloudScale Hardware Co',
        'Invoice Date: 2026-10-23',
        'Due Date: 2026-11-22',
        'Currency: USD',
        'Payment Terms: Net 30',
        '',
        'NVMe Enterprise SSD 2TB   20   180.00   3600.00',
        '',
        'Subtotal: $3,600.00',
        'Tax (0%): $0.00',
        'Total Amount: $3,600.00',
      ].join('\n'),
    },
  ];

  const inserted = [];
  for (const s of samples) {
    const extracted = await reasonOverOcrText(s.ocr_text, s.filename, 'OCR.space Cloud (Engine 2)');
    const row = {
      user_id: req.user.id,
      filename: s.filename,
      mime_type: s.mime_type,
      file_size: s.file_size,
      doc_type: extracted.doc_type,
      extracted,
      status: 'processed',
      error: null,
    };
    const { data, error } = await supabase.from('documents').insert(row).select(LIST_COLUMNS).single();
    if (error) throw error;
    inserted.push(data);
  }

  const { groups, docs } = await validateUser(req.user.id, { useAI: true });
  const fresh = new Map(docs.map((d) => [d.id, d]));
  res.status(201).json({
    documents: inserted.map((d) => fresh.get(d.id) || d),
    validation: { groups, summary: summarizeGroups(groups) },
  });
});

router.delete('/failed/clear', async (req, res) => {
  const { data, error } = await supabase
    .from('documents')
    .delete()
    .eq('user_id', req.user.id)
    .eq('status', 'failed')
    .select('id');
  if (error) throw error;
  await validateUser(req.user.id, { useAI: false });
  res.json({ deleted: data?.length || 0 });
});

/* ---------------- AI assistant ---------------- */
router.post('/assistant/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Message is required' });
  const history = Array.isArray(req.body?.history) ? req.body.history : [];

  const docs = await loadUserDocs(req.user.id);
  if (!docs.length) {
    return res.json({ answer: "You haven't uploaded any documents yet. Head to the **Upload Center** and drop in a few purchase orders, delivery receipts and invoices — then I can analyse spend, match them and spot discrepancies for you." });
  }

  const groups = new Map();
  for (const d of docs) if (d.validation?.group_key) groups.set(d.validation.group_key, d.validation);
  const context = {
    documents: docs.slice(0, 150).map((d) => {
      const e = d.extracted || {};
      return {
        type: d.doc_type, status: d.status, file: d.filename, uploaded: d.created_at?.slice(0, 10),
        number: e.document_number, po_ref: e.po_reference, vendor: e.vendor_name, date: e.document_date,
        due: e.due_date, currency: e.currency, subtotal: e.subtotal, tax: e.tax_amount, total: e.total_amount,
        terms: e.payment_terms,
        lines: (e.line_items || []).slice(0, 25).map((l) => [l.description, l.quantity, l.unit_price, l.amount]),
      };
    }),
    three_way_matches: [...groups.values()].map((g) => ({
      po: g.po_number, vendor: g.vendor, status: g.status, recommendation: g.recommendation,
      amount_at_risk: g.amount_at_risk, summary: g.summary,
      issues: g.findings.filter((f) => f.severity !== 'info').map((f) => `[${f.severity}] ${f.message}`),
    })),
  };

  const answer = await askAssistant({ question: message, history, context });
  res.json({ answer });
});

/* ---------------- single document ---------------- */
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase.from('documents').select(LIST_COLUMNS)
    .eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (error) throw error;
  if (!data) return res.status(404).json({ error: 'Document not found' });
  res.json({ document: data });
});

router.patch('/:id', async (req, res) => {
  const { data: doc, error: findErr } = await supabase.from('documents').select('id, doc_type, extracted')
    .eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (findErr) throw findErr;
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const { extracted, doc_type } = req.body ?? {};
  const patch = { updated_at: new Date().toISOString() };
  if (doc_type) {
    if (!VALID_TYPES.includes(doc_type)) return res.status(400).json({ error: 'Invalid document type' });
    patch.doc_type = doc_type;
  }
  if (extracted && typeof extracted === 'object') {
    const numeric = ['subtotal', 'tax_rate', 'tax_amount', 'total_amount'];
    const clean = { ...(doc.extracted || {}), ...extracted, reviewed: true };
    for (const k of numeric) clean[k] = num(clean[k]);
    clean.line_items = (Array.isArray(clean.line_items) ? clean.line_items : []).map((l) => ({
      description: l.description || null, sku: l.sku || null,
      quantity: num(l.quantity), unit_price: num(l.unit_price), amount: num(l.amount),
    }));
    for (const k of ['document_number', 'po_reference', 'vendor_name', 'vendor_address', 'buyer_name', 'document_date', 'due_date', 'currency', 'payment_terms']) {
      if (clean[k] === '') clean[k] = null;
    }
    patch.extracted = clean;
    patch.status = 'processed';
    patch.error = null;
  }

  const { error } = await supabase.from('documents').update(patch).eq('id', doc.id).eq('user_id', req.user.id);
  if (error) throw error;

  await validateUser(req.user.id, { useAI: false });
  const { data: fresh, error: e2 } = await supabase.from('documents').select(LIST_COLUMNS)
    .eq('id', doc.id).eq('user_id', req.user.id).single();
  if (e2) throw e2;
  res.json({ document: fresh });
});

router.post('/:id/reparse-ocr', async (req, res) => {
  const { data: doc, error: findErr } = await supabase.from('documents').select('id, filename, extracted')
    .eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (findErr) throw findErr;
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const ocrText = String(req.body?.ocr_text || doc.extracted?.ocr_text || '').trim();
  if (!ocrText) return res.status(400).json({ error: 'Provide OCR text to re-parse' });

  const extracted = await reasonOverOcrText(ocrText, doc.filename, doc.extracted?.ocr_provider || 'Cloud OCR + Manual Edit');
  const needsReview = extracted.confidence < 0.75 || extracted.doc_type === 'unknown';
  const patch = {
    doc_type: extracted.doc_type,
    extracted,
    status: needsReview ? 'needs_review' : 'processed',
    error: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('documents').update(patch).eq('id', doc.id).eq('user_id', req.user.id);
  if (error) throw error;

  await validateUser(req.user.id, { useAI: true });
  const { data: fresh, error: e2 } = await supabase.from('documents').select(LIST_COLUMNS)
    .eq('id', doc.id).eq('user_id', req.user.id).single();
  if (e2) throw e2;
  res.json({ document: fresh });
});

router.delete('/:id', async (req, res) => {
  const { data, error } = await supabase.from('documents').delete()
    .eq('id', req.params.id).eq('user_id', req.user.id).select('id');
  if (error) throw error;
  if (!data.length) return res.status(404).json({ error: 'Document not found' });
  await validateUser(req.user.id, { useAI: false });
  res.json({ ok: true });
});

export default router;
