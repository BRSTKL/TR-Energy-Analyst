"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { BarChart, ResponsiveContainer } from "recharts";
import {
  ChartBar as Bar,
  ChartGrid as CartesianGrid,
  ChartLegendDots,
  ChartTip as Tooltip,
  ChartXAxis as XAxis,
  ChartYAxis as YAxis,
  STATUS_COLOR,
} from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calendarSlot, type CalendarYear } from "@/lib/analysis/yekdem-calendar";
import type { YekdemCalendarData } from "@/lib/services/yekdem-calendar";
import { YekdemDecisionCard } from "@/components/yekdem-decision-card";

/**
 * YEKDEM çıkış takvimi: hangi yıl kaç santral ve kaç MW serbest piyasaya geçiyor. Veri /api/yekdem'den (kural
 * lib/analysis/yekdem-calendar.ts). Süre işletmeye giriş yılına bağlıdır ve açık veride yoktur: gelecek yıllarda çoğu santral
 * için iki yıllık aralık vardır ("belirsiz"); santral en erken yılın satırında sayılır.
 */

const TECH: Record<string, string> = { RES: "Rüzgâr", GES: "Güneş", HES: "Hidro" };
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

const cell = (b: { plants: number; mw: number; noMw: number }) =>
  !b.plants ? "–" : b.noMw === b.plants ? `${nf(b.plants)} · MW kayıtsız` : `${nf(b.plants)} · ${nf(b.mw)} MW`;

export default function YekdemCalendarPage() {
  const [data, setData] = useState<(YekdemCalendarData & { success: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [type, setType] = useState<"ALL" | "RES" | "GES" | "HES">("ALL");

  useEffect(() => {
    let alive = true;
    fetch("/api/yekdem")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j.success) setError(j.error ?? "YEKDEM takvimi alınamadı");
        else {
          setData(j);
          setYear(j.calendar.currentYear + 1);
        }
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "YEKDEM takvimi alınamadı"));
    return () => {
      alive = false;
    };
  }, []);

  const cal = data?.calendar;
  const years: CalendarYear[] = useMemo(() => (cal ? [...cal.past.slice(-5), ...cal.future] : []), [cal]);
  const list = useMemo(() => {
    if (!data || year === null) return [];
    return data.plants
      .map((p) => ({ p, slot: calendarSlot(p) }))
      .filter((x) => x.slot?.year === year && (type === "ALL" || x.p.type === type))
      .sort((a, b) => (b.p.mw ?? -1) - (a.p.mw ?? -1) || a.p.name.localeCompare(b.p.name, "tr"));
  }, [data, year, type]);

  if (error)
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  if (!data || !cal)
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> YEKDEM takvimi yükleniyor
        </p>
      </div>
    );

  const thisYear = cal.past[cal.past.length - 1];
  const nextYear = cal.future[0];
  const chart = years.map((r) => ({
    yil: String(r.year),
    "Kesin": Math.round(r.certain.mw),
    "Belirsiz (en erken yıl)": Math.round(r.uncertain.mw),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">YEKDEM çıkışları</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Hangi yıl kaç rüzgâr, güneş ve hidro santrali YEKDEM&apos;den çıkıp serbest piyasaya geçiyor. Çıkan santral üretimini piyasada satar ve
          dengesizliğini kendisi taşır.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label="Şu an YEKDEM'de" value={`${nf(cal.inYekdem.plants)} santral`} sub={`${nf(cal.inYekdem.mw)} MW; santral rehberindeki santrallerde, gücü kayıtlı ${nf(cal.inYekdem.plants - cal.inYekdem.noMw)} santral`} />
        <Stat label={`${thisYear.year}'de serbest piyasaya geçen`} value={`${nf(thisYear.certain.plants)} santral`} sub={`${nf(thisYear.certain.mw)} MW`} />
        {nextYear && (
          <Stat
            label={`${nextYear.year}'de en erken geçecek`}
            value={`${nf(nextYear.certain.plants + nextYear.uncertain.plants)} santral`}
            sub={`${nf(nextYear.certain.mw + nextYear.uncertain.mw)} MW; ${nf(nextYear.certain.plants)} kesin, ${nf(nextYear.uncertain.plants)} belirsiz`}
          />
        )}
      </div>

      <YekdemDecisionCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Yıllara göre serbest piyasaya geçen kapasite (MW)</CardTitle>
          <CardDescription>
            Geçmiş yıllar kesindir. Gelecekte çoğu santralin süresi iki yıllık aralıkta dolar: santral en erken yılın sütununda sayılır, bir sonraki yılda da
            çıkabilir. Bu yüzden son yıllara doğru yığılma gerçeğinden fazla görünür.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartLegendDots
            items={[
              { label: "Kesin", color: STATUS_COLOR.actual, kind: "rect" },
              { label: "Belirsiz (en erken yıl)", color: STATUS_COLOR.scenario, kind: "rect" },
            ]}
          />
          <div className="mt-2 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid />
                <XAxis dataKey="yil" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => nf(Number(v))} width={56} />
                <Tooltip formatter={(v) => `${nf(Number(v))} MW`} />
                <Bar dataKey="Kesin" stackId="a" fill={STATUS_COLOR.actual} />
                <Bar dataKey="Belirsiz (en erken yıl)" stackId="a" fill={STATUS_COLOR.scenario} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serbest piyasaya geçiş yılı</TableHead>
                <TableHead className="text-right">Kesin (santral · MW)</TableHead>
                <TableHead className="text-right">Belirsiz (santral · MW)</TableHead>
                <TableHead className="text-right">Gücü kayıtsız santral</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {years.map((r) => (
                <TableRow key={r.year} className={r.year === year ? "bg-indigo-50/60" : undefined}>
                  <TableCell>
                    <button type="button" onClick={() => setYear(r.year)} className="font-medium text-indigo-700 hover:underline" aria-pressed={r.year === year}>
                      {r.year}
                    </button>
                    {r.year <= cal.currentYear && <span className="ml-2 text-xs text-slate-500">{r.year === cal.currentYear ? "bu yıl" : "geçmiş"}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{cell(r.certain)}</TableCell>
                  <TableCell className="text-right tabular-nums">{cell(r.uncertain)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.certain.noMw + r.uncertain.noMw || "–"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold">{year} yılında geçen santraller</h2>
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
        <span className="text-sm text-slate-500">{list.length} santral</span>
      </div>

      {list.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Santral</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead>Sahip şirket</TableHead>
                  <TableHead className="text-right">Lisanslı güç (MW)</TableHead>
                  <TableHead>Geçiş</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.slice(0, 300).map(({ p, slot }) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link href={`/santraller/${p.id}`} className="text-indigo-700 hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>{TECH[p.type]}</TableCell>
                    <TableCell className="max-w-[18rem] truncate text-slate-600" title={p.owner ?? ""}>
                      {p.owner ?? "–"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.mw === null ? "kayıt yok" : nf(p.mw, p.mw < 10 ? 2 : 1)}</TableCell>
                    <TableCell className="text-slate-600">
                      {year !== null && year <= cal.currentYear ? "kesin" : slot?.uncertain ? `en erken ${year}, ${(year ?? 0) + 1}'de de olabilir` : "kesin"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {list.length > 300 && <p className="text-sm text-slate-500">İlk 300 santral gösteriliyor (güce göre).</p>}

      <p className="text-xs text-slate-500">
        {data.note} {cal.neverSeen} santral hiçbir YEKDEM listesinde görülmediği için takvimde yok. Güç yalnız YEKDEM katılımcı listesindeki lisanslı güçtür;
        kaydı olmayan santral sayılır ama MW toplamına girmez. Hesap kuralı: Metodoloji.
        {data.errors.length > 0 && <span className="text-amber-700"> Uyarı: {data.errors.join("; ")}</span>}
      </p>
    </div>
  );
}
