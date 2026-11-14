import { useRef } from 'react';

/** Reactbits-style Spotlight Card: a radial light follows the cursor across the card and its border. */
export default function SpotlightCard({ children, className = '', spotlightColor = 'rgba(16, 185, 129, 0.22)', as: Tag = 'div', ...props }) {
  const ref = useRef(null);

  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--x', `${e.clientX - r.left}px`);
    el.style.setProperty('--y', `${e.clientY - r.top}px`);
  };

  return (
    <Tag ref={ref} onMouseMove={onMove} className={`group/spot card relative overflow-hidden ${className}`} {...props}>
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover/spot:opacity-100"
        style={{ background: `radial-gradient(420px circle at var(--x, 50%) var(--y, 50%), ${spotlightColor}, transparent 60%)` }}
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover/spot:opacity-100"
        style={{
          padding: 1,
          background: `radial-gradient(260px circle at var(--x, 50%) var(--y, 50%), ${spotlightColor.replace(/[\d.]+\)$/, '0.9)')}, transparent 70%)`,
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        }}
      />
      <div className="relative">{children}</div>
    </Tag>
  );
}
