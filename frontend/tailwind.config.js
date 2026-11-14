import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/');

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [`${root}/index.html`, `${root}/src/**/*.{js,jsx}`],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(16,185,129,.25), 0 10px 40px -10px rgba(16,185,129,.45)',
        'glow-indigo': '0 0 0 1px rgba(99,102,241,.25), 0 10px 40px -10px rgba(99,102,241,.5)',
        'glow-red': '0 0 0 1px rgba(244,63,94,.35), 0 0 24px -4px rgba(244,63,94,.6)',
        'glow-amber': '0 0 0 1px rgba(245,158,11,.35), 0 0 24px -6px rgba(245,158,11,.55)',
        soft: '0 1px 2px rgba(15,23,42,.04), 0 8px 24px -8px rgba(15,23,42,.12)',
      },
      keyframes: {
        shine: { '0%': { backgroundPosition: '200% center' }, '100%': { backgroundPosition: '-200% center' } },
        pulseGlow: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.55 } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        dash: { to: { strokeDashoffset: '-24' } },
      },
      animation: {
        shine: 'shine 4s linear infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        float: 'float 4s ease-in-out infinite',
        dash: 'dash 1s linear infinite',
      },
    },
  },
  plugins: [],
};
