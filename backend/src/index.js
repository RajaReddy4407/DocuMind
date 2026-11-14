import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import express from 'express';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), override: true });
import cors from 'cors';
import multer from 'multer';
import authRoutes from './routes/auth.routes.js';
import documentRoutes from './routes/document.routes.js';
import { authMiddleware } from './middleware/auth.middleware.js';

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = '9f4a8c2e7b1d6a3f0e5c8b2d7a4f1e9c6b3d0a7f4e2c9b6d1a8f5e3c0b7d4a1e';
}

const app = express();
const origins = process.env.CLIENT_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean);

app.use(cors({ origin: origins?.length ? origins : true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, gemini: Boolean(process.env.GEMINI_API_KEY), supabase: Boolean(process.env.SUPABASE_URL) })
);

app.use('/api/auth', authRoutes);
app.use('/api/documents', authMiddleware, documentRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Express 5 forwards async errors here automatically.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Each file must be 15 MB or smaller'
      : err.code === 'LIMIT_FILE_COUNT' ? 'You can upload up to 10 files at once' : err.message;
    return res.status(400).json({ error: msg });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Internal server error' });
});

import http from 'node:http';

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 5001;
  const server = http.createServer(app);
  server.on('error', (err) => {
    console.error('[server] Failed to bind port:', err.message);
  });
  server.listen(port, () => {
    console.log(`DocuMind AI API (OCR + LLM v2) running on http://localhost:${port}`);
  });
  // Keep event loop active in Node 26 watch mode
  setInterval(() => {}, 1 << 30);
}

export default app;
