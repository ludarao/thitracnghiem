/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff5f0",
          100: "#ffe6db",
          200: "#ffcbbb",
          300: "#fda18a",
          400: "#ed6b52",
          500: "#dc382c",
          600: "#c51d18",
          700: "#ae1715",
          800: "#901919",
          900: "#741c1b",
        },
        primary: {
          50: "#fff5f0",
          100: "#ffe6db",
          200: "#ffcbbb",
          300: "#fda18a",
          400: "#ed6b52",
          500: "#dc382c",
          600: "#c51d18",
          700: "#ae1715",
          800: "#901919",
          900: "#741c1b",
        },
      },
    },
  },
  plugins: [],
};
