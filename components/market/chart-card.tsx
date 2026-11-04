"use client";

import React from "react";
import { ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_COLOR } from "@/components/ui/chart";

/**
 * Doğrulanmış renk seti: seçilen dönem vurgulu, önceki yıl gri. Sistem yönü mavi (açık) ↔ turuncu (fazla), dengede gri:
 * ortak `STATUS_COLOR` ile aynı (04.11.2026; önceki kırmızı ↔ mavi renk körü için okunmuyordu ve mavi iki anlama geliyordu).
 */
export const COLOR = { cur: "#2a78d6", prev: "#b4b2a9", smf: "#eb6834", deficit: STATUS_COLOR.deficit, surplus: STATUS_COLOR.surplus, balanced: STATUS_COLOR.balanced, grid: "#e2e8f0", axis: "#64748b" };

/**
 * `unit` sol eksenin birimi ("TL/MWh", "MW"); grafiğin sol üstünde yazılır. `forecastOnly` bütün serilerin tahmin
 * olduğunu söyler (gerçekleşen yoksa düz çizgi de tahmindir).
 */
export function ChartCard({ title, description, children, wide, unit, forecastOnly }: { title: string; description: string; children: React.ReactElement; wide?: boolean; unit?: string; forecastOnly?: boolean }) {
  return (
    <Card className={`shadow-sm ${wide ? "lg:col-span-2" : ""}`}>
      <CardHeader className="border-0 pb-4 pt-6">
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          {title}
          {forecastOnly && (
            <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700">
              Tahmin
            </span>
          )}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pb-6 ps-0 pe-4">
        {unit && <div className="mb-1 ps-4 text-xs text-muted-foreground">{unit}</div>}
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
