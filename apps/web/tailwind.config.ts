import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT:"#00C853", dark:"#007730" },
      },
      fontFamily: {
        mono: ["JetBrains Mono","Fira Code","Consolas","monospace"],
      },
    },
  },
  plugins: [],
}

export default config
