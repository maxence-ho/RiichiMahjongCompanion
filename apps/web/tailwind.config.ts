import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff8ff',
          100: '#dbeafe',
          500: '#1d4ed8',
          700: '#1e3a8a'
        }
      }
    }
  },
  plugins: []
};

export default config;
