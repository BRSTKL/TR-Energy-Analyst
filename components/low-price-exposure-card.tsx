"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LOW_PRICE_MAX, ZERO_PRICE_MAX } from "@/lib/analysis/market-summary";
import type { ComparisonRow, PlantComparisonResult } from "@/lib/analysis/plant-comparison";

const num = (v: number, digits = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const share = (part: number, whole: number, digits = 1) => (whole > 0 ? `%${num((part / whole) * 100, digits)}` : "–");
/** Büyük tutarlar M ₺, orta tutarlar bin ₺ */
const tl = (v: number) =>
  Math.abs(v) >= 1e6 ? `${num(v / 1e6, 1)} M ₺` : Math.abs(v) >= 1e4 ? `${num(v / 1e3, 0)} bin ₺` : `${num(v, 0)} ₺`;

/** Bu saatler baz PTF'den satılsaydı capture rate'in yükseleceği puan */
const rateImpact = (lossTl: number, mwh: number, baseloadPtf: number) =>
  mwh > 0 && baseloadPtf > 0 ? `${lossTl > 0 ? "−" : "+"}${num((Math.abs(lossTl) / (mwh * baseloadPtf)) * 100, 1)} puan` : "–";

function Row({ row, yekdem, baseloadPtf }: { row: ComparisonRow; yekdem: boolean; baseloadPtf: number }) {
  const lp = row.lowPrice;
  const isGroup = row.level !== "plant";
  return (
    <TableRow className={row.level === "portfolio" ? "bg-slate-100/80 font-semibold" : row.level === "technology" ? "bg-slate-50/80 font-medium" : undefined}>
      <TableCell className={isGroup ? "text-slate-900" : "pl-6 text-slate-800"}>
        {row.label}
        {yekdem && <span className="ml-1 rounded bg-indigo-50 px-1 text-2xs font-medium text-indigo-700">YEKDEM</span>}
        {isGroup && row.plantCount > 1 && <span className="ml-1 text-2xs font-normal text-slate-500">({row.plantCount} santral)</span>}
      </TableCell>
      <TableCell className="text-right font-mono">{num(row.totalActualMwh)}</TableCell>
      <TableCell className="text-right font-mono">
        {num(lp.zeroMwh)} <span className="text-xs text-slate-500">({share(lp.zeroMwh, row.totalActualMwh)})</span>
      </TableCell>
      <TableCell className="text-right font-mono">
        {num(lp.lowMwh)} <span className="text-xs text-slate-500">({share(lp.lowMwh, row.totalActualMwh)})</span>
      </TableCell>
      <TableCell className="text-right font-mono">{num(lp.lowHours)}</TableCell>
      <TableCell className="text-right font-mono text-rose-700">{tl(lp.lowLossTl)}</TableCell>
      <TableCell className="text-right font-mono">{row.totalActualMwh > 0 ? num(lp.lowLossTl / row.totalActualMwh, 1) : "–"}</TableCell>
      <TableCell className="text-right font-mono">{rateImpact(lp.lowLossTl, row.totalActualMwh, baseloadPtf)}</TableCell>
    </TableRow>
  );
}

/**
 * Düşük ve sıfır fiyatlı saat maruziyeti (PLAN 2.3): üretimin ne kadarı PTF'nin çöktüğü saatlerde gerçekleşti ve bu
 * üretim baz yük PTF'ye göre ne kadar değer kaybetti. Kayıp, capture price hesabındaki profil maliyetinin bu saatlere
 * düşen kısmıdır.
 *
 * @param yekdemPlants YEKDEM santrallerinin geliri YEKDEM fiyatındandır; bu satırlardaki kayıp piyasa değeridir
 */
export function LowPriceExposureCard({ comparison, yekdemPlants = [] }: { comparison: PlantComparisonResult; yekdemPlants?: string[] }) {
  const pf = comparison.portfolio;
  if (!pf) return null;
  const lp = pf.lowPrice;

  const rows: ComparisonRow[] = [];
  for (const tech of comparison.technologies) {
    rows.push(...comparison.plants.filter((p) => p.plantType === tech.plantType));
    if (tech.plantCount > 1) rows.push(tech);
  }
  const worst = [...comparison.plants].filter((p) => p.totalActualMwh > 0).sort((a, b) => b.lowPrice.lowMwh / b.totalActualMwh - a.lowPrice.lowMwh / a.totalActualMwh)[0];

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Düşük ve sıfır fiyatlı saat maruziyeti</CardTitle>
        <CardDescription>
          PTF&apos;nin {num(LOW_PRICE_MAX)} ₺/MWh altına indiği saatlerde (sıfır fiyat: PTF ≤ {num(ZERO_PRICE_MAX)} ₺) ne kadar
          üretildi ve bu üretim dönemin düz ortalama PTF&apos;sine ({num(comparison.baseloadPtf)} ₺/MWh) göre ne kadar az değerlendi.
          Kayıp, capture price&apos;ı baz PTF&apos;nin altına çeken profil maliyetinin bu saatlerden gelen kısmıdır.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {lp.lowMwh > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-slate-800">
            Portföy üretiminde {num(LOW_PRICE_MAX)} ₺ altındaki saatlerin payı <b>{share(lp.lowMwh, pf.totalActualMwh)}</b> ({num(lp.lowMwh)} MWh,{" "}
            {num(lp.lowHours)} saat); sıfır fiyatlı saatlerin payı <b>{share(lp.zeroMwh, pf.totalActualMwh)}</b> ({num(lp.zeroHours)} saat). Bu üretim baz
            PTF ile satılsaydı <b>{tl(lp.lowLossTl)}</b> daha fazla değer ederdi: tüm üretimin MWh&apos;ı başına{" "}
            {num(lp.lowLossTl / pf.totalActualMwh, 1)} ₺; capture rate&apos;e etkisi {rateImpact(lp.lowLossTl, pf.totalActualMwh, comparison.baseloadPtf)}.
            {worst && comparison.plants.length > 1 && worst.lowPrice.lowMwh > 0 && (
              <>
                {" "}
                En açık santral: {worst.label} ({share(worst.lowPrice.lowMwh, worst.totalActualMwh)}).
              </>
            )}
          </div>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            Dönemde PTF&apos;nin {num(LOW_PRICE_MAX)} ₺/MWh altına indiği saatlerde üretim yok.
          </p>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>Santral</TableHead>
                <TableHead className="text-right">Üretim (MWh)</TableHead>
                <TableHead className="text-right">Sıfır fiyatta (MWh)</TableHead>
                <TableHead className="text-right">{num(LOW_PRICE_MAX)} ₺ altında (MWh)</TableHead>
                <TableHead className="text-right">Saat</TableHead>
                <TableHead className="text-right">Değer kaybı</TableHead>
                <TableHead className="text-right">₺/MWh (tüm üretim)</TableHead>
                <TableHead className="text-right">Capture rate etkisi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <Row key={row.key} row={row} yekdem={row.level === "plant" && yekdemPlants.includes(row.label)} baseloadPtf={comparison.baseloadPtf} />
              ))}
              <Row row={pf} yekdem={false} baseloadPtf={comparison.baseloadPtf} />
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-slate-500">
          Değer kaybı = Σ üretim × (baz PTF − PTF), yalnızca {num(LOW_PRICE_MAX)} ₺ altındaki saatler. Capture rate etkisi = değer kaybı /
          (üretim × baz PTF): bu saatler baz PTF&apos;den satılsaydı capture rate&apos;in kaç puan yükseleceği.
          {yekdemPlants.length > 0 && " YEKDEM santrallerinin geliri YEKDEM fiyatından oluşur; bu satırlardaki kayıp üretimin piyasa değeridir, santralin fiili gelir kaybı değildir."}{" "}
          Dönemin fiyat seyri için{" "}
          <Link href="/market" className="text-sky-700 underline">
            Piyasa
          </Link>{" "}
          sayfasına bakın.
        </p>
      </CardContent>
    </Card>
  );
}
