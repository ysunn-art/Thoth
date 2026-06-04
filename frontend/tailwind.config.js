/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // T-Mobile magenta — primary brand color
        magenta: {
          DEFAULT: "#e20074",
          tint: "rgba(226,0,116,0.1)",
        },
        border: "#e5e5e5",
        muted: "#f5f5f5",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
