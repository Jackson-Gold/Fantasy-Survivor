/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sand: { 50: '#fdfcfb', 100: '#f9f6f0', 200: '#f0e9dc', 300: '#e2d4c2', 400: '#c4ad8f' },
        ocean: { 700: '#0e4c92', 800: '#0a3a6e', 900: '#06284a', 950: '#031425' },
        jungle: { 600: '#2d8a3e', 700: '#237032', 800: '#1a5626' },
        ember: { 500: '#f97316', 600: '#ea580c', 700: '#c2410c' },
      },
      fontFamily: {
        sans: ['system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
