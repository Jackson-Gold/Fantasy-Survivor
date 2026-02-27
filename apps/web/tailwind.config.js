/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sand: {
          50: '#fdfbf7',
          100: '#f8f3e8',
          200: '#efe6d4',
          300: '#e0d0b4',
          400: '#c9b896',
          500: '#a8906c',
        },
        ocean: {
          500: '#1e6bb8',
          600: '#155a9e',
          700: '#0e4c92',
          800: '#0a3a6e',
          900: '#06284a',
          950: '#031425',
        },
        jungle: {
          500: '#3d9b4e',
          600: '#2d8a3e',
          700: '#237032',
          800: '#1a5626',
          900: '#0f3d1a',
        },
        ember: {
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
        },
        torch: '#e85d04',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['"Bebas Neue"', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'tribal-pattern': 'radial-gradient(ellipse at 20% 80%, rgba(234, 88, 12, 0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(14, 76, 146, 0.08) 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, rgba(45, 138, 62, 0.06) 0%, transparent 70%)',
        'beach-gradient': 'linear-gradient(180deg, #f8f3e8 0%, #efe6d4 40%, #e0d0b4 100%)',
      },
      boxShadow: {
        'card': '0 4px 20px rgba(6, 40, 74, 0.12), 0 0 0 1px rgba(6, 40, 74, 0.06)',
        'card-hover': '0 8px 30px rgba(6, 40, 74, 0.18), 0 0 0 1px rgba(6, 40, 74, 0.08)',
        'torch': '0 0 20px rgba(232, 93, 4, 0.35)',
      },
    },
  },
  plugins: [],
};
