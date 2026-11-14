/**
 * Deterministic three-way matching engine (PO ↔ GRN ↔ Invoice).
 * Pure functions — no I/O — so results are reproducible and unit-testable.
 * Gemini (see gemini.service.js) is layered on top to verify, explain and add extra findings,
 * but can never remove a rule-based discrepancy.
 */
import crypto from 'node:crypto';

export const norm = (s) => (s ?? '').toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
export const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const r2 = (n) => Math.round(n * 100) / 100;
const fq = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
export const fmtMoney = (n, cur) =>
  `${cur ? `${cur} ` : ''}${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const TYPE_LABEL = { purchase_order: 'Purchase order', delivery_receipt: 'Delivery receipt', invoice: 'Invoice', unknown: 'Document' };

const REQUIRED = {
  purchase_order: ['document_number', 'vendor_name', 'document_date', 'total_amount'],
  delivery_receipt: ['document_number', 'po_reference', 'document_date'],
  invoice: ['document_number', 'vendor_name', 'document_date', 'total_amount', 'po_reference'],
};
const FIELD_LABEL = {
  document_number: 'document number', vendor_name: 'vendor name', document_date: 'document date',
  total_amount: 'total amount', po_reference: 'PO reference',
};

export function groupKeyFor(doc) {
  const e = doc.extracted || {};
  if (doc.doc_type === 'purchase_order') return norm(e.document_number) || norm(e.po_reference) || null;
  if (doc.doc_type === 'delivery_receipt' || doc.doc_type === 'invoice') return norm(e.po_reference) || null;
  return null;
}

/* ---------------- line item matching ---------------- */
const tokens = (s) => new Set((s || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1));
function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const t of A) if (B.has(t)) hit++;
  return hit / Math.max(A.size, B.size);
}
function findLine(item, rows, used) {
  let best = -1, bestScore = 0;
  rows.forEach((row, idx) => {
    if (used.has(idx)) return;
    let s;
    if (norm(item.sku) && norm(item.sku) === norm(row.sku)) s = 1;
    else if (norm(item.description) && norm(item.description) === norm(row.description)) s = 0.95;
    else s = similarity(item.description, row.description);
    if (s > bestScore) { bestScore = s; best = idx; }
  });
  return bestScore >= 0.5 ? best : -1;
}

function compareLines(po, grn, invoices) {
  const poLines = po?.extracted?.line_items || [];
  const grnLines = grn?.extracted?.line_items || [];
  const invLines = invoices.flatMap((d) => d.extracted?.line_items || []);
  const label = (l) => l.description || l.sku || 'Item';

  const rows = poLines.map((l) => ({
    description: label(l), sku: l.sku || null, ordered: num(l.quantity), received: null, billed: null,
    po_price: num(l.unit_price), inv_price: null, on_po: true,
  }));

  const used = new Set();
  for (const l of grnLines) {
    const idx = findLine(l, rows, used);
    if (idx >= 0) { used.add(idx); rows[idx].received = (rows[idx].received ?? 0) + (num(l.quantity) ?? 0); }
    else rows.push({ description: label(l), sku: l.sku || null, ordered: null, received: num(l.quantity), billed: null, po_price: null, inv_price: null, on_po: !po });
  }
  for (const l of invLines) {
    const idx = findLine(l, rows, new Set());
    if (idx >= 0) {
      rows[idx].billed = (rows[idx].billed ?? 0) + (num(l.quantity) ?? 0);
      rows[idx].inv_price = num(l.unit_price) ?? rows[idx].inv_price;
    } else {
      rows.push({ description: label(l), sku: l.sku || null, ordered: null, received: null, billed: num(l.quantity), po_price: null, inv_price: num(l.unit_price), on_po: !po });
    }
  }
  if (grn && grnLines.length) rows.forEach((r) => { if (r.received === null) r.received = 0; });
  if (invLines.length) rows.forEach((r) => { if (r.billed === null) r.billed = 0; });
  if (poLines.length) rows.forEach((r) => { if (r.ordered === null && r.on_po) r.ordered = 0; });
  return { rows, hasPoLines: poLines.length > 0, hasGrnLines: grnLines.length > 0, hasInvLines: invLines.length > 0 };
}

/* ---------------- duplicates (user-wide) ---------------- */
export function detectDuplicates(docs) {
  const invoices = docs.filter((d) => d.doc_type === 'invoice' && d.status !== 'failed' && d.extracted);
  const out = new Map();
  const add = (id, f) => out.set(id, [...(out.get(id) || []), f]);

  for (let i = 0; i < invoices.length; i++) {
    for (let j = i + 1; j < invoices.length; j++) {
      const a = invoices[i], b = invoices[j];
      const ea = a.extracted, eb = b.extracted;
      const sameVendor = norm(ea.vendor_name) && norm(ea.vendor_name) === norm(eb.vendor_name);
      if (!sameVendor) continue;
      const ids = [a.id, b.id];
      if (norm(ea.document_number) && norm(ea.document_number) === norm(eb.document_number)) {
        const f = (other) => ({
          type: 'duplicate_invoice', severity: 'critical', field: 'document_number', document_ids: ids, source: 'rules',
          message: `Duplicate invoice: #${ea.document_number} from ${ea.vendor_name} was uploaded more than once (also "${other.filename}"). Paying both would double-pay ${fmtMoney(num(ea.total_amount), ea.currency)}.`,
        });
        add(a.id, f(b)); add(b.id, f(a));
      } else if (num(ea.total_amount) && num(ea.total_amount) === num(eb.total_amount) && ea.document_date && ea.document_date === eb.document_date) {
        const f = (self, other) => ({
          type: 'possible_duplicate', severity: 'warning', field: 'total_amount', document_ids: ids, source: 'rules',
          message: `Possible duplicate: invoice #${self.extracted.document_number || '—'} has the same vendor, date and amount (${fmtMoney(num(ea.total_amount), ea.currency)}) as #${other.extracted.document_number || '—'}.`,
        });
        add(a.id, f(a, b)); add(b.id, f(b, a));
      }
    }
  }
  return out;
}

/* ---------------- group analysis ---------------- */
export function analyzeGroup(key, gdocs, dupMap = new Map()) {
  const findings = [];
  const push = (f) => findings.push({ source: 'rules', ...f });

  const pos = gdocs.filter((d) => d.doc_type === 'purchase_order');
  const grns = gdocs.filter((d) => d.doc_type === 'delivery_receipt');
  const allInvoices = gdocs.filter((d) => d.doc_type === 'invoice');
  // Exact duplicates (same vendor + invoice number) are flagged separately and excluded from quantity/amount math.
  const seenInv = new Set();
  const invoices = allInvoices.filter((d) => {
    const k = norm(d.extracted?.document_number) && `${norm(d.extracted?.vendor_name)}|${norm(d.extracted?.document_number)}`;
    if (!k) return true;
    if (seenInv.has(k)) return false;
    seenInv.add(k);
    return true;
  });
  const po = pos[0] || null;
  // Multiple GRNs for one PO = partial deliveries: merge them into one virtual receipt.
  const grn = grns.length <= 1 ? grns[0] || null : {
    id: grns[0].id, doc_type: 'delivery_receipt',
    extracted: { ...grns[0].extracted, line_items: grns.flatMap((g) => g.extracted?.line_items || []) },
  };
  const cur = invoices[0]?.extracted?.currency || po?.extracted?.currency || null;
  const poNumber = po?.extracted?.document_number || invoices[0]?.extracted?.po_reference || grns[0]?.extracted?.po_reference || null;
  const unlinked = key.startsWith('UNLINKED-');

  if (pos.length > 1) push({ type: 'duplicate_po', severity: 'warning', message: `${pos.length} purchase orders share PO number ${poNumber}. Only the first is used for matching.` });

  /* ---- line-level three-way comparison ---- */
  const { rows, hasPoLines, hasGrnLines, hasInvLines } = compareLines(po, grn, invoices);
  for (const r of rows) {
    const price = r.inv_price ?? r.po_price;
    const d = r.description;
    if (!r.on_po && po) {
      if (r.billed) push({ type: 'unordered_item', severity: 'critical', field: 'line_items', message: `Invoice bills ${fq(r.billed)} × "${d}" which does not appear on PO ${poNumber}.`, actual: r.billed });
      else if (r.received) push({ type: 'unordered_item', severity: 'warning', field: 'line_items', message: `Delivery receipt lists ${fq(r.received)} × "${d}" which was not ordered on PO ${poNumber}.`, actual: r.received });
      continue;
    }
    if (hasGrnLines && hasInvLines && r.billed > r.received) {
      const diff = r2(r.billed - r.received);
      push({
        type: 'quantity_mismatch', severity: 'critical', field: 'quantity', expected: r.received, actual: r.billed, difference: diff,
        message: `Invoice charges for ${fq(diff)} more unit${diff === 1 ? '' : 's'} of "${d}" than the delivery receipt confirms (billed ${fq(r.billed)}, received ${fq(r.received)})${price ? ` — ≈ ${fmtMoney(diff * price, cur)} overbilled` : ''}.`,
      });
    } else if (hasGrnLines && hasInvLines && r.billed < r.received && r.billed > 0) {
      push({ type: 'partial_invoice', severity: 'info', field: 'quantity', expected: r.received, actual: r.billed, message: `"${d}": ${fq(r.received - r.billed)} received unit(s) not yet invoiced (partial invoice).` });
    }
    if (hasPoLines && hasInvLines && r.ordered !== null && r.billed > r.ordered && !(hasGrnLines && r.received >= r.ordered && r.billed > r.received)) {
      const diff = r2(r.billed - r.ordered);
      push({ type: 'over_billing', severity: 'critical', field: 'quantity', expected: r.ordered, actual: r.billed, difference: diff, message: `Invoice bills ${fq(diff)} more unit(s) of "${d}" than were ordered on the PO (billed ${fq(r.billed)}, ordered ${fq(r.ordered)}).` });
    }
    if (hasPoLines && hasGrnLines && r.ordered !== null) {
      if (r.received < r.ordered) {
        push({ type: 'short_delivery', severity: 'warning', field: 'quantity', expected: r.ordered, actual: r.received, difference: r2(r.ordered - r.received), message: `Short delivery: "${d}" — ${fq(r.ordered - r.received)} of ${fq(r.ordered)} ordered units were not received.` });
      } else if (r.received > r.ordered) {
        push({ type: 'over_delivery', severity: 'warning', field: 'quantity', expected: r.ordered, actual: r.received, difference: r2(r.received - r.ordered), message: `Over delivery: "${d}" — received ${fq(r.received)} but only ${fq(r.ordered)} were ordered.` });
      }
    }
    if (r.po_price && r.inv_price && Math.abs(r.inv_price - r.po_price) / r.po_price > 0.005) {
      const higher = r.inv_price > r.po_price;
      push({
        type: 'price_variance', severity: higher ? 'critical' : 'info', field: 'unit_price', expected: r.po_price, actual: r.inv_price, difference: r2(r.inv_price - r.po_price),
        message: `Unit price for "${d}" is ${fmtMoney(r.inv_price, cur)} on the invoice vs ${fmtMoney(r.po_price, cur)} agreed on the PO (${higher ? '+' : ''}${(((r.inv_price - r.po_price) / r.po_price) * 100).toFixed(1)}%).`,
      });
    }
  }

  /* ---- amount checks ---- */
  const invTotal = r2(invoices.reduce((s, d) => s + (num(d.extracted?.total_amount) || 0), 0));
  const poTotal = num(po?.extracted?.total_amount);
  if (invoices.length && poTotal && invTotal > poTotal * 1.005 + 0.01) {
    push({ type: 'amount_variance', severity: 'critical', field: 'total_amount', expected: poTotal, actual: invTotal, difference: r2(invTotal - poTotal), message: `Invoiced total ${fmtMoney(invTotal, cur)} exceeds the PO total ${fmtMoney(poTotal, cur)} by ${fmtMoney(invTotal - poTotal, cur)}.` });
  }
  for (const inv of invoices) {
    const e = inv.extracted || {};
    const sub = num(e.subtotal), tax = num(e.tax_amount), tot = num(e.total_amount);
    if (sub !== null && tot !== null && Math.abs(sub + (tax || 0) - tot) > 0.05) {
      push({ type: 'calculation_error', severity: 'warning', field: 'total_amount', document_ids: [inv.id], expected: r2(sub + (tax || 0)), actual: tot, message: `Invoice #${e.document_number || '—'} arithmetic error: subtotal ${fmtMoney(sub, cur)} + tax ${fmtMoney(tax || 0, cur)} ≠ total ${fmtMoney(tot, cur)}.` });
    }
    const lineSum = (e.line_items || []).reduce((s, l) => s + (num(l.amount) ?? (num(l.quantity) || 0) * (num(l.unit_price) || 0)), 0);
    if (sub !== null && (e.line_items || []).length && Math.abs(lineSum - sub) > Math.max(0.05, sub * 0.002)) {
      push({ type: 'calculation_error', severity: 'warning', field: 'subtotal', document_ids: [inv.id], expected: r2(lineSum), actual: sub, message: `Invoice #${e.document_number || '—'} line items sum to ${fmtMoney(lineSum, cur)} but the subtotal reads ${fmtMoney(sub, cur)}.` });
    }
  }

  /* ---- vendor consistency ---- */
  const vendors = [...new Map(gdocs.map((d) => d.extracted?.vendor_name).filter(Boolean).map((v) => [norm(v), v])).values()];
  const differs = (a, b) => !norm(a).includes(norm(b)) && !norm(b).includes(norm(a)) && similarity(a, b) < 0.5;
  if (vendors.some((a) => vendors.some((b) => differs(a, b)))) {
    push({ type: 'vendor_mismatch', severity: 'warning', field: 'vendor_name', message: `Vendor name differs across documents: ${vendors.map((v) => `"${v}"`).join(' vs ')}.` });
  }

  /* ---- missing documents ---- */
  if (invoices.length && !grns.length) push({ type: 'missing_document', severity: 'warning', message: unlinked ? 'No delivery receipt can be linked — receipt of goods cannot be confirmed.' : `No delivery receipt (GRN) on file for PO ${poNumber} — receipt of goods cannot be confirmed.` });
  if (invoices.length && !po) push({ type: 'missing_document', severity: 'warning', field: 'po_reference', message: unlinked ? 'Invoice does not reference a purchase order, so it cannot be matched.' : `Referenced PO ${poNumber} was not found in your documents.` });
  if (grns.length && !po && !invoices.length) push({ type: 'missing_document', severity: 'warning', message: unlinked ? 'Delivery receipt does not reference a purchase order.' : `Delivery receipt references PO ${poNumber}, which has not been uploaded.` });
  if (po && grns.length && !invoices.length) push({ type: 'awaiting_invoice', severity: 'info', message: 'Goods received — awaiting the vendor invoice.' });
  if (po && !grns.length && !invoices.length) push({ type: 'awaiting_delivery', severity: 'info', message: 'Purchase order open — awaiting delivery receipt and invoice.' });

  /* ---- missing fields ---- */
  for (const d of gdocs) {
    const req = REQUIRED[d.doc_type] || [];
    const e = d.extracted || {};
    const missing = req.filter((f) => e[f] === null || e[f] === undefined || e[f] === '');
    if (missing.length) push({ type: 'missing_field', severity: 'warning', field: missing[0], document_ids: [d.id], message: `${TYPE_LABEL[d.doc_type]} "${d.filename}" is missing: ${missing.map((f) => FIELD_LABEL[f]).join(', ')}.` });
  }

  /* ---- duplicates ---- */
  const seen = new Set();
  for (const d of allInvoices) for (const f of dupMap.get(d.id) || []) {
    const k = f.type + f.document_ids.slice().sort().join();
    if (!seen.has(k)) { seen.add(k); findings.push(f); }
  }

  return finalizeGroup({
    key, po_number: poNumber, unlinked, currency: cur,
    vendor: po?.extracted?.vendor_name || invoices[0]?.extracted?.vendor_name || grns[0]?.extracted?.vendor_name || null,
    documents: gdocs.map(summarizeDoc),
    line_comparison: rows,
    invoice_total: invTotal, po_total: poTotal,
    findings,
    has: { po: Boolean(po), grn: grns.length > 0, invoice: invoices.length > 0 },
    fingerprint: fingerprint(gdocs, findings.filter((f) => f.type.includes('duplicate'))),
  });
}

const SEV_ORDER = { critical: 0, warning: 1, info: 2 };
const REC_RANK = { APPROVE: 0, AWAIT_INVOICE: 1, REVIEW: 2, HOLD_PAYMENT: 3 };

/** Derive status / recommendation / actions from the (possibly AI-augmented) findings. */
export function finalizeGroup(g, aiRecommendation = null) {
  g.findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const crit = g.findings.filter((f) => f.severity === 'critical');
  const warn = g.findings.filter((f) => f.severity === 'warning');
  const complete = g.has.po && g.has.grn && g.has.invoice;

  g.status = crit.length ? 'mismatch' : !complete ? 'incomplete' : warn.length ? 'review' : 'matched';
  let rec = !g.has.invoice ? 'AWAIT_INVOICE' : crit.length ? 'HOLD_PAYMENT' : warn.length || !complete ? 'REVIEW' : 'APPROVE';
  if (aiRecommendation && g.has.invoice && REC_RANK[aiRecommendation] > REC_RANK[rec]) rec = aiRecommendation;
  g.recommendation = rec;
  g.amount_at_risk = rec === 'HOLD_PAYMENT' ? g.invoice_total : 0;
  g.counts = { critical: crit.length, warning: warn.length, info: g.findings.length - crit.length - warn.length };

  // Compute 0..100 AP Fraud / Discrepancy Risk Score
  let score = crit.length * 32 + warn.length * 12 + (!complete && g.has.invoice ? 15 : 0);
  if (g.findings.some((f) => f.type === 'duplicate_invoice')) score += 25;
  if (g.po_total && g.invoice_total > g.po_total) {
    score += Math.min(25, Math.round(((g.invoice_total - g.po_total) / g.po_total) * 100));
  }
  g.risk_score = rec === 'APPROVE' ? 0 : Math.min(99, Math.max(0, score));

  if (!g.ai) {
    g.summary = rec === 'HOLD_PAYMENT'
      ? `${crit.length} critical discrepanc${crit.length === 1 ? 'y' : 'ies'} found. Recommend holding payment of ${fmtMoney(g.invoice_total, g.currency)} until resolved with the vendor.`
      : rec === 'REVIEW' ? `${warn.length} item${warn.length === 1 ? '' : 's'} need${warn.length === 1 ? 's' : ''} manual review before this invoice is approved.`
      : rec === 'APPROVE' ? 'PO, delivery receipt and invoice agree on quantities, prices and totals. Safe to approve for payment.'
      : 'No invoice yet — nothing to pay. Documents will be re-matched automatically when the invoice arrives.';
    g.recommended_actions = buildActions(g);
  }
  return g;
}

function buildActions(g) {
  const acts = new Set();
  for (const f of g.findings) {
    if (f.type === 'quantity_mismatch') acts.add(`Request a credit note or corrected invoice for ${fq(f.difference)} unit(s) not delivered.`);
    if (f.type === 'over_billing' || f.type === 'amount_variance') acts.add('Dispute the overbilled amount with the vendor before paying.');
    if (f.type === 'price_variance' && f.severity === 'critical') acts.add('Ask the vendor to honour the PO unit price or approve a PO amendment.');
    if (f.type === 'duplicate_invoice') acts.add('Reject the duplicate invoice and pay only one copy.');
    if (f.type === 'possible_duplicate') acts.add('Confirm with the vendor whether both invoices are genuine.');
    if (f.type === 'short_delivery') acts.add('Follow up with the vendor on the outstanding backorder.');
    if (f.type === 'missing_document') acts.add('Upload the missing document so the match can be completed.');
    if (f.type === 'missing_field') acts.add('Open Document Intelligence and fill in the missing fields.');
    if (f.type === 'unordered_item') acts.add('Verify the unordered item with your purchasing team.');
    if (f.type === 'calculation_error') acts.add('Ask the vendor to reissue the invoice with correct arithmetic.');
    if (f.type === 'vendor_mismatch') acts.add('Confirm the vendor identity / remit-to details before payment.');
  }
  if (g.recommendation === 'HOLD_PAYMENT') return ['Place this invoice on payment hold.', ...acts];
  if (g.recommendation === 'APPROVE') return ['Approve invoice for payment.'];
  return [...acts];
}

export function summarizeDoc(d) {
  const e = d.extracted || {};
  return {
    id: d.id, filename: d.filename, doc_type: d.doc_type, status: d.status,
    document_number: e.document_number || null, vendor: e.vendor_name || null,
    date: e.document_date || null, total: num(e.total_amount), currency: e.currency || null,
  };
}

function fingerprint(gdocs, dupFindings) {
  const payload = gdocs.slice().sort((a, b) => (a.id > b.id ? 1 : -1)).map((d) => [d.id, d.doc_type, d.extracted]);
  return crypto.createHash('sha1').update(JSON.stringify([payload, dupFindings.map((f) => f.message)])).digest('hex');
}

/** Group all of a user's documents by PO number and run the rules engine on each group. */
export function buildGroups(docs) {
  const usable = docs.filter((d) => d.status !== 'failed' && d.status !== 'processing' && d.extracted && d.doc_type !== 'unknown');
  const dupMap = detectDuplicates(usable);
  const map = new Map();
  for (const d of usable) {
    const key = groupKeyFor(d) || `UNLINKED-${d.id}`;
    map.set(key, [...(map.get(key) || []), d]);
  }
  return [...map].map(([key, gdocs]) => analyzeGroup(key, gdocs, dupMap));
}

/** Per-document status derived from its group's validation. */
export function docStatusFor(doc, group) {
  if (doc.status === 'failed' || doc.status === 'processing') return doc.status;
  if (!group) {
    const e = doc.extracted || {};
    return !e.reviewed && ((num(e.confidence) ?? 1) < 0.75 || doc.doc_type === 'unknown') ? 'needs_review' : 'processed';
  }
  const hitsDoc = (f) => f.severity === 'critical' && (!f.document_ids || f.document_ids.includes(doc.id));
  if (group.findings.some(hitsDoc)) return 'mismatch';
  if (group.status === 'matched') return 'matched';
  const e = doc.extracted || {};
  const missingHere = group.findings.some((f) => f.type === 'missing_field' && f.document_ids?.includes(doc.id));
  if (!e.reviewed && ((num(e.confidence) ?? 1) < 0.75 || missingHere)) return 'needs_review';
  return 'processed';
}
