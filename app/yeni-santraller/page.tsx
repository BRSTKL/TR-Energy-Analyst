"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { BarChart, ResponsiveContainer } from "recharts";
import {
  ChartBar as Bar,
  ChartGrid as CartesianGrid,
  CHART_COLOR,
  ChartLegendDots,
  ChartTip as Tooltip,
  ChartXAxis as XAxis,
  ChartYAxis as YAxis,
} from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { NewPlantRadar } from "@/lib/services/new-plants";

/**
 * Yeni santral radarı: veri havuzunda ilk üretimi görülen rüzgâr, güneş ve hidro santralleri. Veri /api/new-plants'ten (kural
 * lib/analysis/new-plants.ts). İlk üretim ticari işletmeye giriş tarihi değildir; sınırlar sayfanın altında yazıyor.
 */

const TECH: Record<string, string> = { RES: "Rüzgâr", GES: "Güneş", HES: "Hidro" };
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const MONTH_FULL = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const day = (ms: number) => {
  const s = new Date(ms).toISOString();
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export default function NewPlantRadarPage() {
  const [data, setData] = useState<(NewPlantRadar & { success: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<"ALL" | "RES" | "GES" | "HES">("ALL");
  const [year, setYear] = useState<"ALL" | string>("ALL");

  useEffect(() => {
    let alive = true;
    fetch("/api/new-plants")
      .then((r) => r.json())
      .then((j) => alive && (j.success ? setData(j) : setError(j.error ?? "Yeni santral radarı alınamadı")))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Yeni santral radarı alınamadı"));
    return () => {
      alive = false;
    };
  }, []);

  const years = useMemo(() => (data ? Array.from(new Set(data.plants.map((p) => new Date(p.firstMs).getUTCFullYear()))).sort() : []), [data]);
  const list = useMemo(() => {
    if (!data) return [];
    return data.plants
      .filter((p) => (type === "ALL" || p.type === type) && (year === "ALL" || String(new Date(p.firstMs).getUTCFullYear()) === year))
      .sort((a, b) => b.firstMs - a.firstMs || b.mw - a.mw);
  }, [data, type, year]);

  if (error)
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  if (!data)
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Santral serileri taranıyor (ilk açılışta birkaç saniye sürebilir)
        </p>
      </div>
    );

  const through = data.dataThrough ? `${MONTH_FULL[Number(data.dataThrough.slice(5, 7)) - 1]} ${data.dataThrough.slice(0, 4)}` : "–";
  const chart = data.months.map((m) => ({ ay: monthLabel(m.month), Rüzgâr: Math.round(m.mwByType.RES), Güneş: Math.round(m.mwByType.GES), Hidro: Math.round(m.mwByType.HES) }));

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Yeni santral radarı</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Veri havuzunda ilk üretimi görülen rüzgâr, güneş ve hidro santralleri: hangi ay kaç santral ve kaç MW devreye girdi.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat
          label="Son 12 ayda devreye giren"
          value={`${nf(data.last12.plants)} santral · ${nf(data.last12.mw)} MW`}
          sub={`${nf(data.last12.recordedMw)} MW kayıtlı güç, ${nf(data.last12.estimatedMw)} MW tahmini (alt sınır)`}
        />
        <Stat
          label={`Şubat 2025 – ${through}`}
          value={`${nf(data.totals.plants)} santral · ${nf(data.totals.mw)} MW`}
          sub={`${nf(data.totals.recordedMw)} MW kayıtlı, ${nf(data.totals.estimatedMw)} MW tahmini`}
        />
        <Stat label="Verinin son ayı" value={through} sub={`${nf(data.scanned)} santral tarandı; sonraki aylar henüz yayımlanmadı`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ay ay devreye giren kapasite (MW)</CardTitle>
          <CardDescription>
            Santralin kurulu gücü ilk üretim ayına yazılır. Gücü kayıtlı olmayan santralde en yüksek saatlik üretim (alt sınır) kullanılır.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartLegendDots
            items={[
              { label: "Rüzgâr", color: CHART_COLOR.blue, kind: "rect" },
              { label: "Güneş", color: CHART_COLOR.amber, kind: "rect" },
              { label: "Hidro", color: CHART_COLOR.teal, kind: "rect" },
            ]}
          />
          <div className="mt-2 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid />
                <XAxis dataKey="ay" tick={{ fontSize: 11 }} interval={1} />
                <YAxis tickFormatter={(v) => nf(Number(v))} width={52} />
                <Tooltip formatter={(v) => `${nf(Number(v))} MW`} />
                <Bar dataKey="Rüzgâr" stackId="a" fill={CHART_COLOR.blue} />
                <Bar dataKey="Güneş" stackId="a" fill={CHART_COLOR.amber} />
                <Bar dataKey="Hidro" stackId="a" fill={CHART_COLOR.teal} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Şirketlere göre devreye giren kapasite</CardTitle>
          <CardDescription>
            Sahibi bilinen {nf(data.ownersKnown)} santral. Sahibi bilinmeyen {nf(data.unknownOwners.plants)} santral ({nf(data.unknownOwners.mw)} MW) burada yok: EPİAŞ
            toplayıcı portföyüne giren yeni santrallerin sahibini yayımlamıyor.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Şirket</TableHead>
                <TableHead className="text-right">Santral</TableHead>
                <TableHead className="text-right">Kurulu güç (MW)</TableHead>
                <TableHead className="text-right">Kayıtlı / tahmini (MW)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.owners.slice(0, 15).map((o) => (
                <TableRow key={o.owner}>
                  <TableCell className="max-w-[24rem] truncate font-medium" title={o.owner}>
                    {o.owner}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{nf(o.plants)}</TableCell>
                  <TableCell className="text-right tabular-nums">{nf(o.mw, 1)}</TableCell>
                  <TableCell className="text-right tabular-nums text-slate-600">
                    {nf(o.recordedMw, 1)} / {nf(o.estimatedMw, 1)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data.aggregators.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Toplayıcılara göre devreye giren kapasite</CardTitle>
            <CardDescription>
              Toplayıcı üyelik listesine göre ({data.membershipAsOf ? `${data.membershipAsOf.slice(8, 10)}.${data.membershipAsOf.slice(5, 7)}.${data.membershipAsOf.slice(0, 4)} tarihli` : "tarihsiz"}). Hiçbir toplayıcıda
              görünmeyen {nf(data.noAggregator.plants)} santral ({nf(data.noAggregator.mw)} MW) burada yok; listeden sonra katılmış ya da toplayıcısız olabilir.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Toplayıcı</TableHead>
                  <TableHead className="text-right">Santral</TableHead>
                  <TableHead className="text-right">Kurulu güç (MW)</TableHead>
                  <TableHead className="text-right">Kayıtlı / tahmini (MW)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.aggregators.map((a) => (
                  <TableRow key={a.aggregator}>
                    <TableCell className="max-w-[24rem] truncate font-medium" title={a.aggregator}>
                      {a.aggregator}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{nf(a.plants)}</TableCell>
                    <TableCell className="text-right tabular-nums">{nf(a.mw, 1)}</TableCell>
                    <TableCell className="text-right tabular-nums text-slate-600">
                      {nf(a.recordedMw, 1)} / {nf(a.estimatedMw, 1)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold">Devreye giren santraller</h2>
        <div className="flex gap-1 rounded-lg border bg-white p-1" role="group" aria-label="Tür">
          {(["ALL", "RES", "GES", "HES"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={type === t}
              onClick={() => setType(t)}
              className={`rounded-md px-3 py-1 text-sm font-medium ${type === t ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {t === "ALL" ? "Tümü" : TECH[t]}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg border bg-white p-1" role="group" aria-label="Yıl">
          {["ALL", ...years.map(String)].map((y) => (
            <button
              key={y}
              type="button"
              aria-pressed={year === y}
              onClick={() => setYear(y)}
              className={`rounded-md px-3 py-1 text-sm font-medium ${year === y ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {y === "ALL" ? "Tüm yıllar" : y}
            </button>
          ))}
        </div>
        <span className="text-sm text-slate-500">{list.length} santral</span>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>İlk üretim</TableHead>
                <TableHead>Santral</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead>Sahip şirket</TableHead>
                <TableHead className="text-right">Kurulu güç (MW)</TableHead>
                <TableHead>Güç kaynağı</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">{day(p.firstMs)}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/santraller/${p.id}`} className="text-indigo-700 hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell>{TECH[p.type]}</TableCell>
                  <TableCell className="max-w-[16rem] truncate text-slate-600" title={p.owner ?? p.aggregators.join(", ")}>
                    {p.owner ?? (p.aggregators[0] ? `toplayıcı: ${p.aggregators[0]}` : "bilinmiyor")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.recorded ? "" : "~"}
                    {nf(p.mw, p.mw < 10 ? 2 : 1)}
                  </TableCell>
                  <TableCell>
                    <span className="mr-2 text-slate-600">{p.capacityLabel}</span>
                    {!p.recorded && <StatusChip kind="estimate" />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <details className="rounded-lg border bg-white p-4 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-800">Bu sayfa neyi gösteriyor, neyi göstermiyor?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            İlk üretim, EPİAŞ&apos;ın yayımladığı gerçekleşen üretim (UEVM) serisindeki ilk dolu gündür. Ticari işletmeye giriş tarihi değildir: deneme üretimi ve
            EPİAŞ&apos;ın santrali listeye eklediği gün de ilk üretim gibi görünür.
          </li>
          <li>
            Havuz çoğu santral için Ocak 2025&apos;ten başlar. Bu yüzden yalnız Şubat 2025&apos;ten sonra ilk üretimi görülenler sayılır. Verisi dosyasının ilk saatinden
            itibaren dolu olan santralin devreye giriş anı bilinemez, radarda yok.
          </li>
          <li>Lisanssız toplamlar (K3_, LÜM_, LÜY: bir bölgedeki binlerce küçük tesis) devreye giriş sayılmaz, hariç. Yalnız rüzgâr, güneş ve hidro santralleri var.</li>
          <li>
            Kurulu güç kayıttan (YEKDEM, EPDK lisansı) alınır; kayıt yoksa en yüksek saatlik üretimdir ve gerçek gücün altında kalabilir (~ ve &ldquo;Tahmini&rdquo; rozeti).
          </li>
          <li>
            Sahip şirket EPİAŞ&apos;ın şirket ve santral listelerinden gelir. Toplayıcı portföyüne giren yeni santrallerin sahibini EPİAŞ yayımlamaz ({data.ownersKnown} /{" "}
            {data.plants.length} santralde biliniyor).
          </li>
          <li>Üretim verisi aylık uzlaştırmadan sonra yayımlanır; son ayın yeni santralleri o ay yayımlanana kadar görünmez.</li>
        </ul>
      </details>
    </div>
  );
}
