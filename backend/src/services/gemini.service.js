/**
 * Two-Stage Hybrid Pipeline:
 *   Stage 1 (OCR) : Free Cloud OCR (`ocr.service.js`) reads raw text & tables from images/PDFs.
 *   Stage 2 (LLM) : LLM (Gemini / Groq) reasons over the OCR text to classify, structure fields,
 *                   audit three-way matches, and answer natural-language procurement questions.
 *   Resilience    : If the LLM key is missing, invalid, or rate-limited, gracefully falls back
 *                   to deterministic OCR parsing & auditing so uploads never fail.
 */
import { GoogleGenAI, Type } from '@google/genai';
import {
  runCloudOCR,
  parseDocumentText,
  validateMatchWithAI as deterministicAudit,
  askAssistant as deterministicAssistant,
} from './ocr.service.js';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
let geminiClient;

function getGemini() {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  // Google AI Studio keys start with "AIza". Skip invalid/placeholder keys so OCR works without error.
  if (!key || !key.startsWith('AIza')) return null;
  geminiClient ??= new GoogleGenAI({ apiKey: key });
  return geminiClient;
}

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    const m = text?.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('LLM returned malformed JSON');
  }
};

/**
 * Optional Free Cloud LLM alternative: Groq Cloud API (Llama 3.3 70B)
 */
async function callGroqJson(systemPrompt, userPrompt) {
  const key = (process.env.GROQ_API_KEY || '').trim();
  if (!key) return null;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
  const data = await res.json();
  return parseJson(data.choices?.[0]?.message?.content || '{}');
}

/* ============================================================
 * 1) Stage 1: Cloud OCR reads document -> Stage 2: LLM reasons over OCR text
 * ============================================================ */
const nStr = { type: Type.STRING, nullable: true };
const nNum = { type: Type.NUMBER, nullable: true };

const extractionSchema = {
  type: Type.OBJECT,
  properties: {
    doc_type: { type: Type.STRING, enum: ['purchase_order', 'delivery_receipt', 'invoice', 'unknown'] },
    document_number: nStr,
    po_reference: nStr,
    vendor_name: nStr,
    vendor_address: nStr,
    buyer_name: nStr,
    document_date: { ...nStr, description: 'ISO date YYYY-MM-DD' },
    due_date: { ...nStr, description: 'ISO date YYYY-MM-DD (invoices only)' },
    currency: { ...nStr, description: 'ISO 4217 code, e.g. USD, EUR, INR' },
    payment_terms: nStr,
    line_items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { description: nStr, sku: nStr, quantity: nNum, unit_price: nNum, amount: nNum },
        required: ['description', 'quantity'],
        propertyOrdering: ['description', 'sku', 'quantity', 'unit_price', 'amount'],
      },
    },
    subtotal: nNum,
    tax_rate: { ...nNum, description: 'Percentage, e.g. 18 for 18%' },
    tax_amount: nNum,
    total_amount: nNum,
    confidence: { type: Type.NUMBER, description: '0..1 overall extraction confidence' },
    missing_fields: { type: Type.ARRAY, items: { type: Type.STRING } },
    notes: nStr,
  },
  required: ['doc_type', 'line_items', 'confidence', 'missing_fields'],
  propertyOrdering: [
    'doc_type', 'document_number', 'po_reference', 'vendor_name', 'vendor_address', 'buyer_name',
    'document_date', 'due_date', 'currency', 'payment_terms', 'line_items', 'subtotal', 'tax_rate',
    'tax_amount', 'total_amount', 'confidence', 'missing_fields', 'notes',
  ],
};

const EXTRACTION_REASONING_PROMPT = `You are DocuMind, an expert accounts-payable reasoning LLM.
A Cloud OCR engine has already read an uploaded procurement document (image or PDF) into raw text.
Reason carefully through the OCR text (fixing any minor OCR character noise like O/0 or I/1 in numbers) to classify the document and extract its structured fields.

Classification:
- "purchase_order": a PO issued by the buyer to a vendor (ordered items & quantities).
- "delivery_receipt": goods received note (GRN), delivery note, packing slip, proof of delivery (received quantities).
- "invoice": a bill / tax invoice requesting payment.
- "unknown": anything else.

Rules:
- For purchase orders, document_number = the PO number and po_reference = the same PO number.
- For delivery receipts and invoices, po_reference = the purchase order number they reference (null if none).
- For delivery receipts, line quantity = quantity actually RECEIVED/ACCEPTED (not ordered/shipped if both shown).
- Numbers must be plain numbers (no currency symbols or thousands separators). Dates must be YYYY-MM-DD.
- vendor_name is always the SUPPLIER (seller), never the buyer.
- Never invent values. Use null when a field is absent or illegible and list such key fields in missing_fields.
- confidence reflects legibility and how certain you are about the key fields (0..1).`;

export async function reasonOverOcrText(ocrText, filename, ocrProvider = 'Cloud OCR') {
  const baseline = parseDocumentText(ocrText, filename, ocrProvider);

  // STAGE 2: LLM reasons over the OCR text
  const userContent = [
    `File name: ${filename}`,
    `OCR Provider: ${ocrProvider}`,
    `--- RAW OCR TEXT ---`,
    ocrText,
    `--- BASELINE REGEX CANDIDATES (verify & refine) ---`,
    JSON.stringify({
      doc_type: baseline.doc_type,
      document_number: baseline.document_number,
      po_reference: baseline.po_reference,
      vendor_name: baseline.vendor_name,
      document_date: baseline.document_date,
      total_amount: baseline.total_amount,
      line_items: baseline.line_items,
    }),
  ].join('\n');

  try {
    let llmData = null;
    if (process.env.GROQ_API_KEY) {
      llmData = await callGroqJson(
        `${EXTRACTION_REASONING_PROMPT}\nReturn a JSON object matching: { doc_type, document_number, po_reference, vendor_name, vendor_address, buyer_name, document_date, due_date, currency, payment_terms, line_items: [{ description, sku, quantity, unit_price, amount }], subtotal, tax_rate, tax_amount, total_amount, confidence, missing_fields, notes }`,
        userContent
      );
    } else {
      const ai = getGemini();
      if (ai) {
        const res = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{ role: 'user', parts: [{ text: `${EXTRACTION_REASONING_PROMPT}\n\n${userContent}` }] }],
          config: { responseMimeType: 'application/json', responseSchema: extractionSchema, temperature: 0.1 },
        });
        llmData = parseJson(res.text);
      }
    }

    if (llmData && llmData.doc_type) {
      llmData.line_items = Array.isArray(llmData.line_items) && llmData.line_items.length
        ? llmData.line_items
        : baseline.line_items;
      llmData.missing_fields = Array.isArray(llmData.missing_fields) ? llmData.missing_fields : baseline.missing_fields;
      llmData.confidence = Math.max(0, Math.min(1, Number(llmData.confidence) || baseline.confidence));
      llmData.ocr_provider = ocrProvider;
      llmData.ocr_text = ocrText.slice(0, 8000);
      llmData.notes = llmData.notes
        ? `${llmData.notes} (OCR: ${ocrProvider} + LLM Reasoning)`
        : `OCR: ${ocrProvider} + LLM Reasoning`;
      return llmData;
    }
  } catch (err) {
    console.warn(`[ocr+llm] LLM reasoning unavailable for ${filename}, using OCR parser result:`, err.message);
  }

  return baseline;
}

export async function extractDocument(buffer, mimeType, filename) {
  // STAGE 1: Cloud OCR reads the image / PDF into raw text
  const { text: ocrText, provider: ocrProvider } = await runCloudOCR(buffer, mimeType, filename);
  return reasonOverOcrText(ocrText, filename, ocrProvider);
}

/* ============================================================
 * 2) Three-way matching validation (OCR fields + Deterministic Rules + LLM Reasoning)
 * ============================================================ */
const validationSchema = {
  type: Type.OBJECT,
  properties: {
    status: { type: Type.STRING, enum: ['matched', 'mismatch', 'incomplete', 'review'] },
    recommendation: { type: Type.STRING, enum: ['APPROVE', 'HOLD_PAYMENT', 'REVIEW', 'AWAIT_INVOICE'] },
    summary: { type: Type.STRING, description: '1-3 sentence plain-English verdict for a small-business owner' },
    recommended_actions: { type: Type.ARRAY, items: { type: Type.STRING } },
    additional_findings: {
      type: Type.ARRAY,
      description: 'ONLY issues not already covered by the rule-engine findings',
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, description: 'snake_case category, e.g. date_anomaly, tax_inconsistency, terms_mismatch' },
          severity: { type: Type.STRING, enum: ['critical', 'warning', 'info'] },
          field: nStr,
          message: { type: Type.STRING },
        },
        required: ['type', 'severity', 'message'],
      },
    },
    confidence: { type: Type.NUMBER },
  },
  required: ['status', 'recommendation', 'summary', 'recommended_actions', 'additional_findings', 'confidence'],
  propertyOrdering: ['status', 'recommendation', 'summary', 'recommended_actions', 'additional_findings', 'confidence'],
};

export async function validateMatchWithAI(group, docs) {
  const detResult = await deterministicAudit(group, docs);

  const payload = {
    po_number: group.po_number,
    documents: docs.map((d) => ({
      id: d.id,
      type: d.doc_type,
      filename: d.filename,
      fields: d.extracted,
    })),
    rule_engine: {
      line_comparison: group.line_comparison,
      invoice_total: group.invoice_total,
      po_total: group.po_total,
      findings: [...(group.findings || []), ...(detResult.additional_findings || [])].map(
        ({ type, severity, message }) => ({ type, severity, message })
      ),
      recommendation: detResult.recommendation,
    },
  };

  const prompt = `You are a meticulous accounts-payable auditor performing a THREE-WAY MATCH between a Purchase Order (ordered),
a Delivery Receipt / GRN (received) and Invoice(s) (billed) extracted via Cloud OCR. A deterministic rule engine has already compared them.

Your job:
1. Verify the rule-engine findings against the OCR-extracted fields (they are authoritative for arithmetic — do not contradict correct math).
2. Add ONLY genuinely new issues in additional_findings (e.g. invoice dated before delivery, due date before invoice date,
   tax rate inconsistent with tax amount, currency mismatch, payment terms differ from PO, suspicious round amounts).
   Do not repeat anything already in rule_engine.findings. Return an empty array if nothing new.
3. Give a verdict. Payment must be HOLD_PAYMENT whenever the invoice charges for more than was received or ordered,
   prices exceed the PO, or the invoice is a duplicate. Use AWAIT_INVOICE when no invoice exists.
4. Write a crisp summary quoting concrete numbers, and 1-4 practical recommended_actions.

DATA:
${JSON.stringify(payload)}`;

  try {
    let llmVerdict = null;
    if (process.env.GROQ_API_KEY) {
      llmVerdict = await callGroqJson(
        'Return a JSON object with keys: status, recommendation, summary, recommended_actions, additional_findings, confidence.',
        prompt
      );
    } else {
      const ai = getGemini();
      if (ai) {
        const res = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { responseMimeType: 'application/json', responseSchema: validationSchema, temperature: 0.1 },
        });
        llmVerdict = parseJson(res.text);
      }
    }

    if (llmVerdict && llmVerdict.recommendation) {
      const combinedFindings = [
        ...(detResult.additional_findings || []),
        ...(llmVerdict.additional_findings || []).filter(
          (lf) => !(detResult.additional_findings || []).some((df) => df.type === lf.type)
        ),
      ];
      return {
        ...llmVerdict,
        additional_findings: combinedFindings,
      };
    }
  } catch (err) {
    console.warn('[ocr+llm] LLM match audit unavailable, using deterministic deep audit:', err.message);
  }

  return detResult;
}

/* ============================================================
 * 3) AI Insights assistant (LLM reasoning over OCR data + deterministic fallback)
 * ============================================================ */
export async function askAssistant({ question, history = [], context }) {
  const sysPrompt = `You are DocuMind AI, a friendly finance co-pilot for a small business.
Documents were scanned with Cloud OCR and matched with a three-way matching engine.
Answer questions using ONLY the user's procurement data below (purchase orders, delivery receipts, invoices and
three-way-match results). Be concise, quote concrete numbers, document numbers and vendors, and use short markdown
(bold, bullet lists, small tables) where helpful. If the data does not contain the answer, say so plainly and suggest
what to upload. Never invent documents. Today is ${new Date().toISOString().slice(0, 10)}.

USER DATA (JSON):
${JSON.stringify(context)}`;

  try {
    if (process.env.GROQ_API_KEY) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.3,
          messages: [
            { role: 'system', content: sysPrompt },
            ...history.slice(-10).map((m) => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: String(m.content || '').slice(0, 4000),
            })),
            { role: 'user', content: question },
          ],
        }),
        signal: AbortSignal.timeout(25000),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      }
    }

    const ai = getGemini();
    if (ai) {
      const contents = [
        ...history.slice(-10).map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(m.content || '').slice(0, 4000) }],
        })),
        { role: 'user', parts: [{ text: question }] },
      ];
      const res = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: { temperature: 0.3, systemInstruction: sysPrompt },
      });
      if (res.text?.trim()) return res.text.trim();
    }
  } catch (err) {
    console.warn('[ocr+llm] LLM assistant unavailable, using deterministic assistant:', err.message);
  }

  return deterministicAssistant({ question, history, context });
}

/* ============================================================
 * 4) Auto-Draft Vendor Dispute / Credit-Note Email
 * ============================================================ */
export async function generateDisputeEmail(group) {
  const vendor = group.vendor || 'Accounts Receivable Team';
  const po = group.po_number || 'Unlinked PO';
  const cur = group.currency || 'USD';
  const invDoc = (group.documents || []).find((d) => d.doc_type === 'invoice');
  const grnDoc = (group.documents || []).find((d) => d.doc_type === 'delivery_receipt');
  const invNo = invDoc?.document_number || '—';
  const grnNo = grnDoc?.document_number || '—';

  const issuesList = (group.findings || [])
    .filter((f) => f.severity !== 'info')
    .map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.message}`)
    .join('\n');

  const lineTable = (group.line_comparison || [])
    .map(
      (r) =>
        `• ${r.description}: Ordered ${r.ordered ?? '—'}, Received ${r.received ?? '—'}, Billed ${r.billed ?? '—'} (PO Price: ${r.po_price ?? '—'}, Inv Price: ${r.inv_price ?? '—'})`
    )
    .join('\n');

  const subject = `URGENT: Payment Hold & Credit Note Request — Invoice #${invNo} (PO ${po})`;
  const deterministicBody = [
    `Dear ${vendor} Billing & Accounts Receivable Team,`,
    ``,
    `We have completed our automated three-way match comparing Purchase Order ${po}, Delivery Receipt #${grnNo}, and your Invoice #${invNo} (${cur} ${Number(group.invoice_total || 0).toFixed(2)}).`,
    ``,
    `Our audit flagged the following discrepancy(ies) that require resolution before we can release payment:`,
    issuesList || '• Please review the attached PO vs. Invoice quantities and unit prices.',
    ``,
    `Line-Item Breakdown (PO vs. GRN vs. Invoice):`,
    lineTable || '• See referenced Purchase Order and Delivery Receipt.',
    ``,
    `Requested Next Steps:`,
    ...(group.recommended_actions || ['Please issue a revised invoice or credit note reflecting the actual delivered quantities and agreed PO unit prices.']).map((a) => `- ${a}`),
    ``,
    `Invoice #${invNo} is currently placed on payment hold pending your credit note or corrected invoice.`,
    ``,
    `Best regards,`,
    `Accounts Payable & Procurement Team`,
    `Generated via DocuMind AI Three-Way Match`,
  ].join('\n');

  try {
    const ai = getGemini();
    if (ai) {
      const res = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Write a concise, firm, professional accounts-payable vendor dispute email based on this 3-way match data:\n${JSON.stringify(group)}\n\nKeep concrete numbers, document IDs, and line-item variances accurate. Output plain text body only (no Subject line).`,
              },
            ],
          },
        ],
        config: { temperature: 0.2 },
      });
      if (res.text?.trim()) {
        return { subject, body: res.text.trim() };
      }
    }
  } catch {
    // Use deterministic template
  }

  return { subject, body: deterministicBody };
}

