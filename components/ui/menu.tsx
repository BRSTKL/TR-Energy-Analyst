"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronDown, type LucideIcon } from "lucide-react";

/**
 * Açılır menü (radix menüsü pakette yok): `<details>` tabanlı; dışarı tıklayınca ve Esc ile kapanır. `items` bağlantı listesi
 * verir; `children` verilirse panel serbest içerik taşır (ör. kendi açılır pencereli düğmeler).
 */

export interface MenuLink {
  href: string;
  label: string;
  icon?: LucideIcon;
  hint?: string;
}

export function Menu({
  label,
  items,
  children,
  active = false,
  align = "left",
  className = "",
}: {
  label: React.ReactNode;
  items?: MenuLink[];
  children?: React.ReactNode;
  active?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e.type === "keydown") {
        if ((e as KeyboardEvent).key !== "Escape") return;
        el.open = false;
        el.querySelector("summary")?.focus();
        return;
      }
      if (!el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  return (
    <details ref={ref} className={`group relative ${className}`}>
      <summary
        className={`flex cursor-pointer list-none items-center gap-1 rounded-md px-3 py-2 text-sm transition-colors marker:hidden hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 [&::-webkit-details-marker]:hidden ${
          active ? "font-medium text-indigo-700" : "text-slate-600"
        }`}
      >
        {label}
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div
        className={`absolute top-full z-40 mt-1 min-w-56 rounded-lg border bg-white p-1.5 shadow-lg ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {items?.map((it) => {
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              title={it.hint}
              onClick={() => {
                if (ref.current) ref.current.open = false;
              }}
              className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              {Icon && <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />}
              {it.label}
            </Link>
          );
        })}
        {children}
      </div>
    </details>
  );
}
