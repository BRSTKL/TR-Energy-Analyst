"use client";

import React, { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LOSS_GROUP_LABEL, type LossGroupKey } from "@/lib/analysis/sector-loss";
import type { SectorCurtailment } from "@/lib/services/sector-curtailment";

const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
/** Piyasa sayfasıyla aynı: son yıl vurgulu mavi, önceki yıl gri */
const COLOR = { cur: "#2a78d6", prev: "#b4b2a9", grid: "#e2e8f0", axis: "#64748b" };
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const SOURCE: Record<string, string> = { USER: "elle doğrulandı", OSM: "OSM", GEM_TRACKER: "GEM", DISTRICT_CENTER: "~ ilçe merkezi" };

/** PLAN 20.4: sektörde güneş santrallerinin uyduyla ölçülen kayıp üretimi (planlı kısıntı ve plansız kayıp) */
export function SectorLossCard() {
  const [data, setData] = useState<SectorCurtailment | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/sector/curtailment")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Kayıp verisi yüklenemedi."));
  }, []);
  if (error)
    return (
      <Card className="shadow-sm">
        <CardContent className="p-4 text-sm text-amber-800">{error}</CardContent>
      </Card>
    );
  if (!data || data.years.length === 0) return null;
  const [prev, cur] = [data.years[data.years.length - 2], data.years[data.years.length - 1]];
  const g = (y: typeof cur | undefined, k: LossGroupKey) => y?.groups[k];
  const months = Array.from({ length: data.lastMonth }, (_, i) => String(i + 1).padStart(2, "0"));
  const chart = months.map((mm) => {
    const row: Record<string, string | number | null> = { ay: MONTHS_SHORT[Number(mm) - 1] };
    for (const y of data.years) row[String(y.year)] = y.monthly.all.find((m) => m.month.endsWith(`-${mm}`))?.lossPct ?? null;
    return row;
  });
  const top = data.plants
    .filter((p) => p.years[cur.year])
    .sort((a, b) => b.years[cur.year].lossPct - a.years[cur.year].lossPct)
    .slice(0, 10);
  const all = g(cur, "all")!;
  const allPrev = g(prev, "all");
  const window = `Ocak–${MONTHS_SHORT[data.lastMonth - 1]}`;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Güneşte kayıp üretim: kısıntı ve arıza (uyduyla)</CardTitle>
        <CardDescription>
          Santralin üretebileceği (gerçekleşen uydu ışınımı × normal verimi) ile ürettiği arasındaki fark, santral verisi olmadan. Planlı: şirket o saat için
          ≈ 0 planlamış (kısıntı kararı); plansız: arıza, bakım, talimat, şebeke ya da kar. Yıllar aynı aylarla ({window}).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {allPrev && (
          <p className="text-sm text-slate-800">
            Konumlu {all.plants} lisanslı güneş santralinde potansiyel üretimin kaybı {prev.year} %{nf(allPrev.lossPct)} → {cur.year} <b>%{nf(all.lossPct)}</b>;
            kaybın planlı kısıntı payı %{nf(allPrev.plannedSharePct, 0)} → <b>%{nf(all.plannedSharePct, 0)}</b>. YEKA santralleri %
            {nf(g(prev, "yeka")!.lossPct)} → %{nf(g(cur, "yeka")!.lossPct)}, diğerleri %{nf(g(prev, "other")!.lossPct)} → %{nf(g(cur, "other")!.lossPct)}: artış
            büyük ölçüde YEKA&apos;nın sıfır fiyatlı saatlerdeki planlı kısıntısından.
          </p>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Grup</TableHead>
                {data.years.map((y) => (
                  <TableHead key={y.year} className="text-right">
                    {y.year}: santral · kayıp · planlı payı · GWh
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(["all", "yeka", "other"] as const).map((k) => (
                <TableRow key={k}>
                  <TableCell>{LOSS_GROUP_LABEL[k]}</TableCell>
                  {data.years.map((y) => {
                    const t = y.groups[k];
                    return (
                      <TableCell key={y.year} className="text-right tabular-nums">
                        {t.plants} · %{nf(t.lossPct)} · %{nf(t.plannedSharePct, 0)} · {nf((t.plannedLossMwh + t.unplannedLossMwh) / 1000)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Aylık kayıp oranı, bütün santraller (%)</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={COLOR.grid} />
                <XAxis dataKey="ay" tick={{ fontSize: 11 }} stroke={COLOR.axis} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} stroke={COLOR.axis} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `%${v}`} domain={[0, "auto"]} />
                <Tooltip formatter={(v: unknown) => (v === null || v === undefined ? "–" : `%${nf(Number(v))}`)} />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => <span className="text-slate-600">{v}</span>} />
                {data.years.map((y, i) => (
                  <Line
                    key={y.year}
                    dataKey={String(y.year)}
                    stroke={i === data.years.length - 1 ? COLOR.cur : COLOR.prev}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="overflow-x-auto">
          <p className="mb-1 text-xs font-medium text-slate-500">{cur.year}&apos;da en çok kaybeden santraller</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Santral</TableHead>
                <TableHead className="text-right">Kayıp {cur.year}</TableHead>
                <TableHead className="text-right">Planlı payı</TableHead>
                <TableHead className="text-right">Kayıp {prev?.year}</TableHead>
                <TableHead>Konum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.map((p) => (
                <TableRow key={p.epiasPlantId}>
                  <TableCell className="font-medium">
                    {p.name}
                    {p.yeka && <span className="ml-1.5 rounded bg-slate-100 px-1 text-[10px] text-slate-500">YEKA</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">%{nf(p.years[cur.year].lossPct)}</TableCell>
                  <TableCell className="text-right tabular-nums">%{nf(p.years[cur.year].plannedSharePct, 0)}</TableCell>
                  <TableCell className="text-right tabular-nums text-slate-500">{prev && p.years[prev.year] ? `%${nf(p.years[prev.year].lossPct)}` : "–"}</TableCell>
                  <TableCell className="text-xs text-slate-500">{SOURCE[p.locationSource] ?? p.locationSource}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs leading-relaxed text-slate-500">
          Kapsam: sektör karnesinin {data.coverage.licensedSolar} lisanslı güneş santralinin konumu bilinen {data.coverage.located}&apos;i (
          {Object.entries(data.coverage.bySource)
            .map(([k, v]) => `${SOURCE[k] ?? k} ${v}`)
            .join(", ")}
          ); lisanssız toplamlar (K3_, LÜM_) tek konumla temsil edilmediği için dışarıda. Grup oranı birleştirilmiş: Σ kayıp ÷ Σ (gerçekleşen + kayıp); büyük
          santraller (ör. Karapınar YEKA-1) YEKA grubunu belirler. Devreye alma ayları sayılmaz. Plansız kayıp model hatasını da içerebilir (inverter sınırı,
          panel kurulumu, konum; ilçe merkezi konumlu santrallerde kaba). Uydu: EUMETSAT SARAH3 (Open-Meteo.com); konum: © OpenStreetMap katkıcıları (ODbL).
        </p>
      </CardContent>
    </Card>
  );
}
