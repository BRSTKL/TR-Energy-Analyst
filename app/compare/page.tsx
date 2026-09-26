"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProjectKpis } from "@/lib/services/project-kpis";

interface ProjectOption {
  id: string;
  name: string;
  plantCount: number;
  totalRecords: number;
}

const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const mTl = (v: number | null) => (v === null ? "–" : `${nf(v / 1e6, 1)} M ₺`);
const TECH: Record<string, string> = { RES: "Rüzgâr", GES: "Güneş", HES: "Hidro" };

/**
 * Bir satır: etiket, her proje için gösterilecek metin ve (varsa) kıyas değeri. `better` verilirse en iyi hücre
 * vurgulanır ("low": düşük olan iyi). Rakamlar Dengesizlik Karnesi ile aynı motordan gelir.
 */
interface Metric {
  label: string;
  hint?: string;
  text: (k: ProjectKpis) => string;
  value?: (k: ProjectKpis) => number | null;
  better?: "low" | "high";
  section?: string;
}

const METRICS: Metric[] = [
  { section: "Portföy", label: "Şirket", text: (k) => k.companies.join(", ") || "Sahibi bilinmiyor" },
  { label: "Santral · kurulu güç", text: (k) => `${k.plantCount} santral · ${nf(k.capacityMw)} MW` },
  { label: "Teknoloji", text: (k) => k.types.map((t) => TECH[t] ?? t).join(", ") },
  { label: "Dönem", text: (k) => (k.period ? `${k.period.start} – ${k.period.end} (${k.period.months} ay)` : "–") },
  { label: "Üretim", text: (k) => `${nf(k.actualMwh / 1000)} GWh` },
  {
    section: "Sapma yükü (dengesizlik + KÜPST)",
    label: "Veri yılı, ana senaryo",
    hint: "YEKDEM santrallerinin dengesizliği YEKDEM havuzunda; KÜPST tüm santraller için şirkete",
    text: (k) => mTl(k.load.a2025),
  },
  {
    label: "2026 kurallarıyla, ana senaryo",
    hint: "YEKDEM'den çıkan santraller şirkete geçer; %3/%6 katsayı ve 2026 KÜPST oranları",
    text: (k) =>
      k.load.a2026 === null ? "–" : `${mTl(k.load.a2026)} (${k.load.a2026 >= k.load.a2025 ? "+" : ""}%${nf((k.load.a2026 / k.load.a2025 - 1) * 100)})`,
  },
  {
    label: "Duyarlılık: tüm santraller şirkete",
    text: (k) => `${mTl(k.load.b2025)} → ${mTl(k.load.b2026)}`,
  },
  {
    label: "MWh başına sapma yükü",
    hint: "Tüm santraller, şirket bazında netleşmiş; şirketler arası karşılaştırma için ortak taban",
    text: (k) => `${nf(k.unitLoadTl)} TL/MWh`,
    value: (k) => k.unitLoadTl,
    better: "low",
  },
  {
    section: "Dengesizlik",
    label: "Santral bazında (tek tek)",
    text: (k) => mTl(k.imbalancePlantLevelTl),
  },
  { label: "Şirket bazında (netleşmiş)", text: (k) => mTl(k.imbalanceCompanyLevelTl) },
  {
    label: "Portföy içi netleşme kazancı",
    text: (k) => `${mTl(k.nettingTl)} (%${nf(k.imbalancePlantLevelTl > 0 ? (k.nettingTl / k.imbalancePlantLevelTl) * 100 : 0)})`,
    value: (k) => (k.imbalancePlantLevelTl > 0 ? k.nettingTl / k.imbalancePlantLevelTl : null),
    better: "high",
  },
  { label: "KÜPST (tahmini)", text: (k) => mTl(k.kupstTl) },
  {
    section: "Risk primi (piyasaya açık portföy, 2026 kuralları)",
    label: "Beklenen",
    text: (k) => (k.riskPremium ? `${nf(k.riskPremium.expectedTlPerMwh)} TL/MWh` : "6 aydan az veri"),
    value: (k) => k.riskPremium?.expectedTlPerMwh ?? null,
    better: "low",
  },
  {
    label: "İhtiyatlı (aylık P90)",
    text: (k) => (k.riskPremium ? `${nf(k.riskPremium.p90MonthTlPerMwh)} TL/MWh` : "–"),
    value: (k) => k.riskPremium?.p90MonthTlPerMwh ?? null,
    better: "low",
  },
  {
    section: "Sektör ve YEKDEM",
    label: "Sektördeki yeri",
    hint: "Santral bazında MWh başına dengesizlik; yalnızca rüzgâr ve güneş",
    text: (k) =>
      k.sector.length
        ? k.sector.map((s) => `${TECH[s.type] ?? s.type}: ${nf(s.unitTl)} TL/MWh, sektörün %${Math.round(100 - s.rankPct)} kadarından iyi`).join(" · ")
        : "Sektör verisi yok",
  },
  {
    label: "YEKDEM",
    text: (k) =>
      k.yekdem.inYekdem === 0
        ? "YEKDEM santrali yok"
        : `${k.yekdem.inYekdem} santral; ${k.yekdem.exiting} çıkıyor, ${k.yekdem.staying} kalıyor${k.yekdem.unknown ? `, ${k.yekdem.unknown} bilinmiyor` : ""}`,
  },
  {
    label: "En yüksek riskli santral",
    text: (k) => (k.worstPlant ? `${k.worstPlant.name} · ${nf(k.worstPlant.unitCostTl)} TL/MWh` : "–"),
  },
];

function bestIndex(m: Metric, rows: ProjectKpis[]): number {
  if (!m.value || !m.better || rows.length < 2) return -1;
  let best = -1;
  rows.forEach((k, i) => {
    const v = m.value!(k);
    if (v === null) return;
    const b = best >= 0 ? m.value!(rows[best])! : null;
    if (b === null || (m.better === "low" ? v < b : v > b)) best = i;
  });
  return best;
}

function downloadCsv(rows: ProjectKpis[]) {
  const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [
    ["Gösterge", ...rows.map((k) => k.name)].map(cell).join(";"),
    ...METRICS.map((m) => [m.section ? `${m.section} · ${m.label}` : m.label, ...rows.map((k) => m.text(k))].map(cell).join(";")),
  ];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "proje_karsilastirma.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ComparePage() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [rows, setRows] = useState<ProjectKpis[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const preset = new URLSearchParams(window.location.search).get("ids")?.split(",").filter(Boolean) ?? [];
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        const list: ProjectOption[] = d.projects.filter((p: ProjectOption) => p.totalRecords > 0);
        setProjects(list);
        const initial = preset.length ? preset.filter((id) => list.some((p) => p.id === id)) : list.slice(0, 4).map((p) => p.id);
        setSelected(initial);
        if (initial.length) run(initial);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Projeler yüklenemedi."));
  }, []);

  function run(ids: string[]) {
    if (ids.length === 0) return;
    setLoading(true);
    setError(null);
    window.history.replaceState(null, "", `/compare?ids=${ids.join(",")}`);
    fetch(`/api/compare?ids=${ids.join(",")}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setRows(d.rows);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Karşılaştırma hesaplanamadı."))
      .finally(() => setLoading(false));
  }

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-8)));

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 sm:px-6 md:flex-row md:items-end md:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-2 text-xs">
              <Link href="/" className="flex items-center gap-1 text-slate-500 hover:text-slate-900">
                <ArrowLeft className="h-3 w-3" /> Dashboard
              </Link>
              <span className="text-slate-300">/</span>
              <span className="font-medium text-slate-700">Proje karşılaştırma</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Proje karşılaştırma</h1>
            <p className="mt-1 max-w-3xl text-xs text-slate-600 sm:text-sm">
              Projelerin sapma yükü, netleşme kazancı, risk primi ve sektördeki yeri yan yana. Rakamlar Dengesizlik Karnesi ile aynı
              motordan gelir; her proje bir şirket ya da portföy olabilir.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/sector">Sektör karnesi</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Karşılaştırılacak projeler</CardTitle>
            <CardDescription>En fazla 8 proje. Yeni bir şirketi eklemek için Sektör karnesinden ya da EPİAŞ aramasından proje oluşturun.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {projects.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
                  selected.includes(p.id) ? "border-sky-400 bg-sky-50 text-sky-900" : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                {p.name}
                <span className="text-xs text-slate-500">{p.plantCount} santral</span>
              </label>
            ))}
            {projects.length === 0 && !error && <p className="text-sm text-slate-500">Verisi olan proje yok.</p>}
            <Button size="sm" onClick={() => run(selected)} disabled={selected.length === 0 || loading} className="ml-auto">
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Karşılaştır
            </Button>
          </CardContent>
        </Card>

        {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}

        {rows && rows.length > 0 && (
          <Card className={loading ? "opacity-60" : ""}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">Göstergeler</CardTitle>
                <CardDescription>Yeşil: satırdaki en iyi değer (yalnızca kıyaslanabilir göstergelerde).</CardDescription>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadCsv(rows)}>
                <Download className="h-3.5 w-3.5" /> Excel (CSV)
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-64">Gösterge</TableHead>
                    {rows.map((k) => (
                      <TableHead key={k.id} className="min-w-[200px] align-bottom">
                        <p className="font-semibold text-slate-900">{k.name}</p>
                        <div className="flex gap-2 pb-1 text-xs font-normal">
                          <Link href={`/projects/${k.id}/results`} className="text-sky-700 hover:underline">
                            Sonuçlar
                          </Link>
                          <Link href={`/projects/${k.id}/dsg`} className="text-sky-700 hover:underline">
                            DSG
                          </Link>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {METRICS.flatMap((m) => {
                    const best = bestIndex(m, rows);
                    const out = [];
                    if (m.section) {
                      out.push(
                        <TableRow key={`s-${m.section}`} className="bg-slate-50 hover:bg-slate-50">
                          <TableCell colSpan={rows.length + 1} className="py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                            {m.section}
                          </TableCell>
                        </TableRow>
                      );
                    }
                    out.push(
                      <TableRow key={m.label}>
                        <TableCell className="align-top">
                          <p className="text-sm font-medium text-slate-800">{m.label}</p>
                          {m.hint && <p className="text-xs text-slate-500">{m.hint}</p>}
                        </TableCell>
                        {rows.map((k, i) => (
                          <TableCell key={k.id} className={`align-top text-sm tabular-nums ${i === best ? "bg-emerald-50 font-semibold text-emerald-800" : "text-slate-800"}`}>
                            {m.text(k)}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                    return out;
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-slate-500">
          Farklı dönemleri kapsayan projeler doğrudan karşılaştırılamaz; &quot;Dönem&quot; satırını kontrol edin. Sapma yükü ve dengesizlik
          şirket bazında uzlaştırmayla; sektör sırası santral bazında (tahmin kalitesi) hesaplanır. KÜPST tahminidir.
        </p>
      </main>
    </div>
  );
}
