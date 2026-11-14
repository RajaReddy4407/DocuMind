import { motion } from 'framer-motion';

/** Reactbits-style Blur Text: words resolve from a blur, one after another. */
export default function BlurText({ text, as = 'p', className = '', delay = 0, stagger = 0.06, direction = 'top' }) {
  const Tag = motion[as] || motion.p;
  const words = text.split(' ');
  return (
    <Tag key={text} className={className} initial="hidden" animate="show" aria-label={text}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="inline-block will-change-[filter,transform]"
          variants={{
            hidden: { opacity: 0, filter: 'blur(10px)', y: direction === 'top' ? -12 : 12 },
            show: { opacity: 1, filter: 'blur(0px)', y: 0, transition: { delay: delay + i * stagger, duration: 0.55, ease: [0.16, 1, 0.3, 1] } },
          }}
        >
          {w}
          {i < words.length - 1 && '\u00A0'}
        </motion.span>
      ))}
    </Tag>
  );
}
