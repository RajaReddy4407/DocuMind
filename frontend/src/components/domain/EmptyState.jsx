import { motion } from 'framer-motion';

export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="card relative overflow-hidden px-6 py-14 text-center">
      <div className="bg-grid mask-fade absolute inset-0 opacity-50" />
      <div className="relative mx-auto flex max-w-md flex-col items-center">
        <div className="relative mb-5 animate-float">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-emerald-400 to-indigo-500 opacity-40 blur-xl" />
          <div className="relative grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-emerald-400 to-indigo-500 text-white shadow-glow">
            {Icon && <Icon size={28} />}
          </div>
        </div>
        <h3 className="text-xl font-bold">{title}</h3>
        {description && <p className="muted mt-2 text-sm">{description}</p>}
        {action && <div className="mt-6">{action}</div>}
      </div>
    </motion.div>
  );
}
