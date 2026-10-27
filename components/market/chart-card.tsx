"use client";

import React from "react";
import { ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Doğrulanmış renk seti: seçilen dönem vurgulu, önceki yıl gri; sistem yönü kırmızı (açık) ↔ mavi (fazla), dengede gri */
export const COLOR = { cur: "#2a78d6", prev: "#b4b2a9", smf: "#eb6834", deficit: "#e34948", surplus: "#2a78d6", balanced: "#c8c7c1", grid: "#e2e8f0", axis: "#64748b" };

export function ChartCard({ title, description, children, wide }: { title: string; description: string; children: React.ReactElement; wide?: boolean }) {
  return (
    <Card className={`shadow-sm ${wide ? "lg:col-span-2" : ""}`}>
      <CardHeader className="border-0 pb-4 pt-6">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pb-6 ps-0 pe-4">
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
