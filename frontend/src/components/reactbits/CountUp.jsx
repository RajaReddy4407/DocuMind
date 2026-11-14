import { useEffect, useState } from 'react';
import { animate } from 'framer-motion';

/** Reactbits-style Count Up number. */
export default function CountUp({ to = 0, duration = 1.4, format = (v) => Math.round(v).toLocaleString(), className = '' }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const controls = animate(0, Number(to) || 0, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: setVal });
    return () => controls.stop();
  }, [to, duration]);
  return <span className={`tabular-nums ${className}`}>{format(val)}</span>;
}
