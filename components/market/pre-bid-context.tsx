"use client";

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ComposedChart, ReferenceLine } from "recharts";
import {
  ChartBar as Bar,
  ChartGrid as CartesianGrid,
  ChartLegend as Legend,
  ChartLine as Line,
  ChartTip as Tooltip,
  ChartXAxis as XAxis,
  ChartYAxis as YAxis,
  CHART_COLOR,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartCard } from "@/components/market/chart-card";
import { Kpi, hh } from "@/components/market/daily-dashboard";
import type { PreBidContext } from "@/lib/services/pre-bid-context";
import { nf } from "@/lib/format";

const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const signedPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}%${nf(Math.abs(v))}`;
const axis = {
  x: { dataKey: "hour", interval: 2 as const, tickFormatter: (h: number) => hh(h) },
};

function Found({ note }: { note: string }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800">
        bulundu
      </span>
      <span className="text-slate-500">{note}</span>
    </div>
  );
}

/** Bulunan EPİAŞ verileriyle bağlam analizleri (ÖNİZLEME). Fiyat modeline girmezler: ölçümde katkıları yok ya da küçük. */
export function PreBidContextPanel({
  date,
  expectedMean,
  data,
}: {
  date: string;
  expectedMean: number | null;
  /** Dışarıda (karar sayfası) alınmış bağlam; verilirse bileşen kendisi çekmez */
  data?: PreBidContext | null;
}) {
  const [fetched, setCtx] = useState<PreBidContext | null>(null);
  const ctx = data !== undefined ? data : fetched;
  const [error, setError] = useState<string | null>(null);
  const [hour, setHour] = useState(19);

  useEffect(() => {
    if (data !== undefined) return;
    let cancelled = false;
    setCtx(null);
    setError(null);
    fetch(`/api/market/pre-bid-context?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.success) throw new Error(d.error);
        setCtx(d);
      })
      .catch(
        (e) =>
          !cancelled &&
          setError(e instanceof Error ? e.message : "Bağlam verisi alınamadı.")
      );
    return () => {
      cancelled = true;
    };
  }, [date, data]);

  if (error)
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        {error}
      </div>
    );
  if (!ctx)
    return (
      <div className="flex items-center gap-2 rounded-md border bg-white p-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Bulunan verilerle bağlam analizleri
        yükleniyor (ilk açılışta arz–talep eğrisi için 24 istek, yaklaşık 15 saniye)…
      </div>
    );

  const g = ctx.gas;
  const ch = ctx.curves?.hours.find((x) => x.hour === hour) ?? null;
  const shape =
    ctx.curves?.shapes[hour]?.map(([price, supply, demand]) => ({
      price,
      supply: Math.abs(supply),
      demand,
    })) ?? [];
  const gipTotal = ctx.gip ? ctx.gip.hours.reduce((s, h) => s + h.volume, 0) : 0;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          Bulunan verilerle bağlam analizleri
        </h2>
        <p className="text-xs text-slate-500">
          EPİAŞ&apos;ta bulunan dört ek veri. Fiyat beklentisi modeline girmiyorlar:
          ölçümde katkıları yok ya da çok küçük (aşağıda yazıyor); karar için bağlam
          olarak gösteriliyor.
        </p>
      </div>
      {ctx.notes.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {ctx.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}

      {g && (
        <Card id="kart-gaz" className="scroll-mt-24 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Doğal gaz günlük referans fiyatı (GRF)
            </CardTitle>
            <Found note="EPİAŞ doğal gaz servisi. Modele katkı yok: Haziran–Ekim 2026'da %15,9 → %14,4, 2025–2026 uzun örnekte %8,3 → %7,4." />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi
                label={`GRF (${g.summary.last.date.slice(8, 10)}.${g.summary.last.date.slice(5, 7)})`}
                value={`${nf(g.summary.last.tl)} TL / 1000 sm³`}
                sub={
                  g.summary.last.usdMmbtu !== null
                    ? `${nf(g.summary.last.usdMmbtu, 1)} USD/MMBtu`
                    : undefined
                }
              />
              <Kpi
                label="28 gün medyanına göre"
                value={
                  g.summary.vsMedian28Pct === null
                    ? "–"
                    : signedPct(g.summary.vsMedian28Pct)
                }
              />
              <Kpi
                label="90 gün öncesine göre"
                value={g.summary.vs90dPct === null ? "–" : signedPct(g.summary.vs90dPct)}
              />
              <Kpi
                label="Gaz yakıt maliyeti (yaklaşık)"
                value={`${nf(g.summary.fuelCost[0])} – ${nf(g.summary.fuelCost[1])} TL/MWh`}
                sub="9,6 kWh/sm³, verim %55–45; yalnız yakıt"
              />
            </div>
            {expectedMean !== null && (
              <p className="text-sm text-slate-700">
                Beklenen ortalama PTF {nf(expectedMean)} TL/MWh, gaz yakıt maliyeti
                aralığının{" "}
                {expectedMean < g.summary.fuelCost[0]
                  ? "altında"
                  : expectedMean > g.summary.fuelCost[1]
                    ? "üstünde"
                    : "içinde"}
                . Gaz santrallerinin marjinal olduğu saatlerde fiyat bu maliyetin altına
                inemez; altında kalan saatlerde fiyatı gaz dışı kaynaklar (hidro, linyit,
                ithalat, yenilenebilir) belirliyor olabilir. Bu yorum maliyet varsayımına
                bağlıdır; BOTAŞ&apos;ın elektrik üretimi tarifesi GRF&apos;den farklı
                olabilir.
              </p>
            )}
            <ChartCard
              title="GRF, son 120 gün"
              description="TL / 1000 sm³ (günlük referans fiyat)."
            >
              <ComposedChart
                data={g.series}
                margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
              >
                <CartesianGrid />
                <XAxis
                  dataKey="date"
                  interval={19}
                  tickFormatter={(d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`}
                />
                <YAxis
                  tickFormatter={(v: number) => nf(v / 1000, 0)}
                  unit=" bin"
                  domain={["auto", "auto"]}
                  width={62}
                />
                <Tooltip
                  formatter={(v: unknown) => `${nf(Number(v ?? 0))} TL/1000 sm³`}
                />
                <Line
                  name="GRF"
                  dataKey="tl"
                  stroke={CHART_COLOR.orange}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ChartCard>
          </CardContent>
        </Card>
      )}

      {ctx.curves && (
        <Card id="kart-egri" className="scroll-mt-24 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Gün öncesi arz–talep eğrisi ({ctx.curves.day.slice(8, 10)}.
              {ctx.curves.day.slice(5, 7)}; teklif öncesi bilinen en son eğri)
            </CardTitle>
            <Found note="EPİAŞ saatlik eğri. Modele katkı küçük: üçüncü özellik olarak %14,7 → %15,7; doğrudan kaydırma kötü (hata 527 → 992 TL/MWh)." />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor="curve-hour" className="text-slate-600">
                Saat
              </label>
              <select
                id="curve-hour"
                className="h-9 rounded-md border border-slate-200 bg-white px-2"
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
              >
                {ctx.curves.hours.map((x) => (
                  <option key={x.hour} value={x.hour}>
                    {hh(x.hour)}
                  </option>
                ))}
              </select>
              {ch && (
                <span className="text-slate-700">
                  Denge {nf(ch.price)} TL/MWh, {nf(ch.quantity)} MW. Talep −1.000 MW:{" "}
                  <b>{nf(ch.shifts[1].price)}</b>; +1.000 MW:{" "}
                  <b>{nf(ch.shifts[2].price)}</b>; +2.000 MW:{" "}
                  <b>{nf(ch.shifts[3].price)}</b> TL/MWh.
                </span>
              )}
            </div>
            <ChartCard
              title={`${hh(hour)} eğrisi`}
              description="MW. Her fiyatta kümülatif satış teklifi (arz) ve alış talebi; kesiştikleri nokta denge fiyatı (kırmızı: tavan)."
            >
              <ComposedChart
                data={shape}
                margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
              >
                <CartesianGrid />
                <XAxis
                  dataKey="price"
                  type="number"
                  domain={[0, 4600]}
                  tickFormatter={(v: number) => nf(v)}
                />
                <YAxis
                  tickFormatter={(v: number) => nf(v / 1000, 0)}
                  unit=" GW"
                  domain={["auto", "auto"]}
                  width={62}
                />
                <Tooltip
                  formatter={(v: unknown) => `${nf(Number(v ?? 0))} MW`}
                  labelFormatter={(p) => `Fiyat ${nf(Number(p))} TL/MWh`}
                />
                <Legend />
                {ch && (
                  <ReferenceLine
                    x={ch.price}
                    stroke={CHART_COLOR.slateLight}
                    strokeDasharray="4 4"
                  />
                )}
                <ReferenceLine x={4500} stroke={CHART_COLOR.red} strokeDasharray="6 3" />
                <Line
                  name="Arz (satış teklifi)"
                  dataKey="supply"
                  stroke={CHART_COLOR.teal}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  name="Talep (alış teklifi)"
                  dataKey="demand"
                  stroke={CHART_COLOR.blue}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ChartCard>
            <details className="rounded-md border bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">
                Bütün saatlerin denge ve duyarlılık tablosu
              </summary>
              <div className="overflow-x-auto px-2 pb-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-slate-500">
                      <th className="px-2 py-2 font-medium">Saat</th>
                      <th className="px-2 py-2 text-right font-medium">Denge fiyatı</th>
                      <th className="px-2 py-2 text-right font-medium">Miktar (MW)</th>
                      <th className="px-2 py-2 text-right font-medium">Talep −2.000</th>
                      <th className="px-2 py-2 text-right font-medium">−1.000</th>
                      <th className="px-2 py-2 text-right font-medium">+1.000</th>
                      <th className="px-2 py-2 text-right font-medium">+2.000</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ctx.curves.hours.map((x) => (
                      <tr key={x.hour} className="border-b last:border-0">
                        <td className="px-2 py-1.5 tabular-nums">{hh(x.hour)}</td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                          {nf(x.price)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                          {nf(x.quantity)}
                        </td>
                        {x.shifts.map((s) => (
                          <td
                            key={s.dq}
                            className="px-2 py-1.5 text-right tabular-nums text-slate-600"
                          >
                            {nf(s.price)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <p className="text-xs text-slate-500">
              Duyarlılık dünkü eğrinin şeklinden gelir: eğri dengeye yakın çok dik, bu
              yüzden küçük bir talep kayması büyük fiyat farkı verir ve doğrudan tahmin
              olarak kötü çıktı. Fiyat limiti (4.500) olan saatlerde artış hep tavana
              dayanır.
            </p>
          </CardContent>
        </Card>
      )}

      {ctx.bids && (
        <Card id="kart-teklif" className="scroll-mt-24 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              GÖP toplam teklifler: satış / alış oranı ({ctx.bids.day.slice(8, 10)}.
              {ctx.bids.day.slice(5, 7)})
            </CardTitle>
            <Found note="EPİAŞ GÖP toplam alış ve satış teklif miktarları. Modele eklenmedi (ölçülmedi); sıkılık göstergesi olarak gösteriliyor." />
          </CardHeader>
          <CardContent>
            <ChartCard
              title="Satış teklifi / alış teklifi"
              description="Oran 1'e yaklaşırsa satış teklifi alışı zar zor karşılıyor (sıkı piyasa); kesikli çizgi son 28 günün aynı saat ortancası."
            >
              <ComposedChart
                data={ctx.bids.hours}
                margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
              >
                <CartesianGrid />
                <XAxis {...axis.x} />
                <YAxis
                  tickFormatter={(v: number) => nf(v, 2)}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  formatter={(v: unknown) => nf(Number(v ?? 0), 2)}
                  labelFormatter={(h) => hh(Number(h))}
                />
                <Legend />
                <Line
                  name="Oran"
                  dataKey="ratio"
                  stroke={CHART_COLOR.indigo}
                  isAnimationActive={false}
                />
                <Line
                  name="Son 28 gün ortancası"
                  dataKey="ref"
                  stroke={CHART_COLOR.slateLight}
                  strokeDasharray="4 4"
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ChartCard>
          </CardContent>
        </Card>
      )}

      {ctx.gip && (
        <Card id="kart-gip" className="scroll-mt-24 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Gün içi piyasa işlemleri ({ctx.gip.day.slice(8, 10)}.
              {ctx.gip.day.slice(5, 7)})
            </CardTitle>
            <Found note="EPİAŞ GİP işlem geçmişi (saatlik kontratlar, her işlem). Modele eklenmedi; gün içi düzeltme maliyetini görmek için." />
          </CardHeader>
          <CardContent>
            <ChartCard
              title="Hacim ve ağırlıklı fiyat"
              description={`Çubuk: saatlik kontrat hacmi (MWh; 1 lot = 0,1 MWh varsayımı; toplam ${nf(gipTotal)} MWh). Çizgiler: GİP ağırlıklı ortalama fiyatı ve aynı saatin PTF'si (TL/MWh).`}
            >
              <ComposedChart
                data={ctx.gip.hours.map((x, h) => ({ ...x, ptf: ctx.gip!.ptf[h] }))}
                margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
              >
                <CartesianGrid />
                <XAxis {...axis.x} />
                <YAxis yAxisId="p" tickFormatter={(v: number) => nf(v)} />
                <YAxis
                  yAxisId="v"
                  orientation="right"
                  tickFormatter={(v: number) => nf(v)}
                  width={56}
                />
                <Tooltip
                  formatter={(v: unknown) => nf(Number(v ?? 0))}
                  labelFormatter={(h) => hh(Number(h))}
                />
                <Legend />
                <Bar
                  yAxisId="v"
                  name="Hacim (MWh)"
                  dataKey="volume"
                  fill={CHART_COLOR.slateLight}
                  fillOpacity={0.5}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="p"
                  name="GİP ağırlıklı fiyat"
                  dataKey="vwap"
                  stroke={CHART_COLOR.orange}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="p"
                  name="PTF"
                  dataKey="ptf"
                  stroke={CHART_COLOR.blue}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ChartCard>
          </CardContent>
        </Card>
      )}
      {ctx.neighbors && (
        <Card id="kart-komsu" className="scroll-mt-24 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Komşu ülke fiyatları ve sınır akışları ({dm(ctx.neighbors.day)})
            </CardTitle>
            <Found note="ENTSO-E Transparency Platform; sunucu her saat kontrol edip havuza yazıyor. Fiyat modeline eklendi mi sorusu yukarıdaki ölçümde. Komşu fiyatı Türkiye kapanışından (12:30) sonra yayımlanır: teklif saatinde bilinen, hedef günden bir önceki gündür." />
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-500">
              Karşılaştırılan gün {dm(ctx.neighbors.day)}
              {ctx.neighbors.daysBefore > 1
                ? ` (hedef günden ${ctx.neighbors.daysBefore} gün önce: daha yenisi havuzda yok)`
                : ""}
              .{" "}
              {ctx.neighbors.fx
                ? `PTF, ECB kuruyla (1 EUR = ${nf(ctx.neighbors.fx, 2)} TL) EUR'ya çevrildi.`
                : "Kur bulunamadı: PTF karşılaştırması yok."}
              {ctx.neighbors.coupledPct !== null
                ? ` Bulgaristan ve Yunanistan fiyatı saatlerin %${nf(ctx.neighbors.coupledPct, 0)}'inde aynı.`
                : ""}
            </p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Kpi
                label="Bulgaristan ort."
                value={
                  ctx.neighbors.mean.bg !== null
                    ? `${nf(ctx.neighbors.mean.bg, 1)} EUR`
                    : "—"
                }
                sub="EUR/MWh"
              />
              <Kpi
                label="Yunanistan ort."
                value={
                  ctx.neighbors.mean.gr !== null
                    ? `${nf(ctx.neighbors.mean.gr, 1)} EUR`
                    : "—"
                }
                sub="EUR/MWh"
              />
              <Kpi
                label="PTF ort."
                value={
                  ctx.neighbors.mean.ptfEur !== null
                    ? `${nf(ctx.neighbors.mean.ptfEur, 1)} EUR`
                    : "—"
                }
                sub="EUR/MWh"
              />
              <Kpi
                label="PTF − Bulgaristan"
                value={
                  ctx.neighbors.mean.spreadBg !== null
                    ? `${ctx.neighbors.mean.spreadBg > 0 ? "+" : ctx.neighbors.mean.spreadBg < 0 ? "−" : ""}${nf(Math.abs(ctx.neighbors.mean.spreadBg), 1)} EUR`
                    : "—"
                }
                sub="pozitif: Türkiye daha pahalı"
              />
              <Kpi
                label="Net ihracat (BG + GR)"
                value={
                  ctx.neighbors.mean.netBg !== null && ctx.neighbors.mean.netGr !== null
                    ? `${nf(ctx.neighbors.mean.netBg + ctx.neighbors.mean.netGr)} MW`
                    : "—"
                }
                sub={
                  ctx.neighbors.mean.netBg !== null && ctx.neighbors.mean.netGr !== null
                    ? `BG ${nf(ctx.neighbors.mean.netBg)} · GR ${nf(ctx.neighbors.mean.netGr)} MW; eksi: ithalat`
                    : undefined
                }
              />
            </div>
            <ChartCard
              title="Saatlik fiyat: Bulgaristan, Yunanistan ve PTF (EUR/MWh)"
              description="PTF ECB kuruyla EUR'ya çevrildi. Bulgaristan ve Yunanistan çizgileri çoğu saat üst üste biner."
            >
              <ComposedChart
                data={ctx.neighbors.hours}
                margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
              >
                <CartesianGrid />
                <XAxis {...axis.x} />
                <YAxis tickFormatter={(v: number) => nf(v)} />
                <Tooltip
                  formatter={(v: unknown) => `${nf(Number(v ?? 0), 1)} EUR/MWh`}
                  labelFormatter={(h) => hh(Number(h))}
                />
                <Legend />
                <Line
                  name="Bulgaristan"
                  dataKey="bg"
                  stroke={CHART_COLOR.teal}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  name="Yunanistan"
                  dataKey="gr"
                  stroke={CHART_COLOR.amber}
                  dot={false}
                  strokeDasharray="4 3"
                  isAnimationActive={false}
                />
                <Line
                  name="PTF (EUR)"
                  dataKey="ptfEur"
                  stroke={CHART_COLOR.blue}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ChartCard>
            <ChartCard
              title="Net ihracat (MW): Türkiye'den çıkan − Türkiye'ye giren"
              description="Pozitif: Türkiye komşuya elektrik veriyor, negatif: ithalat. ENTSO-E fiziksel akış (saatlik)."
            >
              <ComposedChart
                data={ctx.neighbors.hours}
                margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
              >
                <CartesianGrid />
                <XAxis {...axis.x} />
                <YAxis tickFormatter={(v: number) => nf(v)} />
                <Tooltip
                  formatter={(v: unknown) => `${nf(Number(v ?? 0))} MW`}
                  labelFormatter={(h) => hh(Number(h))}
                />
                <Legend />
                <Bar
                  name="Bulgaristan"
                  dataKey="netBg"
                  fill={CHART_COLOR.teal}
                  isAnimationActive={false}
                />
                <Bar
                  name="Yunanistan"
                  dataKey="netGr"
                  fill={CHART_COLOR.amber}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ChartCard>
            {ctx.neighbors.targetDay && (
              <p className="text-xs text-slate-500">
                Bilgi: {dm(ctx.date)} gününün komşu fiyatı yayımlanmış (Bulgaristan ort.{" "}
                {ctx.neighbors.targetDay.bg !== null
                  ? nf(ctx.neighbors.targetDay.bg, 1)
                  : "—"}{" "}
                EUR/MWh, Yunanistan{" "}
                {ctx.neighbors.targetDay.gr !== null
                  ? nf(ctx.neighbors.targetDay.gr, 1)
                  : "—"}
                ); bu fiyat Türkiye teklif kapanışından sonra bilinir, teklif kararında
                kullanılamaz.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {ctx.dams && (
        <Card id="kart-baraj" className="scroll-mt-24 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Baraj doluluğu (DSİ, ülke ortalaması)
            </CardTitle>
            <Found note="DSİ yağış ve baraj doluluk sitesinin herkese açık API'si; sunucu her saat kontrol edip havuza yazıyor. Fiyat modeline eklenince şanstan ayırt edilemedi (yukarıdaki ölçüm); karar için bağlam. Baraj bazında veri yok." />
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-500">
              En son yayım: {ctx.dams.asOf.split("-").reverse().join(".")}
              {ctx.dams.staleDays > 0
                ? ` (${ctx.dams.staleDays} gün önce; DSİ yalnız iş günlerinde ve mayıs–ekim aralığında yayımlıyor)`
                : ""}
              .
            </p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {ctx.dams.purposes.map((p) => (
                <Kpi
                  key={p.purpose}
                  label={p.label}
                  value={`%${nf(p.occupancyPct, 1)}`}
                  sub={`${nf(p.activeVolumeMm3, 1)} milyon m³${
                    p.weekAgoPct !== null ? ` · 1 hafta önce %${nf(p.weekAgoPct, 1)}` : ""
                  }${p.yearAgoPct !== null ? ` · geçen yıl %${nf(p.yearAgoPct, 1)}` : ""}`}
                />
              ))}
            </div>
            <ChartCard
              title="Enerji amaçlı barajlar: doluluk, yıllar yan yana"
              description="Aynı gün-ay için yıllar karşılaştırılır (%). Çizgiler yalnız yayımlanan günleri birleştirir."
            >
              <ComposedChart
                data={ctx.dams.season}
                margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
              >
                <CartesianGrid />
                <XAxis dataKey="md" interval={14} />
                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => `%${nf(v)}`}
                />
                <Tooltip formatter={(v: unknown) => `%${nf(Number(v ?? 0), 1)}`} />
                <Legend />
                {ctx.dams.seasonYears.map((y, i, all) => (
                  <Line
                    key={y}
                    name={String(y)}
                    dataKey={String(y)}
                    stroke={
                      i === all.length - 1
                        ? CHART_COLOR.blue
                        : i === all.length - 2
                          ? CHART_COLOR.orange
                          : CHART_COLOR.slateLight
                    }
                    connectNulls
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </ComposedChart>
            </ChartCard>
            {ctx.dams.cities.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="py-1 pr-2 font-medium">İl (içme suyu)</th>
                      <th className="py-1 pr-2 text-right font-medium">Doluluk</th>
                      <th className="py-1 pr-2 text-right font-medium">1 hafta önce</th>
                      <th className="py-1 font-medium">Yeterlilik (gün)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ctx.dams.cities.map((c) => (
                      <tr key={c.name} className="border-b border-slate-100">
                        <td className="py-1 pr-2">{c.name}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">
                          %{nf(c.occupancyPct, 1)}
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums">
                          {c.weekAgoPct !== null ? `%${nf(c.weekAgoPct, 1)}` : "—"}
                        </td>
                        <td className="py-1 tabular-nums">{c.supplyDays ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {ctx.outages && (
        <Card id="kart-ariza" className="scroll-mt-24 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Süren arıza ve bakımlar ({dm(ctx.date)} günü için)
            </CardTitle>
            <Found note="EPİAŞ piyasa mesaj sistemi, şu an canlı çekildi. Fiyat modeline eklenmedi (ölçülmedi); yön modelinde (Aşama 14) kullanılıyor. EPİAŞ yalnız başlamış bildirimleri veriyor: ileri tarihli planlı bakım bu servisten gelmiyor." />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi
                label="Şu an süren kayıp"
                value={`${nf(ctx.outages.ongoingMw)} MW`}
                sub={`${ctx.outages.ongoingCount} bildirim`}
              />
              <Kpi
                label={`${dm(ctx.date)} gününe sarkan`}
                value={`${nf(ctx.outages.carryMw)} MW`}
                sub={`${ctx.outages.carryCount} bildirim (bitişi bildirilmemiş olanlar dahil)`}
              />
              <Kpi
                label="Son 14 günün öğle ortancası"
                value={ctx.outages.typical ? `${nf(ctx.outages.typical.median)} MW` : "—"}
                sub={
                  ctx.outages.typical
                    ? `çeyrekler ${nf(ctx.outages.typical.q25)}–${nf(ctx.outages.typical.q75)} MW`
                    : "yeterli veri yok"
                }
              />
              <Kpi
                label="Şu an / tipik"
                value={
                  ctx.outages.typical && ctx.outages.typical.median > 0
                    ? signedPct(
                        (ctx.outages.ongoingMw / ctx.outages.typical.median - 1) * 100
                      )
                    : "—"
                }
                sub="şu an süren, tipik öğle düzeyine göre"
              />
            </div>
            <ChartCard
              title="Hâlâ sürmesi beklenen arızalı kapasite"
              description="Bugün süren bildirimlerin, o saatte bitişi geçmemiş olanların toplam kaybı (MW). Bitişi bildirilmemiş bildirim gün boyu sürüyor sayılır. Bugünden sonra başlayacak arızalar bilinmez."
            >
              <ComposedChart
                data={ctx.outages.hours}
                margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
              >
                <CartesianGrid />
                <XAxis {...axis.x} />
                <YAxis tickFormatter={(v: number) => nf(v)} />
                <Tooltip
                  formatter={(v: unknown) => `${nf(Number(v ?? 0))} MW`}
                  labelFormatter={(h) => hh(Number(h))}
                />
                <Bar name="Arızalı kapasite" dataKey="mw" fill={CHART_COLOR.orange} />
                {ctx.outages.typical && (
                  <ReferenceLine
                    y={ctx.outages.typical.median}
                    stroke={CHART_COLOR.blue}
                    strokeDasharray="4 4"
                  />
                )}
              </ComposedChart>
            </ChartCard>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-1 pr-2 font-medium">Birim</th>
                    <th className="py-1 pr-2 font-medium">Şirket</th>
                    <th className="py-1 pr-2 text-right font-medium">Kayıp (MW)</th>
                    <th className="py-1 pr-2 font-medium">Başladı</th>
                    <th className="py-1 pr-2 font-medium">Bitiş</th>
                    <th className="py-1 font-medium">Neden</th>
                  </tr>
                </thead>
                <tbody>
                  {ctx.outages.top.map((o) => (
                    <tr
                      key={`${o.name}-${o.since}`}
                      className="border-b border-slate-100"
                    >
                      <td className="py-1 pr-2">{o.name}</td>
                      <td className="py-1 pr-2 text-slate-500">{o.org ?? "—"}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {nf(o.lostMw)}
                      </td>
                      <td className="py-1 pr-2 tabular-nums">{o.since}</td>
                      <td className="py-1 pr-2 tabular-nums">
                        {o.until ?? "bildirilmemiş"}
                      </td>
                      <td className="py-1 text-slate-500">{o.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-400">
                Yarına sarkan en büyük 8 bildirim. Kayıp = işletmedeki güç − olay anındaki
                kapasite. Bildirimler yayım saatiyle saklanmıyor; yarının listesi bugünün
                bilgisidir.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
