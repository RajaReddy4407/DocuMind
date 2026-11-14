import { Link } from 'react-router-dom';

export default function Logo({ compact = false }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="relative grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-indigo-500 shadow-glow">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M9.5 14l2 2 4-4.5" />
        </svg>
      </span>
      {!compact && (
        <span className="font-display text-lg font-extrabold tracking-tight">
          DocuMind<span className="text-gradient"> AI</span>
        </span>
      )}
    </Link>
  );
}
