import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        surface: '#0b1220',
        card: '#111827',
        border: '#1f2937'
      }
    }
  },
  plugins: []
};

export default config;
