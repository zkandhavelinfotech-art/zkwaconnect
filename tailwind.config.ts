import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./app/**/*.{ts,tsx}','./components/**/*.{ts,tsx}','./lib/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: {
      brand: { DEFAULT:'#075E54', light:'#128C7E', dark:'#054840' },
      wa:    { DEFAULT:'#25D366', dark:'#1ebe58' },
    },
    fontFamily: {
      sans:    ['DM Sans','sans-serif'],
      display: ['Sora','sans-serif'],
      mono:    ['JetBrains Mono','monospace'],
    },
  }},
  plugins: [],
}
export default config
