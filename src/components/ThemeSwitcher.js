// src/components/ThemeSwitcher.js
import { useEffect, useState } from "react";

const SunIcon = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8 18.4 18.4M18.4 5.6 19.8 4.2M4.2 19.8 5.6 18.4" />
  </svg>
);

const MoonIcon = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
  </svg>
);

const LIGHT = { bg: "#ffffff", text: "#111827", border: "rgba(0,0,0,.25)", hover: "rgba(0,0,0,.06)" };
const DARK  = { bg: "#0b1220", text: "#e5e7eb", border: "rgba(255,255,255,.25)", hover: "rgba(255,255,255,.08)" };

export default function ThemeSwitcher() {
  const getInitial = () => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  const [theme, setTheme] = useState(getInitial);

  useEffect(() => {
  document.documentElement.setAttribute("data-bs-theme", theme);
  document.documentElement.style.setProperty(
    "--nav-divider",
    theme === "dark" ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.12)"
  );
  localStorage.setItem("theme", theme);
}, [theme]);

  const c = theme === "dark" ? DARK : LIGHT;

  return (
    <button
      aria-label="Toggle theme"
      title={theme === "dark" ? "Switch to light" : "Switch to dark"}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40, height: 40, padding: 0,
        borderRadius: 10, border: `1px solid ${c.border}`,
        background: "transparent", color: c.text, cursor: "pointer"
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = c.hover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
