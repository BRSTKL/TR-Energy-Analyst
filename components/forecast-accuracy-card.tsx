"use client";

import { PLAN_EXCESS_HINT, planExcessFromActualVsForecast } from "@/lib/conventions";
import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { diagnoseAccuracy } from "@/lib/analysis/forecast-accuracy";
import type { AccuracyStats, PlantAccuracy } from "@/lib/analysis/forecast-accuracy";

interface AccuracyResponse {
  success: boolean;
  plants: PlantAccuracy[];
  portfolio: AccuracyStats;
}

const num = (v: number, digits = 1) =>
  v.toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
// İşaret yüzde işaretinin önüne yazılır: "+%10,7", "−%4,6"
const pct = (v: number, digits = 1, signed = false) =>
  `${v < 0 ? "−" : signed && v > 0 ? "+" : ""}%${num(Math.abs(v) * 100, digits)}`;

const MONTHS_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function PlantRow({
  label,
  stats,
  active,
  onClick,
}: {
  label: string;
  stats: AccuracyStats;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <TableRow
      onClick={onClick}
      className={
        onClick
          ? `cursor-pointer ${active ? "bg-sky-50" : "hover:bg-slate-50"}`
          : "bg-slate-100/80 font-semibold"
      }
    >
      <TableCell className="font-medium text-slate-900">{label}</TableCell>
      <TableCell className="text-right font-mono">{num(stats.totalForecastMwh, 0)}</TableCell>
      <TableCell className="text-right font-mono">{num(stats.totalActualMwh, 0)}</TableCell>
      <TableCell
        className={`text-right font-mono ${Math.abs(stats.biasRatio) >= 0.1 ? "text-rose-700 font-semibold" : ""}`}
      >
        {pct(planExcessFromActualVsForecast(stats.biasRatio), 1, true)}
      </TableCell>
      <TableCell className="text-right font-mono">{pct(stats.wape)}</TableCell>
      <TableCell className="text-right font-mono">{num(stats.maeMwh, 2)}</TableCell>
      <TableCell
        className={`text-right font-mono ${stats.systematicShare >= 0.5 ? "text-amber-700 font-semibold" : ""}`}
      >
        {pct(stats.systematicShare, 0)}
      </TableCell>
      <TableCell className="text-right font-mono">{pct(stats.underForecastHourShare, 0)}</TableCell>
    </TableRow>
  );
}

/**
 * Fiyattan bağımsız tahmin doğruluğu kartı: santral tablosu + seçili santral için aylık ve saatlik sapma grafikleri.
 */
export function ForecastAccuracyCard({ projectId, refreshKey }: { projectId: string; refreshKey?: unknown }) {
  const [data, setData] = useState<AccuracyResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/forecast-accuracy`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: AccuracyResponse | null) => {
        if (cancelled || !json?.success) return;
        setData(json);
        setSelectedId((prev) =>
          prev && json.plants.some((p) => p.plantId === prev) ? prev : json.plants[0]?.plantId ?? null
        );
      })
      .catch(() => {
        // Kart gösterilmez; sayfanın geri kalanı etkilenmez
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  const selected = data?.plants.find((p) => p.plantId === selectedId) ?? null;

  const monthlyChart = useMemo(
    () =>
      (selected?.monthly ?? []).map((m) => ({
        label: MONTHS_TR[Number(m.key.slice(5, 7)) - 1] ?? m.key,
        bias: Number((planExcessFromActualVsForecast(m.biasRatio) * 100).toFixed(1)),
        wape: Number((m.wape * 100).toFixed(1)),
      })),
    [selected]
  );

  const hourlyChart = useMemo(
    () =>
      (selected?.hourOfDay ?? []).map((h) => ({
        label: h.key,
        meanError: Number((h.netErrorMwh / (h.hours || 1)).toFixed(2)),
      })),
    [selected]
  );

  if (!data || data.plants.length === 0) return null;

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Tahmin Doğruluğu (Fiyattan Bağımsız)</CardTitle>
        <CardDescription>
          Yalnızca gün öncesi tahmin ve gerçekleşen üretim kullanılır; piyasa fiyatı eksik olsa da
          sonuçlar geçerlidir. {PLAN_EXCESS_HINT} WAPE = Σ|hata| /
          Σ gerçekleşen. Sistematik pay = |Σ hata| / Σ |hata|, yani hatanın tek yönlü kısmı.
          Grafikleri görmek için bir santral seçin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>Santral</TableHead>
                <TableHead className="text-right">Tahmin (MWh)</TableHead>
                <TableHead className="text-right">Gerçekleşen (MWh)</TableHead>
                <TableHead className="text-right">Plan fazlası</TableHead>
                <TableHead className="text-right">WAPE</TableHead>
                <TableHead className="text-right">MAE (MWh/saat)</TableHead>
                <TableHead className="text-right">Sistematik Pay</TableHead>
                <TableHead className="text-right">Eksik Tahmin Saatleri</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.plants.map((p) => (
                <PlantRow
                  key={p.plantId}
                  label={`${p.plantName} (${p.plantType})`}
                  stats={p.overall}
                  active={p.plantId === selectedId}
                  onClick={() => setSelectedId(p.plantId)}
                />
              ))}
              <PlantRow label="Portföy" stats={data.portfolio} />
            </TableBody>
          </Table>
        </div>

        {selected && (
          <div className="space-y-4">
            <p className="rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs text-sky-900">
              <strong>{selected.plantName}:</strong> {diagnoseAccuracy(selected.overall)}
            </p>

            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h4 className="mb-2 text-xs font-semibold text-slate-700">
                  Aylık Plan Fazlası ve WAPE (%) — {selected.plantName}
                </h4>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyChart} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip formatter={(val) => `%${Number(val).toLocaleString("tr-TR")}`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <ReferenceLine y={0} stroke="#94a3b8" />
                      <Bar dataKey="bias" name="Plan fazlası" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="wape" name="WAPE" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-xs font-semibold text-slate-700">
                  Günün Saatine Göre Ortalama Hata (MWh) — {selected.plantName}
                </h4>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyChart} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(val) => `${Number(val).toLocaleString("tr-TR")} MWh`}
                        labelFormatter={(l) => `Saat ${l}:00`}
                      />
                      <ReferenceLine y={0} stroke="#94a3b8" />
                      <Bar dataKey="meanError" name="Ortalama hata" radius={[3, 3, 0, 0]}>
                        {hourlyChart.map((h) => (
                          <Cell key={h.label} fill={h.meanError >= 0 ? "#10b981" : "#f43f5e"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-1 text-2xs text-slate-500">
                  Yeşil: tahminden fazla üretim · Kırmızı: tahminden az üretim
                </p>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold text-slate-700">
                En Büyük Sapmalı 10 Saat — {selected.plantName}
              </h4>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead>Tarih / Saat</TableHead>
                      <TableHead className="text-right">Tahmin (MWh)</TableHead>
                      <TableHead className="text-right">Gerçekleşen (MWh)</TableHead>
                      <TableHead className="text-right">Hata (MWh)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.worstHours.map((w) => (
                      <TableRow key={String(w.timestamp)}>
                        <TableCell className="font-mono text-xs">
                          {String(w.timestamp).slice(0, 16).replace("T", " ")}
                        </TableCell>
                        <TableCell className="text-right font-mono">{num(w.forecastMwh, 2)}</TableCell>
                        <TableCell className="text-right font-mono">{num(w.actualMwh, 2)}</TableCell>
                        <TableCell
                          className={`text-right font-mono ${w.errorMwh >= 0 ? "text-emerald-700" : "text-rose-700"}`}
                        >
                          {w.errorMwh > 0 ? "+" : ""}
                          {num(w.errorMwh, 2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
