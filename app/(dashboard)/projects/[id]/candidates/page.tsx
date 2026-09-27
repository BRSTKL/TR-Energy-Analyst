"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Download, Loader2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CandidateResult } from "@/lib/analysis/candidate-screening";
import type { ProjectCandidates } from "@/lib/services/candidates";
import type { SectorTech } from "@/lib/sector/benchmark";

const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const tl = (v: number) => (Math.abs(v) >= 1e6 ? `${nf(v / 1e6, 1)} M ₺` : `${nf(v / 1e3, 0)} bin ₺`);
const TECH: Record<string, string> = { RES: "Rüzgâr", GES: "Güneş", HES: "Hidro" };
const HYDRO: Record<string, string> = { RESERVOIR: "barajlı", RUN_OF_RIVER: "nehir tipi" };
const BASIS: Record<ProjectCandidates["basis"], string> = { owners: "santral sahibi", plants: "santral", companies: "şirket" };
const FILTERS: Array<{ id: "ALL" | SectorTech; label: string }> = [
  { id: "ALL", label: "Tümü" },
  { id: "RES", label: "Rüzgâr" },
  { id: "GES", label: "Güneş" },
  { id: "HES", label: "Hidro" },
];

const sub = (c: CandidateResult) =>
  [c.organizationName ?? "Sahibi bilinmiyor", TECH[c.type] ?? c.type, c.hydroKind ? `${HYDRO[c.hydroKind]} (tahmini)` : null, c.yekdem ? "YEKDEM" : null]
    .filter(Boolean)
    .join(" · ");

function downloadCsv(d: ProjectCandidates) {
  const num = (v: number | null | undefined, digits = 1) => (v == null ? "" : v.toFixed(digits).replace(".", ","));
  const head = ["Sıra", "Santral", "EPİAŞ kimliği", "Şirket", "Teknoloji", "YEKDEM", "Üretim MWh", "Tek başına dengesizlik TL", "Netleşme kazancı TL", "Kazanç / tek başına %", "Zıt yönde saat %", "Adil prim TL/MWh", "Tek başına TL/MWh (KÜPST dahil)"];
  const lines = d.result.candidates.map((c, i) =>
    [String(i + 1), c.name, String(c.epiasPlantId), c.organizationName ?? "", TECH[c.type] ?? c.type, c.yekdem ? "Evet" : c.yekdem === false ? "Hayır" : "", num(c.actualMwh, 0), num(c.standaloneCostTl, 0), num(c.gainTl, 0), num(c.gainPct), num(c.offsettingPct), num(c.fair?.fairUnitTl), num(c.fair?.standaloneUnitTl)]
      .map((x) => `"${x.replace(/"/g, '""')}"`)
      .join(";")
  );
  const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `aday_santraller_${d.project.name.replace(/\s+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function CandidatesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("ALL");
  const [data, setData] = useState<ProjectCandidates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/projects/${projectId}/candidates${filter === "ALL" ? "" : `?types=${filter}`}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Aday taraması yüklenemedi."))
      .finally(() => setLoading(false));
  }, [projectId, filter]);

  const list = data?.result.candidates ?? [];
  const top = list.filter((c) => c.fair);
  const rest = list.filter((c) => !c.fair);
  const best = top[0];
  const maxGain = Math.max(...top.map((c) => c.gainTl), 1);
  const pf = data?.result.portfolio;

  return (
    <div className="min-h-screen bg-slate-50/60 pb-20">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-xs">
            <Link href={`/projects/${projectId}/results`} className="flex items-center gap-1 text-slate-500 hover:text-slate-900">
              <ArrowLeft className="h-3 w-3" /> Sonuçlar
            </Link>
            <span className="text-slate-300">/</span>
            <span className="font-medium text-slate-700">{data?.project.name ?? ""}</span>
          </div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            <Target className="h-6 w-6 text-indigo-600" /> Aday santraller
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Portföyünüze en çok değer katacak santraller: aday portföyle tek dengede uzlaştırılsaydı, saat saat netleşme sayesinde portföy
            ve aday birlikte ne kadar daha az dengesizlik öderdi. Adaylar aynı yılın sektör karnesindeki santrallerdir; adil prim, adayın
            portföydeki Shapley payıdır.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Button key={f.id} size="sm" variant={filter === f.id ? "default" : "outline"} onClick={() => setFilter(f.id)}>
              {f.label}
            </Button>
          ))}
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          {data && (
            <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => downloadCsv(data)}>
              <Download className="h-3.5 w-3.5" /> Tüm adaylar (CSV)
            </Button>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        )}

        {data && pf && (
          <>
            <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
              <CardContent className="space-y-1 p-4 text-sm text-slate-800">
                {best ? (
                  <p className="text-base">
                    En çok değer katacak aday <b>{best.name}</b> ({best.organizationName ?? "sahibi bilinmiyor"}): portföye eklenirse portföy ve
                    aday birlikte <b>{tl(best.gainTl)}</b> daha az dengesizlik öder; bu, adayın tek başına maliyetine göre %{nf(best.gainPct)}.
                    Adil prim MWh başına <b>{nf(best.fair!.fairUnitTl, 1)} TL</b> (tek başına {nf(best.fair!.standaloneUnitTl, 1)} TL).
                  </p>
                ) : (
                  <p>Uygun aday yok.</p>
                )}
                <p className="text-xs text-slate-600">
                  Portföy: {pf.members} {BASIS[data.basis]}, {nf(pf.hours)} saat, {nf(pf.actualMwh / 1000)} GWh, dengesizlik maliyeti {tl(pf.costTl)} ·
                  sektör karnesi {data.sectorLabel}. Tutarlar projenin dönemi içindir.
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Portföyünüze en çok değer katacak {top.length} santral</CardTitle>
                <CardDescription>
                  Netleşme kazancı = portföyün ve adayın ayrı ayrı ödeyeceği dengesizlik − birlikte ödedikleri. Kazanç, adayın sapması
                  portföyünkünü dengelediği saatlerden gelir.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Santral</TableHead>
                      <TableHead className="text-right">Üretim</TableHead>
                      <TableHead className="min-w-[180px]">Netleşme kazancı</TableHead>
                      <TableHead className="text-right">Kazanç / tek başına</TableHead>
                      <TableHead className="text-right">Zıt yönde saat</TableHead>
                      <TableHead className="text-right">Tek başına TL/MWh</TableHead>
                      <TableHead className="text-right">Adil prim TL/MWh</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {top.map((c, i) => (
                      <TableRow key={c.key}>
                        <TableCell className="text-slate-500">{i + 1}</TableCell>
                        <TableCell>
                          <p className="font-medium text-slate-900">{c.name}</p>
                          <p className="text-xs text-slate-500">{sub(c)}</p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">{nf(c.actualMwh / 1000)} GWh</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded-full bg-slate-100">
                              <div className="h-2 rounded-full bg-[#2a78d6]" style={{ width: `${Math.max(2, (c.gainTl / maxGain) * 100)}%` }} />
                            </div>
                            <span className="w-20 text-right font-semibold tabular-nums text-slate-900">{tl(c.gainTl)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">%{nf(c.gainPct)}</TableCell>
                        <TableCell className="text-right tabular-nums">%{nf(c.offsettingPct)}</TableCell>
                        <TableCell className="text-right tabular-nums">{nf(c.fair!.standaloneUnitTl, 1)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className="font-semibold text-slate-900">{nf(c.fair!.fairUnitTl, 1)}</span>
                          <span className="ml-1 text-xs text-slate-500">(−%{nf(c.fair!.discountPct)})</span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {top.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-8 text-center text-sm text-slate-500">
                          Bu teknolojide aday yok.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {rest.length > 0 && (
              <Card className="shadow-sm">
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                  <div>
                    <CardTitle className="text-base">Diğer adaylar ({nf(rest.length)})</CardTitle>
                    <CardDescription>Kazanca göre sıralı; adil prim yalnızca ilk {top.length} aday için hesaplanır.</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? "Gizle" : "Göster"}
                  </Button>
                </CardHeader>
                {showAll && (
                  <CardContent className="max-h-[480px] overflow-auto p-0">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white">
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Santral</TableHead>
                          <TableHead className="text-right">Üretim</TableHead>
                          <TableHead className="text-right">Netleşme kazancı</TableHead>
                          <TableHead className="text-right">Kazanç / tek başına</TableHead>
                          <TableHead className="text-right">Zıt yönde saat</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rest.map((c, i) => (
                          <TableRow key={c.key}>
                            <TableCell className="text-slate-500">{top.length + i + 1}</TableCell>
                            <TableCell>
                              <p className="text-slate-900">{c.name}</p>
                              <p className="text-xs text-slate-500">{sub(c)}</p>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right tabular-nums">{nf(c.actualMwh / 1000)} GWh</TableCell>
                            <TableCell className="text-right tabular-nums">{tl(c.gainTl)}</TableCell>
                            <TableCell className="text-right tabular-nums">%{nf(c.gainPct)}</TableCell>
                            <TableCell className="text-right tabular-nums">%{nf(c.offsettingPct)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>
            )}

            <p className="text-xs text-slate-500">
              Adaylar {data.sectorLabel} sektör karnesindeki {data.types.map((t) => TECH[t].toLocaleLowerCase("tr-TR")).join(", ")} santralleridir;
              projede olan {data.excluded.inProject} ve toplayıcının EPİAŞ portföyünde zaten olan {data.excluded.inAggregatorPortfolio} santral
              aday sayılmadı.
              {data.withoutHourly > 0 && ` Saatlik serisi toplanmamış ${nf(data.withoutHourly)} santral taranamadı.`}
              {data.result.skippedForCoverage > 0 && ` Portföy saatlerinin %90'ından azında verisi olan ${nf(data.result.skippedForCoverage)} santral elendi.`}{" "}
              Maliyet sonuç sayfasıyla aynı motordan; santraller tek dengede uzlaştırılmış varsayılır. Adil prim: Shapley payı + tahmini
              KÜPST, adayın üretimine bölünür
              {top[0]?.fair?.method === "two-player" ? " (üye sayısı fazla olduğundan portföy tek oyuncu sayıldı, kazanç ikiye bölündü)" : ""}. Zıt
              yönde saat: adayın ve portföyün sapmasının ters işaretli olduğu saatlerin payı.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
