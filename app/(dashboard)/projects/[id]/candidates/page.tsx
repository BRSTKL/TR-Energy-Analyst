"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Download, Loader2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CandidateResult, CandidateSort } from "@/lib/analysis/candidate-screening";
import type { AccessFilter, ProjectCandidates, YekdemFilter } from "@/lib/services/candidates";
import type { CandidateAccessKind } from "@/lib/analysis/candidate-access";
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
const YEKDEM_FILTERS: Array<{ id: YekdemFilter; label: string }> = [
  { id: "all", label: "Tümü" },
  { id: "exclude", label: "YEKDEM dışı" },
  { id: "only", label: "YEKDEM" },
];
const ACCESS_FILTERS: Array<{ id: AccessFilter; label: string }> = [
  { id: "independent", label: "Hedef (bağımsız)" },
  { id: "all", label: "Tümü" },
  { id: "aggregator", label: "Başka toplayıcıda" },
  { id: "group", label: "Grup portföyü" },
  { id: "retail", label: "Lisanssız / tedarik" },
  { id: "unknown", label: "Sahibi bilinmiyor" },
];
const ACCESS_BADGE: Record<CandidateAccessKind, { text: string; cls: string }> = {
  independent: { text: "Hedef: toplayıcısız, bağımsız", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  group: { text: "Grup portföyü", cls: "bg-slate-50 text-slate-700 border-slate-200" },
  aggregator: { text: "Başka toplayıcıda", cls: "bg-rose-50 text-rose-800 border-rose-200" },
  retail: { text: "Lisanssız / görevli tedarik", cls: "bg-slate-50 text-slate-600 border-slate-200" },
  unknown: { text: "Sahibi bilinmiyor", cls: "bg-amber-50 text-amber-800 border-amber-200" },
};

function AccessBadge({ c }: { c: CandidateResult }) {
  if (!c.access) return null;
  const b = ACCESS_BADGE[c.access.kind];
  const detail =
    c.access.kind === "aggregator"
      ? `: ${c.access.label}`
      : c.access.kind === "group"
        ? `: ${c.access.label} (${c.access.groupPlants} santral)`
        : "";
  return <span className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-[11px] ${b.cls}`}>{b.text + detail}</span>;
}

const SORTS: Array<{ id: CandidateSort; label: string }> = [
  { id: "total", label: "Toplam kazanç" },
  { id: "perMwh", label: "MWh başına kazanç" },
];

const sub = (c: CandidateResult) =>
  [c.organizationName ?? "Sahibi bilinmiyor", TECH[c.type] ?? c.type, c.hydroKind ? `${HYDRO[c.hydroKind]} (tahmini)` : null, c.yekdem ? "YEKDEM" : null]
    .filter(Boolean)
    .join(" · ");

function downloadCsv(d: ProjectCandidates) {
  const num = (v: number | null | undefined, digits = 1) => (v == null ? "" : v.toFixed(digits).replace(".", ","));
  const head = ["Sıra", "Santral", "EPİAŞ kimliği", "Şirket", "Teknoloji", "YEKDEM", "Ulaşılabilirlik", "Toplayıcı / grup", "Üretim MWh", "Tek başına dengesizlik TL", "Netleşme kazancı TL", "Kazanç TL/MWh", "Kazanç / tek başına %", "Zıt yönde saat %", "Adil prim TL/MWh", "Tek başına TL/MWh (KÜPST dahil)"];
  const lines = d.result.candidates.map((c, i) =>
    [String(i + 1), c.name, String(c.epiasPlantId), c.organizationName ?? "", TECH[c.type] ?? c.type, c.yekdem ? "Evet" : c.yekdem === false ? "Hayır" : "", c.access ? ACCESS_BADGE[c.access.kind].text : "", c.access?.label ?? "", num(c.actualMwh, 0), num(c.standaloneCostTl, 0), num(c.gainTl, 0), num(c.gainPerMwhTl), num(c.gainPct), num(c.offsettingPct), num(c.fair?.fairUnitTl), num(c.fair?.standaloneUnitTl)]
      .map((x) => `"${x.replace(/"/g, '""')}"`)
      .join(";")
  );
  const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `aday_santraller_${d.project.name.replace(/\s+/g, "_")}${d.result.sortBy === "perMwh" ? "_mwh_basina" : ""}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function CandidatesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("ALL");
  const [yekdem, setYekdem] = useState<YekdemFilter>("all");
  const [access, setAccess] = useState<AccessFilter>("independent");
  const [sortBy, setSortBy] = useState<CandidateSort>("total");
  const [data, setData] = useState<ProjectCandidates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    if (filter !== "ALL") q.set("types", filter);
    if (yekdem !== "all") q.set("yekdem", yekdem);
    if (sortBy !== "total") q.set("sort", sortBy);
    if (access !== "all") q.set("access", access);
    fetch(`/api/projects/${projectId}/candidates${q.toString() ? `?${q}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Aday taraması yüklenemedi."))
      .finally(() => setLoading(false));
  }, [projectId, filter, yekdem, sortBy, access]);

  const list = data?.result.candidates ?? [];
  const top = list.filter((c) => c.fair);
  const rest = list.filter((c) => !c.fair);
  const best = top[0];
  const perMwh = data?.result.sortBy === "perMwh";
  // Çubuk, seçili sıralamanın ölçüsünü gösterir
  const metric = (c: CandidateResult) => (perMwh ? c.gainPerMwhTl : c.gainTl);
  const maxMetric = Math.max(...top.map(metric), 1);
  const pf = data?.result.portfolio;
  const minGwh = data?.result.minActualMwh != null ? data.result.minActualMwh / 1000 : null;

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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <Button key={f.id} size="sm" variant={filter === f.id ? "default" : "outline"} onClick={() => setFilter(f.id)}>
                {f.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">Destek:</span>
            {YEKDEM_FILTERS.map((f) => (
              <Button key={f.id} size="sm" variant={yekdem === f.id ? "default" : "outline"} onClick={() => setYekdem(f.id)}>
                {f.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">Sıralama:</span>
            {SORTS.map((f) => (
              <Button key={f.id} size="sm" variant={sortBy === f.id ? "default" : "outline"} onClick={() => setSortBy(f.id)}>
                {f.label}
              </Button>
            ))}
          </div>
          <div className="flex w-full flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">Ulaşılabilirlik:</span>
            {ACCESS_FILTERS.map((f) => {
              const n = data ? (f.id === "all" ? Object.values(data.accessCounts).reduce((a, b) => a + b, 0) : data.accessCounts[f.id]) : null;
              return (
                <Button key={f.id} size="sm" variant={access === f.id ? "default" : "outline"} onClick={() => setAccess(f.id)}>
                  {f.label}
                  {n !== null && <span className="ml-1 text-xs opacity-70">{nf(n)}</span>}
                </Button>
              );
            })}
          </div>
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

        {data && !data.aggregatorList && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-words">
              Toplayıcıların santral listeleri henüz toplanmadı; &quot;başka toplayıcıda&quot; ayrımı yapılamıyor ve bu santraller hedef
              görünebilir. Toplamak için (VPN açık): <code>node --env-file=.env node_modules/.bin/tsx scripts/aggregator-collect.mts</code>
            </span>
          </div>
        )}

        {data && pf && (
          <>
            <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
              <CardContent className="space-y-1 p-4 text-sm text-slate-800">
                {best ? (
                  <p className="text-base">
                    {perMwh ? "MWh başına en çok değer katan aday" : "En çok değer katacak aday"} <b>{best.name}</b> ({best.organizationName ?? "sahibi bilinmiyor"}): portföye eklenirse portföy ve
                    aday birlikte <b>{tl(best.gainTl)}</b> daha az dengesizlik öder
                    {perMwh ? (
                      <>
                        ; adayın her MWh&apos;ı için <b>{nf(best.gainPerMwhTl, 1)} TL</b>
                      </>
                    ) : null}
                    ; bu, adayın tek başına maliyetine göre %{nf(best.gainPct)}. Adil prim MWh başına <b>{nf(best.fair!.fairUnitTl, 1)} TL</b> (tek başına {nf(best.fair!.standaloneUnitTl, 1)} TL).
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
                <CardTitle className="text-base">
                  {perMwh ? `Adayın MWh'ı başına en çok değer katan ${top.length} santral` : `Portföyünüze en çok değer katacak ${top.length} santral`}
                </CardTitle>
                <CardDescription>
                  Netleşme kazancı = portföyün ve adayın ayrı ayrı ödeyeceği dengesizlik − birlikte ödedikleri. Kazanç, adayın sapması
                  portföyünkünü dengelediği saatlerden gelir.
                  {perMwh && minGwh !== null
                    ? ` MWh başına sıralamada üretimi ${nf(minGwh, 1)} GWh'tan (portföyün %5'i) az olan santraller sona alınır.`
                    : " Toplam kazanç büyük santralleri öne çıkarır; santral büyüklüğünden bağımsız karşılaştırma için MWh başına sıralamayı seçin."}
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Santral</TableHead>
                      <TableHead className="text-right">Üretim</TableHead>
                      <TableHead className="min-w-[180px]">{perMwh ? "Kazanç TL/MWh" : "Netleşme kazancı"}</TableHead>
                      <TableHead className="text-right">{perMwh ? "Netleşme kazancı" : "Kazanç TL/MWh"}</TableHead>
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
                          <AccessBadge c={c} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">{nf(c.actualMwh / 1000)} GWh</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded-full bg-slate-100">
                              <div className="h-2 rounded-full bg-[#2a78d6]" style={{ width: `${Math.max(2, (metric(c) / maxMetric) * 100)}%` }} />
                            </div>
                            <span className="w-20 text-right font-semibold tabular-nums text-slate-900">
                              {perMwh ? nf(c.gainPerMwhTl, 1) : tl(c.gainTl)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{perMwh ? tl(c.gainTl) : nf(c.gainPerMwhTl, 1)}</TableCell>
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
                        <TableCell colSpan={9} className="py-8 text-center text-sm text-slate-500">
                          Bu süzgeçlerle aday yok.
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
                    <CardDescription>
                      {perMwh ? "MWh başına kazanca göre sıralı (eşiğin altındakiler sonda)" : "Kazanca göre sıralı"}; adil prim yalnızca ilk{" "}
                      {top.length} aday için hesaplanır.
                    </CardDescription>
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
                          <TableHead className="text-right">Kazanç TL/MWh</TableHead>
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
                              <AccessBadge c={c} />
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right tabular-nums">{nf(c.actualMwh / 1000)} GWh</TableCell>
                            <TableCell className="text-right tabular-nums">{tl(c.gainTl)}</TableCell>
                            <TableCell className="text-right tabular-nums">{nf(c.gainPerMwhTl, 1)}</TableCell>
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
              {data.excluded.byAccess > 0 && ` Ulaşılabilirlik süzgeci nedeniyle ${nf(data.excluded.byAccess)} santral listede yok.`}
              {data.excluded.byYekdem > 0 &&
                ` Destek süzgeci nedeniyle ${nf(data.excluded.byYekdem)} santral (${data.yekdem === "exclude" ? "YEKDEM'li" : "YEKDEM dışı"}) listede yok.`}
              {data.withoutHourly > 0 && ` Saatlik serisi toplanmamış ${nf(data.withoutHourly)} santral taranamadı.`}
              {data.result.skippedForCoverage > 0 && ` Portföy saatlerinin %90'ından azında verisi olan ${nf(data.result.skippedForCoverage)} santral elendi.`}{" "}
              Maliyet sonuç sayfasıyla aynı motordan; santraller tek dengede uzlaştırılmış varsayılır. Adil prim: Shapley payı + tahmini
              KÜPST, adayın üretimine bölünür
              {top[0]?.fair?.method === "two-player" ? " (üye sayısı fazla olduğundan portföy tek oyuncu sayıldı, kazanç ikiye bölündü)" : ""}. Zıt
              yönde saat: adayın ve portföyün sapmasının ters işaretli olduğu saatlerin payı. YEKDEM&apos;li bir santralin dengesizliği ana senaryoda
              YEKDEM havuzunda kaldığından, toplayıcının serbest piyasa portföyüne katkısı için &quot;YEKDEM dışı&quot; süzgeci daha gerçekçidir.
            </p>
            <p className="text-xs text-slate-500">
              <b>Ulaşılabilirlik:</b> &quot;Başka toplayıcıda&quot;, EPİAŞ&apos;ta &quot;(TOPLAYICI)&quot; olarak kayıtlı katılımcıların santral
              listelerinden gelir
              {data.aggregatorList
                ? ` (${data.aggregatorList.aggregators} toplayıcı, ${data.aggregatorList.asOf}${data.aggregatorList.failed ? `; ${data.aggregatorList.failed} toplayıcının listesi alınamadı` : ""})`
                : " (henüz toplanmadı)"}
              . &quot;Grup portföyü&quot;: sahibinin grubunun EPİAŞ&apos;ta en az 3 santrali var (aynı şirket ya da şirket adındaki aynı marka,
              ör. ENERJİSA); böyle bir grup santrallerini kendi portföyünde netleştirir. &quot;Lisanssız / görevli tedarik&quot;: görevli tedarik
              şirketlerinin (K3) portföyü ve lisanssız santraller. &quot;Hedef&quot;: bunların hiçbiri. Tahmindir: dengeden sorumlu grup
              üyeliği EPİAŞ&apos;ta santral bazında yayımlanmaz ve yalnızca yer adıyla kurulmuş bir proje şirketi grubuna bağlanamaz.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
