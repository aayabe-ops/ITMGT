/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Identidade Emergent Cold LatAm
        navy: {
          DEFAULT: '#1C2543', 50: '#f4f5f8', 100: '#e5e7ef', 200: '#c5cadd', 300: '#9aa2c0',
          400: '#5f6a95', 500: '#3a4570', 600: '#29335a', 700: '#1f284a', 800: '#1C2543', 900: '#141a30',
        },
        bordeaux: {
          DEFAULT: '#92223E', 50: '#fbeef1', 100: '#f6dae1', 200: '#eab2c0', 300: '#dd8399',
          400: '#c14e6c', 500: '#92223E', 600: '#7d1c35', 700: '#67172c', 800: '#511224', 900: '#3d0e1b',
        },
        // Rampa "blue" remapeada para o azul da marca (#0F4C81) — todos os blue-* existentes já adotam a marca.
        blue: {
          50: '#eef4fa', 100: '#d6e6f2', 200: '#adcce5', 300: '#7dabd3', 400: '#4886bd',
          500: '#1f6aa8', 600: '#0F4C81', 700: '#0c3f6c', 800: '#0a3357', 900: '#082944',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Segoe UI"', 'system-ui', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
