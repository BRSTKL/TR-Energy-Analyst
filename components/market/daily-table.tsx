"use client";

import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { nf } from "@/lib/format";
import type { DayRow } from "@/lib/analysis/daily-market";

export const DIRECTION_LABEL: Record<string, string> = { DEFICIT: "Enerji açığı", SURPLUS: "Enerji fazlası", BALANCED: "Dengede" };
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const cell = (v: number | null) => (v === null ? "–" : nf(v));

/**
 * Günlük piyasa panosunun saatlik tablosu (ana sayfada ve /market/gunluk'te aynı). `compact`: yalnız fiyat, yön ve net yük
 * (ana sayfa); tam: tüketim, rüzgâr ve güneş planı da.
 */
export function DailyTable({ rows, compact = false }: { rows: DayRow[]; compact?: boolean }) {
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Saat</TableHead>
            <TableHead className="text-right">PTF</TableHead>
            <TableHead className="text-right">SMF</TableHead>
            <TableHead className="text-right">Kıyas ortancası</TableHead>
            <TableHead>Yön</TableHead>
            {!compact && <TableHead className="text-right">Tüketim</TableHead>}
            {!compact && <TableHead className="text-right">Rüzgâr</TableHead>}
            {!compact && <TableHead className="text-right">Güneş planı</TableHead>}
            <TableHead className="text-right">Net yük</TableHead>
            {!compact && <TableHead className="text-right">Net yük (arz)</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.hour}>
              <TableCell>{hh(r.hour)}</TableCell>
              <TableCell className="text-right">{cell(r.ptf)}</TableCell>
              <TableCell className="text-right">{cell(r.smf)}</TableCell>
              <TableCell className="text-right">{cell(r.refMedian)}</TableCell>
              <TableCell>{r.direction ? DIRECTION_LABEL[r.direction] ?? r.direction : "–"}</TableCell>
              {!compact && <TableCell className="text-right">{cell(r.consumption)}</TableCell>}
              {!compact && <TableCell className="text-right">{cell(r.wind)}</TableCell>}
              {!compact && <TableCell className="text-right">{cell(r.sunPlan)}</TableCell>}
              <TableCell className="text-right">{cell(r.net)}</TableCell>
              {!compact && <TableCell className="text-right">{cell(r.netSupply)}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="px-2 pt-2 text-xs text-slate-500">Fiyatlar TL/MWh, diğer sütunlar MW (saatlik ortalama). Net yük = tüketim − rüzgâr − güneş planı; (arz) = gerçek zamanlı termik + hidro + diğer + net ithalat.</p>
    </>
  );
}
