"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, BookOpen, Database, Layers, Wind, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportDownloadDialog } from "@/components/report-download-dialog";
import { EpiasSyncDialog } from "@/components/epias-sync-dialog";
import type { ProjectKpis } from "@/lib/services/project-kpis";

/**
 * Ana sayfa: uygulamayı ilk açan kişinin gördüğü özet. Hepsi gerçek veriden ve raporla aynı motordan gelir:
 * piyasanın son durumu (/api/market), projelerin sapma yükü ve sektördeki yeri (/api/compare), sektör karnesinin
 * teknoloji medyanları (/api/sector) ve veri durumu.
 */

const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const tl = (v: number) => (Math.abs(v) >= 1e6 ? `${nf(v / 1e6, 1)} M ₺` : `${nf(v / 1e3, 0)} bin ₺`);
const pct = (a: number, b: number) => (a !== 0 ? ((b - a) / Math.abs(a)) * 100 : null);
const signed = (v: number | null, d = 0) => (v === null ? "" : `${v >= 0 ? "+" : "−"}%${nf(Math.abs(v), d)}`);
const trDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const periodShort = (p: { start: string; end: string }) =>
  `${MONTHS[Number(p.start.slice(5, 7)) - 1]}–${MONTHS[Number(p.end.slice(5, 7)) - 1]} ${p.end.slice(0, 4)}`;
const TECH: Record<string, string> = { RES: "Rüzgâr", GES: "Güneş", HES: "Hidro" };

interface MarketStats {
  spread: { mean: number };
  ptf: { mean: number };
  zeroHours: number;
  direction: { deficitPct: number };
}
interface MarketResponse {
  success: boolean;
  error?: string;
  available: { start: string; end: string } | null;
  period: { label: string };
  previousPeriod: { label: string } | null;
  current: MarketStats;
  previous: MarketStats | null;
  sentences: string[];
}
interface SectorResponse {
  success: boolean;
  years: number[];
  year: number;
  label: string;
  byType: Partial<Record<string, { unitImbalanceTl: { count: number; median: number } }>>;
}

/** Sektördeki yer: düşük yüzdelik daha iyi */
const rankText = (rankPct: number) => (rankPct <= 50 ? `en iyi %${nf(Math.max(1, rankPct))}` : `en kötü %${nf(Math.max(1, 100 - rankPct))}`);

function Kpi({ label, value, sub, tone = "text-slate-900" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Skeleton({ h = "h-24" }: { h?: string }) {
  return <div className={`${h} animate-pulse rounded-lg border border-slate-200 bg-slate-100/70`} />;
}

function SectionHead({ title, sub, href, cta }: { title: string; sub?: string; href?: string; cta?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {sub && <p className="text-sm text-slate-600">{sub}</p>}
      </div>
      {href && (
        <Link href={href} className="flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-900">
          {cta} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

function MarketSection({ market }: { market: MarketResponse | null | undefined }) {
  if (market === undefined)
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} />
        ))}
      </div>
    );
  if (!market) return <p className="text-sm text-slate-500">Piyasa verisi yüklenemedi. EPİAŞ&apos;tan piyasa verisini güncelleyin.</p>;
  const c = market.current;
  const p = market.previous;
  const prevLabel = market.previousPeriod?.label.slice(0, 4);
  return (
    <div className="space-y-3">
      {market.sentences[0] && <p className="text-sm text-slate-800">{market.sentences[0]}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="SMF–PTF makası (saatlik ortalama)"
          value={`${nf(c.spread.mean)} TL/MWh`}
          sub={p ? `${prevLabel}: ${nf(p.spread.mean)} (${signed(pct(p.spread.mean, c.spread.mean))})` : undefined}
          tone={p && c.spread.mean > p.spread.mean ? "text-rose-700" : "text-slate-900"}
        />
        <Kpi
          label="Ortalama PTF"
          value={`${nf(c.ptf.mean)} TL/MWh`}
          sub={p ? `${prevLabel}: ${nf(p.ptf.mean)} (${signed(pct(p.ptf.mean, c.ptf.mean))})` : undefined}
        />
        <Kpi label="Sıfır fiyatlı saat" value={nf(c.zeroHours)} sub={p ? `${prevLabel}: ${nf(p.zeroHours)}` : undefined} />
        <Kpi
          label="Sistem açığındaki saatlerin payı"
          value={`%${nf(c.direction.deficitPct)}`}
          sub={p ? `${prevLabel}: %${nf(p.direction.deficitPct)}` : undefined}
        />
      </div>
    </div>
  );
}

function ProjectsSection({ rows, total }: { rows: ProjectKpis[] | null | undefined; total: number | null }) {
  if (rows === undefined) return <Skeleton h="h-40" />;
  if (!rows || rows.length === 0)
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          Henüz verisi olan proje yok. EPİAŞ&apos;tan bir şirketin santrallerini ekleyerek ya da üretim dosyası yükleyerek başlayın.
        </p>
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/projects">
            <Layers className="h-4 w-4" /> Projelerim
          </Link>
        </Button>
      </div>
    );
  return (
    <Card className="shadow-sm">
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proje</TableHead>
              <TableHead>Dönem</TableHead>
              <TableHead className="text-right">Sapma yükü</TableHead>
              <TableHead className="text-right">MWh başına</TableHead>
              <TableHead>Sektördeki yer</TableHead>
              <TableHead>Veri</TableHead>
              <TableHead className="text-right">Rapor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/projects/${r.id}/results`} className="font-medium text-slate-900 hover:text-indigo-700 hover:underline">
                    {r.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {r.plantCount} santral · {nf(r.capacityMw)} MW · {r.types.map((t) => TECH[t] ?? t).join(", ")}
                    {r.companies.length ? ` · ${r.companies.length === 1 ? r.companies[0] : `${r.companies.length} şirket`}` : ""}
                  </p>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-slate-600">{r.period ? periodShort(r.period) : "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  <span className="font-semibold text-slate-900">{tl(r.load.current)}</span>
                  {r.load.next2026 !== null && <p className="text-xs text-rose-700">2026 kurallarıyla {tl(r.load.next2026)}</p>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{nf(r.unitLoadTl)} TL</TableCell>
                <TableCell className="text-sm">
                  {r.sector.length
                    ? r.sector.map((s) => (
                        <p key={`${s.type}-${s.kind ?? ""}`} className={s.rankPct <= 50 ? "text-emerald-700" : "text-rose-700"}>
                          {TECH[s.type] ?? s.type}{s.kind === "RESERVOIR" ? " (barajlı)" : s.kind === "RUN_OF_RIVER" ? " (nehir tipi)" : ""}: {rankText(s.rankPct)}
                        </p>
                      ))
                    : <span className="text-slate-400">karne yok</span>}
                </TableCell>
                <TableCell className="text-sm">
                  {r.dataGaps.length === 0 ? (
                    <span className="text-emerald-700">Tam</span>
                  ) : (
                    <span className="text-amber-700" title={r.dataGaps.join("\n")}>
                      {r.dataGaps.length} eksik
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <ReportDownloadDialog projectId={r.id} label="PPT" compact />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="border-t px-4 py-2 text-xs text-slate-500">
          Sapma yükü: dönemin dengesizlik riski (tüm santraller, uzlaştırma biriminde netleşmiş) + tahmini KÜPST. MWh başına: sapma
          yükü / üretim. Sektördeki yer: MWh başına dengesizlikte aynı
          dönemin sektör karnesindeki yüzdelik.
          {total !== null && total > rows.length ? ` En yeni ${rows.length} proje gösteriliyor (toplam ${total}).` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

function SectorSection({ cur, prev }: { cur: SectorResponse | null | undefined; prev: SectorResponse | null | undefined }) {
  if (cur === undefined)
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} />
        ))}
      </div>
    );
  if (!cur) return <p className="text-sm text-slate-500">Sektör karnesi henüz toplanmadı.</p>;
  const types = (["RES", "GES", "HES"] as const).filter((t) => cur.byType[t]);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {types.map((t) => {
        const d = cur.byType[t]!.unitImbalanceTl;
        const pd = prev?.byType[t]?.unitImbalanceTl;
        return (
          <Kpi
            key={t}
            label={`${TECH[t]} · ${nf(d.count)} santral · medyan`}
            value={`${nf(d.median)} TL/MWh`}
            sub={pd ? `${prev!.year}: ${nf(pd.median)} (${signed(pct(pd.median, d.median))})` : undefined}
          />
        );
      })}
    </div>
  );
}

export default function HomePage() {
  const [market, setMarket] = useState<MarketResponse | null | undefined>(undefined);
  const [rows, setRows] = useState<ProjectKpis[] | null | undefined>(undefined);
  const [projectTotal, setProjectTotal] = useState<number | null>(null);
  const [sector, setSector] = useState<SectorResponse | null | undefined>(undefined);
  const [sectorPrev, setSectorPrev] = useState<SectorResponse | null | undefined>(undefined);

  useEffect(() => {
    const json = (r: Response) => (r.ok ? r.json() : null);
    fetch("/api/market")
      .then(json)
      .then((d) => setMarket(d?.success ? d : null))
      .catch(() => setMarket(null));
    fetch("/api/projects")
      .then(json)
      .then(async (d) => {
        const ids: string[] = (d?.projects ?? []).map((p: { id: string }) => p.id);
        setProjectTotal(ids.length);
        if (!ids.length) return setRows(null);
        const c = await fetch(`/api/compare?ids=${ids.slice(0, 6).join(",")}`).then(json);
        // En yeni dönem üstte
        setRows(c?.success ? [...(c.rows as ProjectKpis[])].sort((a, b) => (b.period?.end ?? "").localeCompare(a.period?.end ?? "")) : null);
      })
      .catch(() => setRows(null));
    fetch("/api/sector")
      .then(json)
      .then((d: SectorResponse | null) => {
        setSector(d?.success ? d : null);
        const prevYear = d?.years?.find((y) => y < d.year);
        if (!prevYear) return setSectorPrev(null);
        return fetch(`/api/sector?year=${prevYear}`)
          .then(json)
          .then((p) => setSectorPrev(p?.success ? p : null));
      })
      .catch(() => {
        setSector(null);
        setSectorPrev(null);
      });
  }, []);

  return (
    <main className="min-h-screen bg-slate-50/50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow">
                <Zap className="h-5 w-5" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">TR-Energy Analyst</h1>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm text-slate-600">
              EPİAŞ açık verisiyle yenilenebilir üreticilerin dengesizlik maliyetini ölçen, sektörle kıyaslayan ve azaltma yollarını
              gösteren analiz aracı.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild className="gap-2 bg-slate-900 text-white hover:bg-slate-800">
              <Link href="/projects">
                <Layers className="h-4 w-4" /> Projelerim
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/market">
                <Activity className="h-4 w-4" /> Piyasa
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/sector">
                <Wind className="h-4 w-4" /> Sektör karnesi
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/compare">
                <Layers className="h-4 w-4" /> Karşılaştır
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/methodology">
                <BookOpen className="h-4 w-4" /> Metodoloji
              </Link>
            </Button>
          </div>
        </div>

        <section className="space-y-3">
          <SectionHead
            title={`Piyasa · ${market?.period.label ?? ""}`}
            sub={market?.previousPeriod ? `Bir önceki yılın aynı dönemiyle: ${market.previousPeriod.label}` : undefined}
            href="/market"
            cta="Piyasa özeti"
          />
          <MarketSection market={market} />
        </section>

        <section className="space-y-3">
          <SectionHead title="Projeler" sub="Dengesizlik Karnesi ile aynı motordan" href="/projects" cta="Tüm projeler" />
          <ProjectsSection rows={rows} total={projectTotal} />
        </section>

        <section className="space-y-3">
          <SectionHead
            title={`Sektör karnesi · ${sector?.label ?? ""}`}
            sub="Lisanslı santrallerin MWh başına dengesizlik riski (santral tek başına)"
            href="/sector"
            cta="Sektör karnesi"
          />
          <SectorSection cur={sector} prev={sectorPrev} />
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <Database className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p>
              <b className="text-slate-800">Veri durumu:</b> piyasa verisi{" "}
              {market?.available ? `${trDate(market.available.start)} – ${trDate(market.available.end)}` : "—"} (EPİAŞ) · sektör
              karnesi {sector?.years?.length ? [...sector.years].sort().join(", ") : "—"} ·{" "}
              {projectTotal !== null ? `${nf(projectTotal)} proje` : "—"}. Kaynak ve yöntem:{" "}
              <Link href="/methodology" className="text-indigo-700 hover:underline">
                Metodoloji
              </Link>
              .
            </p>
          </div>
          <EpiasSyncDialog />
        </section>
      </div>
    </main>
  );
}
