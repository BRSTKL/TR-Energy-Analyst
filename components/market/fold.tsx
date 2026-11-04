"use client";

import React from "react";
import { ChevronDown } from "lucide-react";

/**
 * Kapalı bölüm: başlık ve sağda kısa bir özet satırı ("2 yukarı, 1 aşağı"); açılınca ayrıntı. Teklif öncesi sayfasında ana
 * karar (fiyat, riskli saatler, tablo) açık, açıklama ve ölçüm kapalı durur. `open` + `onToggle` verilirse dışarıdan
 * denetlenir (bir kartın "ayrıntı" bağlantısı bölümü açabilsin diye).
 */
export function Fold({
  title,
  hint,
  children,
  id,
  open,
  onToggle,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  id?: string;
  open?: boolean;
  onToggle?: (open: boolean) => void;
}) {
  return (
    <details
      id={id}
      className="group"
      open={open}
      onToggle={onToggle ? (e) => onToggle((e.target as HTMLDetailsElement).open) : undefined}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-slate-900">{title}</span>
        <span className="flex min-w-0 items-center gap-2 text-slate-500">
          {hint && <span className="truncate text-xs sm:text-sm">{hint}</span>}
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
        </span>
      </summary>
      <div className="space-y-4 border-t border-slate-100 px-4 py-4">{children}</div>
    </details>
  );
}

/** Kapalı bölümlerin ortak çerçevesi */
export function FoldList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-slate-200 overflow-hidden rounded-lg border bg-white shadow-sm">{children}</div>;
}
