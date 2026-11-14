import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase.js';
import { authMiddleware, signToken } from '../middleware/auth.middleware.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, created_at: u.created_at });

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body ?? {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();

  if (!cleanName) return res.status(400).json({ error: 'Name is required' });
  if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'A valid email is required' });
  if (String(password || '').length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const { data: existing, error: findErr } = await supabase
    .from('users').select('id').eq('email', cleanEmail).maybeSingle();
  if (findErr) throw findErr;
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const password_hash = await bcrypt.hash(password, 12);
  const { data: user, error } = await supabase
    .from('users')
    .insert({ name: cleanName, email: cleanEmail, password_hash })
    .select('id, name, email, created_at')
    .single();
  if (error) throw error;

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const cleanEmail = String(email || '').trim().toLowerCase();

  const { data: user, error } = await supabase
    .from('users').select('id, name, email, password_hash, created_at').eq('email', cleanEmail).maybeSingle();
  if (error) throw error;

  const ok = user && (await bcrypt.compare(String(password || ''), user.password_hash));
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', authMiddleware, async (req, res) => {
  const { data: user, error } = await supabase
    .from('users').select('id, name, email, created_at').eq('id', req.user.id).maybeSingle();
  if (error) throw error;
  if (!user) return res.status(401).json({ error: 'Account no longer exists' });
  res.json({ user: publicUser(user) });
});

export default router;
