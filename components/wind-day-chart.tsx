"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { LOSS_COLOR, LOSS_LABEL } from "@/components/weather-day-chart";
import type { WindDay } from "@/lib/services/wind-loss";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const COLOR = { plan: "#eb6834", expected: "#2a78d6", era5: "#1baf7a", grid: "#e2e8f0", axis: "#64748b" };
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const axisX = { tick: { fontSize: 11 }, stroke: COLOR.axis, tickLine: false };
const axisY = { tick: { fontSize: 11 }, stroke: COLOR.axis, tickLine: false, axisLine: false, width: 52, tickFormatter: (v: number) => nf(v) };

/** Rüzgâr santralinin bir günü: üretim (kayıp durumuna göre renkli), ilk KGÜP, beklenen üretim (MWh); altta 100 m rüzgâr (m/s) */
export function WindDayChart({ day, loading, onDate, showLoss }: { day: WindDay; loading?: boolean; onDate: (date: string) => void; showLoss: boolean }) {
  const shift = (days: number) => {
    const d = new Date(Date.parse(`${day.date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
    if (d >= day.firstDate && d <= day.lastDate) onDate(d);
  };
  const label = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const energy = day.hours.map((h) => ({
    saat: label(h.hour),
    state: showLoss && (h.lossState === "planned" || h.lossState === "unplanned") ? h.lossState : "normal",
    "Üretim (UEVM)": h.uevmMwh,
    "İlk KGÜP": h.kgupFirstMwh,
    "Beklenen üretim (rüzgâra göre)": h.expectedMwh,
  }));
  const wind = day.hours.map((h) => ({ saat: label(h.hour), "ECMWF IFS 9 km": h.wsPrimary, "ERA5 0,25°": h.wsSecondary }));
  const lost = showLoss ? day.hours.filter((h) => h.lossState === "planned" || h.lossState === "unplanned") : [];
  const lostMwh = lost.reduce((a, h) => a + Math.max(0, (h.expectedMwh ?? 0) - (h.uevmMwh ?? 0)), 0);
  const [y, m, d] = day.date.split("-").map(Number);
  const states = Array.from(new Set(energy.map((e) => e.state)));
  const legend = [
    ...(["normal", "planned", "unplanned"] as const).filter((s) => s === "normal" || states.includes(s)).map((s) => ({ value: LOSS_LABEL[s], square: true, color: LOSS_COLOR[s] })),
    { value: "İlk KGÜP", square: false, color: COLOR.plan },
    { value: "Beklenen üretim (rüzgâra göre)", square: false, color: COLOR.expected },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button size="sm" variant="outline" onClick={() => shift(-1)} disabled={day.date <= day.firstDate} aria-label="Önceki gün">
          ‹
        </Button>
        <input type="date" className="h-8 rounded-md border border-slate-300 px-2 text-sm" value={day.date} min={day.firstDate} max={day.lastDate} onChange={(e) => e.target.value && onDate(e.target.value)} />
        <Button size="sm" variant="outline" onClick={() => shift(1)} disabled={day.date >= day.lastDate} aria-label="Sonraki gün">
          ›
        </Button>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        <span className="text-slate-600">
          {d} {MONTHS[m - 1]} {y}: üretim <b>{nf(day.totals.uevmMwh)} MWh</b>, ilk KGÜP {nf(day.totals.kgupFirstMwh)} MWh
          {lost.length > 0 && <>; kayıp saat {lost.length} (≈ {nf(lostMwh)} MWh)</>}
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
                  v === null || v === undefined ? "–" : [`${nf(Number(v), 1)} MWh`, name === "Üretim (UEVM)" ? LOSS_LABEL[(item?.payload?.state as keyof typeof LOSS_LABEL) ?? "normal"] : String(name)]
                }
              />
              <Bar dataKey="Üretim (UEVM)" isAnimationActive={false} radius={[4, 4, 0, 0]}>
                {energy.map((e, i) => (
                  <Cell key={i} fill={LOSS_COLOR[e.state as keyof typeof LOSS_COLOR]} />
                ))}
              </Bar>
              <Line dataKey="İlk KGÜP" stroke={COLOR.plan} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="Beklenen üretim (rüzgâra göre)" stroke={COLOR.expected} strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-600">
          {legend.map((l) => (
            <span key={l.value} className="inline-flex items-center gap-1.5">
              {l.square ? <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} /> : <span className="inline-block h-0.5 w-4" style={{ background: l.color }} />}
              {l.value}
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-slate-500">Geçmiş rüzgâr, 100 m, m/s (saat ortalaması; IFS kısa vadeli model, ERA5 yeniden analiz)</p>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={wind} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={COLOR.grid} />
              <XAxis dataKey="saat" {...axisX} interval={2} />
              <YAxis {...axisY} tickFormatter={(v: number) => nf(v, 0)} />
              <Tooltip formatter={(v: unknown) => (v === null || v === undefined ? "–" : `${nf(Number(v), 1)} m/s`)} />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => <span className="text-slate-600">{v}</span>} />
              <Line dataKey="ECMWF IFS 9 km" stroke={COLOR.expected} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="ERA5 0,25°" stroke={COLOR.era5} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        Konum: {day.location.text} ({day.location.source}; {day.location.ref}). Beklenen üretim geçmiş rüzgârla (ECMWF IFS 9 km) ve santralin kendi güç
        eğrisiyle; geçmiş analizi içindir, tahmin değildir. Rüzgâr modelin ızgara noktasından; santral sırtta ise ızgara hızı düşük kalır, eğri bunu santrale
        özgü düzeltir. Saatler Türkiye saati.
      </p>
    </div>
  );
}
