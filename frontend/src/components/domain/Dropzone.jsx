import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileImage, FileText, UploadCloud, X } from 'lucide-react';
import { bytes } from '../../lib/format.js';

const ACCEPT = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const MAX_FILES = 10;
const MAX_SIZE = 15 * 1024 * 1024;

/** Animated multi-file drag & drop zone (PDF + images). */
export default function Dropzone({ files, onChange, disabled = false }) {
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const depth = useRef(0);

  const previews = useMemo(() => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  const add = (list) => {
    setError('');
    const incoming = [...list];
    const rejected = incoming.filter((f) => !ACCEPT.includes(f.type) || f.size > MAX_SIZE);
    const ok = incoming.filter((f) => !rejected.includes(f));
    const merged = [...files];
    for (const f of ok) if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f);
    if (merged.length > MAX_FILES) setError(`Up to ${MAX_FILES} files per batch — extra files were skipped.`);
    else if (rejected.length) setError(`${rejected.length} file(s) skipped — only PDF, PNG, JPG, WEBP up to 15 MB.`);
    onChange(merged.slice(0, MAX_FILES));
  };

  const handlers = disabled ? {} : {
    onDragEnter: (e) => { e.preventDefault(); depth.current++; setDrag(true); },
    onDragOver: (e) => e.preventDefault(),
    onDragLeave: (e) => { e.preventDefault(); if (--depth.current <= 0) { depth.current = 0; setDrag(false); } },
    onDrop: (e) => { e.preventDefault(); depth.current = 0; setDrag(false); add(e.dataTransfer.files); },
  };

  return (
    <div>
      <motion.div
        {...handlers}
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !disabled && inputRef.current?.click()}
        animate={{ scale: drag ? 1.015 : 1 }}
        className={`relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[28px] px-6 py-14 text-center transition-colors sm:py-20 ${
          drag ? 'bg-emerald-500/10' : 'bg-white/50 hover:bg-white/80 dark:bg-slate-900/40 dark:hover:bg-slate-900/60'
        } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      >
        {/* Animated dashed border */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <rect x="1" y="1" rx="27" fill="none" style={{ width: 'calc(100% - 2px)', height: 'calc(100% - 2px)' }}
            strokeWidth="2" strokeDasharray="10 14"
            className={`${drag ? 'stroke-emerald-500' : 'stroke-slate-300 dark:stroke-slate-700'} animate-dash`} />
        </svg>
        <div className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${drag ? 'opacity-100' : 'opacity-0'}`}
          style={{ background: 'radial-gradient(600px circle at 50% 40%, rgba(16,185,129,.18), transparent 60%)' }} />

        <motion.div animate={drag ? { y: -8, scale: 1.1 } : { y: [0, -6, 0] }} transition={drag ? { type: 'spring' } : { duration: 3, repeat: Infinity }}
          className="relative mb-5 grid h-20 w-20 place-items-center rounded-[26px] bg-gradient-to-br from-emerald-400 to-indigo-500 text-white shadow-glow">
          <UploadCloud size={36} />
        </motion.div>
        <p className="relative font-display text-lg font-bold sm:text-xl">{drag ? 'Release to add documents' : 'Drag & drop POs, receipts and invoices'}</p>
        <p className="muted relative mt-1 text-sm">or <span className="font-semibold text-emerald-600 dark:text-emerald-400">browse files</span> · PDF, PNG, JPG, WEBP · up to {MAX_FILES} files</p>
        <div className="relative mt-5 flex flex-wrap justify-center gap-2 text-[11px] font-semibold">
          {['Purchase Orders', 'Delivery Receipts / GRN', 'Invoices'].map((l) => (
            <span key={l} className="rounded-full bg-slate-900/5 px-3 py-1 dark:bg-white/10">{l}</span>
          ))}
        </div>
        <input ref={inputRef} type="file" multiple hidden accept={ACCEPT.join(',')} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </motion.div>

      {error && <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">{error}</p>}

      <AnimatePresence initial={false}>
        {files.length > 0 && (
          <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4 grid gap-2 sm:grid-cols-2">
            <AnimatePresence>
              {files.map((f, i) => (
                <motion.li key={f.name + f.size} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                  className="glass flex items-center gap-3 rounded-2xl p-2.5">
                  {previews[i] ? (
                    <img src={previews[i]} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-500/10 text-rose-500">
                      {f.type === 'application/pdf' ? <FileText size={20} /> : <FileImage size={20} />}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{f.name}</p>
                    <p className="muted text-xs">{bytes(f.size)} · {f.type === 'application/pdf' ? 'PDF' : 'Image'}</p>
                  </div>
                  {!disabled && (
                    <button onClick={() => onChange(files.filter((x) => x !== f))} className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-rose-500/10 hover:text-rose-500" aria-label={`Remove ${f.name}`}>
                      <X size={16} />
                    </button>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
