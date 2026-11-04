import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        argus: {
          bg:          "#0b0d0c",
          bg2:         "#0f1211",
          amber:       "#d9b36c",
          amberDim:    "#a6854b",
          amberBright: "#f0d49a",
          green:       "#173a31",
          greenLight:  "#5fc7b0",
          red:         "#e5624f",
          redDim:      "#4a221c",
          text:        "#e6e1d3",
          textDim:     "#9b9a8d",
          textFaint:   "#64675f",
          textBright:  "#f7f3e8",
          border:      "#232a27",
          borderBright:"#36403c",
          surface:     "#131716",
          surfaceHi:   "#191e1c",
          blue:        "#1b2a3d",
          blueLight:   "#7fa8e0",
          input:       "#101413",
          inputBorder: "#2d3633",
          peacock:     "#2e8f87",
          violet:      "#9b8ad8",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
        sans: ["Instrument Sans", "Inter", "sans-serif"],
        serif: ["Fraunces", "Georgia", "serif"],
      },
      keyframes: {
        "pulse-soft":     { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.6" } },
        "pulse-rapid":    { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.3" } },
        "spin-slow":      { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
        "flash-complete": { "0%": { opacity: "0", filter: "brightness(3)" }, "30%": { opacity: "1", filter: "brightness(2)" }, "100%": { opacity: "0.9", filter: "brightness(1)" } },
        "glow-amber":     { "0%, 100%": { boxShadow: "0 0 6px rgba(240,165,0,0.4)" }, "50%": { boxShadow: "0 0 16px rgba(240,165,0,0.8)" } },
        "glow-green":     { "0%, 100%": { boxShadow: "0 0 4px rgba(57,211,83,0.4)" }, "50%": { boxShadow: "0 0 12px rgba(57,211,83,0.7)" } },
        "glow-blue":      { "0%, 100%": { boxShadow: "0 0 4px rgba(90,175,239,0.3)" }, "50%": { boxShadow: "0 0 12px rgba(90,175,239,0.7)" } },
        "fade-in":        { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        "pulse-soft":     "pulse-soft 3s ease-in-out infinite",
        "pulse-rapid":    "pulse-rapid 0.8s ease-in-out infinite",
        "spin-slow":      "spin-slow 3s linear infinite",
        "flash-complete": "flash-complete 0.5s ease-out forwards",
        "glow-amber":     "glow-amber 3s ease-in-out infinite",
        "glow-green":     "glow-green 2s ease-in-out infinite",
        "glow-blue":      "glow-blue 0.8s ease-in-out infinite",
        "fade-in":        "fade-in 0.2s ease-out forwards",
      },
    },
  },
  plugins: [],
};

export default config;
