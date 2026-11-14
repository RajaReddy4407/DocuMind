import { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

/** Reactbits-style Tilted Card: 3D tilt toward the cursor with a glare highlight. */
export default function TiltedCard({ children, className = '', max = 8 }) {
  const ref = useRef(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 200, damping: 18 });
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 200, damping: 18 });
  const glare = useTransform([px, py], ([x, y]) => `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(255,255,255,.18), transparent 55%)`);

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const reset = () => { px.set(0.5); py.set(0.5); };

  return (
    <div style={{ perspective: 900 }}>
      <motion.div ref={ref} onMouseMove={onMove} onMouseLeave={reset} style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }} className={`relative ${className}`}>
        {children}
        <motion.div className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: glare }} />
      </motion.div>
    </div>
  );
}
