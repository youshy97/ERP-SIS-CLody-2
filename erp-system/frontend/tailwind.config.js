/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: '#0F1B2B',        // deep blueprint navy
        steel: '#22344A',
        slate: '#3D5169',
        line: '#2C4054',
        accent: '#3FA7D6',     // blueprint cyan
        accent2: '#E8A33D',    // hazard amber for warnings/gates
        paper: '#F6F5F1',
        good: '#4C9A6A',
        bad: '#C15A4A',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"IBM Plex Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      backgroundImage: {
        'blueprint-grid': "linear-gradient(rgba(63,167,214,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(63,167,214,0.06) 1px, transparent 1px)",
      },
      backgroundSize: {
        'grid-md': '24px 24px',
      },
    },
  },
  plugins: [],
}
