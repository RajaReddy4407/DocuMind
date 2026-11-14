import SplitText from '../reactbits/SplitText.jsx';
import BlurText from '../reactbits/BlurText.jsx';

export default function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">{eyebrow}</p>}
        <SplitText text={title} className="text-3xl font-extrabold sm:text-4xl" />
        {subtitle && <BlurText text={subtitle} delay={0.25} stagger={0.03} className="muted mt-2 max-w-2xl text-sm sm:text-base" />}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
