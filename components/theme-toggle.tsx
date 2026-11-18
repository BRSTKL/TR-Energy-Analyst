"use client";

/**
 * Açık / karanlık mod düğmesi (18.11.2026). Seçim tarayıcıda saklanır (`tre-theme`); varsayılan açık mod. Sayfa açılırken
 * titreme olmasın diye sınıf, app/layout.tsx'teki küçük betikle boyamadan önce kurulur; bu düğme yalnız değiştirir.
 */
import React, { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export const THEME_KEY = "tre-theme";

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      /* gizli pencere: yalnız bu sekmede geçerli */
    }
    setDark(next);
  };
  const label = dark ? "Açık moda geç" : "Karanlık moda geç";
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className="shrink-0 rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
    >
      {dark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
