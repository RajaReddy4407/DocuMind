/**
 * Generates crisp, realistic PNG document images + PDFs for testing Cloud OCR + LLM Reasoning + 3-Way Matching.
 * Output directory: documind-ai/sample-documents/
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(new URL('../../sample-documents', import.meta.url));
fs.mkdirSync(outDir, { recursive: true });

// 5x7 crisp bitmap font for ASCII printable characters (scaled 2x/3x when rendering)
const FONT_5X7 = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '!': [4, 4, 4, 4, 0, 0, 4],
  '"': [10, 10, 0, 0, 0, 0, 0],
  '#': [10, 31, 10, 10, 31, 10, 0],
  '$': [4, 15, 20, 14, 5, 30, 4],
  '%': [24, 25, 2, 4, 8, 19, 3],
  '&': [12, 18, 20, 8, 21, 18, 13],
  '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8],
  '*': [0, 4, 21, 14, 21, 4, 0],
  '+': [0, 4, 4, 31, 4, 4, 0],
  ',': [0, 0, 0, 0, 4, 4, 8],
  '-': [0, 0, 0, 31, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 12, 12],
  '/': [0, 1, 2, 4, 8, 16, 0],
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 2, 4, 8, 31],
  '3': [31, 2, 4, 2, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  ':': [0, 12, 12, 0, 12, 12, 0],
  ';': [0, 12, 12, 0, 12, 4, 8],
  '@': [14, 17, 1, 13, 21, 21, 14],
  'A': [14, 17, 17, 31, 17, 17, 17],
  'B': [30, 17, 17, 30, 17, 17, 30],
  'C': [14, 17, 16, 16, 16, 17, 14],
  'D': [28, 18, 17, 17, 17, 18, 28],
  'E': [31, 16, 16, 30, 16, 16, 31],
  'F': [31, 16, 16, 30, 16, 16, 16],
  'G': [14, 17, 16, 23, 17, 17, 15],
  'H': [17, 17, 17, 31, 17, 17, 17],
  'I': [14, 4, 4, 4, 4, 4, 14],
  'J': [7, 2, 2, 2, 2, 18, 12],
  'K': [17, 18, 20, 24, 20, 18, 17],
  'L': [16, 16, 16, 16, 16, 16, 31],
  'M': [17, 27, 21, 21, 17, 17, 17],
  'N': [17, 17, 25, 21, 19, 17, 17],
  'O': [14, 17, 17, 17, 17, 17, 14],
  'P': [30, 17, 17, 30, 16, 16, 16],
  'Q': [14, 17, 17, 17, 21, 18, 13],
  'R': [30, 17, 17, 30, 20, 18, 17],
  'S': [15, 16, 16, 14, 1, 1, 30],
  'T': [31, 4, 4, 4, 4, 4, 4],
  'U': [17, 17, 17, 17, 17, 17, 14],
  'V': [17, 17, 17, 17, 17, 10, 4],
  'W': [17, 17, 17, 21, 21, 21, 10],
  'X': [17, 17, 10, 4, 10, 17, 17],
  'Y': [17, 17, 17, 10, 4, 4, 4],
  'Z': [31, 1, 2, 4, 8, 16, 31],
};

// CRC32 table for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function renderDocumentPng({ accentColor, title, badge, lines, ocrText }) {
  const width = 920;
  const height = 680;
  const rgb = Buffer.alloc(width * height * 3, 255); // White background

  const setPx = (x, y, r, g, b) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = (y * width + x) * 3;
    rgb[idx] = r;
    rgb[idx + 1] = g;
    rgb[idx + 2] = b;
  };

  const fillRect = (x0, y0, w, h, [r, g, b]) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) setPx(x, y, r, g, b);
    }
  };

  const drawText = (str, x0, y0, scale = 2, color = [15, 23, 42]) => {
    const upper = String(str).toUpperCase();
    let cx = x0;
    for (let i = 0; i < upper.length; i++) {
      const glyph = FONT_5X7[upper[i]] || FONT_5X7[' '];
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row];
        for (let col = 0; col < 5; col++) {
          if ((bits >> (4 - col)) & 1) {
            fillRect(cx + col * scale, y0 + row * scale, scale, scale, color);
          }
        }
      }
      cx += 6 * scale;
    }
  };

  // Outer card border
  fillRect(20, 20, width - 40, height - 40, [226, 232, 240]);
  fillRect(23, 23, width - 46, height - 46, [255, 255, 255]);

  // Top header banner
  fillRect(23, 23, width - 46, 92, accentColor);
  drawText(title, 52, 48, 4, [255, 255, 255]);
  drawText(badge, 52, 86, 2, [226, 232, 240]);

  // Render document lines
  let y = 142;
  for (const l of lines) {
    if (l === '---') {
      fillRect(50, y + 6, width - 100, 2, [203, 213, 225]);
      y += 22;
      continue;
    }
    if (l.startsWith('HEADER:')) {
      fillRect(46, y - 6, width - 92, 30, [241, 245, 249]);
      drawText(l.slice(7).trim(), 54, y + 2, 2, [30, 41, 59]);
      y += 34;
      continue;
    }
    if (l.startsWith('TOTAL:')) {
      fillRect(width - 380, y - 6, 330, 34, accentColor);
      drawText(l.slice(6).trim(), width - 365, y + 3, 2, [255, 255, 255]);
      y += 40;
      continue;
    }
    drawText(l, 54, y, 2, [15, 23, 42]);
    y += 28;
  }

  // Encode raw scanlines (filter byte 0 per row)
  const rawScanlines = Buffer.alloc(height * (1 + width * 3));
  for (let row = 0; row < height; row++) {
    const dstStart = row * (1 + width * 3);
    rawScanlines[dstStart] = 0;
    rgb.copy(rawScanlines, dstStart + 1, row * width * 3, (row + 1) * width * 3);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const textPayload = Buffer.concat([Buffer.from('Comment\0', 'ascii'), Buffer.from(ocrText, 'utf8')]);
  const idat = zlib.deflateSync(rawScanlines, { level: 6 });

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('tEXt', textPayload),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const DOCUMENTS = [
  // SCENARIO 1: Discrepancy / Hold Payment (PO-2026-501)
  {
    filename: '01_PO-2026-501_Purchase_Order.png',
    accentColor: [79, 70, 229], // Indigo
    title: 'PURCHASE ORDER',
    badge: 'DOCUMIND PROCUREMENT SAMPLE - PO-2026-501',
    lines: [
      'PO NUMBER: PO-2026-501              ORDER DATE: 2026-11-01',
      'VENDOR: Vertex Precision Tools Ltd',
      'BUYER: Horizon Aerospace Manufacturing',
      'CURRENCY: USD                       PAYMENT TERMS: Net 30',
      '---',
      'HEADER: ITEM DESCRIPTION                 QTY    UNIT PRICE    AMOUNT',
      'Titanium Drill Bit Set M10        100    45.00         4500.00',
      'High-Pressure Coolant Pump        20     150.00        3000.00',
      '---',
      'SUBTOTAL: $7,500.00',
      'TAX (0%): $0.00',
      'TOTAL: TOTAL AMOUNT: $7,500.00',
    ],
    ocrText: [
      'PURCHASE ORDER',
      'PO Number: PO-2026-501',
      'Vendor: Vertex Precision Tools Ltd',
      'Buyer: Horizon Aerospace Manufacturing',
      'Order Date: 2026-11-01',
      'Currency: USD',
      'Payment Terms: Net 30',
      '',
      'Titanium Drill Bit Set M10   100   45.00   4500.00',
      'High-Pressure Coolant Pump   20    150.00  3000.00',
      '',
      'Subtotal: $7,500.00',
      'Tax (0%): $0.00',
      'Total Amount: $7,500.00',
    ].join('\n'),
  },
  {
    filename: '02_GRN-774_Delivery_Receipt.png',
    accentColor: [2, 132, 199], // Sky Blue
    title: 'DELIVERY RECEIPT (GRN)',
    badge: 'GOODS RECEIVED NOTE - SHORT DELIVERY ON DRILL BITS',
    lines: [
      'GRN NUMBER: GRN-774                 DELIVERY DATE: 2026-11-05',
      'PO REFERENCE: PO-2026-501',
      'VENDOR: Vertex Precision Tools Ltd',
      'RECEIVED BY: Warehouse Dock B',
      '---',
      'HEADER: ITEM DESCRIPTION                 ORDERED       RECEIVED',
      'Titanium Drill Bit Set M10        100           92',
      'High-Pressure Coolant Pump        20            20',
      '---',
      'NOTES: 8 units of Titanium Drill Bit Set M10 were backordered.',
    ],
    ocrText: [
      'DELIVERY RECEIPT (GOODS RECEIVED NOTE)',
      'GRN Number: GRN-774',
      'PO Reference: PO-2026-501',
      'Vendor: Vertex Precision Tools Ltd',
      'Delivery Date: 2026-11-05',
      '',
      'Titanium Drill Bit Set M10   100   92',
      'High-Pressure Coolant Pump   20    20',
    ].join('\n'),
  },
  {
    filename: '03_INV-8830_Vendor_Invoice_Overbilled.png',
    accentColor: [225, 29, 72], // Rose
    title: 'TAX INVOICE',
    badge: 'OVERBILLED QUANTITY & UNIT PRICE VARIANCE TEST',
    lines: [
      'INVOICE NUMBER: INV-8830            INVOICE DATE: 2026-11-06',
      'PO REFERENCE: PO-2026-501           DUE DATE: 2026-12-06',
      'VENDOR: Vertex Precision Tools Ltd',
      'CURRENCY: USD                       PAYMENT TERMS: Net 30',
      '---',
      'HEADER: ITEM DESCRIPTION                 QTY    UNIT PRICE    AMOUNT',
      'Titanium Drill Bit Set M10        100    50.00         5000.00',
      'High-Pressure Coolant Pump        20     150.00        3000.00',
      '---',
      'SUBTOTAL: $8,000.00',
      'TAX (0%): $0.00',
      'TOTAL: TOTAL AMOUNT: $8,000.00',
    ],
    ocrText: [
      'TAX INVOICE',
      'Invoice Number: INV-8830',
      'PO Reference: PO-2026-501',
      'Vendor: Vertex Precision Tools Ltd',
      'Invoice Date: 2026-11-06',
      'Due Date: 2026-12-06',
      'Currency: USD',
      'Payment Terms: Net 30',
      '',
      'Titanium Drill Bit Set M10   100   50.00   5000.00',
      'High-Pressure Coolant Pump   20    150.00  3000.00',
      '',
      'Subtotal: $8,000.00',
      'Tax (0%): $0.00',
      'Total Amount: $8,000.00',
    ].join('\n'),
  },

  // SCENARIO 2: Clean 100% Approved Match (PO-2026-610)
  {
    filename: '04_PO-2026-610_Clean_Purchase_Order.png',
    accentColor: [16, 185, 129], // Emerald
    title: 'PURCHASE ORDER',
    badge: 'CLEAN 3-WAY MATCH SCENARIO - PO-2026-610',
    lines: [
      'PO NUMBER: PO-2026-610              ORDER DATE: 2026-11-02',
      'VENDOR: Nova Office Ergonomics Inc',
      'BUYER: Horizon Aerospace Manufacturing',
      'CURRENCY: USD                       PAYMENT TERMS: Net 30',
      '---',
      'HEADER: ITEM DESCRIPTION                 QTY    UNIT PRICE    AMOUNT',
      'Motorized Standing Desk Frame     15     300.00        4500.00',
      '---',
      'SUBTOTAL: $4,500.00',
      'TAX (0%): $0.00',
      'TOTAL: TOTAL AMOUNT: $4,500.00',
    ],
    ocrText: [
      'PURCHASE ORDER',
      'PO Number: PO-2026-610',
      'Vendor: Nova Office Ergonomics Inc',
      'Buyer: Horizon Aerospace Manufacturing',
      'Order Date: 2026-11-02',
      'Currency: USD',
      'Payment Terms: Net 30',
      '',
      'Motorized Standing Desk Frame   15   300.00   4500.00',
      '',
      'Subtotal: $4,500.00',
      'Tax (0%): $0.00',
      'Total Amount: $4,500.00',
    ].join('\n'),
  },
  {
    filename: '05_GRN-812_Clean_Delivery_Receipt.png',
    accentColor: [16, 185, 129],
    title: 'DELIVERY RECEIPT (GRN)',
    badge: 'ALL 15 UNITS RECEIVED IN FULL - PO-2026-610',
    lines: [
      'GRN NUMBER: GRN-812                 DELIVERY DATE: 2026-11-04',
      'PO REFERENCE: PO-2026-610',
      'VENDOR: Nova Office Ergonomics Inc',
      '---',
      'HEADER: ITEM DESCRIPTION                 ORDERED       RECEIVED',
      'Motorized Standing Desk Frame     15            15',
      '---',
      'NOTES: Delivered in full, no damages.',
    ],
    ocrText: [
      'DELIVERY RECEIPT',
      'GRN Number: GRN-812',
      'PO Reference: PO-2026-610',
      'Vendor: Nova Office Ergonomics Inc',
      'Delivery Date: 2026-11-04',
      '',
      'Motorized Standing Desk Frame   15   15',
    ].join('\n'),
  },
  {
    filename: '06_INV-9105_Clean_Invoice.png',
    accentColor: [16, 185, 129],
    title: 'TAX INVOICE',
    badge: 'EXACT MATCH WITH PO-2026-610 AND GRN-812',
    lines: [
      'INVOICE NUMBER: INV-9105            INVOICE DATE: 2026-11-05',
      'PO REFERENCE: PO-2026-610           DUE DATE: 2026-12-05',
      'VENDOR: Nova Office Ergonomics Inc',
      'CURRENCY: USD                       PAYMENT TERMS: Net 30',
      '---',
      'HEADER: ITEM DESCRIPTION                 QTY    UNIT PRICE    AMOUNT',
      'Motorized Standing Desk Frame     15     300.00        4500.00',
      '---',
      'SUBTOTAL: $4,500.00',
      'TAX (0%): $0.00',
      'TOTAL: TOTAL AMOUNT: $4,500.00',
    ],
    ocrText: [
      'TAX INVOICE',
      'Invoice Number: INV-9105',
      'PO Reference: PO-2026-610',
      'Vendor: Nova Office Ergonomics Inc',
      'Invoice Date: 2026-11-05',
      'Due Date: 2026-12-05',
      'Currency: USD',
      'Payment Terms: Net 30',
      '',
      'Motorized Standing Desk Frame   15   300.00   4500.00',
      '',
      'Subtotal: $4,500.00',
      'Tax (0%): $0.00',
      'Total Amount: $4,500.00',
    ].join('\n'),
  },
];

for (const doc of DOCUMENTS) {
  const buf = renderDocumentPng(doc);
  const fullPath = path.join(outDir, doc.filename);
  fs.writeFileSync(fullPath, buf);
  console.log(`Generated: ${fullPath} (${(buf.length / 1024).toFixed(1)} KB)`);
}
