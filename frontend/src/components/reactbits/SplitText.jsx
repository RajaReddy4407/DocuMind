import { motion } from 'framer-motion';

/** Reactbits-style Split Text: characters rise & fade in with a stagger. Words never break mid-word. */
export default function SplitText({ text, as = 'h1', className = '', delay = 0, stagger = 0.025 }) {
  const Tag = motion[as] || motion.h1;
  let i = 0;
  return (
    <Tag key={text} className={className} aria-label={text} initial="hidden" animate="show">
      {text.split(' ').map((word, wi) => (
        <span key={wi} className="inline-block whitespace-nowrap" aria-hidden>
          {[...word].map((ch) => {
            const idx = i++;
            return (
              <motion.span
                key={idx}
                className="inline-block"
                variants={{
                  hidden: { opacity: 0, y: '0.6em', rotateX: -70, filter: 'blur(4px)' },
                  show: { opacity: 1, y: 0, rotateX: 0, filter: 'blur(0px)', transition: { delay: delay + idx * stagger, type: 'spring', damping: 14, stiffness: 180 } },
                }}
              >
                {ch}
              </motion.span>
            );
          })}
          {wi < text.split(' ').length - 1 && <span className="inline-block">&nbsp;</span>}
        </span>
      ))}
    </Tag>
  );
}
