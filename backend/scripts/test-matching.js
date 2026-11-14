// Offline sanity test of the three-way matching rules engine + OCR parser: `npm run test:matching`
import assert from 'node:assert/strict';
import { buildGroups } from '../src/services/matching.service.js';
import { parseDocumentText, validateMatchWithAI, askAssistant } from '../src/services/ocr.service.js';

const doc = (id, doc_type, extracted) => ({ id, doc_type, status: 'processed', filename: `${id}.pdf`, extracted });

const docs = [
  doc('po1', 'purchase_order', {
    document_number: 'PO-1001', po_reference: 'PO-1001', vendor_name: 'Acme Supplies Ltd', document_date: '2026-10-01',
    currency: 'USD', total_amount: 2500, line_items: [{ description: 'Steel bolts M8', quantity: 100, unit_price: 25, amount: 2500 }],
  }),
  doc('grn1', 'delivery_receipt', {
    document_number: 'GRN-55', po_reference: 'PO 1001', vendor_name: 'Acme Supplies', document_date: '2026-10-05',
    line_items: [{ description: 'Steel bolts M8', quantity: 95 }],
  }),
  doc('inv1', 'invoice', {
    document_number: 'INV-9', po_reference: 'PO-1001', vendor_name: 'Acme Supplies Ltd', document_date: '2026-10-06',
    currency: 'USD', subtotal: 2500, tax_amount: 0, total_amount: 2500,
    line_items: [{ description: 'Steel bolts M8', quantity: 100, unit_price: 25, amount: 2500 }],
  }),
  doc('inv2', 'invoice', {
    document_number: 'INV-9', po_reference: 'PO-1001', vendor_name: 'Acme Supplies Ltd', document_date: '2026-10-06',
    currency: 'USD', subtotal: 2500, tax_amount: 0, total_amount: 2500,
    line_items: [{ description: 'Steel bolts M8', quantity: 100, unit_price: 25, amount: 2500 }],
  }),
  // A clean match
  doc('po2', 'purchase_order', { document_number: 'PO-2', vendor_name: 'Beta Co', document_date: '2026-10-01', total_amount: 100, line_items: [{ description: 'Paper A4', quantity: 10, unit_price: 10 }] }),
  doc('grn2', 'delivery_receipt', { document_number: 'G2', po_reference: 'PO-2', document_date: '2026-10-02', line_items: [{ description: 'Paper A4', quantity: 10 }] }),
  doc('inv3', 'invoice', { document_number: 'B-1', po_reference: 'PO-2', vendor_name: 'Beta Co', document_date: '2026-10-03', subtotal: 100, tax_amount: 0, total_amount: 100, line_items: [{ description: 'Paper A4', quantity: 10, unit_price: 10, amount: 100 }] }),
];

const groups = buildGroups(docs);
const g1 = groups.find((g) => g.key === 'PO1001');
const g2 = groups.find((g) => g.key === 'PO2');

console.log(JSON.stringify(g1.findings.map((f) => `[${f.severity}] ${f.message}`), null, 2));
assert.equal(g1.recommendation, 'HOLD_PAYMENT');
assert.ok(g1.findings.some((f) => f.type === 'quantity_mismatch' && f.message.includes('Invoice charges for 5 more units')));
assert.ok(g1.findings.some((f) => f.type === 'duplicate_invoice'));
assert.ok(g1.findings.some((f) => f.type === 'short_delivery'));
assert.equal(g2.recommendation, 'APPROVE', JSON.stringify(g2.findings));
assert.equal(g2.status, 'matched');

// Test OCR text extraction parser
const sampleInvoiceText = `
TAX INVOICE
Vendor: Acme Supplies Ltd
Invoice Number: INV-2045
PO Number: PO-1001
Date: 2026-10-12
Due Date: 2026-11-11
Currency: USD
Payment Terms: Net 30

Steel bolts M8   100   25.00   2500.00

Subtotal: $2,500.00
Tax (10%): $250.00
Total Amount: $2,750.00
`;
const parsed = parseDocumentText(sampleInvoiceText, 'invoice-2045.pdf', 'OCR.space Cloud');
assert.equal(parsed.doc_type, 'invoice');
assert.equal(parsed.document_number, 'INV-2045');
assert.equal(parsed.po_reference, 'PO-1001');
assert.equal(parsed.vendor_name, 'Acme Supplies Ltd');
assert.equal(parsed.document_date, '2026-10-12');
assert.equal(parsed.total_amount, 2750);
assert.equal(parsed.line_items.length, 1);
assert.equal(parsed.line_items[0].quantity, 100);

const audit = await validateMatchWithAI(g1, docs.slice(0, 4));
assert.equal(audit.recommendation, 'HOLD_PAYMENT');

const ans = await askAssistant({
  question: 'Which invoices should we put on payment hold and why?',
  context: {
    documents: [],
    three_way_matches: [{ po: g1.po_number, vendor: g1.vendor, recommendation: g1.recommendation, amount_at_risk: g1.amount_at_risk, issues: ['Overbilled 5 units'] }],
  },
});
assert.ok(ans.includes('PO-1001'));

console.log('\n✅ matching engine & Cloud OCR parser tests passed');
