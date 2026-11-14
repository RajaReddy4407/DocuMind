# DocuMind AI — Invoice Intelligence & Three-Way Matching

Mobile-first Intelligent Document Processing web app for small businesses that correlates **Purchase Orders (PO)**, **Delivery Receipts (GRN)**, and **Invoices** using **Google Gemini 2.5 Flash** (`@google/genai` with `responseSchema`) and a deterministic three-way matching rules engine.

## Quick Setup (3 Environment Fields)

1. **Create Supabase tables:** Open your Supabase project → **SQL Editor** → paste and run [`backend/supabase/schema.sql`](./backend/supabase/schema.sql).
2. **Fill in [`backend/.env`](./backend/.env):**
   - `SUPABASE_URL` — Supabase Dashboard → *Project Settings → API → Project URL*
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase Dashboard → *Project Settings → API → `service_role` secret*
   - `GEMINI_API_KEY` — [Google AI Studio](https://aistudio.google.com/apikey)
3. **Run the servers:**
   ```bash
   # Terminal 1 — Backend (http://localhost:5000)
   cd documind-ai/backend
   npm run dev

   # Terminal 2 — Frontend (http://localhost:5173)
   cd documind-ai/frontend
   npm run dev
   ```
4. **Offline rules-engine test:**
   ```bash
   cd documind-ai/backend
   npm run test:matching
   ```
