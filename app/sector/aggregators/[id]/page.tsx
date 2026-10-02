"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MethodLink } from "@/components/method-link";
import { tlAxis } from "@/lib/format";
import type { AggregatorDetail } from "@/lib/analysis/aggregator-detail";

/**
 * Toplayıcı ayrıntısı (PLAN 9.2): kıyas tablosundaki bir satırın içi. Üstte özet, ortada aylık netleşme, altta sahiplerin
 * portföye katkısı ve santraller (sektör medyanına göre).
 */

type Response = { success: boolean; error?: string; year: number; name: string; period: { start: string; end: string }; membershipAsOf: string } & AggregatorDetail;

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const mTl = (v: number) => `${nf(v / 1e6, 1)} M ₺`;
const TECH_LABEL: Record<string, string> = { RES: "Rüzgâr", GES: "Güneş", HES: "Hidro" };
const monthLabel = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-white p-3" title={hint}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default function AggregatorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const year = useSearchParams().get("year") ?? "2026";
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sector/aggregators/${id}?year=${year}`)
      .then((r) => r.json())
      .then((d: Response) => (d.success ? setData(d) : setError(d.error ?? "Ayrıntı yüklenemedi.")))
      .catch(() => setError("Ayrıntı yüklenemedi."));
  }, [id, year]);

  if (error) return <div className="mx-auto max-w-5xl p-6 text-sm text-red-600">{error}</div>;
  if (!data)
    return (
      <div className="flex items-center justify-center gap-2 p-16 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Toplayıcı hesaplanıyor…
      </div>
    );

  const s = data.summary;
  const period = `${monthLabel(data.period.start)}–${monthLabel(data.period.end)} ${data.year}`;
  const chart = data.months.map((m) => ({
    ay: monthLabel(m.month),
    "Sahipler tek başına": m.ownerLevelTl,
    "Portföyde": m.portfolioTl,
    "TL/MWh": Math.round(m.portfolioTlPerMwh),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div>
        <Link href="/sector" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3 w-3" /> Sektör karnesi · Toplayıcılar
        </Link>
        <a
          href={`/api/sector/aggregators/${id}/summary?year=${year}`}
          className="float-right inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-3 text-xs font-medium hover:bg-slate-50"
          title="Bu toplayıcının tek slaytlık özeti (PPTX); ilk mesaja eklenebilir"
        >
          <Download className="h-3.5 w-3.5" /> 1 sayfa özet (PPTX)
        </a>
        <h1 className="mt-1 text-xl font-semibold">{data.name.replace(/\s*\(TOPLAYICI\)\s*$/, "")}</h1>
        <p className="text-sm text-slate-500">
          {period} · rüzgâr, güneş ve hidro santralleri · üyelik {data.membershipAsOf} tarihli listeye göre <MethodLink section="toplayici-kiyas" />
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Santral" value={`${s.coveredPlants} / ${s.listedPlants - (s.otherTechPlants ?? 0)}`} hint="Analizde / listedeki rüzgâr, güneş, hidro" />
        <Stat label="Üretim" value={`${nf(s.productionMwh / 1000)} GWh`} />
        <Stat label="Netleşme değeri" value={mTl(s.nettingValueTl)} hint="Sahipler tek başına − portföy" />
        <Stat label="Netleşme oranı" value={`%${nf(s.nettingPct)}`} />
        <Stat label="Portföy maliyeti" value={`${nf(s.nettedTlPerMwh)} TL/MWh`} />
        <Stat label="Karışıma göre endeks" value={s.mixAdjustedIndex !== null ? nf(s.mixAdjustedIndex, 2) : "–"} hint="1'in altı: sektörün ortalama santrallerinin aynı karışımla ödeyeceğinden ucuz" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aylık netleşme</CardTitle>
          <CardDescription>Çubuklar: sahipler tek başına ile portföyde dengesizlik maliyeti. Aradaki fark netleşme değeri. Çizgi: portföyün TL/MWh maliyeti.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="ay" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="tl" tickFormatter={tlAxis} tick={{ fontSize: 12 }} width={64} />
                <YAxis yAxisId="mwh" orientation="right" tick={{ fontSize: 12 }} width={40} />
                <Tooltip formatter={(v, name) => (name === "TL/MWh" ? `${nf(Number(v))} TL/MWh` : mTl(Number(v)))} />
                <Legend />
                <Bar yAxisId="tl" dataKey="Sahipler tek başına" fill="#94a3b8" />
                <Bar yAxisId="tl" dataKey="Portföyde" fill="#0e8c7e" />
                <Line yAxisId="mwh" dataKey="TL/MWh" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Table className="mt-3">
            <TableHeader>
              <TableRow>
                <TableHead>Ay</TableHead>
                <TableHead className="text-right">Üretim</TableHead>
                <TableHead className="text-right">Sahipler tek başına</TableHead>
                <TableHead className="text-right">Portföyde</TableHead>
                <TableHead className="text-right">Netleşme değeri</TableHead>
                <TableHead className="text-right">Oran</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.months.map((m) => (
                <TableRow key={m.month}>
                  <TableCell>{monthLabel(m.month)}</TableCell>
                  <TableCell className="text-right tabular-nums">{nf(m.productionMwh / 1000)} GWh</TableCell>
                  <TableCell className="text-right tabular-nums">{mTl(m.ownerLevelTl)}</TableCell>
                  <TableCell className="text-right tabular-nums">{mTl(m.portfolioTl)}</TableCell>
                  <TableCell className="text-right tabular-nums">{mTl(m.nettingTl)}</TableCell>
                  <TableCell className="text-right tabular-nums">%{nf(m.nettingPct)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Üreticilerin portföye katkısı</CardTitle>
          <CardDescription>
            Üretici portföyden ayrılırsa kaybedilecek fayda: (üretici olmadan portföy) + (üretici tek başına) − (portföy). Yüksek katkı, sapmaları portföyün
            geri kalanını dengeleyen üretici demektir. Sahibi EPİAŞ&apos;ta belirlenemeyen santral kendi başına bir üretici sayılır.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Üretici</TableHead>
                <TableHead className="text-right">Santral</TableHead>
                <TableHead className="text-right">Üretim</TableHead>
                <TableHead className="text-right">Tek başına TL/MWh</TableHead>
                <TableHead className="text-right">Katkı</TableHead>
                <TableHead className="text-right">Katkı TL/MWh</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.owners.map((o) => (
                <TableRow key={o.name}>
                  <TableCell className="font-medium" title={o.name}>{o.name.length > 46 ? `${o.name.slice(0, 44)}…` : o.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{o.plantCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{nf(o.productionMwh / 1000, 1)} GWh</TableCell>
                  <TableCell className="text-right tabular-nums">{nf(o.standaloneTlPerMwh)}</TableCell>
                  <TableCell className="text-right tabular-nums">{mTl(o.contributionTl)}</TableCell>
                  <TableCell className="text-right tabular-nums">{nf(o.contributionTlPerMwh, 1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Santraller</CardTitle>
          <CardDescription>Santral tek başına dengesizlik maliyeti ve aynı teknolojinin sektör medyanına göre farkı (pozitif: medyandan pahalı).</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Santral</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead>Üretici</TableHead>
                <TableHead className="text-right">Üretim</TableHead>
                <TableHead className="text-right">TL/MWh</TableHead>
                <TableHead className="text-right">Sektör medyanı</TableHead>
                <TableHead className="text-right">Fark</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.plants.map((p) => (
                <TableRow key={p.epiasPlantId}>
                  <TableCell className="font-medium">{p.name.replace(/-40W\w+$/, "")}</TableCell>
                  <TableCell>{TECH_LABEL[p.type] ?? p.type}</TableCell>
                  <TableCell className="text-xs text-slate-500" title={p.owner ?? ""}>{p.owner ? (p.owner.length > 30 ? `${p.owner.slice(0, 28)}…` : p.owner) : "–"}</TableCell>
                  <TableCell className="text-right tabular-nums">{nf(p.productionMwh / 1000, 1)} GWh</TableCell>
                  <TableCell className="text-right tabular-nums">{nf(p.standaloneTlPerMwh)}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.sectorMedianTlPerMwh !== null ? nf(p.sectorMedianTlPerMwh) : "–"}</TableCell>
                  <TableCell className={`text-right tabular-nums ${p.vsMedianPct !== null && p.vsMedianPct > 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {p.vsMedianPct !== null ? `${p.vsMedianPct > 0 ? "+" : ""}${nf(p.vsMedianPct)}%` : "–"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
