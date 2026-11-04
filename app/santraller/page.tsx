"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DirectoryEntry } from "@/lib/analysis/plant-search";

/**
 * Santral rehberi: havuzdaki santralleri ad ya da sahip şirkete göre arar; her satır santral kartına gider
 * (/santraller/<kimlik>). Veri /api/plants'ten gelir.
 */

const TYPES = [
  { id: "ALL", label: "Tümü" },
  { id: "RES", label: "Rüzgâr" },
  { id: "GES", label: "Güneş" },
  { id: "HES", label: "Hidro" },
] as const;
const TECH: Record<string, string> = { RES: "Rüzgâr", GES: "Güneş", HES: "Hidro" };

export default function PlantDirectoryPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["id"]>("ALL");
  const [limit, setLimit] = useState(50);
  const [res, setRes] = useState<{ total: number; items: DirectoryEntry[]; directorySize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/plants?q=${encodeURIComponent(q)}&type=${type}&limit=${limit}`, { signal: ctrl.signal });
        const j = await r.json();
        if (!j.success) throw new Error(j.error ?? "Santral listesi alınamadı");
        setRes(j);
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(e instanceof Error ? e.message : "Santral listesi alınamadı");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, type, limit]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Santral rehberi</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Rüzgâr, güneş ve hidro santrallerinin kartı: kayıtlı kurulu güç, konum, YEKDEM durumu ve gerçekleşen satış fiyatı.
          Santralin bir projede olması gerekmez.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Santral ya da şirket ara</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(50);
            }}
            placeholder="Santral ya da şirket adı"
            className="h-10 w-full rounded-md border bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          />
        </label>
        <div className="flex gap-1 rounded-lg border bg-white p-1" role="group" aria-label="Tür">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={type === t.id}
              onClick={() => {
                setType(t.id);
                setLimit(50);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${type === t.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <Card>
          <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
        </Card>
      ) : !res ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Santraller yükleniyor
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500" aria-live="polite">
            {res.total === 0
              ? "Eşleşen santral yok."
              : res.total > res.items.length
                ? `${res.total} santral eşleşti, ${res.items.length} tanesi gösteriliyor.`
                : `${res.total} santral`}
            {loading && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" aria-label="Yenileniyor" />}
          </p>
          {res.items.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Santral</TableHead>
                      <TableHead>Tür</TableHead>
                      <TableHead>Sahip şirket</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {res.items.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          <Link href={`/santraller/${p.id}`} className="text-indigo-700 hover:underline">
                            {p.name}
                          </Link>
                        </TableCell>
                        <TableCell>{TECH[p.type]}</TableCell>
                        <TableCell className="text-slate-600">{p.owner ?? "–"}</TableCell>
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
          {res.total > res.items.length && limit >= 500 && <p className="text-sm text-slate-500">Daha fazlası için aramayı daraltın.</p>}
        </>
      )}
    </div>
  );
}
