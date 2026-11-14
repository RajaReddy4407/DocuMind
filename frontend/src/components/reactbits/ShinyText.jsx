/** Reactbits-style Shiny Text: a light sweep across the text. */
export default function ShinyText({ children, className = '' }) {
  return <span className={`shiny-text ${className}`}>{children}</span>;
}
