/**
 * Multi-Provider Free Cloud OCR + Deterministic Procurement Document Intelligence
 *
 * Supported Free Cloud OCR Providers (set via OCR_PROVIDER in .env):
 *  - "auto"          : Tries configured cloud provider (defaults to OCR.space free cloud API)
 *                      with automatic fallback to built-in PDF stream / filename & metadata extraction.
 *  - "ocrspace"      : OCR.space Free OCR API (25,000 free requests/month, supports PDF & images,
 *                      works out-of-the-box with free public key 'helloworld' or OCR_SPACE_API_KEY).
 *  - "azure"         : Azure AI Document Intelligence Free Tier (F0: 500 pages/month free).
 *  - "google_vision" : Google Cloud Vision API Free Tier (1,000 units/month free).
 *  - "mindee"        : Mindee Financial Document API Free Tier (250 pages/month free).
 */
import zlib from 'node:zlib';

const PROVIDER = (process.env.OCR_PROVIDER || 'auto').toLowerCase();

/* ============================================================
 * 1) FREE CLOUD OCR PROVIDERS
 * ============================================================ */

/**
 * Provider A: OCR.space Free Cloud API (https://ocr.space/ocrapi)
 * - Free tier: 25,000 requests/month (no credit card required)
 * - Built-in default key: 'helloworld' (works immediately without registration)
 * - Uses base64Image payload for reliable Node.js FormData transmission
 */
async function ocrWithOcrSpace(buffer, mimeType, filename) {
  const apiKey = (process.env.OCR_SPACE_API_KEY || 'helloworld').trim();
  const endpoint = process.env.OCR_SPACE_ENDPOINT || 'https://api.ocr.space/parse/image';
  const safeMime = mimeType || 'image/png';
  const dataUri = `data:${safeMime};base64,${buffer.toString('base64')}`;

  const runEngine = async (engine, isTable = true) => {
    const body = new URLSearchParams();
    body.append('apikey', apiKey);
    body.append('base64Image', dataUri);
    body.append('language', 'eng');
    body.append('isOverlayRequired', 'false');
    body.append('isTable', isTable ? 'true' : 'false');
    body.append('scale', 'true');
    body.append('detectOrientation', 'true');
    body.append('OCREngine', String(engine));
    if (safeMime === 'application/pdf' || filename?.toLowerCase().endsWith('.pdf')) {
      body.append('filetype', 'PDF');
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`OCR.space HTTP ${res.status}`);
    const json = await res.json();
    if (json.IsErroredOnProcessing) {
      const msg = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join('; ') : String(json.ErrorMessage || 'OCR error');
      throw new Error(msg);
    }
    const text = (json.ParsedResults || [])
      .map((r) => r.ParsedText || '')
      .join('\n')
      .trim();
    return text;
  };

  // Try Engine 2 (best for numbers/invoices/tables), fallback to Engine 1 (faster, handles larger PDFs)
  try {
    const text = await runEngine(safeMime === 'application/pdf' ? 1 : 2, true);
    if (text) return { text, provider: 'OCR.space Cloud (Engine 2)' };
  } catch {
    // Fallback to Engine 1
  }
  const text = await runEngine(1, false);
  return { text, provider: 'OCR.space Cloud (Engine 1)' };
}

/**
 * Provider B: Azure AI Document Intelligence (Form Recognizer) Free Tier (F0: 500 pages/mo)
 * Requires AZURE_DOC_INTEL_ENDPOINT and AZURE_DOC_INTEL_KEY
 */
async function ocrWithAzure(buffer, mimeType) {
  const endpoint = (process.env.AZURE_DOC_INTEL_ENDPOINT || '').replace(/\/+$/, '');
  const key = (process.env.AZURE_DOC_INTEL_KEY || '').trim();
  if (!endpoint || !key) throw new Error('AZURE_DOC_INTEL_ENDPOINT and AZURE_DOC_INTEL_KEY are required for Azure OCR');

  const model = process.env.AZURE_DOC_INTEL_MODEL || 'prebuilt-read';
  const url = `${endpoint}/documentintelligence/documentModels/${model}:analyze?api-version=2024-11-30`;

  const startRes = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': mimeType || 'application/octet-stream',
    },
    body: buffer,
    signal: AbortSignal.timeout(20000),
  });
  if (!startRes.ok) throw new Error(`Azure OCR HTTP ${startRes.status}: ${await startRes.text()}`);

  const opUrl = startRes.headers.get('operation-location');
  if (!opUrl) throw new Error('Azure OCR missing Operation-Location header');

  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise((r) => setTimeout(r, 1200));
    const pollRes = await fetch(opUrl, {
      headers: { 'Ocp-Apim-Subscription-Key': key },
      signal: AbortSignal.timeout(15000),
    });
    if (!pollRes.ok) throw new Error(`Azure poll HTTP ${pollRes.status}`);
    const data = await pollRes.json();
    if (data.status === 'succeeded') {
      return { text: data.analyzeResult?.content || '', provider: 'Azure Document Intelligence' };
    }
    if (data.status === 'failed') {
      throw new Error(`Azure OCR analysis failed: ${JSON.stringify(data.error || {})}`);
    }
  }
  throw new Error('Azure OCR timed out waiting for analysis');
}

/**
 * Provider C: Google Cloud Vision API Free Tier (1,000 units/mo free)
 * Requires GOOGLE_VISION_API_KEY
 */
async function ocrWithGoogleVision(buffer, mimeType) {
  const key = (process.env.GOOGLE_VISION_API_KEY || '').trim();
  if (!key) throw new Error('GOOGLE_VISION_API_KEY is required for Google Cloud Vision OCR');

  const isPdf = mimeType === 'application/pdf';
  const endpoint = isPdf
    ? `https://vision.googleapis.com/v1/files:annotate?key=${encodeURIComponent(key)}`
    : `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`;

  const body = isPdf
    ? {
        requests: [{
          inputConfig: { content: buffer.toString('base64'), mimeType: 'application/pdf' },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        }],
      }
    : {
        requests: [{
          image: { content: buffer.toString('base64') },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        }],
      };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`Google Vision HTTP ${res.status}`);
  const data = await res.json();

  if (isPdf) {
    const pages = data.responses?.[0]?.responses || [];
    const text = pages.map((p) => p.fullTextAnnotation?.text || '').join('\n').trim();
    return { text, provider: 'Google Cloud Vision' };
  }
  const text = data.responses?.[0]?.fullTextAnnotation?.text || data.responses?.[0]?.textAnnotations?.[0]?.description || '';
  return { text: text.trim(), provider: 'Google Cloud Vision' };
}

/**
 * Provider D: Mindee Financial Document API Free Tier (250 pages/mo free)
 * Requires MINDEE_API_KEY
 */
async function ocrWithMindee(buffer, mimeType, filename) {
  const key = (process.env.MINDEE_API_KEY || '').trim();
  if (!key) throw new Error('MINDEE_API_KEY is required for Mindee OCR');

  const form = new FormData();
  form.append('document', new Blob([buffer], { type: mimeType }), filename || 'document.pdf');

  const res = await fetch('https://api.mindee.net/v1/products/mindee/financial_document/v1/predict', {
    method: 'POST',
    headers: { Authorization: `Token ${key}` },
    body: form,
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`Mindee HTTP ${res.status}`);
  const data = await res.json();
  const pred = data.document?.inference?.prediction;
  if (!pred) throw new Error('Mindee returned empty prediction');

  const lines = [];
  if (pred.supplier_name?.value) lines.push(`Vendor: ${pred.supplier_name.value}`);
  if (pred.supplier_address?.value) lines.push(`Vendor Address: ${pred.supplier_address.value}`);
  if (pred.customer_name?.value) lines.push(`Buyer: ${pred.customer_name.value}`);
  if (pred.invoice_number?.value) lines.push(`Invoice Number: ${pred.invoice_number.value}`);
  if (pred.date?.value) lines.push(`Date: ${pred.date.value}`);
  if (pred.due_date?.value) lines.push(`Due Date: ${pred.due_date.value}`);
  if (pred.locale?.currency) lines.push(`Currency: ${pred.locale.currency}`);
  for (const r of pred.reference_numbers || []) {
    if (r.value) lines.push(`PO Reference: ${r.value}`);
  }
  for (const li of pred.line_items || []) {
    lines.push(`${li.description || 'Item'} | Qty: ${li.quantity ?? 1} | Unit Price: ${li.unit_price ?? 0} | Amount: ${li.total_amount ?? 0}`);
  }
  if (pred.total_net?.value !== null && pred.total_net?.value !== undefined) lines.push(`Subtotal: ${pred.total_net.value}`);
  if (pred.total_tax?.value !== null && pred.total_tax?.value !== undefined) lines.push(`Tax Amount: ${pred.total_tax.value}`);
  if (pred.total_amount?.value !== null && pred.total_amount?.value !== undefined) lines.push(`Total Amount: ${pred.total_amount.value}`);

  return { text: lines.join('\n'), provider: 'Mindee Cloud OCR' };
}

/**
 * Built-in Zero-Dependency Digital PDF Text Extractor
 */
function extractNativePdfText(buffer) {
  try {
    const raw = buffer.toString('latin1');
    const chunks = [];

    const decodePdfString = (s) =>
      s
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\')
        .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));

    const parseTextBlocks = (content) => {
      const btEt = content.match(/BT[\s\S]*?ET/g) || [content];
      for (const block of btEt) {
        const parts = [];
        const re = /\((?:\\.|[^\\()])*\)\s*(?:Tj|'|")|\[((?:\\.|[^[\]])*)\]\s*TJ/g;
        let m;
        while ((m = re.exec(block)) !== null) {
          if (m[1] !== undefined) {
            const inner = m[1].match(/\((?:\\.|[^\\()])*\)/g) || [];
            parts.push(inner.map((x) => decodePdfString(x.slice(1, -1))).join(''));
          } else {
            const strMatch = m[0].match(/\((?:\\.|[^\\()])*\)/);
            if (strMatch) parts.push(decodePdfString(strMatch[0].slice(1, -1)));
          }
        }
        if (parts.length) chunks.push(parts.join(' '));
      }
    };

    const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let sm;
    while ((sm = streamRe.exec(raw)) !== null) {
      const start = sm.index + sm[0].indexOf('\n') + 1;
      const end = sm.index + sm[0].lastIndexOf('endstream') - (sm[0].endsWith('\r\nendstream') ? 2 : 1);
      const slice = buffer.subarray(start, end);
      try {
        const inflated = zlib.inflateSync(slice).toString('latin1');
        parseTextBlocks(inflated);
      } catch {
        parseTextBlocks(slice.toString('latin1'));
      }
    }

    if (!chunks.length) parseTextBlocks(raw);
    return chunks.join('\n').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, ' ').trim();
  } catch {
    return '';
  }
}

/**
 * Extracts embedded text from PNG tEXt / iTXt metadata chunks if present.
 */
function extractNativePngText(buffer) {
  try {
    if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) return '';
    let offset = 8;
    const out = [];
    while (offset + 8 <= buffer.length) {
      const len = buffer.readUInt32BE(offset);
      const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
      const data = buffer.subarray(offset + 8, offset + 8 + len);
      if (type === 'tEXt' || type === 'iTXt') {
        const str = data.toString('utf8').replace(/\0+/g, '\n').trim();
        const nulIdx = data.indexOf(0);
        out.push(nulIdx >= 0 ? data.subarray(nulIdx + 1).toString('utf8').replace(/^\0+/, '').trim() : str);
      }
      if (type === 'IEND') break;
      offset += 12 + len;
    }
    return out.filter(Boolean).join('\n').trim();
  } catch {
    return '';
  }
}

/**
 * Orchestrates Cloud OCR across configured providers with resilient fallback.
 */
export async function runCloudOCR(buffer, mimeType, filename) {
  const errors = [];
  const nativePdfText =
    mimeType === 'application/pdf'
      ? extractNativePdfText(buffer)
      : mimeType === 'image/png'
      ? extractNativePngText(buffer)
      : '';

  const tryProvider = async (name, fn) => {
    try {
      const res = await fn();
      if (res?.text && res.text.trim().length > 3) return res;
      errors.push(`${name}: returned empty text`);
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
    return null;
  };

  if (PROVIDER === 'azure' || (PROVIDER === 'auto' && process.env.AZURE_DOC_INTEL_KEY)) {
    const r = await tryProvider('Azure', () => ocrWithAzure(buffer, mimeType));
    if (r) return { ...r, text: mergeText(r.text, nativePdfText) };
    if (PROVIDER === 'azure') throw new Error(errors.join(' | '));
  }

  if (PROVIDER === 'google_vision' || (PROVIDER === 'auto' && process.env.GOOGLE_VISION_API_KEY)) {
    const r = await tryProvider('Google Vision', () => ocrWithGoogleVision(buffer, mimeType));
    if (r) return { ...r, text: mergeText(r.text, nativePdfText) };
    if (PROVIDER === 'google_vision') throw new Error(errors.join(' | '));
  }

  if (PROVIDER === 'mindee' || (PROVIDER === 'auto' && process.env.MINDEE_API_KEY)) {
    const r = await tryProvider('Mindee', () => ocrWithMindee(buffer, mimeType, filename));
    if (r) return { ...r, text: mergeText(r.text, nativePdfText) };
    if (PROVIDER === 'mindee') throw new Error(errors.join(' | '));
  }

  // Default: OCR.space Free Cloud OCR
  const r = await tryProvider('OCR.space', () => ocrWithOcrSpace(buffer, mimeType, filename));
  if (r) return { ...r, text: mergeText(r.text, nativePdfText) };

  // Fallback to native PDF text if cloud is unreachable or rate-limited
  if (nativePdfText.length > 5) {
    return { text: nativePdfText, provider: 'Built-in PDF OCR Fallback' };
  }

  // Final resilient fallback so uploads can still be reviewed manually in Document Intelligence
  console.warn(`[ocr] Cloud OCR warning for "${filename}": ${errors.join('; ')}`);
  return {
    text: `Filename: ${filename || 'document'}\n(${errors.join('; ') || 'No text detected by OCR'})`,
    provider: 'OCR Fallback (Needs Review)',
  };
}

function mergeText(cloudText, pdfText) {
  if (!pdfText) return cloudText;
  if (!cloudText) return pdfText;
  return cloudText.length >= pdfText.length * 0.6 ? `${cloudText}\n${pdfText}` : `${pdfText}\n${cloudText}`;
}

/* ============================================================
 * 2) STRUCTURED PROCUREMENT PARSER (PO / GRN / INVOICE)
 * ============================================================ */

const MONTHS = {
  jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
  apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
  aug: '08', august: '08', sep: '09', sept: '09', september: '09', oct: '10', october: '10',
  nov: '11', november: '11', dec: '12', december: '12',
};

function parseIsoDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  let m = s.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  m = s.match(/\b(0?[1-9]|[12]\d|3[01])[\s\-/,]+([A-Za-z]{3,9})[\s\-/,]+(20\d{2})\b/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`;
  }

  m = s.match(/\b([A-Za-z]{3,9})\.?\s+(0?[1-9]|[12]\d|3[01]),?\s+(20\d{2})\b/);
  if (m && MONTHS[m[1].toLowerCase()]) {
    return `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${m[2].padStart(2, '0')}`;
  }

  m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (m) {
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    const yr = m[3];
    const [mm, dd] = a > 12 ? [b, a] : [a, b];
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${yr}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }
  return null;
}

function cleanNum(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).replace(/[,$\u20AC\u00A3\u20B9\s]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function classifyDocument(text, filename = '') {
  const t = `${filename}\n${text}`.toLowerCase();
  const scores = { purchase_order: 0, delivery_receipt: 0, invoice: 0 };

  if (/\b(po|purchase[_-\s]?order)\b/i.test(filename)) scores.purchase_order += 4;
  if (/\b(grn|delivery|receipt|packing[_-\s]?slip|pod)\b/i.test(filename)) scores.delivery_receipt += 4;
  if (/\b(inv|invoice|bill)\b/i.test(filename)) scores.invoice += 4;

  if (/\bpurchase\s+order\b/.test(t)) scores.purchase_order += 6;
  if (/\bpo\s*(?:number|no|#|date)\b/.test(t) && !/\binvoice\b/.test(t) && !/\bdelivery\b/.test(t)) scores.purchase_order += 4;
  if (/\border\s+summary\b|\bordered\s+by\b|\bplease\s+supply\b/.test(t)) scores.purchase_order += 2;

  if (/\b(?:delivery\s+(?:receipt|note|order)|goods\s+received\s+note|packing\s+slip|proof\s+of\s+delivery|\bgrn\b)\b/.test(t)) {
    scores.delivery_receipt += 7;
  }
  if (/\bqty\s+received\b|\bquantity\s+received\b|\breceived\s+by\b|\bdelivered\s+to\b/.test(t)) {
    scores.delivery_receipt += 4;
  }

  if (/\b(?:tax\s+invoice|invoice\s*(?:number|no|#|date)|bill\s+to|amount\s+due|balance\s+due|remit\s+to)\b/.test(t)) {
    scores.invoice += 6;
  }
  if (/\binvoice\b/.test(t)) scores.invoice += 3;
  if (/\bdue\s+date\b/.test(t)) scores.invoice += 2;

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] >= 3 ? best[0] : 'unknown';
}

function extractCurrency(text) {
  const m = text.match(/\b(USD|EUR|GBP|INR|CAD|AUD|SGD|AED|JPY)\b/);
  if (m) return m[1];
  if (text.includes('₹') || /\bRs\.?\s*\d/i.test(text)) return 'INR';
  if (text.includes('€')) return 'EUR';
  if (text.includes('£')) return 'GBP';
  if (text.includes('$')) return 'USD';
  return null;
}

function extractLineItems(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items = [];
  const skipRe = /^(?:subtotal|sub-total|total|grand\s+total|tax|vat|gst|cgst|sgst|igst|discount|shipping|freight|amount\s+due|balance\s+due|item|description|qty|quantity|page\s+\d|thank\s+you|notes|terms|payment|bank|account|iban|swift|routing|filename)/i;

  for (const line of lines) {
    if (line.length < 4 || skipRe.test(line)) continue;

    // Pattern 1: Structured Mindee / pipe-delimited line
    const pipeMatch = line.match(/^(.+?)\s*\|\s*Qty:\s*([\d.,]+)\s*\|\s*Unit Price:\s*([\d.,]+)\s*\|\s*Amount:\s*([\d.,]+)/i);
    if (pipeMatch) {
      items.push({
        description: pipeMatch[1].trim(),
        sku: null,
        quantity: cleanNum(pipeMatch[2]),
        unit_price: cleanNum(pipeMatch[3]),
        amount: cleanNum(pipeMatch[4]),
      });
      continue;
    }

    // Pattern 2: Description [SKU] Qty UnitPrice Amount (3 trailing numbers, supports tabs/spaces)
    const normalized = line.replace(/\t+/g, '   ');
    const threeNums = normalized.match(
      /^([A-Za-z0-9][A-Za-z0-9\s\-/,()."'#&+]{2,70}?)\s+(\d+(?:\.\d+)?)\s+[$€£₹]?(\d{1,3}(?:,\d{3})*(?:\.\d{1,4})?|\d+(?:\.\d{1,4})?)\s+[$€£₹]?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)$/
    );
    if (threeNums) {
      const descRaw = threeNums[1].replace(/\s+/g, ' ').trim();
      const qty = cleanNum(threeNums[2]);
      const price = cleanNum(threeNums[3]);
      const amt = cleanNum(threeNums[4]);
      if (qty !== null && qty > 0 && qty < 1000000 && !/^(20\d{2}|19\d{2})$/.test(threeNums[2])) {
        const skuMatch = descRaw.match(/^([A-Z]{2,5}[-_]\d{2,6})\s+(.+)$/);
        items.push({
          description: skuMatch ? skuMatch[2].trim() : descRaw,
          sku: skuMatch ? skuMatch[1] : null,
          quantity: qty,
          unit_price: price,
          amount: amt,
        });
        continue;
      }
    }

    // Pattern 3: Delivery receipt / GRN row with Ordered vs Received
    const grnTwoQty = normalized.match(/^([A-Za-z][A-Za-z0-9\s\-/,()."'#&+]{2,65}?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/);
    if (grnTwoQty && !skipRe.test(grnTwoQty[1])) {
      const descRaw = grnTwoQty[1].replace(/\s+/g, ' ').trim();
      const n1 = cleanNum(grnTwoQty[2]);
      const n2 = cleanNum(grnTwoQty[3]);
      if (n1 !== null && n2 !== null && n1 < 100000 && n2 < 100000 && !/\b202\d\b/.test(line)) {
        items.push({
          description: descRaw,
          sku: null,
          quantity: n2,
          unit_price: null,
          amount: null,
        });
        continue;
      }
    }

    // Pattern 4: Description + single trailing quantity
    const singleQty = normalized.match(/^([A-Za-z][A-Za-z0-9\s\-/,()."'#&+]{3,60}?)\s+(?:qty[:\s]*)?(\d+(?:\.\d+)?)\s*(?:pcs|units|ea|boxes|hrs|kg)?$/i);
    if (singleQty && !skipRe.test(singleQty[1]) && !/(:|date|number|no\.|po|inv|grn|phone|tel|zip|total|tax)/i.test(singleQty[1])) {
      const qty = cleanNum(singleQty[2]);
      if (qty !== null && qty > 0 && qty < 50000) {
        items.push({
          description: singleQty[1].replace(/\s+/g, ' ').trim(),
          sku: null,
          quantity: qty,
          unit_price: null,
          amount: null,
        });
      }
    }
  }

  return items.slice(0, 50);
}

export function parseDocumentText(text, filename = '', providerName = 'Cloud OCR') {
  const doc_type = classifyDocument(text, filename);

  const poMatch =
    text.match(/\b(?:P\.?O\.?[ \t]*(?:Number|No\.?|#|Ref(?:erence)?)|Purchase[ \t]+Order[ \t]*(?:Number|No\.?|#))[ \t]*[:#-]?[ \t]*([A-Z0-9][A-Z0-9\-/]{1,24})/i) ||
    text.match(/\b(PO-\d{2,10}[A-Z0-9-]*)\b/i);
  let po_reference = poMatch ? poMatch[1].trim() : null;

  let document_number = null;
  if (doc_type === 'purchase_order') {
    document_number = po_reference;
  } else if (doc_type === 'delivery_receipt') {
    const grnMatch =
      text.match(/\b(?:GRN|Delivery[ \t]*(?:Note|Receipt)|Receipt|Packing[ \t]*Slip)[ \t]*(?:Number|No\.?|#)[ \t]*[:#-]?[ \t]*([A-Z0-9][A-Z0-9\-/]{1,24})/i) ||
      text.match(/\b(GRN-\d{1,10}|DN-\d{1,10})\b/i);
    document_number = grnMatch ? grnMatch[1].trim() : null;
  } else if (doc_type === 'invoice') {
    const invMatch =
      text.match(/\b(?:Invoice[ \t]*(?:Number|No\.?|#)|Inv[ \t]*(?:No\.?|#))[ \t]*[:#-]?[ \t]*([A-Z0-9][A-Z0-9\-/]{1,24})/i) ||
      text.match(/\b(INV-\d{1,10}[A-Z0-9-]*)\b/i);
    document_number = invMatch ? invMatch[1].trim() : null;
  }

  if (!document_number) {
    const genericNo = text.match(/\b(?:Document|Order|Ref(?:erence)?)\s*(?:Number|No\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\-/]{1,24})/i);
    document_number = genericNo ? genericNo[1].trim() : (doc_type === 'purchase_order' ? po_reference : null);
  }
  if (doc_type === 'purchase_order' && document_number && !po_reference) {
    po_reference = document_number;
  }

  const vendorMatch =
    text.match(/\b(?:Vendor|Supplier|Seller|From|Remit\s+To)\s*[:\-]\s*([^\r\n|]{2,60})/i) ||
    text.match(/^([A-Z][A-Za-z0-9&.,\s]{2,45}\b(?:Ltd|LLC|Inc|Corp|Co|GmbH|Pvt|Limited|Supplies|Industrial|Solutions|Services|Enterprises)\.?)/m);
  const vendor_name = vendorMatch ? vendorMatch[1].trim() : null;

  const addrMatch = text.match(/\b(?:Vendor\s+Address|Supplier\s+Address|Address)\s*[:\-]\s*([^\r\n]{5,90})/i);
  const vendor_address = addrMatch ? addrMatch[1].trim() : null;

  const buyerMatch = text.match(/\b(?:Buyer|Bill\s+To|Customer|Ship\s+To|Client)\s*[:\-]\s*([^\r\n|]{2,60})/i);
  const buyer_name = buyerMatch ? buyerMatch[1].trim() : null;

  const dateLabelMatch = text.match(/\b(?:Invoice\s+Date|Order\s+Date|Delivery\s+Date|Document\s+Date|Date)\s*[:\-]?\s*([A-Za-z0-9,\s\-/.]{6,20})/i);
  const dueDateMatch = text.match(/\b(?:Due\s+Date|Payment\s+Due)\s*[:\-]?\s*([A-Za-z0-9,\s\-/.]{6,20})/i);
  const document_date = parseIsoDate(dateLabelMatch?.[1]) || parseIsoDate(text);
  const due_date = parseIsoDate(dueDateMatch?.[1]);

  const termsMatch = text.match(/\b(?:Payment\s+Terms|Terms)\s*[:\-]?\s*((?:Net\s*\d+|Due\s+on\s+receipt|2\/10\s*Net\s*30|COD)[^\r\n]{0,25})/i)
    || text.match(/\b(Net\s*(?:15|30|45|60|90)|Due\s+on\s+receipt)\b/i);
  const payment_terms = termsMatch ? termsMatch[1].trim() : null;

  const subMatch = text.match(/\b(?:Subtotal|Sub-total|Net\s+Amount|Total\s+Net)\s*[:\-]?\s*[$€£₹]?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const taxMatch = text.match(/\b(?:Tax\s*Amount|Sales\s+Tax|VAT|GST|Total\s+Tax|Tax)\s*(?:\(\d+(?:\.\d+)?%\))?\s*[:\-]?\s*[$€£₹]?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const taxRateMatch = text.match(/\b(?:Tax|VAT|GST)\s*(?:Rate)?\s*[:(\-]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%/i);
  const totalMatch =
    text.match(/\b(?:Grand\s+Total|Total\s+Amount|Invoice\s+Total|Amount\s+Due|Balance\s+Due|Order\s+Total|Total)\s*[:\-]?\s*[$€£₹]?\s*([\d,]+(?:\.\d{1,2})?)/i);

  const line_items = extractLineItems(text);
  const lineSum = line_items.reduce((s, l) => s + (l.amount ?? (l.quantity || 0) * (l.unit_price || 0)), 0);

  let subtotal = cleanNum(subMatch?.[1]);
  const tax_rate = cleanNum(taxRateMatch?.[1]);
  const tax_amount = cleanNum(taxMatch?.[1]);
  let total_amount = cleanNum(totalMatch?.[1]);

  if (subtotal === null && lineSum > 0 && doc_type !== 'delivery_receipt') subtotal = Math.round(lineSum * 100) / 100;
  if (total_amount === null && subtotal !== null) total_amount = Math.round((subtotal + (tax_amount || 0)) * 100) / 100;

  const currency = extractCurrency(text);

  const requiredByType = {
    purchase_order: ['document_number', 'vendor_name', 'document_date', 'total_amount'],
    delivery_receipt: ['document_number', 'po_reference', 'document_date'],
    invoice: ['document_number', 'vendor_name', 'document_date', 'total_amount', 'po_reference'],
    unknown: ['document_number', 'vendor_name', 'document_date'],
  };
  const extractedMap = { document_number, po_reference, vendor_name, document_date, total_amount };
  const reqList = requiredByType[doc_type] || requiredByType.unknown;
  const missing_fields = reqList.filter((k) => !extractedMap[k]);

  let confidence = doc_type === 'unknown' ? 0.45 : 0.78;
  if (line_items.length > 0) confidence += 0.1;
  if (missing_fields.length === 0) confidence += 0.08;
  confidence -= missing_fields.length * 0.1;
  confidence = Math.max(0.25, Math.min(0.98, Math.round(confidence * 100) / 100));

  return {
    doc_type,
    document_number,
    po_reference,
    vendor_name,
    vendor_address,
    buyer_name,
    document_date,
    due_date,
    currency,
    payment_terms,
    line_items,
    subtotal,
    tax_rate,
    tax_amount,
    total_amount,
    confidence,
    missing_fields,
    ocr_provider: providerName,
    ocr_text: text.slice(0, 8000),
    notes: `Read via ${providerName}`,
  };
}

export async function extractDocument(buffer, mimeType, filename) {
  const { text, provider } = await runCloudOCR(buffer, mimeType, filename);
  return parseDocumentText(text, filename, provider);
}

/* ============================================================
 * 3) DETERMINISTIC DEEP AUDIT
 * ============================================================ */
export async function validateMatchWithAI(group, docs) {
  const additional_findings = [];
  const po = docs.find((d) => d.doc_type === 'purchase_order')?.extracted;
  const grns = docs.filter((d) => d.doc_type === 'delivery_receipt').map((d) => d.extracted).filter(Boolean);
  const invoices = docs.filter((d) => d.doc_type === 'invoice').map((d) => d.extracted).filter(Boolean);

  for (const inv of invoices) {
    if (inv.document_date && po?.document_date && inv.document_date < po.document_date) {
      additional_findings.push({
        type: 'date_anomaly',
        severity: 'warning',
        field: 'document_date',
        message: `Invoice #${inv.document_number || '—'} is dated ${inv.document_date}, which is earlier than PO date ${po.document_date}.`,
      });
    }
    if (inv.due_date && inv.document_date && inv.due_date < inv.document_date) {
      additional_findings.push({
        type: 'date_anomaly',
        severity: 'warning',
        field: 'due_date',
        message: `Invoice #${inv.document_number || '—'} due date (${inv.due_date}) is earlier than the invoice date (${inv.document_date}).`,
      });
    }
    for (const grn of grns) {
      if (inv.document_date && grn.document_date && inv.document_date < grn.document_date) {
        additional_findings.push({
          type: 'date_anomaly',
          severity: 'info',
          field: 'document_date',
          message: `Invoice #${inv.document_number || '—'} (${inv.document_date}) was issued before delivery receipt #${grn.document_number || '—'} (${grn.document_date}).`,
        });
      }
    }

    if (inv.subtotal && inv.tax_rate !== null && inv.tax_rate !== undefined && inv.tax_amount !== null && inv.tax_amount !== undefined) {
      const expectedTax = Math.round(inv.subtotal * (inv.tax_rate / 100) * 100) / 100;
      if (Math.abs(expectedTax - inv.tax_amount) > 0.5) {
        additional_findings.push({
          type: 'tax_inconsistency',
          severity: 'warning',
          field: 'tax_amount',
          message: `Invoice #${inv.document_number || '—'} tax rate (${inv.tax_rate}%) on subtotal ${inv.subtotal} equals ${expectedTax}, but tax amount is ${inv.tax_amount}.`,
        });
      }
    }

    if (po?.payment_terms && inv.payment_terms && po.payment_terms.toLowerCase() !== inv.payment_terms.toLowerCase()) {
      additional_findings.push({
        type: 'terms_mismatch',
        severity: 'info',
        field: 'payment_terms',
        message: `Payment terms on invoice ("${inv.payment_terms}") differ from PO ("${po.payment_terms}").`,
      });
    }
  }

  const currencies = [...new Set(docs.map((d) => d.extracted?.currency).filter(Boolean))];
  if (currencies.length > 1) {
    additional_findings.push({
      type: 'currency_mismatch',
      severity: 'critical',
      field: 'currency',
      message: `Currency mismatch across linked documents: ${currencies.join(' vs ')}.`,
    });
  }

  const allFindings = [...(group.findings || []), ...additional_findings];
  const critCount = allFindings.filter((f) => f.severity === 'critical').length;
  const warnCount = allFindings.filter((f) => f.severity === 'warning').length;

  const recommendation = !group.has?.invoice
    ? 'AWAIT_INVOICE'
    : critCount > 0
    ? 'HOLD_PAYMENT'
    : warnCount > 0 || !group.has?.po || !group.has?.grn
    ? 'REVIEW'
    : 'APPROVE';

  const status = critCount > 0
    ? 'mismatch'
    : !group.has?.po || !group.has?.grn || !group.has?.invoice
    ? 'incomplete'
    : warnCount > 0
    ? 'review'
    : 'matched';

  const cur = group.currency ? `${group.currency} ` : '';
  const summary =
    recommendation === 'HOLD_PAYMENT'
      ? `Deep audit flagged ${critCount} critical issue(s) and ${warnCount} warning(s) for PO ${group.po_number || 'unlinked'}. Hold payment of ${cur}${Number(group.invoice_total || 0).toFixed(2)} until resolved.`
      : recommendation === 'APPROVE'
      ? `Deep audit verified PO ${group.po_number}: quantities, unit prices, dates, and totals (${cur}${Number(group.invoice_total || 0).toFixed(2)}) match across all 3 documents.`
      : recommendation === 'AWAIT_INVOICE'
      ? `PO ${group.po_number || 'group'} has no vendor invoice yet. Awaiting invoice before payment verification.`
      : `Deep audit found ${warnCount} item(s) requiring manual review before approving ${cur}${Number(group.invoice_total || 0).toFixed(2)}.`;

  return {
    status,
    recommendation,
    summary,
    recommended_actions: group.recommended_actions || [],
    additional_findings,
    confidence: 0.95,
  };
}

/* ============================================================
 * 4) PROCUREMENT INSIGHTS ASSISTANT
 * ============================================================ */
export async function askAssistant({ question, context }) {
  const q = String(question || '').toLowerCase();
  const docs = context?.documents || [];
  const matches = context?.three_way_matches || [];

  const holds = matches.filter((m) => m.recommendation === 'HOLD_PAYMENT');
  const approved = matches.filter((m) => m.recommendation === 'APPROVE');
  const reviews = matches.filter((m) => m.recommendation === 'REVIEW');

  if (q.includes('hold') || q.includes('block') || q.includes('risk') || q.includes('which invoice')) {
    if (!holds.length) {
      return '✅ **No invoices are currently on payment hold.** All uploaded groups are either approved, awaiting invoices, or in minor review.';
    }
    const totalRisk = holds.reduce((s, h) => s + (Number(h.amount_at_risk) || 0), 0);
    const list = holds
      .map((h) => `- **PO ${h.po || 'Unlinked'}** (${h.vendor || 'Unknown vendor'}) — **$${Number(h.amount_at_risk || 0).toLocaleString()} at risk**\n  ${(h.issues || []).map((i) => `  • ${i}`).join('\n')}`)
      .join('\n');
    return `### 🛑 Invoices on Payment Hold (${holds.length})\nTotal amount at risk: **$${totalRisk.toLocaleString()}**\n\n${list}`;
  }

  if (q.includes('quantity') || q.includes('mismatch') || q.includes('delivery') || q.includes('grn') || q.includes('received')) {
    const qtyIssues = matches.flatMap((m) =>
      (m.issues || [])
        .filter((i) => /unit|quantity|delivery|received|ordered/i.test(i))
        .map((i) => `- **PO ${m.po || 'Unlinked'}** (${m.vendor || 'Unknown'}): ${i}`)
    );
    if (!qtyIssues.length) {
      return '✅ **No quantity mismatches detected** between Purchase Orders, Delivery Receipts (GRNs), and Invoices.';
    }
    return `### 📦 Quantity & Delivery Discrepancies (${qtyIssues.length})\n\n${qtyIssues.join('\n')}`;
  }

  if (q.includes('duplicate') || q.includes('over-bill') || q.includes('overbill') || q.includes('price')) {
    const billingIssues = matches.flatMap((m) =>
      (m.issues || [])
        .filter((i) => /duplicate|overbill|exceeds|price|more unit/i.test(i))
        .map((i) => `- **PO ${m.po || 'Unlinked'}** (${m.vendor || 'Unknown'}): ${i}`)
    );
    if (!billingIssues.length) {
      return '✅ **No duplicate invoices or over-billed items** were found across your uploaded documents.';
    }
    return `### ⚠️ Duplicate Invoices & Over-Billing Alerts (${billingIssues.length})\n\n${billingIssues.join('\n')}`;
  }

  if (q.includes('vendor') || q.includes('spend') || q.includes('supplier') || q.includes('total')) {
    const invoices = docs.filter((d) => d.type === 'invoice');
    const byVendor = new Map();
    for (const inv of invoices) {
      const v = inv.vendor || 'Unknown Vendor';
      const cur = byVendor.get(v) || { count: 0, total: 0, currency: inv.currency || 'USD' };
      cur.count += 1;
      cur.total += Number(inv.total) || 0;
      byVendor.set(v, cur);
    }
    if (!byVendor.size) {
      return 'No vendor invoices have been uploaded yet. Upload invoices in the **Upload Center** to see vendor spend breakdowns.';
    }
    const rows = [...byVendor.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([v, s]) => `- **${v}**: ${s.currency} ${s.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${s.count} invoice${s.count === 1 ? '' : 's'})`)
      .join('\n');
    return `### 💰 Total Spend Breakdown by Vendor\n\n${rows}`;
  }

  const allIssues = matches.flatMap((m) => (m.issues || []).map((i) => `- **PO ${m.po || 'Unlinked'}**: ${i}`));
  return [
    `### 📊 Procurement & Three-Way Match Summary`,
    `- **Uploaded Documents**: ${docs.length} (${docs.filter((d) => d.type === 'purchase_order').length} POs, ${docs.filter((d) => d.type === 'delivery_receipt').length} GRNs, ${docs.filter((d) => d.type === 'invoice').length} Invoices)`,
    `- **Match Groups**: ${matches.length} total (${approved.length} Approved, ${holds.length} On Hold, ${reviews.length} Needs Review)`,
    allIssues.length ? `\n**Active Discrepancies:**\n${allIssues.slice(0, 8).join('\n')}` : '\n✅ All matched groups are clean with no discrepancies.',
  ].join('\n');
}
