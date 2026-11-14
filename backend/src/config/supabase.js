import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const url = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && serviceKey);

if (!isSupabaseConfigured) {
  console.warn('[supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — database calls will fail.');
}

// Service-role client: bypasses RLS, so EVERY query in this codebase must filter by user_id.
export const supabase = createClient(url || 'http://localhost:54321', serviceKey || 'missing-key', {
  auth: { persistSession: false, autoRefreshToken: false },
});
