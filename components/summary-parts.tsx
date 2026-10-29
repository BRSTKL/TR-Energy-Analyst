import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** Özet sayfalarının (Bugün, Portföy özeti) ortak küçük bileşenleri ve biçimleyicileri */

export const nf = (v: number, d = 0) =>
  v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function Kpi({
  label,
  value,
  sub,
  tone = "text-slate-900",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function Skeleton({ h = "h-24" }: { h?: string }) {
  return (
    <div
      className={`${h} animate-pulse rounded-lg border border-slate-200 bg-slate-100/70`}
    />
  );
}

export function SectionHead({
  title,
  sub,
  href,
  cta,
}: {
  title: string;
  sub?: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {sub && <p className="text-sm text-slate-600">{sub}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-900"
        >
          {cta} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
