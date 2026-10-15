"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import type { WeatherDay } from "@/lib/services/weather-preview";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const COLOR = { plan: "#eb6834", uevm: "#b4b2a9", ghi: "#2a78d6", grid: "#e2e8f0", axis: "#64748b" };
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const axisX = { tick: { fontSize: 11 }, stroke: COLOR.axis, tickLine: false };
const axisY = { tick: { fontSize: 11 }, stroke: COLOR.axis, tickLine: false, axisLine: false, width: 52, tickFormatter: (v: number) => nf(v) };

/** PLAN 15.2: bir günün ışınım tahmini (2 ve 1 gün önceki), gerçek üretim ve ilk KGÜP; gün seçici ve ayın korelasyonu */
export function WeatherDayChart({ day, loading, onDate }: { day: WeatherDay; loading?: boolean; onDate: (date: string) => void }) {
  const shift = (days: number) => {
    const d = new Date(Date.parse(`${day.date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
    if (d >= day.firstDate && d <= day.lastDate) onDate(d);
  };
  const chart = day.hours.map((h) => ({
    saat: `${String(h.hour).padStart(2, "0")}:00`,
    "Üretim (UEVM)": h.uevmMwh,
    "İlk KGÜP": h.kgupFirstMwh,
    "Işınım, 2 gün önceki tahmin": h.ghiD2,
    "Işınım, 1 gün önceki tahmin": h.ghiD1,
  }));
  const r = (v: number | null) => (v === null ? "–" : nf(v, 2));
  const [y, m, d] = day.date.split("-").map(Number);

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
          {d} {MONTHS[m - 1]} {y}: üretim <b>{nf(day.totals.uevmMwh)} MWh</b>, ilk KGÜP {nf(day.totals.kgupFirstMwh)} MWh, ışınım (2 gün önce){" "}
          {nf(day.totals.ghiD2KwhM2, 1)} kWh/m²
        </span>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={COLOR.grid} />
            <XAxis dataKey="saat" {...axisX} interval={2} />
            <YAxis yAxisId="mwh" {...axisY} label={{ value: "MWh", angle: -90, position: "insideLeft", fontSize: 11, fill: COLOR.axis }} />
            <YAxis yAxisId="w" orientation="right" {...axisY} label={{ value: "W/m²", angle: 90, position: "insideRight", fontSize: 11, fill: COLOR.axis }} />
            <Tooltip
              formatter={(v: unknown, name: unknown) => (v === null || v === undefined ? "–" : String(name).startsWith("Işınım") ? `${nf(Number(v))} W/m²` : `${nf(Number(v), 1)} MWh`)}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => <span className="text-slate-600">{v}</span>} />
            <Bar yAxisId="mwh" dataKey="Üretim (UEVM)" fill={COLOR.uevm} isAnimationActive={false} />
            <Line yAxisId="mwh" dataKey="İlk KGÜP" stroke={COLOR.plan} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line yAxisId="w" dataKey="Işınım, 2 gün önceki tahmin" stroke={COLOR.ghi} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line yAxisId="w" dataKey="Işınım, 1 gün önceki tahmin" stroke={COLOR.ghi} strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-sm text-slate-800">
        {MONTHS[m - 1]} {y} boyunca ({day.month.days} gün) saatlik ışınım tahmini ile üretimin korelasyonu: 2 gün önceki tahminle <b>{r(day.month.corrD2)}</b>, 1
        gün önceki tahminle {r(day.month.corrD1)}. 1&apos;e yakınsa üretim büyük ölçüde havayla açıklanıyor; belirgin düşükse kısıntı, arıza ya da devreye alma
        olabilir.
      </p>
      <p className="text-xs leading-relaxed text-slate-500">
        Konum: {day.location.text} ({day.location.source}; {day.location.ref}). Model ECMWF IFS 0,25°, en yakın ızgara noktası {day.location.grid}. Işınım üretim
        saatine hizalı (Open-Meteo değeri önceki saatin ortalamasıdır). 2 gün önceki tahmin GÖP kesiminden önce elde vardır (ana sonuç); 1 gün önceki tahmin
        çoğu saatte kesimden sonra yapılmıştır (iyimser üst sınır, karşılaştırma için). Saatler Türkiye saati. Hava verisi: Open-Meteo.com (CC-BY 4.0).
      </p>
    </div>
  );
}
