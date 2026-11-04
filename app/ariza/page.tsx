"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Search } from "lucide-react";
import { AreaChart, ResponsiveContainer } from "recharts";
import { ChartArea as Area, ChartGrid as CartesianGrid, ChartTip as Tooltip, ChartXAxis as XAxis, ChartYAxis as YAxis, STATUS_COLOR } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OutageMonitor, OutageWindow } from "@/lib/services/outage-monitor";

/**
 * Arıza izleme: EPİAŞ piyasa mesaj sistemindeki arıza ve bakım bildirimleri. Süren bildirimler, çıkan kapasite ve son 14 günün
 * saatlik seri. Veri /api/outages'tan (havuz: data/pool/umm). Bildirimlerde yayım zamanı ve yakıt türü yok, sayfa bunu yazar.
 */

const WINDOWS: Array<{ id: OutageWindow; label: string }> = [
  { id: "active", label: "Şu an süren" },
  { id: "24h", label: "Son 24 saat" },
  { id: "7d", label: "Son 7 gün" },
];
const TECH: Record<string, string> = { RES: "Rüzgâr", GES: "Güneş", HES: "Hidro" };
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
/** Duvar saati ms → "04.11 10:00" */
const stamp = (ms: number) => {
  const s = new Date(ms).toISOString();
  return `${s.slice(8, 10)}.${s.slice(5, 7)} ${s.slice(11, 16)}`;
};
const stampIso = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)} ${iso.slice(11, 16)}`;

export default function OutagePage() {
  const [win, setWin] = useState<OutageWindow>("active");
  const [data, setData] = useState<OutageMonitor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/outages?window=${win}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j.success) setError(j.error ?? "Arıza bildirimleri alınamadı");
        else {
          setData(j);
          setError(null);
        }
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Arıza bildirimleri alınamadı"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [win]);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    return needle ? data.rows.filter((r) => `${r.plant} ${r.org ?? ""} ${r.reason ?? ""}`.toLocaleLowerCase("tr-TR").includes(needle)) : data.rows;
  }, [data, q]);

  const fetched = data?.fetchedAt ? new Date(data.fetchedAt) : null;
  const ageH = fetched ? (Date.now() - fetched.getTime()) / 3_600_000 : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Arıza izleme</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          EPİAŞ piyasa mesaj sistemindeki arıza ve bakım bildirimleri: hangi santral devre dışı, ne kadar kapasite çıkmış.
        </p>
      </div>

      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      {!data && !error && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Bildirimler yükleniyor
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs text-slate-500">Şu an süren bildirim</div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums">{nf(data.summary.activeCount)}</div>
            </div>
            <div className="rounded-lg border bg-white p-3" title="Süren bildirimlerde (işletmedeki güç − olay anı kapasitesi) toplamı">
              <div className="text-xs text-slate-500">Çıkan kapasite</div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums">{nf(data.summary.activeMw)} MW</div>
            </div>
            <div className="col-span-2 rounded-lg border bg-white p-3 md:col-span-1">
              <div className="text-xs text-slate-500">Bildirimler en son</div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums">
                {fetched ? `${String(fetched.getDate()).padStart(2, "0")}.${String(fetched.getMonth() + 1).padStart(2, "0")} ${String(fetched.getHours()).padStart(2, "0")}:${String(fetched.getMinutes()).padStart(2, "0")}` : "–"}
              </div>
              {ageH !== null && ageH > 12 && <div className="mt-0.5 text-xs text-amber-700">{nf(ageH)} saat önce alındı: liste güncel olmayabilir</div>}
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Süren = bildirilen başlangıç ≤ şimdi &lt; bildirilen bitiş. Bitiş çoğu zaman tahmindir ve değişebilir. Bildirimlerde yayım zamanı ve yakıt türü yok;
            tür yalnız santral rehberindeki rüzgâr, güneş ve hidro santrallerde yazılır.
          </p>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Çıkan kapasite, son 14 gün</CardTitle>
              <CardDescription>Her saat başında süren bildirimlerin toplam çıkan kapasitesi (MW). Planlı bakımlar da dahil.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.series}>
                    <CartesianGrid />
                    <XAxis dataKey="t" tickFormatter={(t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}`} interval={23} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => nf(Number(v))} width={52} />
                    <Tooltip formatter={(v, _n, p) => [`${nf(Number(v))} MW (${(p?.payload as { count: number }).count} bildirim)`, "Çıkan kapasite"]} labelFormatter={(t) => stampIso(String(t))} />
                    <Area type="stepAfter" dataKey="mw" stroke={STATUS_COLOR.actual} fill={STATUS_COLOR.band} strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1 rounded-lg border bg-white p-1" role="group" aria-label="Pencere">
              {WINDOWS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  aria-pressed={win === w.id}
                  onClick={() => setWin(w.id)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${win === w.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <label className="relative sm:w-72">
              <span className="sr-only">Santral, şirket ya da neden ara</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Santral, şirket ya da neden"
                className="h-9 w-full rounded-md border bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              />
            </label>
          </div>

          <p className="text-sm text-slate-500" aria-live="polite">
            {data.total === 0
              ? "Bu pencerede bildirim yok."
              : `${data.total} bildirim${data.total > data.rows.length ? `, en büyük ${data.rows.length} tanesi gösteriliyor` : ""}${q ? `; aramaya uyan ${rows.length}` : ""}.`}
            {loading && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" aria-label="Yenileniyor" />}
          </p>

          {rows.length > 0 && (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Santral</TableHead>
                      <TableHead>Şirket</TableHead>
                      <TableHead className="text-right">Çıkan (MW)</TableHead>
                      <TableHead className="text-right">Kurulu (MW)</TableHead>
                      <TableHead>Başlangıç</TableHead>
                      <TableHead>Bildirilen bitiş</TableHead>
                      <TableHead>Neden</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {r.plantId ? (
                            <Link href={`/santraller/${r.plantId}`} className="text-indigo-700 hover:underline">
                              {r.plant}
                            </Link>
                          ) : (
                            r.plant
                          )}
                          {r.type && <span className="ml-2 text-xs font-normal text-slate-500">{TECH[r.type]}</span>}
                        </TableCell>
                        <TableCell className="max-w-[16rem] truncate text-slate-600" title={r.org ?? ""}>
                          {r.org ?? "–"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{nf(r.lossMw, r.lossMw < 10 ? 1 : 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">{nf(r.installedMw, r.installedMw < 10 ? 1 : 0)}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{stamp(r.startMs)}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{stamp(r.endMs)}</TableCell>
                        <TableCell className="text-slate-600">{r.reason ?? "–"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
