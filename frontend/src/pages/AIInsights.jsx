import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, RotateCcw, Send, Sparkles, User } from 'lucide-react';
import api, { errorMessage } from '../api/client.js';
import PageHeader from '../components/layout/PageHeader.jsx';
import MagnetButton from '../components/reactbits/MagnetButton.jsx';
import ShinyText from '../components/reactbits/ShinyText.jsx';

const PROMPTS = [
  'Which invoices should we put on payment hold and why?',
  'Summarize all quantity mismatches between delivery receipts and invoices.',
  'Are there any duplicate invoices or over-billed line items?',
  'Break down our total spend by vendor.',
];

export default function AIInsights() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm **DocuMind AI**, your procurement & accounts-payable co-pilot. Ask me anything about your uploaded purchase orders, delivery receipts, invoices, vendor spend or three-way matching discrepancies.",
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput('');
    const next = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setBusy(true);
    try {
      const { data } = await api.post('/documents/assistant/chat', {
        message: q,
        history: next.slice(1, -1),
      });
      setMessages((m) => [...m, { role: 'assistant', content: data.answer }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${errorMessage(e)}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="AI Insights & Assistant"
        title="Ask your procurement data"
        subtitle="Documents are read by Cloud OCR and reasoned over by the LLM — grounded strictly in your POs, GRNs and invoices."
        actions={
          messages.length > 1 && (
            <button onClick={() => setMessages(messages.slice(0, 1))} className="btn-ghost h-10 text-xs">
              <RotateCcw size={14} /> Clear chat
            </button>
          )
        }
      />

      <div className="card flex h-[calc(100vh-15rem)] min-h-[28rem] flex-col overflow-hidden p-4 sm:p-5">
        {/* Prompt chips */}
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {PROMPTS.map((p) => (
            <button key={p} onClick={() => send(p)} disabled={busy}
              className="glass shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition hover:border-emerald-500/40">
              <Sparkles size={11} className="mr-1 inline text-emerald-500" /> {p}
            </button>
          ))}
        </div>

        {/* Message stream */}
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {messages.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-indigo-500 text-white shadow-glow">
                  <Bot size={18} />
                </span>
              )}
              <div className={`max-w-2xl whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-glow dark:text-slate-950'
                  : 'glass'
              }`}>
                {m.content}
              </div>
              {m.role === 'user' && (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-slate-200 dark:bg-white/10">
                  <User size={17} />
                </span>
              )}
            </motion.div>
          ))}
          {busy && (
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-indigo-500 text-white">
                <Bot size={18} className="animate-pulse" />
              </span>
              <div className="glass rounded-3xl px-4 py-2.5 text-xs font-semibold">
                <ShinyText>Auditing your POs, GRNs and invoices…</ShinyText>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="mt-3 flex items-center gap-2 border-t border-slate-200/70 pt-3 dark:border-white/10">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about discrepancies, vendor spend, PO status…"
            className="input h-12 flex-1"
            disabled={busy}
          />
          <MagnetButton type="submit" disabled={!input.trim() || busy} className="btn-primary h-12 px-5">
            <Send size={17} /> Send
          </MagnetButton>
        </form>
      </div>
    </>
  );
}
