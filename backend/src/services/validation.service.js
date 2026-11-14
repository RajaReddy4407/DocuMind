import { supabase } from '../config/supabase.js';
import { buildGroups, docStatusFor, finalizeGroup, num } from './matching.service.js';
import { validateMatchWithAI } from './gemini.service.js';

/** Every query here is scoped to a single user_id. */
export async function loadUserDocs(userId) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

function overlayAI(group, ai) {
  const extra = (ai.additional_findings || []).map((f) => ({ ...f, field: f.field || null, source: 'ai' }));
  group.findings = [...group.findings.filter((f) => f.source !== 'ai'), ...extra];
  group.ai = true;
  group.summary = ai.summary;
  group.recommended_actions = ai.recommended_actions?.length ? ai.recommended_actions : group.recommended_actions;
  group.ai_confidence = ai.confidence;
  group.analyzed_at = ai.analyzed_at;
  return finalizeGroup(group, ai.recommendation);
}

/**
 * Re-run three-way matching for all of a user's documents.
 * - Rules engine always runs (fast, deterministic).
 * - When `useAI` is set, Gemini verifies groups (optionally limited to `keys`).
 * - Cached AI verdicts are reused while the group's fingerprint is unchanged.
 * Persists each document's group verdict + derived status.
 */
export async function validateUser(userId, { useAI = false, keys = null, force = false } = {}) {
  const docs = await loadUserDocs(userId);
  const groups = buildGroups(docs);
  const byId = new Map(docs.map((d) => [d.id, d]));

  for (const g of groups) {
    const gdocs = g.documents.map((s) => byId.get(s.id));
    const cached = gdocs.map((d) => d.validation).find((v) => v?.ai && v.fingerprint === g.fingerprint && v.ai_raw);
    const wantAI = useAI && (!keys || keys.has(g.key));

    if (wantAI && (!cached || force)) {
      try {
        const raw = await validateMatchWithAI(g, gdocs);
        raw.analyzed_at = new Date().toISOString();
        g.ai_raw = raw;
        overlayAI(g, raw);
      } catch (e) {
        console.warn('[validation] Gemini verification failed:', e.message);
        g.ai_error = e.message;
        if (cached) { g.ai_raw = cached.ai_raw; overlayAI(g, cached.ai_raw); }
      }
    } else if (cached) {
      g.ai_raw = cached.ai_raw;
      overlayAI(g, cached.ai_raw);
    }
  }

  // Persist (only rows that actually changed).
  const groupOf = new Map();
  for (const g of groups) for (const s of g.documents) groupOf.set(s.id, g);

  const updates = [];
  for (const d of docs) {
    const g = groupOf.get(d.id) || null;
    const status = docStatusFor(d, g);
    const validation = g ? stripForStorage(g) : null;
    if (status !== d.status || stable(validation) !== stable(d.validation)) {
      d.status = status;
      d.validation = validation;
      updates.push(
        supabase.from('documents').update({ status, validation }).eq('id', d.id).eq('user_id', userId)
      );
    }
  }
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;

  // Refresh doc summaries with new statuses for the response.
  for (const g of groups) g.documents = g.documents.map((s) => ({ ...s, status: byId.get(s.id).status }));
  return { groups: groups.map(publicGroup), docs };
}

// Postgres jsonb does not preserve key order, so compare with sorted keys.
const stable = (v) => JSON.stringify(v, (_k, val) =>
  val && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.keys(val).sort().map((k) => [k, val[k] === undefined ? null : val[k]]))
    : val);

function stripForStorage(g) {
  const { documents, ...rest } = g;
  return JSON.parse(JSON.stringify({ ...rest, group_key: g.key, document_ids: documents.map((d) => d.id) }));
}

function publicGroup(g) {
  const { ai_raw, fingerprint, ...rest } = g;
  return rest;
}

export function summarizeGroups(groups) {
  return {
    total_groups: groups.length,
    on_hold: groups.filter((g) => g.recommendation === 'HOLD_PAYMENT').length,
    review: groups.filter((g) => g.recommendation === 'REVIEW').length,
    approved: groups.filter((g) => g.recommendation === 'APPROVE').length,
    awaiting: groups.filter((g) => g.recommendation === 'AWAIT_INVOICE').length,
    critical: groups.reduce((s, g) => s + g.counts.critical, 0),
    warnings: groups.reduce((s, g) => s + g.counts.warning, 0),
    amount_at_risk: Math.round(groups.reduce((s, g) => s + (num(g.amount_at_risk) || 0), 0) * 100) / 100,
    duplicates: groups.reduce((s, g) => s + g.findings.filter((f) => f.type === 'duplicate_invoice').length, 0),
  };
}
