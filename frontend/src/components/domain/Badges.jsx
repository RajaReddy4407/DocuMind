import { DOC_TYPES, STATUS } from '../../lib/format.js';

export function TypeBadge({ type }) {
  const t = DOC_TYPES[type] || DOC_TYPES.unknown;
  const Icon = t.icon;
  return (
    <span className={`pill ${t.cls}`}>
      <Icon size={12} /> {t.label}
    </span>
  );
}

export function StatusPill({ status }) {
  const s = STATUS[status] || STATUS.processed;
  return (
    <span className={`pill ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${status === 'mismatch' || status === 'processing' ? 'animate-pulse' : ''}`} />
      {s.label}
    </span>
  );
}
