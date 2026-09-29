"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, PlusCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SECTOR_TECHS, type Distribution, type HydroKind, type SectorBenchmark, type SectorCompanyRow, type SectorTech } from "@/lib/sector/benchmark";
import type { SectorPlant } from "@/lib/services/sector";

import { MethodLink } from "@/components/method-link";
type Tech = SectorTech;
type HydroFilter = "all" | HydroKind | "unknown";

interface SectorResponse {
  years: number[];
  year: number;
  /** "2025" ya da "2026 (Ocak–Ağustos)" */
  label: string;
  generatedAt: string;
  excluded: number;
  /** "k1": arıza / kısıntı saatleri hariç */
  view: "all" | "k1";
  k1Available: boolean;
  byType: SectorBenchmark["byType"];
  plants: SectorPlant[];
  companies: SectorCompanyRow[];
}

const TECH_LABEL: Record<Tech, string> = { RES: "Rüzgâr", GES: "Güneş", HES: "Hidro" };
const HYDRO_LABEL: Record<HydroKind, string> = { RESERVOIR: "Barajlı", RUN_OF_RIVER: "Nehir tipi" };
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const gwh = (mwh: number) => `${nf(mwh / 1000, 0)} GWh`;
/** Yüzdelik sıra düşük = iyi; ekranda "sektörün %X kadarından iyi" */
const betterThan = (rankPct: number) => Math.round(100 - rankPct);

/** Bir satır: şirket ya da santral (tablo ve seçim aynı şekli kullanır) */
interface Row {
  key: string;
  kind: "company" | "plant";
  name: string;
  sub: string;
  plantIds: number[];
  plantCount: number;
  mw: number;
  actualMwh: number;
  unitTl: number;
  unitKupstTl: number;
  rankPct: number;
  deviationPct: number | null;
  sameDirectionPct: number | null;
  yekdem: boolean | null;
  /** Yalnızca hidro santral satırında (tahmini) */
  hydroKind?: HydroKind | null;
}

type SortKey = "name" | "mw" | "actualMwh" | "unitTl" | "unitKupstTl" | "rankPct";

function toRows(data: SectorResponse, tech: Tech, view: "company" | "plant"): Row[] {
  if (view === "company") {
    return data.companies
      .filter((c) => c.type === tech)
      .map((c) => ({
        key: `c:${c.organizationId ?? c.name}`,
        kind: "company",
        name: c.name,
        sub: `${c.plantCount} santral`,
        plantIds: c.plantIds,
        plantCount: c.plantCount,
        mw: c.peakMw,
        actualMwh: c.actualMwh,
        unitTl: c.unitImbalanceTl,
        unitKupstTl: c.unitKupstTl,
        rankPct: c.rankPct,
        deviationPct: null,
        sameDirectionPct: null,
        yekdem: null,
      }));
  }
  return data.plants
    .filter((p) => p.type === tech)
    .map((p) => ({
      key: `p:${p.epiasPlantId}`,
      kind: "plant",
      name: p.name,
      sub: p.organizationName ?? "Sahibi bilinmiyor",
      plantIds: [p.epiasPlantId],
      plantCount: 1,
      mw: p.peakMw,
      actualMwh: p.actualMwh,
      unitTl: p.unitImbalanceTl,
      unitKupstTl: p.unitKupstTl,
      rankPct: p.rankPct,
      deviationPct: p.deviationPct,
      sameDirectionPct: p.sameDirectionPct,
      yekdem: p.yekdem,
      hydroKind: p.type === "HES" ? p.hydroKind ?? null : undefined,
    }));
}

/** Dağılım: 5 TL'lik aralıklarda santral sayısı; seçilen satırlar dikey çizgiyle işaretlenir */
function Histogram({ values, dist, marks }: { values: number[]; dist: Distribution; marks: Array<{ label: string; value: number }> }) {
  const step = 5;
  const lo = Math.floor(Math.min(dist.p10 * 0.8, ...marks.map((m) => m.value)) / step) * step;
  const hi = Math.ceil(Math.max(dist.p90 * 1.3, ...marks.map((m) => m.value)) / step) * step;
  const bins: number[] = Array.from({ length: Math.max(1, (hi - lo) / step) }, () => 0);
  for (const v of values) bins[Math.min(bins.length - 1, Math.max(0, Math.floor((v - lo) / step)))]++;
  const max = Math.max(...bins, 1);
  const pct = (v: number) => ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * 100;
  return (
    <div className="space-y-1">
      <div className="relative h-44">
        <div className="absolute inset-y-0 bg-slate-100" style={{ left: `${pct(dist.p10)}%`, width: `${pct(dist.p90) - pct(dist.p10)}%` }} />
        <div className="absolute inset-0 flex items-end gap-px">
          {bins.map((n, i) => {
            const mid = lo + (i + 0.5) * step;
            const color = mid < dist.p10 ? "bg-emerald-500" : mid > dist.p90 ? "bg-rose-500" : "bg-slate-400";
            return (
              <div
                key={i}
                className={`relative flex-1 rounded-t-sm ${color}`}
                style={{ height: `${(n / max) * 88}%` }}
                title={`${lo + i * step}–${lo + (i + 1) * step} TL/MWh: ${n} santral`}
              />
            );
          })}
        </div>
        <div className="absolute inset-y-0 w-0.5 bg-slate-900" style={{ left: `${pct(dist.median)}%` }}>
          <span className="absolute -top-5 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-slate-900">
            Medyan {nf(dist.median)}
          </span>
        </div>
        {marks.map((m, i) => (
          <div key={m.label} className="absolute inset-y-0 w-0.5 bg-amber-500" style={{ left: `${pct(m.value)}%` }}>
            <span
              className="absolute -translate-x-1/2 whitespace-nowrap rounded bg-amber-500 px-1.5 py-0.5 text-2xs font-semibold text-white"
              style={{ top: `${14 + (i % 3) * 20}px` }}
            >
              {m.label.length > 24 ? `${m.label.slice(0, 22)}…` : m.label} · {nf(m.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="relative h-4 text-2xs text-slate-500">
        {[lo, (lo + hi) / 2, hi].map((v, i) => (
          <span key={i} className="absolute -translate-x-1/2" style={{ left: `${pct(v)}%` }}>
            {nf(v)}
          </span>
        ))}
      </div>
      <p className="text-center text-xs text-slate-500">
        MWh başına dengesizlik riski (TL, santral tek başına) · gri bant: sektörün orta %80&apos;i · yeşil: en iyi %10 · kırmızı: en kötü %10
      </p>
    </div>
  );
}

function downloadCsv(rows: Row[], tech: Tech, view: "company" | "plant", year: number) {
  // Türkçe Excel ayırıcı olarak noktalı virgül ve ondalık virgül bekler; BOM Türkçe karakterleri korur
  const num = (v: number | null, d = 1) => (v === null ? "" : v.toFixed(d).replace(".", ","));
  const head = [view === "company" ? "Şirket" : "Santral", view === "company" ? "Santral sayısı" : "Şirket", "MW (yaklaşık)", "Üretim MWh", "Dengesizlik TL/MWh", "KÜPST TL/MWh", "Sektörün yüzde kaçından iyi", "Sapma %", "Sistemle aynı yön %", "YEKDEM"];
  const lines = rows.map((r) =>
    [
      r.name,
      view === "company" ? String(r.plantCount) : r.sub,
      num(r.mw, 0),
      num(r.actualMwh, 0),
      num(r.unitTl),
      num(r.unitKupstTl),
      String(betterThan(r.rankPct)),
      num(r.deviationPct),
      num(r.sameDirectionPct),
      r.yekdem === null ? "" : r.yekdem ? "Evet" : "Hayır",
    ]
      .map((c) => `"${c.replace(/"/g, '""')}"`)
      .join(";")
  );
  const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sektor_karnesi_${year}_${tech}_${view === "company" ? "sirketler" : "santraller"}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function SectorPage() {
  const [data, setData] = useState<SectorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [k1, setK1] = useState(false);
  const [tech, setTech] = useState<Tech>("RES");
  const [hydro, setHydro] = useState<HydroFilter>("all");
  const [view, setView] = useState<"company" | "plant">("company");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "unitTl", asc: true });
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setError(null);
    const q = new URLSearchParams({ ...(year ? { year: String(year) } : {}), ...(k1 ? { view: "k1" } : {}) });
    fetch(`/api/sector?${q}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Sektör karnesi yüklenemedi."));
  }, [year, k1]);

  const allRows = useMemo(() => (data ? toRows(data, tech, view) : []), [data, tech, view]);
  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    const byHydro =
      tech === "HES" && view === "plant" && hydro !== "all"
        ? allRows.filter((r) => (hydro === "unknown" ? !r.hydroKind : r.hydroKind === hydro))
        : allRows;
    const filtered = q
      ? byHydro.filter((r) => r.name.toLocaleLowerCase("tr-TR").includes(q) || r.sub.toLocaleLowerCase("tr-TR").includes(q))
      : byHydro;
    const dir = sort.asc ? 1 : -1;
    return [...filtered].sort((a, b) =>
      sort.key === "name" ? a.name.localeCompare(b.name, "tr-TR") * dir : ((a[sort.key] as number) - (b[sort.key] as number)) * dir
    );
  }, [allRows, query, sort, tech, view, hydro]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Sektör karnesi yükleniyor…
      </div>
    );
  }

  const techs = SECTOR_TECHS.filter((t) => data.byType[t]);
  // Seçili teknoloji bu yılın karnesinde yoksa (ör. hidro toplanmamış) rüzgâra dön
  const dist = data.byType[tech] ?? data.byType.RES;
  const techValues = data.plants.filter((p) => p.type === tech).map((p) => p.unitImbalanceTl);
  const selectedRows = allRows.filter((r) => selected.includes(r.key));
  const toggle = (key: string) => setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key].slice(-5)));
  const header = (key: SortKey, label: string, right = true) => (
    <TableHead
      className={`cursor-pointer select-none whitespace-nowrap ${right ? "text-right" : ""}`}
      onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : key === "name" || key === "unitTl" || key === "rankPct" }))}
    >
      {label}
      {sort.key === key ? (sort.asc ? " ↑" : " ↓") : ""}
    </TableHead>
  );

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
              <span className="font-medium text-slate-700">Sektör karnesi</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Sektör karnesi {data.label}</h1>
            <MethodLink section="sektor" label="Yöntem ve varsayımlar" />
            <p className="mt-1 max-w-3xl text-xs text-slate-600 sm:text-sm">
              EPİAŞ&apos;ta üretimi yayımlanan lisanslı {techs.map((t) => TECH_LABEL[t].toLocaleLowerCase("tr-TR")).join(", ")} santrallerinin
              MWh başına dengesizlik riski, aynı motorla ve santral tek başına uzlaştırılmış varsayımıyla (tahmin kalitesi kıyası). Dönemin en
              az %90&apos;ında verisi olan {nf(data.plants.length)} santral; {nf(data.excluded)} santral eksik veri nedeniyle dışarıda.
              {data.view === "k1" && " Olası arıza / kısıntı saatleri hariç (K1)."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data.years.length > 1 && (
              <select
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                value={data.year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {data.years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/compare">Projeleri karşılaştır</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          {techs.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={tech === t ? "default" : "outline"}
              onClick={() => {
                setTech(t);
                setSelected([]);
                setHydro("all");
              }}
            >
              {TECH_LABEL[t]} · {data.byType[t]!.unitImbalanceTl.count}
            </Button>
          ))}
          {data.k1Available && (
            <label className="ml-auto flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={k1} onChange={(e) => setK1(e.target.checked)} />
              Arıza / kısıntı saatleri hariç (K1)
            </label>
          )}
        </div>
        {tech === "HES" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Alt tip (tahmini):</span>
            {(["all", "RESERVOIR", "RUN_OF_RIVER", "unknown"] as HydroFilter[]).map((h) => (
              <Button key={h} size="sm" variant={hydro === h ? "default" : "outline"} onClick={() => setHydro(h)}>
                {h === "all" ? "Tümü" : h === "unknown" ? "Belirsiz" : HYDRO_LABEL[h]}
              </Button>
            ))}
            <span className="text-xs text-slate-500">Santral görünümünde süzer; addaki baraj / regülatör, yoksa gün içi üretim esnekliği.</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Medyan", `${nf(dist.unitImbalanceTl.median)} TL/MWh`, `orta %50: ${nf(dist.unitImbalanceTl.p25)}–${nf(dist.unitImbalanceTl.p75)}`],
            ["En iyi %10 / en kötü %10", `≤ ${nf(dist.unitImbalanceTl.p10)} / ≥ ${nf(dist.unitImbalanceTl.p90)}`, `fark %${nf((dist.unitImbalanceTl.p90 / dist.unitImbalanceTl.p10 - 1) * 100)}`],
            ["KÜPST medyanı (tahmini)", `${nf(dist.unitKupstTl.median)} TL/MWh`, "plan sapma bedeli"],
            ["Sistemle aynı yönde sapma", `%${nf(dist.sameDirectionPct.median)}`, "medyan santral; 2026'da bu saatlerde %6"],
          ].map(([label, value, sub]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
              <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{TECH_LABEL[tech]} santrallerinin dağılımı</CardTitle>
            <CardDescription>Tablodan en fazla 5 şirket ya da santral seçin; dağılımdaki yerleri işaretlenir.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Histogram values={techValues} dist={dist.unitImbalanceTl} marks={selectedRows.map((r) => ({ label: r.name, value: r.unitTl }))} />
          </CardContent>
        </Card>

        {selectedRows.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {selectedRows.map((r) => (
              <div key={r.key} className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
                <div>
                  <p className="font-semibold text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-600">
                    {r.sub} · ~{nf(r.mw)} MW · {gwh(r.actualMwh)}
                  </p>
                </div>
                <p className="text-sm text-slate-800">
                  MWh başına <b>{nf(r.unitTl)} TL</b>: sektör medyanının{" "}
                  <b>
                    %{nf(Math.abs(r.unitTl / dist.unitImbalanceTl.median - 1) * 100)} {r.unitTl <= dist.unitImbalanceTl.median ? "altında" : "üstünde"}
                  </b>
                  , sektörün <b>%{betterThan(r.rankPct)}</b> kadarından iyi. KÜPST {nf(r.unitKupstTl)} TL/MWh.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" className="gap-1.5">
                    <Link
                      href={`/projects/epias?name=${encodeURIComponent(r.kind === "company" ? r.name : r.sub)}&ids=${r.plantIds.join(",")}`}
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      {r.kind === "company" ? "Bu şirketle proje oluştur" : "Bu santralle proje oluştur"}
                    </Link>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(r.key)}>
                    Seçimi kaldır
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Card>
          <CardHeader className="gap-3 pb-3 md:flex-row md:items-center md:justify-between md:space-y-0">
            <div className="flex items-center gap-2">
              <Button size="sm" variant={view === "company" ? "default" : "outline"} onClick={() => setView("company")}>
                Şirketler
              </Button>
              <Button size="sm" variant={view === "plant" ? "default" : "outline"} onClick={() => setView("plant")}>
                Santraller
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={view === "company" ? "Şirket ara" : "Santral ya da şirket ara"}
                  className="h-9 w-64 rounded-md border border-slate-200 bg-white pl-8 pr-2 text-sm"
                />
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadCsv(rows, tech, view, data.year)}>
                <Download className="h-3.5 w-3.5" /> Excel (CSV)
              </Button>
            </div>
          </CardHeader>
          <CardContent className="max-h-[560px] overflow-auto p-0">
            <Table>
              <TableHeader className="sticky top-0 bg-white">
                <TableRow>
                  {header("name", view === "company" ? "Şirket" : "Santral", false)}
                  {header("mw", "MW (yakl.)")}
                  {header("actualMwh", "Üretim")}
                  {header("unitTl", "Dengesizlik TL/MWh")}
                  {header("unitKupstTl", "KÜPST TL/MWh")}
                  {header("rankPct", "Sektörün % kaçından iyi")}
                  {view === "plant" && <TableHead className="text-right">Sapma %</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const isSel = selected.includes(r.key);
                  const tone = r.unitTl <= dist.unitImbalanceTl.p10 ? "text-emerald-700" : r.unitTl >= dist.unitImbalanceTl.p90 ? "text-rose-700" : "text-slate-900";
                  return (
                    <TableRow key={r.key} onClick={() => toggle(r.key)} className={`cursor-pointer ${isSel ? "bg-amber-50" : ""}`}>
                      <TableCell>
                        <p className="font-medium text-slate-900">{r.name}</p>
                        <p className="text-xs text-slate-500">
                          {r.sub}
                          {r.yekdem ? " · YEKDEM" : ""}
                          {r.hydroKind ? ` · ${HYDRO_LABEL[r.hydroKind]} (tahmini)` : ""}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{nf(r.mw)}</TableCell>
                      <TableCell className="text-right tabular-nums">{gwh(r.actualMwh)}</TableCell>
                      <TableCell className={`text-right font-semibold tabular-nums ${tone}`}>{nf(r.unitTl)}</TableCell>
                      <TableCell className="text-right tabular-nums">{nf(r.unitKupstTl)}</TableCell>
                      <TableCell className="text-right tabular-nums">%{betterThan(r.rankPct)}</TableCell>
                      {view === "plant" && <TableCell className="text-right tabular-nums">{r.deviationPct === null ? "–" : nf(r.deviationPct, 1)}</TableCell>}
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-slate-500">
                      Sonuç yok. Kıyaslamada yalnızca yılın en az %90&apos;ında verisi olan santraller var.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <p className="text-xs text-slate-500">
          Kaynak: EPİAŞ Şeffaflık Platformu, {data.label} saatlik KGÜP (ilk versiyon), UEVM, PTF ve SMF. Değerler santral tek başına
          uzlaştırılmış varsayımıyladır; şirket içi netleşme hariçtir, bu yüzden şirketin ödediği tutar değil tahmin
          kalitesinin kıyasıdır. KÜPST EPDK 13025 tolerans oranlarıyla tahmindir. MW, santralin yıl içindeki en yüksek saatlik
          üretimidir (kurulu güç yaklaşığı). Şirket rakamı, şirketin kıyaslamadaki santrallerinin üretim ağırlıklı ortalamasıdır.
        </p>
      </main>
    </div>
  );
}
