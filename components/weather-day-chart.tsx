"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import type { WeatherDay } from "@/lib/services/weather-preview";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
/**
 * Renkler: seriler referans kategorik paletin ilk üç yuvası (mavi, turuncu, su yeşili; doğrulayıcıdan geçti); kayıp
 * durumu referans durum paleti (planlı = uyarı, plansız = kritik), her zaman etiketle. Tek eksen: MWh ve W/m² ayrı grafik.
 */
export const LOSS_COLOR = { normal: "#b4b2a9", planned: "#fab219", unplanned: "#d03b3b" } as const;
export const LOSS_LABEL = { normal: "Üretim", planned: "Üretim · planlı kısıntı saati", unplanned: "Üretim · plansız kayıp saati" } as const;
const COLOR = { plan: "#eb6834", expected: "#2a78d6", forecast: "#2a78d6", satellite: "#1baf7a", grid: "#e2e8f0", axis: "#64748b" };
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const axisX = { tick: { fontSize: 11 }, stroke: COLOR.axis, tickLine: false };
const axisY = { tick: { fontSize: 11 }, stroke: COLOR.axis, tickLine: false, axisLine: false, width: 52, tickFormatter: (v: number) => nf(v) };
const legendStyle = { wrapperStyle: { fontSize: 12 }, formatter: (v: string) => <span className="text-slate-600">{v}</span> };

/** PLAN 15.2 / 20.3: bir günün üretimi, ilk KGÜP'ü ve uyduya göre beklenen üretimi (MWh); altta ışınım tahmini ve uydu (W/m²) */
export function WeatherDayChart({ day, loading, onDate }: { day: WeatherDay; loading?: boolean; onDate: (date: string) => void }) {
  const shift = (days: number) => {
    const d = new Date(Date.parse(`${day.date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
    if (d >= day.firstDate && d <= day.lastDate) onDate(d);
  };
  const hasSat = day.hours.some((h) => h.satGhi !== undefined && h.satGhi !== null);
  const label = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const energy = day.hours.map((h) => ({
    saat: label(h.hour),
    state: h.lossState ?? "normal",
    "Üretim (UEVM)": h.uevmMwh,
    "İlk KGÜP": h.kgupFirstMwh,
    "Beklenen üretim (uyduya göre)": h.expectedMwh ?? null,
  }));
  const radiation = day.hours.map((h) => ({
    saat: label(h.hour),
    "Tahmin, 2 gün önce": h.ghiD2,
    "Tahmin, 1 gün önce": h.ghiD1,
    "Gerçekleşen (uydu)": h.satGhi ?? null,
  }));
  const lost = day.hours.filter((h) => h.lossState === "planned" || h.lossState === "unplanned");
  const lostMwh = lost.reduce((a, h) => a + Math.max(0, (h.expectedMwh ?? 0) - (h.uevmMwh ?? 0)), 0);
  const r = (v: number | null) => (v === null ? "–" : nf(v, 2));
  const [y, m, d] = day.date.split("-").map(Number);
  const states = Array.from(new Set(energy.map((e) => e.state))).filter((s): s is keyof typeof LOSS_COLOR => s in LOSS_COLOR);
  const legendPayload = [
    ...(["normal", "planned", "unplanned"] as const).filter((s) => s === "normal" || states.includes(s)).map((s) => ({ value: LOSS_LABEL[s], type: "square" as const, color: LOSS_COLOR[s], id: s })),
    { value: "İlk KGÜP", type: "line" as const, color: COLOR.plan, id: "kgup" },
    ...(hasSat ? [{ value: "Beklenen üretim (uyduya göre)", type: "line" as const, color: COLOR.expected, id: "exp" }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button size="sm" variant="outline" onClick={() => shift(-1)} disabled={day.date <= day.firstDate} aria-label="Önceki gün">
          ‹
        </Button>
        <input
          type="date"
          className="h-8 rounded-md border border-slate-300 px-2 text-sm"
          value={day.date}
          min={day.firstDate}
          max={day.lastDate}
          onChange={(e) => e.target.value && onDate(e.target.value)}
        />
        <Button size="sm" variant="outline" onClick={() => shift(1)} disabled={day.date >= day.lastDate} aria-label="Sonraki gün">
          ›
        </Button>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        <span className="text-slate-600">
          {d} {MONTHS[m - 1]} {y}: üretim <b>{nf(day.totals.uevmMwh)} MWh</b>, ilk KGÜP {nf(day.totals.kgupFirstMwh)} MWh
          {lost.length > 0 && (
            <>
              ; kayıp saat {lost.length} (≈ {nf(lostMwh)} MWh)
            </>
          )}
        </span>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-slate-500">Üretim, MWh</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={energy} margin={{ top: 6, right: 10, left: 0, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke={COLOR.grid} />
              <XAxis dataKey="saat" {...axisX} interval={2} />
              <YAxis {...axisY} />
              <Tooltip
                formatter={(v: unknown, name: unknown, item: any) =>
                  v === null || v === undefined
                    ? "–"
                    : [`${nf(Number(v), 1)} MWh`, name === "Üretim (UEVM)" ? LOSS_LABEL[(item?.payload?.state as keyof typeof LOSS_LABEL) ?? "normal"] ?? "Üretim" : String(name)]
                }
              />
              <Bar dataKey="Üretim (UEVM)" isAnimationActive={false} radius={[4, 4, 0, 0]}>
                {energy.map((e, i) => (
                  <Cell key={i} fill={LOSS_COLOR[(e.state as keyof typeof LOSS_COLOR) in LOSS_COLOR ? (e.state as keyof typeof LOSS_COLOR) : "normal"]} />
                ))}
              </Bar>
              <Line dataKey="İlk KGÜP" stroke={COLOR.plan} strokeWidth={2} dot={false} isAnimationActive={false} />
              {hasSat && <Line dataKey="Beklenen üretim (uyduya göre)" stroke={COLOR.expected} strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-600">
          {legendPayload.map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1.5">
              {l.type === "square" ? (
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />
              ) : (
                <span className="inline-block h-0.5 w-4" style={{ background: l.color }} />
              )}
              {l.value}
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-slate-500">Işınım, W/m²</p>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={radiation} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={COLOR.grid} />
              <XAxis dataKey="saat" {...axisX} interval={2} />
              <YAxis {...axisY} />
              <Tooltip formatter={(v: unknown) => (v === null || v === undefined ? "–" : `${nf(Number(v))} W/m²`)} />
              <Legend {...legendStyle} />
              <Line dataKey="Tahmin, 2 gün önce" stroke={COLOR.forecast} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="Tahmin, 1 gün önce" stroke={COLOR.forecast} strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              {hasSat && <Line dataKey="Gerçekleşen (uydu)" stroke={COLOR.satellite} strokeWidth={2} dot={false} isAnimationActive={false} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="text-sm text-slate-800">
        {MONTHS[m - 1]} {y} boyunca ({day.month.days} gün) saatlik ışınım tahmini ile üretimin korelasyonu: 2 gün önceki tahminle <b>{r(day.month.corrD2)}</b>, 1
        gün önceki tahminle {r(day.month.corrD1)}. 1&apos;e yakınsa üretim büyük ölçüde havayla açıklanıyor; belirgin düşükse kısıntı, arıza ya da devreye alma
        olabilir.
      </p>
      <p className="text-xs leading-relaxed text-slate-500">
        Konum: {day.location.text} ({day.location.source}; {day.location.ref}). Tahmin: ECMWF IFS 0,25°, en yakın ızgara noktası {day.location.grid}; 2 gün önceki
        tahmin GÖP kesiminden önce elde vardır, 1 gün önceki çoğu saatte kesimden sonra yapılmıştır (karşılaştırma için). Beklenen üretim: gerçekleşen uydu
        ışınımı (EUMETSAT SARAH3, ≈ 2 gün gecikmeli) × santralin normal verimi; yalnız ölçüm içindir, tahmin değildir. Kayıp saat: ışınım ≥ 200 W/m² iken
        üretim beklenenin yarısının altında; planlı: şirketin ilk KGÜP&apos;ü ≈ 0. Işınım üretim saatine hizalı; saatler Türkiye saati. Veri: Open-Meteo.com (CC-BY
        4.0).
      </p>
    </div>
  );
}
