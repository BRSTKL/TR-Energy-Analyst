"use client";

import React, { useEffect, useState } from "react";
import { LineChart, ResponsiveContainer } from "recharts";
import { ChartGrid as CartesianGrid, ChartLegend as Legend, ChartLine as Line, ChartTip as Tooltip, ChartXAxis as XAxis, ChartYAxis as YAxis } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LossGroupKey } from "@/lib/analysis/sector-loss";
import type { HydroKindKey, SectorCurtailment, SectorHydroLoss } from "@/lib/services/sector-curtailment";

const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
/** Piyasa sayfasıyla aynı: son yıl vurgulu mavi, önceki yıl gri */
const COLOR = { cur: "#2a78d6", prev: "#b4b2a9", grid: "#e2e8f0", axis: "#64748b" };
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const SOURCE: Record<string, string> = { USER: "elle doğrulandı", OSM: "OSM", GEM_TRACKER: "GEM", DISTRICT_CENTER: "~ ilçe merkezi" };

type Tech = "GES" | "RES" | "HES";

/**
 * Sektörde kayıp üretim, alt başlıklarla: güneş uyduyla (PLAN 20.4), rüzgâr geçmiş rüzgârla (18.10.2026; proje kayıp
 * sayfasıyla aynı kural, kalite eşiğini geçen santraller). Seçilen alt başlık kendi verisini çeker.
 */
export function SectorLossCard() {
  const [tech, setTech] = useState<Tech>("GES");
  const [data, setData] = useState<Partial<Record<Tech, SectorCurtailment | SectorHydroLoss>>>({});
  const [error, setError] = useState<Partial<Record<Tech, string>>>({});
  useEffect(() => {
    if (data[tech] || error[tech]) return;
    fetch(`/api/sector/curtailment?tech=${tech}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setData((x) => ({ ...x, [tech]: d }));
      })
      .catch((e) => setError((x) => ({ ...x, [tech]: e instanceof Error ? e.message : "Kayıp verisi yüklenemedi." })));
  }, [tech, data, error]);
  const tabs = (
    <div role="tablist" className="mb-2 flex gap-1 border-b border-slate-200">
      {(["GES", "RES", "HES"] as const).map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={tech === t}
          onClick={() => setTech(t)}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tech === t ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
        >
          {t === "GES" ? "Güneş" : t === "RES" ? "Rüzgâr" : "Hidro"}
        </button>
      ))}
    </div>
  );
  const d = data[tech];
  if (error[tech] || !d || d.years.length === 0)
    return (
      <Card className="shadow-sm">
        <CardHeader className="pb-0">{tabs}</CardHeader>
        <CardContent className={`p-4 text-sm ${error[tech] ? "text-amber-800" : "text-slate-500"}`}>{error[tech] ?? (d ? "Veri yok." : "Yükleniyor…")}</CardContent>
      </Card>
    );
  if (tech === "HES") return <HydroLossBody data={d as SectorHydroLoss} tabs={tabs} />;
  return <SectorLossBody data={d as SectorCurtailment} tech={tech} tabs={tabs} />;
}

const KIND_LABEL: Record<HydroKindKey, string> = { RESERVOIR: "Barajlı", RUN_OF_RIVER: "Nehir tipi", unclassified: "Sınıflanmamış" };
const CAUSE_LABEL: Record<string, string> = { fault: "arıza", maintenance: "bakım", curtailment: "talimat", economic: "ekonomik", other: "diğer" };

type HydroMetric = "rorUnplannedMwh" | "rorLongStopMwh" | "rorPlannedMwh" | "reservoirPct";
const HYDRO_METRIC: Record<HydroMetric, string> = {
  rorUnplannedMwh: "Nehir tipi · plansız düşüş",
  rorLongStopMwh: "Nehir tipi · bildirimsiz uzun duruş",
  rorPlannedMwh: "Nehir tipi · planlı duruş",
  reservoirPct: "Barajlı · arızadaki kapasite %",
};

/** Özet kutusu: büyük sayı (GWh), yanında küçük yüzde, altında önceki yılla kıyas */
function StatBox({ label, value, pct, prev }: { label: string; value: string; pct?: string; prev?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
        {value}
        {pct && <span className="ml-2 text-sm font-normal text-slate-500">{pct}</span>}
      </p>
      {prev && <p className="mt-0.5 text-xs text-slate-500">{prev}</p>}
    </div>
  );
}

/** Önceki yıla göre değişim: ▲ %66, ▲ ×3,4 (iki katın üstünde), ▼ %45 */
function change(cur: number, prev: number | undefined): string {
  if (prev === undefined || prev <= 0) return "–";
  const r = cur / prev;
  if (r >= 2) return `▲ ×${nf(r, 1)}`;
  return `${r >= 1 ? "▲" : "▼"} %${nf(Math.abs(r - 1) * 100, 0)}`;
}

/** Cümle içinde değişim: "3,4 katına çıktı", "%66 arttı", "%20 azaldı" */
function trend(cur: number, prev: number): string {
  if (prev <= 0) return "ölçüldü";
  const r = cur / prev;
  if (r >= 2) return `${nf(r, 1)} katına çıktı`;
  return `%${nf(Math.abs(r - 1) * 100, 0)} ${r >= 1 ? "arttı" : "azaldı"}`;
}

/**
 * Hidro: akış verisi olmadığı için "üretebileceği" ölçülemez (lib/analysis/hydro-loss.ts). Nehir tipinde üretimden ani
 * düşüşler: plansız olanlar olası kayıp (alt sınır), planlı olanlar kayıp değil (suyu düşük fiyatlı saatlerden kaydırma).
 * Barajlıda yalnız bildirilen arızadaki kapasite (EPİAŞ arıza / bakım bildirimleri; en çok; kayıp değil).
 * Düzen (kullanıcı 18.10.2026): özet kutuları → tek cümle → yıl tablosu → ilk 10 santral → "Nasıl hesaplandı?".
 */
function HydroLossBody({ data, tabs }: { data: SectorHydroLoss; tabs: React.ReactNode }) {
  const [prev, cur] = [data.years[data.years.length - 2], data.years[data.years.length - 1]];
  const window = `Ocak–${MONTHS_SHORT[data.lastMonth - 1]}`;
  const gwh = (v: number) => nf(v / 1000, 1);
  const pctOf = (part: number, whole: number) => (whole > 0 ? `%${nf((part / whole) * 100, 1)}` : undefined);
  const ror = cur.groups.RUN_OF_RIVER;
  const rorPrev = prev?.groups.RUN_OF_RIVER;
  const res = cur.groups.RESERVOIR;
  const resPrev = prev?.groups.RESERVOIR;
  const [kind, setKind] = useState<"RUN_OF_RIVER" | "RESERVOIR">("RUN_OF_RIVER");
  const [metric, setMetric] = useState<HydroMetric>("rorUnplannedMwh");
  const isPct = metric === "reservoirPct";
  const chart = Array.from({ length: data.lastMonth }, (_, i) => String(i + 1).padStart(2, "0")).map((mm) => {
    const row: Record<string, string | number | null> = { ay: MONTHS_SHORT[Number(mm) - 1] };
    for (const y of data.years) {
      const v = y.monthly.find((m) => m.month.endsWith(`-${mm}`))?.[metric];
      row[String(y.year)] = v === undefined ? null : isPct ? v : v / 1000;
    }
    return row;
  });
  const value = (p: SectorHydroLoss["plants"][number]) => {
    const c = p.years[cur.year];
    return kind === "RUN_OF_RIVER" ? (c.drops?.unplannedMwh ?? 0) + (c.drops?.longStopMwh ?? 0) : c.reportedLossMwh;
  };
  const top = data.plants
    .filter((p) => p.kind === kind && p.years[cur.year] && value(p) > 0)
    .sort((a, b) => value(b) - value(a))
    .slice(0, 10);
  const mainCause = (c: Record<string, number>) => {
    const [k, v] = Object.entries(c).sort((a, b) => b[1] - a[1])[0] ?? ["other", 0];
    return v > 0 ? CAUSE_LABEL[k] : "–";
  };
  const rows: Array<{ label: string; cur: number; prev?: number; pct?: boolean }> = [
    { label: "Nehir tipi · plansız düşüş, GWh", cur: ror.unplannedMwh, prev: rorPrev?.unplannedMwh },
    { label: "Nehir tipi · bildirimsiz uzun duruş, GWh", cur: ror.longStopMwh ?? 0, prev: rorPrev?.longStopMwh },
    { label: "Nehir tipi · planlı duruş, GWh", cur: ror.plannedMwh, prev: rorPrev?.plannedMwh },
    { label: "Barajlı · arızadaki kapasite, GWh", cur: res.reportedLossMwh, prev: resPrev?.reportedLossMwh },
    { label: "Barajlı · arızadaki kapasite, %", cur: res.reportedPct, prev: resPrev?.reportedPct, pct: true },
  ];
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        {tabs}
        <CardTitle className="text-base">Hidroda kayıp üretim</CardTitle>
        <CardDescription>
          Lisanslı hidro santralleri, {window} {prev ? `${prev.year} ve ` : ""}
          {cur.year}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatBox
            label="Nehir tipi · bildirimsiz uzun duruş"
            value={`${gwh(ror.longStopMwh ?? 0)} GWh`}
            pct={pctOf(ror.longStopMwh ?? 0, ror.actualMwh)}
            prev={rorPrev?.longStopMwh !== undefined ? `${prev.year}: ${gwh(rorPrev.longStopMwh)} GWh · ${change(ror.longStopMwh ?? 0, rorPrev.longStopMwh)}` : undefined}
          />
          <StatBox
            label="Nehir tipi · plansız düşüş"
            value={`${gwh(ror.unplannedMwh)} GWh`}
            pct={pctOf(ror.unplannedMwh, ror.actualMwh)}
            prev={rorPrev ? `${prev.year}: ${gwh(rorPrev.unplannedMwh)} GWh · ${change(ror.unplannedMwh, rorPrev.unplannedMwh)}` : undefined}
          />
          <StatBox
            label="Nehir tipi · planlı öğle duruşu"
            value={`${gwh(ror.plannedMwh)} GWh`}
            pct={pctOf(ror.plannedMwh, ror.actualMwh)}
            prev={rorPrev ? `${prev.year}: ${gwh(rorPrev.plannedMwh)} GWh · ${change(ror.plannedMwh, rorPrev.plannedMwh)}` : undefined}
          />
          <StatBox
            label="Barajlı · arızadaki kapasite"
            value={`${gwh(res.reportedLossMwh)} GWh`}
            pct={`%${nf(res.reportedPct)}`}
            prev={resPrev ? `${prev.year}: ${gwh(resPrev.reportedLossMwh)} GWh · %${nf(resPrev.reportedPct)}` : undefined}
          />
        </div>

        <p className="text-sm text-slate-800">
          Nehir tipi santrallerde bildirimsiz uzun duruşlar {rorPrev?.longStopMwh ? trend(ror.longStopMwh ?? 0, rorPrev.longStopMwh) : "ölçüldü"} (
          {ror.longStopPlants ?? 0} santral; büyük olasılıkla bölgesel iletim kısıtı nedeniyle kısıntı), kısa beklenmedik düşüşler{" "}
          {rorPrev ? trend(ror.unplannedMwh, rorPrev.unplannedMwh) : "ölçüldü"}; planlı öğle
          duruşları {rorPrev ? trend(ror.plannedMwh, rorPrev.plannedMwh) : "ölçüldü"}{" "}
          (güneşin fiyatı düşürdüğü saatlerde su akşama kaydırılıyor; kayıp değil). Barajlıda arızadaki kapasite kayıp sayılmaz: su saklanıp sonra kullanılabilir.
        </p>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gösterge</TableHead>
                {prev && <TableHead className="text-right">{prev.year}</TableHead>}
                <TableHead className="text-right">{cur.year}</TableHead>
                {prev && <TableHead className="text-right">Değişim</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.label}>
                  <TableCell>{r.label}</TableCell>
                  {prev && <TableCell className="text-right tabular-nums">{r.prev === undefined ? "–" : r.pct ? `%${nf(r.prev)}` : gwh(r.prev)}</TableCell>}
                  <TableCell className="text-right font-medium tabular-nums">{r.pct ? `%${nf(r.cur)}` : gwh(r.cur)}</TableCell>
                  {prev && (
                    <TableCell className="text-right tabular-nums text-slate-500">
                      {r.pct && r.prev !== undefined ? `${r.cur >= r.prev ? "▲" : "▼"} ${nf(Math.abs(r.cur - r.prev))} puan` : change(r.cur, r.prev)}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium text-slate-500">Aylık</p>
            {(Object.keys(HYDRO_METRIC) as HydroMetric[]).map((k) => (
              <button
                key={k}
                onClick={() => setMetric(k)}
                className={`rounded border px-2 py-0.5 text-xs ${metric === k ? "border-slate-900 text-slate-900" : "border-slate-200 text-slate-500"}`}
              >
                {HYDRO_METRIC[k]}
              </button>
            ))}
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={COLOR.grid} />
                <XAxis dataKey="ay" tick={{ fontSize: 11 }} stroke={COLOR.axis} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke={COLOR.axis}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(v: number) => (isPct ? `%${v}` : `${v}`)}
                  domain={[0, "auto"]}
                />
                <Tooltip formatter={(v: unknown) => (v === null || v === undefined ? "–" : isPct ? `%${nf(Number(v))}` : `${nf(Number(v))} GWh`)} />
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
          <p className="mt-1 text-xs text-slate-500">{isPct ? "Barajlı santrallerde bildirilen arızadaki kapasitenin oranı (%)." : "Nehir tipi santraller, GWh; olay başladığı aya yazılır."}</p>
        </div>

        <div className="overflow-x-auto">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium text-slate-500">En çok etkilenen 10 santral, {cur.year}</p>
            {(["RUN_OF_RIVER", "RESERVOIR"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded border px-2 py-0.5 text-xs ${kind === k ? "border-slate-900 text-slate-900" : "border-slate-200 text-slate-500"}`}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Santral</TableHead>
                {kind === "RUN_OF_RIVER" ? (
                  <>
                    <TableHead className="text-right">Uzun duruş, GWh</TableHead>
                    <TableHead className="text-right">Plansız düşüş, GWh</TableHead>
                    <TableHead className="text-right">Olay</TableHead>
                    <TableHead className="text-right">Planlı duruş, GWh</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead className="text-right">Arızadaki kapasite, GWh</TableHead>
                    <TableHead className="text-right">Oran</TableHead>
                    <TableHead>Baskın neden</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.map((p) => {
                const c = p.years[cur.year];
                return (
                  <TableRow key={p.epiasPlantId}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    {kind === "RUN_OF_RIVER" ? (
                      <>
                        <TableCell className="text-right font-medium tabular-nums">{gwh(c.drops?.longStopMwh ?? 0)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{gwh(c.drops?.unplannedMwh ?? 0)}</TableCell>
                        <TableCell className="text-right tabular-nums text-slate-500">{c.drops?.unplannedEvents ?? 0}</TableCell>
                        <TableCell className="text-right tabular-nums text-slate-500">{gwh(c.drops?.plannedMwh ?? 0)}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="text-right font-medium tabular-nums">{gwh(c.reportedLossMwh)}</TableCell>
                        <TableCell className="text-right tabular-nums text-slate-500">%{nf(c.reportedPct)}</TableCell>
                        <TableCell className="text-slate-500">{mainCause(c.byCause)}</TableCell>
                      </>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <details className="rounded-lg border border-slate-200 px-3 py-2 text-xs leading-relaxed text-slate-600">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Nasıl hesaplandı?</summary>
          <div className="mt-2 space-y-2">
            <p>
              Hidroda santralin o saatte ne üretebileceği dışarıdan ölçülemez (açık akış verisi yok; barajlı santral suyu saklayabilir). Bu yüzden ölçüm değil iki
              gösterge kullanılır.
            </p>
            <p>
              <b>Nehir tipi, ani düşüş:</b> saatin çevresindeki 72 saatin (önce ve sonra) üretim medyanı kurulu gücün %30&apos;unun üstünde iken üretim bunun
              %20&apos;sinin altına düşüp en az 6 saat kalırsa olay; kayıp = medyan − üretim. İlk KGÜP&apos;te önceden sıfırlanmışsa planlı (kayıp sayılmaz).
              3 günden uzun duruşlar medyanı da düşürdüğü için bu kuralla görünmez. {cur.year}&apos;da {ror.unplannedEvents} plansız olay, {ror.unplannedWithNotice}
              &apos;i EPİAŞ bildirimiyle çakışıyor; {ror.plannedEvents.toLocaleString("tr-TR")} planlı duruş. Yüzdeler gerçekleşen üretime oran.
            </p>
            <p>
              <b>Nehir tipi, bildirimsiz uzun duruş</b> (20.10.2026): ilk KGÜP en az 1 MW iken üretim planın %5&apos;inin altında, en az 6 saat sürüyor, arıza ya da
              bakım bildirimi yok ve ani düşüş olayına girmemiş saatler; kayıp = plan − üretim. Haftalarca süren duruşları yakalar (ani düşüş kuralının göremediği
              kısım). {cur.year}&apos;da {ror.longStopPlants ?? 0} santral, çoğu Nisan–Haziran; büyük olasılıkla bölgesel iletim kısıtı nedeniyle TEİAŞ talimatı
              (kaynak türüne göre talimat açık veride yok), bildirilmemiş uzun arıza ya da sel duruşu da olabilir. Planı tutturamayan şirket için gerçek bir sapmadır;
              kısmi kısıntıyı yakalamaz.
            </p>
            <p>
              <b>Barajlı, arızadaki kapasite:</b> santrallerin EPİAŞ piyasa mesaj sistemine bildirdiği arıza / bakım; saat başına normal güç − olay sırasındaki güç
              (aynı saate düşen bildirimlerden en büyüğü, o saatte üretilenle sınırlı); oran = bu ÷ (gerçekleşen + bu). Su durumu gerekçeli bildirimler (kaynak
              yetersizliği, düşük göl seviyesi) dahil değil. Şirket beyanıdır, en çok. Nedenler ({cur.year}, barajlı): arıza {gwh(res.byCause.fault)}, bakım{" "}
              {gwh(res.byCause.maintenance)}, talimat {gwh(res.byCause.curtailment)}, diğer {gwh(res.byCause.other + res.byCause.economic)} GWh.
            </p>
            <p>
              <b>Kapsam:</b> sektör karnesinin {data.coverage.licensed} lisanslı hidro santrali: barajlı {data.coverage.byKind.RESERVOIR} (bildirimli{" "}
              {res.plantsWithNotice}), nehir tipi {data.coverage.byKind.RUN_OF_RIVER}, sınıflanmamış {data.coverage.byKind.unclassified}. Sınıflanmamış santrallerin
              türü bilinmediği için yukarıda yok; bildirdikleri arızadaki kapasite {cur.year}&apos;da {gwh(cur.groups.unclassified.reportedLossMwh)} GWh (%
              {nf(cur.groups.unclassified.reportedPct)}). Bildirimler {data.coverage.noticeCoverage.from} – {data.coverage.noticeCoverage.to}.
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

/**
 * Güneş / rüzgâr. Düzen (kullanıcı 18.10.2026, hidroyla aynı): özet kutuları → tek cümle → yıl tablosu → aylık grafik →
 * en çok kaybeden 10 santral (istenirse hepsi) → "Nasıl hesaplandı?".
 */
function SectorLossBody({ data, tech, tabs }: { data: SectorCurtailment; tech: Tech; tabs: React.ReactNode }) {
  const wind = tech === "RES";
  const [prev, cur] = [data.years[data.years.length - 2], data.years[data.years.length - 1]];
  const g = (y: typeof cur | undefined, k: LossGroupKey) => y?.groups[k];
  const months = Array.from({ length: data.lastMonth }, (_, i) => String(i + 1).padStart(2, "0"));
  const chart = months.map((mm) => {
    const row: Record<string, string | number | null> = { ay: MONTHS_SHORT[Number(mm) - 1] };
    for (const y of data.years) row[String(y.year)] = y.monthly.all.find((m) => m.month.endsWith(`-${mm}`))?.lossPct ?? null;
    return row;
  });
  const lost = (t: { plannedLossMwh: number; unplannedLossMwh: number } | undefined) => (t ? t.plannedLossMwh + t.unplannedLossMwh : undefined);
  // Santraller son yılın kayıp enerjisine göre (son yıl verisi olmayanlar sonda)
  const rows = [...data.plants].sort((a, b) => (lost(b.years[cur.year]) ?? -1) - (lost(a.years[cur.year]) ?? -1));
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, 10);
  const pct = (v: number | undefined, d = 1) => (v === undefined ? "–" : `%${nf(v, d)}`);
  const gwh = (v: number | undefined) => (v === undefined ? "–" : nf(v / 1000, 1));
  const mtl = (v: number | undefined) => (v === undefined ? "–" : v >= 1e6 ? `${nf(v / 1e6, 1)} M` : `${nf(v / 1e3, 0)} bin`);
  const all = g(cur, "all")!;
  const allPrev = g(prev, "all");
  const window = `Ocak–${MONTHS_SHORT[data.lastMonth - 1]}`;
  const share = (part: number, whole: number | undefined) => (whole ? `%${nf((part / whole) * 100, 0)}` : undefined);
  const tableRows: Array<{ label: string; cur: number; prev?: number; pct?: boolean }> = [
    { label: "Toplam kayıp, GWh", cur: lost(all)!, prev: lost(allPrev) },
    { label: "Planlı kısıntı, GWh", cur: all.plannedLossMwh, prev: allPrev?.plannedLossMwh },
    { label: "Plansız kayıp, GWh", cur: all.unplannedLossMwh, prev: allPrev?.unplannedLossMwh },
    ...(!wind && data.coverage.withSnow ? [{ label: "  içinde: karlı saatlerde (kar olası), GWh", cur: all.snowLossMwh ?? 0, prev: allPrev?.snowLossMwh }] : []),
    { label: "Kayıp oranı, %", cur: all.lossPct, prev: allPrev?.lossPct, pct: true },
    ...(wind
      ? []
      : [
          { label: "YEKA · kayıp oranı, %", cur: g(cur, "yeka")!.lossPct, prev: g(prev, "yeka")?.lossPct, pct: true },
          { label: "YEKA dışı · kayıp oranı, %", cur: g(cur, "other")!.lossPct, prev: g(prev, "other")?.lossPct, pct: true },
        ]),
  ];
  const dPrev = (v: number) => (allPrev ? `${prev.year}: ${gwh(v)} GWh` : undefined);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        {tabs}
        <CardTitle className="text-base">{wind ? "Rüzgârda kayıp üretim" : "Güneşte kayıp üretim"}</CardTitle>
        <CardDescription>
          {wind ? `Kalite eşiğini geçen ${all.plants} lisanslı rüzgâr santrali` : `Konumu bilinen ${all.plants} lisanslı güneş santrali`}, {window}{" "}
          {prev ? `${prev.year} ve ` : ""}
          {cur.year}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatBox
            label="Toplam kayıp"
            value={`${gwh(lost(all))} GWh`}
            pct={`%${nf(all.lossPct)}`}
            prev={allPrev ? `${prev.year}: ${gwh(lost(allPrev))} GWh · %${nf(allPrev.lossPct)}` : undefined}
          />
          <StatBox
            label="Planlı kısıntı (şirket planında)"
            value={`${gwh(all.plannedLossMwh)} GWh`}
            pct={share(all.plannedLossMwh, lost(all))}
            prev={allPrev ? `${dPrev(allPrev.plannedLossMwh)} · ${change(all.plannedLossMwh, allPrev.plannedLossMwh)}` : undefined}
          />
          <StatBox
            label={wind ? "Plansız kayıp (alt sınır)" : "Plansız kayıp (arıza, talimat, kar)"}
            value={`${gwh(all.unplannedLossMwh)} GWh`}
            pct={share(all.unplannedLossMwh, lost(all))}
            prev={allPrev ? `${dPrev(allPrev.unplannedLossMwh)} · ${change(all.unplannedLossMwh, allPrev.unplannedLossMwh)}` : undefined}
          />
        </div>
        {!wind &&
          (data.coverage.withSnow ? (
            <p className="text-xs text-slate-600">
              Plansız kaybın {gwh(all.snowLossMwh ?? 0)} GWh&apos;i ({share(all.snowLossMwh ?? 0, all.unplannedLossMwh) ?? "%0"}) yerde kar olan saatlerde (ERA5 kar
              derinliği ≥ 1 cm; {data.coverage.withSnow} santral): panel karla örtülmüş olabilir, kısıntı ya da arıza değildir. Izgara kaba (0,25°), bir işarettir.
            </p>
          ) : (
            <p className="text-xs text-amber-800">
              Kar verisi henüz yok: kışın plansız kaybın bir kısmı karla örtülü panelden olabilir (scripts/snow-sync.mts ile çekilince ayrılır).
            </p>
          ))}

        {allPrev && (
          <p className="text-sm text-slate-800">
            Kayıp {trend(lost(all)!, lost(allPrev)!)}; kaybın planlı payı %{nf(allPrev.plannedSharePct, 0)} → %{nf(all.plannedSharePct, 0)}
            {wind
              ? ": kaybın çoğu artık şirketin önceden planında düşürdüğü saatlerde. Plansız kayıp yalnız uzun ve iki hava kaynağının birlikte bulduğu düşüşlerle sayılır (alt sınır)."
              : `. Artış büyük ölçüde YEKA'nın sıfır fiyatlı saatlerdeki planlı kısıntısından (YEKA %${nf(g(prev, "yeka")!.lossPct)} → %${nf(g(cur, "yeka")!.lossPct)}).`}
          </p>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gösterge</TableHead>
                {prev && <TableHead className="text-right">{prev.year}</TableHead>}
                <TableHead className="text-right">{cur.year}</TableHead>
                {prev && <TableHead className="text-right">Değişim</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableRows.map((r) => (
                <TableRow key={r.label}>
                  <TableCell>{r.label}</TableCell>
                  {prev && <TableCell className="text-right tabular-nums">{r.prev === undefined ? "–" : r.pct ? pct(r.prev) : gwh(r.prev)}</TableCell>}
                  <TableCell className="text-right font-medium tabular-nums">{r.pct ? pct(r.cur) : gwh(r.cur)}</TableCell>
                  {prev && (
                    <TableCell className="text-right tabular-nums text-slate-500">
                      {r.pct && r.prev !== undefined ? `${r.cur >= r.prev ? "▲" : "▼"} ${nf(Math.abs(r.cur - r.prev))} puan` : change(r.cur, r.prev)}
                    </TableCell>
                  )}
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
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium text-slate-500">
              {showAll ? `Bütün santraller (${rows.length})` : "En çok kaybeden 10 santral"}, {cur.year}
            </p>
            <button onClick={() => setShowAll((x) => !x)} className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:text-slate-800">
              {showAll ? "İlk 10" : `Hepsini göster (${rows.length})`}
            </button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Santral</TableHead>
                <TableHead className="text-right">Kayıp, GWh</TableHead>
                <TableHead className="text-right">Oran</TableHead>
                <TableHead className="text-right">Planlı payı</TableHead>
                <TableHead className="text-right">TL karşılığı</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((p) => {
                const c = p.years[cur.year];
                return (
                  <TableRow key={p.epiasPlantId}>
                    <TableCell className="font-medium">
                      {p.name}
                      {p.yeka && !wind && <span className="ml-1.5 rounded bg-slate-100 px-1 text-[10px] text-slate-500">YEKA</span>}
                      {p.locationSource === "DISTRICT_CENTER" && <span className="ml-1 text-xs text-slate-400" title="Konum ilçe merkezi tahmini">~</span>}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{gwh(lost(c))}</TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">{pct(c?.lossPct)}</TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">{pct(c?.plannedSharePct, 0)}</TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">{mtl(c ? c.plannedValueTl + c.unplannedValueTl : undefined)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <details className="rounded-lg border border-slate-200 px-3 py-2 text-xs leading-relaxed text-slate-600">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Nasıl hesaplandı?</summary>
          <div className="mt-2 space-y-2">
            {wind ? (
              <p>
                Santralin üretebileceği (100 m rüzgâr × santralin kendi üretiminden öğrenilen güç eğrisi) ile ürettiği arasındaki fark, santral verisi olmadan.
                Planlı: şirket o saat için beklenenin %10&apos;undan az planlamış; plansız: ilk KGÜP&apos;te olmayan, iki hava kaynağının birlikte bulduğu ve en az
                6 saat süren düşüşler (alt sınır). Kayıp oranı = Σ kayıp ÷ Σ (gerçekleşen + kayıp). TL karşılığı kayıp MWh × PTF, {cur.year}.
              </p>
            ) : (
              <p>
                Santralin üretebileceği (gerçekleşen uydu ışınımı × normal verimi) ile ürettiği arasındaki fark, santral verisi olmadan. Planlı: şirket o saat
                için ≈ 0 planlamış (kısıntı kararı); plansız: arıza, bakım, talimat, şebeke ya da kar. Kayıp oranı = Σ kayıp ÷ Σ (gerçekleşen + kayıp). TL
                karşılığı kayıp MWh × PTF, {cur.year}.
              </p>
            )}
            <p>&quot;–&quot;: o yılın {window} döneminde üretim yok ya da santral devreye alma dönemindeydi (kayıp sayılmadı). ~: konum ilçe merkezi tahmini.</p>
        {wind ? (
          <p>
            Kapsam: sektör karnesinin {data.coverage.licensed} lisanslı rüzgâr santralinin konumu bilinen {data.coverage.located}&apos;i (
            {Object.entries(data.coverage.bySource)
              .map(([k, v]) => `${SOURCE[k] ?? k} ${v}`)
              .join(", ")}
            {data.coverage.withoutWind ? `; ${data.coverage.withoutWind} santralde rüzgâr verisi yok` : ""}); {data.coverage.unreliable} santral kalite eşiğinin
            (kayıpsız günlerde günlük beklenen ↔ gerçekleşen r ≥ 0,85) altında kaldığı için sayılmadı. Grup oranı birleştirilmiş: Σ kayıp ÷ Σ (gerçekleşen +
            kayıp). Yalnız santralin büyük kısmının durduğu saatler görünür (birkaç türbinin arızası görünmez); ilçe merkezi (~) konumlu santrallerde kaba.
            Kurulu güç kayıttan (YEKDEM, EPDK lisansı) ya da en yüksek üretimden alt sınır. Rüzgâr: ECMWF IFS 9 km ve ERA5 0,25° (Open-Meteo.com, CC BY 4.0; ERA5:
            Copernicus Climate Change Service); konum: Global Energy Monitor (CC BY 4.0), © OpenStreetMap katkıcıları (ODbL).
          </p>
        ) : (
          <p>
            Kapsam: sektör karnesinin {data.coverage.licensedSolar} lisanslı güneş santralinin konumu bilinen {data.coverage.located}&apos;i (
            {Object.entries(data.coverage.bySource)
              .map(([k, v]) => `${SOURCE[k] ?? k} ${v}`)
              .join(", ")}
            ); lisanssız toplamlar (K3_, LÜM_) tek konumla temsil edilmediği için dışarıda. Grup oranı birleştirilmiş: Σ kayıp ÷ Σ (gerçekleşen + kayıp); büyük
            santraller (ör. Karapınar YEKA-1) YEKA grubunu belirler. Devreye alma ayları sayılmaz. Plansız kayıp model hatasını da içerebilir (inverter sınırı,
            panel kurulumu, konum; ilçe merkezi konumlu santrallerde kaba). Uydu: EUMETSAT SARAH3 (Open-Meteo.com); konum: © OpenStreetMap katkıcıları (ODbL).
          </p>
        )}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
