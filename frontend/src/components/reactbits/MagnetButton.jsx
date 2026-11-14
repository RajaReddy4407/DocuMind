import { useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

/**
 * Reactbits-style Magnet Button: the button is pulled toward the cursor
 * when it enters an invisible field around it, then springs back.
 */
export default function MagnetButton({ children, className = '', strength = 0.3, field = 40, wrapperClassName = '', ...props }) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 14, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 14, mass: 0.4 });
  // Inner label moves a little further for a parallax feel.
  const ix = useSpring(x, { stiffness: 260, damping: 18 });
  const iy = useSpring(y, { stiffness: 260, damping: 18 });

  const onMove = (e) => {
    if (props.disabled) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const reset = () => { x.set(0); y.set(0); };

  return (
    <div
      className={`inline-flex ${wrapperClassName}`}
      style={{ padding: field, margin: -field }}
      onMouseMove={onMove}
      onMouseLeave={reset}
    >
      <motion.button
        ref={ref}
        style={{ x: sx, y: sy }}
        whileTap={{ scale: 0.95 }}
        className={className}
        {...props}
      >
        <motion.span className="inline-flex items-center gap-2" style={{ x: ix, y: iy }}>
          {children}
        </motion.span>
      </motion.button>
    </div>
  );
}
