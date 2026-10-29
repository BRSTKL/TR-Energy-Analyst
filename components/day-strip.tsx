"use client";

/**
 * Üst şerit (her sayfada): Türkiye saati, günün fazı ve teklif kapanışına geri sayım, yarının kayıtlarının durumu.
 * Kayıt durumu `/api/ops/status`'tan (yalnız dosya okur) 5 dakikada bir; alınamazsa rozet gösterilmez, nedeni başlıkta yazar.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { dayPhase, phaseText } from "@/lib/ui/day-phase";
import { opsChips, type ChipTone } from "@/lib/ui/ops-chips";
import { useTrMinutes } from "@/lib/ui/use-tr-clock";
import type { OpsStatus } from "@/lib/services/ops-status";

const WEEKDAY = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const MONTH = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
];
const POLL_MS = 5 * 60_000;

const TONE: Record<ChipTone, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  bad: "border-red-200 bg-red-50 text-red-700",
  wait: "border-slate-200 bg-slate-100 text-slate-600",
};

function trDateLabel(now: number) {
  const w = new Date(now + 3 * 3_600_000);
  const hh = String(w.getUTCHours()).padStart(2, "0");
  const mm = String(w.getUTCMinutes()).padStart(2, "0");
  return `${WEEKDAY[w.getUTCDay()]} ${w.getUTCDate()} ${MONTH[w.getUTCMonth()]} · ${hh}:${mm}`;
}

export function DayStrip() {
  const minutes = useTrMinutes();
  const [status, setStatus] = useState<OpsStatus | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/ops/status")
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          if (!d.success) throw new Error(d.error ?? "Durum alınamadı.");
          setStatus(d as OpsStatus);
          setFailed(null);
        })
        .catch(
          (e) =>
            !cancelled && setFailed(e instanceof Error ? e.message : "Durum alınamadı.")
        );
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (minutes === null) return <div className="h-7 w-full" aria-hidden="true" />;
  const phase = dayPhase(minutes);
  const phaseTone = phase.urgent
    ? "border-red-200 bg-red-50 text-red-700"
    : phase.id === "closing"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-slate-200 bg-white text-slate-700";
  const chips = status ? opsChips(status, minutes) : [];

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <div className="flex min-w-0 items-center gap-2 text-xs">
        <Clock
          className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block"
          aria-hidden="true"
        />
        <span
          className="hidden font-medium tabular-nums text-slate-700 sm:inline"
          suppressHydrationWarning
        >
          {trDateLabel(Date.now())}
        </span>
        <span
          className={`truncate rounded-md border px-2 py-0.5 font-medium ${phaseTone}`}
          role="status"
        >
          {phaseText(phase)}
        </span>
      </div>
      <div
        className="hidden items-center gap-1.5 text-xs sm:flex"
        aria-label="Yarının günlük kayıtları"
      >
        {chips.map((c) => (
          <Link
            key={c.key}
            href="/"
            title={c.title}
            className={`rounded-md border px-2 py-0.5 font-medium tabular-nums ${TONE[c.tone]}`}
          >
            {c.text}
          </Link>
        ))}
        {failed && !status && (
          <span className="text-slate-400" title={failed}>
            kayıt durumu alınamadı
          </span>
        )}
      </div>
    </div>
  );
}
