"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CompanyRow } from "@/lib/analysis/company-profile";

/**
 * Şirketler: sektör karnesindeki santraller sahip şirkete göre; her satır şirket profiline gider (/sirketler/<ad>).
 * Veri /api/companies'ten gelir. Tahmini kurulu güç içeren toplam `~` ile işaretlenir (CLAUDE.md "Kurulu güç").
 */

const TECH: Record<string, string> = { RES: "rüzgâr", GES: "güneş", HES: "hidro" };
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const day = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

interface ListResponse {
  year: number;
  years: number[];
  period: { start: string; end: string };
  companies: number;
  unknown: { plants: number; mw: number };
  errors: string[];
  total: number;
  items: CompanyRow[];
}

export default function CompaniesPage() {
  const [q, setQ] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [limit, setLimit] = useState(50);
  const [res, setRes] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/companies?q=${encodeURIComponent(q)}&limit=${limit}${year ? `&year=${year}` : ""}`, { signal: ctrl.signal });
        const j = await r.json();
        if (!j.success) throw new Error(j.error ?? "Şirket listesi alınamadı");
        setRes(j);
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(e instanceof Error ? e.message : "Şirket listesi alınamadı");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, year, limit]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Şirketler</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Rüzgâr, güneş ve hidro santralleri sahip şirkete göre: kurulu güç, üretim ve sapmanın maliyeti. Kaynak sektör karnesi.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Şirket ara</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(50);
            }}
            placeholder="Şirket adı"
            className="h-10 w-full rounded-md border bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          />
        </label>
        {res && res.years.length > 1 && (
          <div className="flex gap-1 rounded-lg border bg-white p-1" role="group" aria-label="Yıl">
            {res.years.map((y) => (
              <button
                key={y}
                type="button"
                aria-pressed={res.year === y}
                onClick={() => {
                  setYear(y);
                  setLimit(50);
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${res.year === y ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {y}
              </button>
            ))}
          </div>
        )}
      </div>

      {error ? (
        <Card>
          <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
        </Card>
      ) : !res ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Şirketler yükleniyor
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500" aria-live="polite">
            {res.total === 0
              ? "Eşleşen şirket yok."
              : res.total > res.items.length
                ? `${res.total} şirket eşleşti, ${res.items.length} tanesi gösteriliyor.`
                : `${res.total} şirket`}
            {` · dönem ${day(res.period.start)} – ${day(res.period.end)}`}
            {loading && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" aria-label="Yenileniyor" />}
          </p>
          {res.items.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Şirket</TableHead>
                      <TableHead className="text-right">Santral</TableHead>
                      <TableHead className="text-right">Kurulu güç (MW)</TableHead>
                      <TableHead className="text-right">Üretim (GWh)</TableHead>
                      <TableHead className="text-right">Dengesizlik (TL/MWh)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {res.items.map((c) => (
                      <TableRow key={c.slug}>
                        <TableCell className="font-medium">
                          <Link href={`/sirketler/${c.slug}${year ? `?year=${res.year}` : ""}`} className="text-indigo-700 hover:underline">
                            {c.name}
                          </Link>
                          <div className="text-xs font-normal text-slate-500">{c.byType.map((t) => `${t.plants} ${TECH[t.type]}`).join(" · ")}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.plants}</TableCell>
                        <TableCell className="text-right tabular-nums" title={c.estimatedMw > 0 ? `${nf(c.estimatedMw, 1)} MW'ı tahmin (en yüksek üretim, alt sınır)` : undefined}>
                          {c.estimatedMw > 0 ? "~" : ""}
                          {nf(c.mw, 1)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{nf(c.actualMwh / 1000, 1)}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.unitImbalanceTl === null ? "–" : nf(c.unitImbalanceTl, 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          {res.total > res.items.length && limit < 500 && (
            <button
              type="button"
              onClick={() => setLimit((n) => Math.min(500, n + 100))}
              className="h-9 rounded-md border bg-white px-4 text-sm font-medium hover:bg-slate-50"
            >
              Daha fazla göster
            </button>
          )}
          <div className="space-y-1 text-xs text-slate-500">
            <p>
              <span className="font-medium">~</span> işaretli toplamda kaydı bulunamayan santral var; onların gücü en yüksek saatlik üretimden alınan alt
              sınırdır.
            </p>
            <p>
              Dengesizlik santral santral hesaplanıp toplanır; şirketin santralleri arasındaki netleşme dahil değildir, gerçek maliyet daha düşük
              olabilir. Risk göstergesidir, fatura değil.
            </p>
            {res.unknown.plants > 0 && (
              <p>
                Sahibi görünmeyen {res.unknown.plants} santral ({nf(res.unknown.mw, 0)} MW) listede yok; çoğu toplayıcı portföyünde ve EPİAŞ sahibini
                yayımlamıyor.
              </p>
            )}
            {res.errors.map((e) => (
              <p key={e} className="text-amber-700">
                {e}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
