"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Map as MapIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TR_PROVINCES, TR_VIEW_H, TR_VIEW_W } from "@/components/ui/turkiye-map-data";
import { useElementWidth } from "@/components/ui/use-element-width";
import {
  quantileBreaks,
  stepOf,
  type EpdkMapTech,
  type ProvinceLicense,
  type ProvinceTotal,
} from "@/lib/sector/epdk-by-province";

interface TechData {
  byPlate: Record<string, ProvinceTotal>;
  licenses: Record<string, ProvinceLicense[]>;
  unplaced: ProvinceTotal;
  exportedAt: string | null;
}
interface ApiData {
  techs: Record<EpdkMapTech, TechData | null>;
}

type Choice = EpdkMapTech | "ALL";
type BBox = [number, number, number, number];
type View = { s: number; tx: number; ty: number };

const CHOICES: Array<{ id: Choice; label: string; color: string }> = [
  { id: "RES", label: "Rüzgâr", color: "#0284c7" },
  { id: "GES", label: "Güneş", color: "#d97706" },
  { id: "HES", label: "Hidro", color: "#0d9488" },
  { id: "ALL", label: "Hepsi", color: "#4f46e5" },
];
const TECH_LABEL: Record<EpdkMapTech, string> = {
  RES: "Rüzgâr",
  GES: "Güneş",
  HES: "Hidro",
};
const STEPS = 5;
const STEP_OPACITY = [0.2, 0.38, 0.58, 0.78, 1];
const PROVINCE_NAME = new Map(TR_PROVINCES.map((p) => [p.plate, p.name]));
const FULL_VIEW: View = { s: 1, tx: 0, ty: 0 };

const fmtMw = (v: number) => `${Math.round(v).toLocaleString("tr-TR")} MW`;

function fitView(b: BBox, padding = 1.7, maxScale = 6): View {
  const s = Math.min(
    TR_VIEW_W / ((b[2] - b[0]) * padding),
    TR_VIEW_H / ((b[3] - b[1]) * padding),
    maxScale
  );
  return {
    s,
    tx: TR_VIEW_W / 2 - ((b[0] + b[2]) / 2) * s,
    ty: TR_VIEW_H / 2 - ((b[1] + b[3]) / 2) * s,
  };
}

/**
 * Sektör sayfası harita sekmesi: EPDK üretim lisanslarının il bazında kurulu gücü (RES / GES / HES). Kaynak ve kapsam
 * kartta yazılır: yürürlükteki ana kaynak lisanslar; rüzgâr ve hidroda işletmedeki MWe (yoksa lisans MWe), güneşte lisans MWe.
 * Hesap: lib/sector/epdk-by-province.ts.
 */
export function SectorProvinceMapCard() {
  const [data, setData] = useState<ApiData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice>("RES");
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [svgRef, svgWidth] = useElementWidth<SVGSVGElement>();

  useEffect(() => {
    let alive = true;
    fetch("/api/sector/epdk-il", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (!d.success) throw new Error(d.error || "Harita verisi alınamadı.");
        setData(d);
      })
      .catch(
        (e) =>
          alive && setError(e instanceof Error ? e.message : "Harita verisi alınamadı.")
      );
    return () => {
      alive = false;
    };
  }, []);

  const techs = useMemo(
    () => (choice === "ALL" ? (["RES", "GES", "HES"] as const) : ([choice] as const)),
    [choice]
  );
  const missing = data ? techs.filter((t) => !data.techs[t]) : [];

  const totals = useMemo(() => {
    const out: Record<string, ProvinceTotal> = {};
    if (!data) return out;
    for (const t of techs) {
      const d = data.techs[t];
      if (!d) continue;
      for (const [plate, v] of Object.entries(d.byPlate)) {
        const o = (out[plate] ??= { mw: 0, count: 0 });
        o.mw += v.mw;
        o.count += v.count;
      }
    }
    return out;
  }, [data, techs]);

  const breaks = useMemo(
    () =>
      quantileBreaks(
        Object.values(totals).map((v) => v.mw),
        STEPS
      ),
    [totals]
  );
  const ranking = useMemo(
    () => Object.entries(totals).sort((a, b) => b[1].mw - a[1].mw),
    [totals]
  );
  const sumMw = ranking.reduce((s, [, v]) => s + v.mw, 0);
  const sumCount = ranking.reduce((s, [, v]) => s + v.count, 0);
  const maxMw = ranking[0]?.[1].mw ?? 0;
  const unplaced = data
    ? techs.reduce(
        (s, t) => ({
          mw: s.mw + (data.techs[t]?.unplaced.mw ?? 0),
          count: s.count + (data.techs[t]?.unplaced.count ?? 0),
        }),
        { mw: 0, count: 0 }
      )
    : { mw: 0, count: 0 };

  const color = CHOICES.find((c) => c.id === choice)!.color;
  const exportedAt = data
    ? (techs.map((t) => data.techs[t]?.exportedAt).filter(Boolean)[0] ?? null)
    : null;

  const selectedLicenses = useMemo(() => {
    if (!data || !selected) return [];
    return techs
      .flatMap((t) =>
        (data.techs[t]?.licenses[selected] ?? []).map((l) => ({ ...l, tech: t }))
      )
      .sort((a, b) => b.mw - a.mw);
  }, [data, selected, techs]);

  const view = useMemo<View>(() => {
    const p = selected ? TR_PROVINCES.find((x) => x.plate === selected) : null;
    return p ? fitView(p.bbox) : FULL_VIEW;
  }, [selected]);
  const pxPerUnit = svgWidth ? svgWidth / TR_VIEW_W : 0.8;
  const unit = 1 / (view.s * pxPerUnit);
  const zoomed = view.s > 1.01;

  const fillFor = (plate: string) => {
    const v = totals[plate];
    if (!v) return { fill: "#f1f5f9", opacity: 1 };
    return { fill: color, opacity: STEP_OPACITY[stepOf(v.mw, breaks)] };
  };

  const hoverPlate = hovered ?? selected;
  const hoverTotal = hoverPlate ? totals[hoverPlate] : undefined;

  return (
    <Card
      className="shadow-sm"
      onKeyDown={(e) => e.key === "Escape" && setSelected(null)}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapIcon className="h-4 w-4 text-indigo-600" /> İllere göre lisanslı güç
        </CardTitle>
        <CardDescription>
          Kaynak: EPDK üretim lisansı dışa aktarımı{exportedAt ? ` (${exportedAt})` : ""}.
          Yürürlükteki ana kaynak lisanslar. Rüzgâr ve hidroda işletmedeki MWe (yoksa
          lisans MWe), güneşte lisans MWe sayılır; henüz kurulmamış tesisleri içerebilir,
          gerçekleşmiş kurulu güç değildir. Lisanssız üretim bu kayıtlarda yoktur.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        {!data && !error && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor...
          </p>
        )}

        {data && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-8 rounded-md border border-slate-200 bg-white p-0.5">
                {CHOICES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={choice === c.id}
                    onClick={() => {
                      setChoice(c.id);
                      setSelected(null);
                    }}
                    className={`rounded px-3 text-xs font-medium ${choice === c.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-500">
                {ranking.length} il · {sumCount.toLocaleString("tr-TR")} lisans ·{" "}
                <span className="font-medium text-slate-700">{fmtMw(sumMw)}</span>
                {unplaced.count > 0 &&
                  ` · ili belli olmayan ${unplaced.count} lisans (${fmtMw(unplaced.mw)}) haritada yok`}
              </span>
            </div>
            {missing.length > 0 && (
              <p className="text-xs text-amber-700">
                {missing.map((t) => TECH_LABEL[t]).join(", ")} için EPDK dosyası
                bulunamadı; toplam eksik olabilir.
              </p>
            )}

            <div className="grid overflow-hidden rounded-lg border border-slate-200 md:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="flex min-w-0 flex-col border-b border-slate-200 bg-white md:border-b-0 md:border-r">
                <div className="relative">
                  <svg
                    ref={svgRef}
                    viewBox={`0 0 ${TR_VIEW_W} ${TR_VIEW_H}`}
                    role="img"
                    aria-label="İllere göre EPDK lisanslı güç haritası"
                    className="block h-auto w-full select-none"
                    onMouseLeave={() => setHovered(null)}
                  >
                    <g
                      style={{
                        transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`,
                        transformOrigin: "0 0",
                        transition: "transform 700ms cubic-bezier(.22,.8,.24,1)",
                      }}
                    >
                      {TR_PROVINCES.map((p) => {
                        const { fill, opacity } = fillFor(p.plate);
                        const on = p.plate === selected;
                        return (
                          <path
                            key={p.plate}
                            d={p.d}
                            aria-hidden
                            fill={fill}
                            fillOpacity={opacity}
                            stroke={
                              on ? "#0f172a" : p.plate === hovered ? "#475569" : "#fff"
                            }
                            strokeWidth={on ? 2 : p.plate === hovered ? 1.5 : 0.75}
                            vectorEffect="non-scaling-stroke"
                            strokeLinejoin="round"
                            style={{ cursor: "pointer" }}
                            onMouseEnter={() => setHovered(p.plate)}
                            onClick={() =>
                              setSelected((cur) => (cur === p.plate ? null : p.plate))
                            }
                          />
                        );
                      })}
                      {zoomed &&
                        TR_PROVINCES.map((p) => (
                          <text
                            key={`l${p.plate}`}
                            x={p.label[0]}
                            y={p.label[1]}
                            textAnchor="middle"
                            pointerEvents="none"
                            fontSize={11 * unit}
                            fontWeight={p.plate === selected ? 700 : 400}
                            fill="#334155"
                            stroke="#fff"
                            strokeWidth={3 * unit}
                            strokeLinejoin="round"
                            paintOrder="stroke"
                          >
                            {p.name}
                          </text>
                        ))}
                    </g>
                  </svg>
                  <span className="absolute bottom-1.5 right-2.5 text-[10px] text-slate-400">
                    Sınırlar:{" "}
                    <a
                      href="https://www.geoboundaries.org/"
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      geoBoundaries
                    </a>{" "}
                    (CC BY-SA 2.0)
                  </span>
                </div>

                <div className="flex-1 border-t border-slate-200 px-3 py-2 text-xs">
                  {hoverPlate ? (
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium text-slate-900">
                        {PROVINCE_NAME.get(hoverPlate)}
                      </span>
                      <span className="text-slate-500">{hoverPlate}</span>
                      <span className="text-slate-600">
                        {hoverTotal
                          ? `${fmtMw(hoverTotal.mw)} · ${hoverTotal.count} lisans`
                          : "bu türde lisans yok"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-400">
                      Bir ilin üzerine gelin ya da tıklayın.
                    </span>
                  )}
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span>az</span>
                    {STEP_OPACITY.map((o, i) => (
                      <span
                        key={i}
                        className="h-2.5 w-7 rounded-sm"
                        style={{ background: color, opacity: o }}
                        title={
                          i === 0
                            ? `< ${Math.round(breaks[0] ?? 0)} MW`
                            : i === STEPS - 1
                              ? `≥ ${Math.round(breaks[i - 1] ?? 0)} MW`
                              : `${Math.round(breaks[i - 1] ?? 0)} – ${Math.round(breaks[i] ?? 0)} MW`
                        }
                      />
                    ))}
                    <span>çok</span>
                    <span className="ml-2 inline-flex items-center gap-1">
                      <span className="h-2.5 w-4 rounded-sm bg-slate-100 ring-1 ring-slate-200" />{" "}
                      lisans yok
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex max-h-[26rem] min-h-0 flex-col">
                {selected ? (
                  <>
                    <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-800">
                          {PROVINCE_NAME.get(selected)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {totals[selected]
                            ? `${selectedLicenses.length} lisans · ${fmtMw(totals[selected].mw)}`
                            : "bu türde lisans yok"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelected(null)}
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        <ArrowLeft className="h-3 w-3" /> İller
                      </button>
                    </div>
                    <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
                      {selectedLicenses.map((l) => (
                        <li
                          key={l.licenseNo}
                          className="flex items-baseline gap-2 rounded-md px-2.5 py-1.5 text-sm"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{l.plant}</span>
                            <span className="block truncate text-xs text-slate-500">
                              {l.ilce && l.ilce !== "-" ? `${l.ilce} · ` : ""}
                              {choice === "ALL" ? `${TECH_LABEL[l.tech]} · ` : ""}
                              {l.licenseNo}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-slate-600">
                            {l.mw.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}{" "}
                            MW
                          </span>
                        </li>
                      ))}
                      {selectedLicenses.length === 0 && (
                        <li className="px-3 py-2 text-sm text-slate-500">
                          Bu ilde seçili türde yürürlükte lisans yok.
                        </li>
                      )}
                    </ul>
                  </>
                ) : (
                  <>
                    <div className="px-3 pb-1 pt-3 text-sm font-semibold text-slate-800">
                      İller (lisanslı güce göre)
                    </div>
                    <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
                      {ranking.map(([plate, v]) => (
                        <li key={plate}>
                          <button
                            type="button"
                            onClick={() => setSelected(plate)}
                            onMouseEnter={() => setHovered(plate)}
                            onMouseLeave={() => setHovered(null)}
                            onFocus={() => setHovered(plate)}
                            onBlur={() => setHovered(null)}
                            className="relative flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-slate-100"
                          >
                            <span
                              aria-hidden
                              className="absolute inset-y-1 left-1 rounded-sm opacity-15"
                              style={{
                                width: `${Math.max(2, (v.mw / maxMw) * 96)}%`,
                                background: color,
                              }}
                            />
                            <span className="relative min-w-0 flex-1 truncate">
                              {PROVINCE_NAME.get(plate)}
                            </span>
                            <span className="relative shrink-0 text-xs tabular-nums text-slate-600">
                              {fmtMw(v.mw)}
                            </span>
                          </button>
                        </li>
                      ))}
                      {ranking.length === 0 && (
                        <li className="px-3 py-2 text-sm text-slate-500">Veri yok.</li>
                      )}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
