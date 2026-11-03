/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        ink: { 950: '#07080b', 900: '#0c0e13', 850: '#11141a', 800: '#161a22', 700: '#222834', 600: '#2f3746', 400: '#7c8699', 300: '#a3acbd' },
        slow: '#2dd4bf',
        mod: '#fbbf24',
        agg: '#f43f5e',
      },
    },
  },
  plugins: [],
};
