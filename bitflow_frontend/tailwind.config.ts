import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // ── Color palette — industrial phosphor terminal ─────────────────────
      colors: {
        // Backgrounds (darkest → lightest)
        void:    "#07080a",   // page bg
        pit:     "#0d0e11",   // panel bg
        shaft:   "#13141a",   // editor bg
        surface: "#1a1b22",   // raised elements (toolbar, tab bar)
        rim:     "#22232d",   // borders
        muted:   "#2e3040",   // disabled / inactive borders

        // Text
        dim:     "#80839d",   // placeholder, tertiary text (≥4.5:1 on every bg up to surface)
        ghost:   "#9598ac",   // secondary labels (≥6:1)
        pale:    "#b0b3cc",   // body text
        bright:  "#e8eaf6",   // primary text / headings

        // Phosphor green accent
        phosphor: {
          DEFAULT: "#00e87a",
          dim:     "#00b05c",
          glow:    "#00ff88",
          faint:   "#003d22",
        },

        // Status colours
        danger:  "#ff4f4f",
        warn:    "#ffb84d",
        info:    "#4db8ff",
      },

      // ── Typography ───────────────────────────────────────────────────────
      fontFamily: {
        // Headings, branding, body copy — Inter, site-wide
        display: ["var(--font-display)", "sans-serif"],
        // Legacy class name used for big headings across pages — also Inter now
        serif:   ["var(--font-display)", "sans-serif"],
        // ONLY for genuinely-code contexts: terminal output, compiler logs,
        // waveform labels — real monospace alignment matters here.
        mono:    ["var(--font-mono)", "monospace"],
      },

      // ── Animations ───────────────────────────────────────────────────────
      keyframes: {
        // Cursor blink in terminal
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0" },
        },
        // Subtle pulse for the run button while simulating
        pulse_soft: {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.6" },
        },
        // Slide-up for terminal lines appearing
        slide_up: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        // Glow throb for status dot
        glow: {
          "0%, 100%": { boxShadow: "0 0 4px 1px #00e87a66" },
          "50%":      { boxShadow: "0 0 10px 3px #00e87acc" },
        },
        // Floating up and down for the 3D chip
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%":      { transform: "translateY(-15px)" },
        },
        // Signal pulse travelling along a PCB trace (stroke-dashoffset)
        dash: {
          to: { strokeDashoffset: "0" },
        },
        // Section reveal on load — content settles up into place
        fade_up: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        // Continuous signal flowing along a trace (loops, unlike one-shot `dash`)
        trace_flow: {
          from: { strokeDashoffset: "100" },
          to:   { strokeDashoffset: "0" },
        },
        // Gentle opacity pulse — golden-ratio rings, pads
        pulse_glow: {
          "0%, 100%": { opacity: "0.4" },
          "50%":      { opacity: "1" },
        },
        // Higher-contrast pulse — die cells "lighting up"
        cell_pulse: {
          "0%, 100%": { opacity: "0.12" },
          "50%":      { opacity: "0.85" },
        },
        // Chip mascot antenna idle wiggle
        wiggle: {
          "0%, 100%": { transform: "rotate(-5deg)" },
          "50%":      { transform: "rotate(5deg)" },
        },
        // Antenna wags hard while the mascot hops — excited puppy energy
        wiggle_fast: {
          "0%, 100%": { transform: "rotate(-24deg)" },
          "50%":      { transform: "rotate(24deg)" },
        },
        // Glowing text — signup/login toggle link
        text_glow: {
          "0%, 100%": { textShadow: "0 0 4px rgba(0,232,122,0.4)" },
          "50%":      { textShadow: "0 0 12px rgba(0,232,122,0.95)" },
        },
        // Head shake reaction on incorrect login
        shake_x: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%":      { transform: "translateX(-8px)" },
          "40%":      { transform: "translateX(8px)" },
          "60%":      { transform: "translateX(-6px)" },
          "80%":      { transform: "translateX(6px)" },
        },
        // Right-click reaction — mascot hops up like an excited pup
        jump: {
          "0%":       { transform: "translateY(0)" },
          "35%":      { transform: "translateY(-30px)" },
          "55%":      { transform: "translateY(-30px)" },
          "100%":     { transform: "translateY(0)" },
        },
      },
      animation: {
        blink:      "blink 1.1s step-end infinite",
        pulse_soft: "pulse_soft 1.5s ease-in-out infinite",
        slide_up:   "slide_up 0.15s ease-out both",
        glow:       "glow 2s ease-in-out infinite",
        float:      "float 4s ease-in-out infinite",
        dash:       "dash 2.4s linear forwards",
        fade_up:    "fade_up 0.5s ease-out both",
        trace_flow: "trace_flow 1.9s linear infinite",
        pulse_glow: "pulse_glow 6s ease-in-out infinite",
        cell_pulse: "cell_pulse 2.4s ease-in-out infinite",
        wiggle:      "wiggle 2.6s ease-in-out infinite",
        wiggle_fast: "wiggle_fast 0.14s ease-in-out infinite",
        text_glow:  "text_glow 2s ease-in-out infinite",
        shake_x:    "shake_x 0.5s ease-in-out",
        jump:       "jump 0.5s cubic-bezier(0.34,1.56,0.64,1)",
      },

      // ── Spacing extras ───────────────────────────────────────────────────
      height: {
        toolbar:  "48px",
        tabbar:   "36px",
        terminal: "240px",
      },
    },
  },
  plugins: [],
};

export default config;
