"use client";

import { planExcessFromActualVsForecast } from "@/lib/conventions";
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ComparisonRow, PlantComparisonResult } from "@/lib/analysis/plant-comparison";

const num = (v: number, digits = 0) =>
  v.toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

// İşaret yüzde işaretinin önüne yazılır: "+%10,7", "−%4,6"
const pct = (v: number, digits = 1, signed = false) =>
  `${v < 0 ? "−" : signed && v > 0 ? "+" : ""}%${num(Math.abs(v) * 100, digits)}`;

function Row({ row, yekdem = false }: { row: ComparisonRow; yekdem?: boolean }) {
  const isGroup = row.level !== "plant";
  const deviationClass =
    Math.abs(row.volumeDeviationRatio) >= 0.1
      ? "text-rose-700 font-semibold"
      : Math.abs(row.volumeDeviationRatio) >= 0.05
        ? "text-amber-700"
        : "text-slate-700";

  return (
    <TableRow
      className={
        row.level === "portfolio"
          ? "bg-slate-100/80 font-semibold"
          : row.level === "technology"
            ? "bg-slate-50/80 font-medium"
            : undefined
      }
    >
      <TableCell className={isGroup ? "text-slate-900" : "pl-6 text-slate-800"}>
        {row.label}
        {yekdem && <span className="ml-1 rounded bg-indigo-50 px-1 text-2xs font-medium text-indigo-700">YEKDEM</span>}
        {isGroup && row.plantCount > 1 && (
          <span className="ml-1 text-2xs font-normal text-slate-500">({row.plantCount} santral)</span>
        )}
      </TableCell>
      <TableCell className="text-right font-mono">{num(row.totalActualMwh)}</TableCell>
      <TableCell className={`text-right font-mono ${deviationClass}`}>
        {pct(planExcessFromActualVsForecast(row.volumeDeviationRatio), 1, true)}
      </TableCell>
      <TableCell className="text-right font-mono">{num(row.capturePrice, 2)}</TableCell>
      <TableCell
        className={`text-right font-mono ${row.captureRate < 0.95 ? "text-amber-700" : "text-slate-700"}`}
      >
        {pct(row.captureRate)}
      </TableCell>
      <TableCell className="text-right font-mono">{num(row.unitRevenue, 2)}</TableCell>
      <TableCell className="text-right font-mono text-rose-700">{num(row.unitImbalanceCost, 2)}</TableCell>
      <TableCell className="text-right font-mono">{pct(row.imbalanceCostShare, 2)}</TableCell>
    </TableRow>
  );
}

/**
 * Santralleri, teknoloji gruplarını (RES / HES / GES) ve portföyü aynı birim metriklerle yan yana gösterir.
 */
/**
 * @param yekdemPlants veri döneminde YEKDEM'de olan santraller: gelirleri YEKDEM fiyatından oluşur; tablodaki PTF'ye
 * dayalı gelir ve capture değerleri bu santraller için piyasa değeridir, fiili gelir değildir
 */
export function PlantComparisonCard({ comparison, yekdemPlants = [] }: { comparison: PlantComparisonResult; yekdemPlants?: string[] }) {
  if (!comparison.portfolio) return null;

  const rows: ComparisonRow[] = [];
  for (const tech of comparison.technologies) {
    rows.push(...comparison.plants.filter((p) => p.plantType === tech.plantType));
    if (tech.plantCount > 1) rows.push(tech);
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Santral ve Teknoloji Karşılaştırması
        </CardTitle>
        <CardDescription>
          Capture price, santralin üretim ağırlıklı ortalama PTF&apos;sidir; dönemin düz ortalama
          PTF&apos;si ({num(comparison.baseloadPtf, 2)} ₺/MWh) ile oranı capture rate&apos;tir. Plan
          fazlası + ise plan gerçekleşenden fazla (santral eksik üretti), − ise az.
          {yekdemPlants.length > 0 &&
            " YEKDEM etiketli santrallerin geliri YEKDEM fiyatından oluşur; bu satırlardaki gelir ve capture değerleri üretimin piyasa (PTF) değeridir, fiili gelir değildir."}{" "}
          Tüm birim
          değerler toplamlar üzerinden ağırlıklı hesaplanır.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>Santral</TableHead>
                <TableHead className="text-right">Üretim (MWh)</TableHead>
                <TableHead className="text-right">Plan fazlası</TableHead>
                <TableHead className="text-right">Capture Price (₺/MWh)</TableHead>
                <TableHead className="text-right">Capture Rate</TableHead>
                <TableHead className="text-right">Birim Gelir (₺/MWh)</TableHead>
                <TableHead className="text-right">Birim Deng. Maliyeti (₺/MWh)</TableHead>
                <TableHead className="text-right">Maliyet / Fiktif Gelir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <Row key={row.key} row={row} yekdem={row.level === "plant" && yekdemPlants.includes(row.label)} />
              ))}
              <Row row={comparison.portfolio} />
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
