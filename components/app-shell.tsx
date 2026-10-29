"use client";

/**
 * Uygulama kabuğu: sol menü (lg+), üstte saat şeridi, telefonda çekmece ve altta dört kısayol.
 * Menü yapısı `components/nav/nav-config.ts`'den gelir (tek kaynak). Giriş sayfasında ve baskıda görünmez.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Zap } from "lucide-react";
import { DayStrip } from "@/components/day-strip";
import {
  activeNavId,
  hidesShell,
  MOBILE_BAR,
  NAV_FOOTER,
  NAV_GROUPS,
  navItem,
  type NavItem,
} from "@/components/nav/nav-config";
import { dayPhase, formatCountdown } from "@/lib/ui/day-phase";
import { forecastHref, LAST_PROJECT_EVENT, readLastProject } from "@/lib/ui/last-project";
import { useTrMinutes } from "@/lib/ui/use-tr-clock";

function useLastProject(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setId(readLastProject());
    read();
    window.addEventListener(LAST_PROJECT_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(LAST_PROJECT_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return id;
}

function NavLink({
  item,
  active,
  href,
  badge,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  href: string;
  badge?: { text: string; urgent: boolean } | null;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={href}
      title={item.hint}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 ${
        active
          ? "bg-indigo-50 font-medium text-indigo-700"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon
          className={`h-4 w-4 shrink-0 ${active ? "text-indigo-600" : "text-slate-400"}`}
          aria-hidden="true"
        />
        <span className="truncate">{item.label}</span>
      </span>
      {badge && (
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
            badge.urgent ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
          }`}
        >
          {badge.text}
        </span>
      )}
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? "/";
  const active = activeNavId(pathname);
  const minutes = useTrMinutes();
  const lastProject = useLastProject();
  const phase = minutes === null ? null : dayPhase(minutes);
  const closeBadge =
    phase && phase.id === "closing" && phase.minutesToClose !== null
      ? { text: formatCountdown(phase.minutesToClose), urgent: phase.urgent }
      : null;
  const hrefOf = (it: NavItem) =>
    it.id === "forecast" ? forecastHref(lastProject) : it.href;
  return (
    <nav
      aria-label="Ana menü"
      className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-3"
    >
      {NAV_GROUPS.map((g) => (
        <div key={g.id}>
          <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {g.label}
          </p>
          <div className="space-y-0.5">
            {g.items.map((it) => (
              <NavLink
                key={it.id}
                item={it}
                href={hrefOf(it)}
                active={active === it.id}
                badge={it.id === "pre-bid" ? closeBadge : null}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="mt-auto space-y-0.5 border-t pt-3">
        {NAV_FOOTER.map((it) => (
          <NavLink
            key={it.id}
            item={it}
            href={it.href}
            active={active === it.id}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </nav>
  );
}

function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow">
        <Zap className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="text-sm font-bold tracking-tight text-slate-900">
        TR-Energy Analyst
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [drawer, setDrawer] = useState(false);
  const lastProject = useLastProject();
  const active = activeNavId(pathname);

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  if (hidesShell(pathname)) return <>{children}</>;

  return (
    <div className="min-h-screen">
      <a
        href="#icerik"
        className="sr-only z-50 rounded-md bg-white px-3 py-2 text-sm font-medium text-indigo-700 shadow focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        İçeriğe geç
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-white lg:flex print:hidden">
        <div className="flex h-12 items-center border-b px-4">
          <Brand />
        </div>
        <NavList />
      </aside>

      <div className="lg:pl-60 print:pl-0">
        <header className="sticky top-0 z-20 flex min-h-12 items-center gap-3 border-b bg-white/95 px-3 py-1.5 backdrop-blur sm:px-4 print:hidden">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Menüyü aç"
            aria-expanded={drawer}
            className="-ml-1 rounded-md p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="lg:hidden">
            <Brand />
          </div>
          <DayStrip />
        </header>
        <main id="icerik" className="pb-20 lg:pb-0 print:pb-0">
          {children}
        </main>
      </div>

      <nav
        aria-label="Kısayollar"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden"
      >
        {MOBILE_BAR.map((id) => {
          const it = navItem(id);
          const Icon = it.icon;
          const on = active === id;
          return (
            <Link
              key={id}
              href={id === "forecast" ? forecastHref(lastProject) : it.href}
              aria-current={on ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${on ? "font-medium text-indigo-700" : "text-slate-500"}`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {it.short ?? it.label}
            </Link>
          );
        })}
      </nav>

      {drawer && (
        <div
          className="fixed inset-0 z-40 lg:hidden print:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menü"
        >
          <button
            type="button"
            aria-label="Menüyü kapat"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setDrawer(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-12 items-center justify-between border-b px-4">
              <Brand />
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Menüyü kapat"
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <NavList onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
