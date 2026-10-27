"use client";

import React, { useEffect, useMemo, useState } from "react";
import { MapPin, RotateCcw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  TR_PROVINCES,
  TR_VIEW_H,
  TR_VIEW_W,
  trProject,
} from "@/components/ui/turkiye-map-data";
import { useElementWidth } from "@/components/ui/use-element-width";
import {
  formatLocation,
  isLocationEstimate,
  isLocationSource,
  LOCATION_SOURCE_LABEL,
} from "@/lib/epias-plant/location";

export interface MapPlant {
  id: string;
  name: string;
  type: string;
  capacityMw: number;
  latitude?: number | null;
  longitude?: number | null;
  locationSource?: string | null;
  locationRef?: string | null;
}

interface Placed extends MapPlant {
  x: number;
  y: number;
  estimate: boolean;
}

const TYPE_COLOR: Record<string, string> = {
  RES: "#0284c7",
  GES: "#d97706",
  HES: "#0d9488",
};
const TYPE_LABEL: Record<string, string> = { RES: "Rüzgâr", GES: "Güneş", HES: "Hidro" };
const TYPES = ["RES", "GES", "HES"] as const;
const colorOf = (t: string) => TYPE_COLOR[t] ?? "#64748b";

type View = { s: number; tx: number; ty: number };
const FULL_VIEW: View = { s: 1, tx: 0, ty: 0 };
const ZOOM_SCALE = 5;

const sourceLabel = (s?: string | null) =>
  isLocationSource(s) ? LOCATION_SOURCE_LABEL[s] : "kaynak belirtilmemiş";

/**
 * Projedeki santrallerin haritası. Nokta rengi tür, boyutu kurulu güç; içi boş kesikli halka ilçe merkezi tahmini
 * (kural: lib/epias-plant/location.ts, tahmin her yerde "~" ile işaretlenir). Konumu olmayan santral haritaya konmaz,
 * listede ayrıca gösterilir.
 */
export function PlantMapCard({ plants }: { plants: MapPlant[] }) {
  const [svgRef, svgWidth] = useElementWidth<SVGSVGElement>();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const placed = useMemo<Placed[]>(
    () =>
      plants.flatMap((p) => {
        if (typeof p.latitude !== "number" || typeof p.longitude !== "number") return [];
        const [x, y] = trProject(p.latitude, p.longitude);
        return [{ ...p, x, y, estimate: isLocationEstimate(p.locationSource) }];
      }),
    [plants]
  );
  const unplaced = useMemo(
    () =>
      plants.filter(
        (p) => typeof p.latitude !== "number" || typeof p.longitude !== "number"
      ),
    [plants]
  );
  const estimates = placed.filter((p) => p.estimate).length;

  const typesPresent = useMemo(
    () => TYPES.filter((t) => plants.some((p) => p.type === t)),
    [plants]
  );
  const visible = useMemo(
    () => placed.filter((p) => !hidden.has(p.type)),
    [placed, hidden]
  );
  const sorted = useMemo(
    () => [...visible].sort((a, b) => b.capacityMw - a.capacityMw),
    [visible]
  );

  // seçili santral gizlenen bir türe aitse ya da silindiyse seçim kalkar
  useEffect(() => {
    if (selectedId && !visible.some((p) => p.id === selectedId)) setSelectedId(null);
  }, [selectedId, visible]);

  const selected = selectedId ? (visible.find((p) => p.id === selectedId) ?? null) : null;
  const hovered = hoveredId ? (visible.find((p) => p.id === hoveredId) ?? null) : null;
  const shown = hovered ?? selected;

  const view = useMemo<View>(
    () =>
      selected
        ? {
            s: ZOOM_SCALE,
            tx: TR_VIEW_W / 2 - selected.x * ZOOM_SCALE,
            ty: TR_VIEW_H / 2 - selected.y * ZOOM_SCALE,
          }
        : FULL_VIEW,
    [selected]
  );

  const pxPerUnit = svgWidth ? svgWidth / TR_VIEW_W : 0.8;
  const unit = 1 / (view.s * pxPerUnit); // bir ekran pikseli, harita biriminde
  const radius = (mw: number) =>
    Math.min(11, 4 + Math.sqrt(Math.max(mw, 0)) * 0.45) * unit;

  const toggleType = (t: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  if (plants.length === 0) return null;

  return (
    <Card
      className="shadow-sm"
      onKeyDown={(e) => e.key === "Escape" && setSelectedId(null)}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-indigo-600" /> Santral haritası
        </CardTitle>
        <CardDescription>
          {placed.length} / {plants.length} santralin konumu kayıtlı
          {estimates > 0 && (
            <>
              {" · "}
              <span className="text-amber-700">
                {estimates} tanesi ilçe merkezi tahmini (~, içi boş halka)
              </span>
            </>
          )}
          . Hava verisine dayanan sonuçlar bu konumları kullanır.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {typesPresent.map((t) => {
            const off = hidden.has(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={!off}
                onClick={() => toggleType(t)}
                className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
                  off
                    ? "border-slate-200 bg-white text-slate-400"
                    : "border-slate-300 bg-slate-50 text-slate-700"
                }`}
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: off ? "#cbd5e1" : colorOf(t) }}
                />
                {TYPE_LABEL[t]} ({placed.filter((p) => p.type === t).length}/
                {plants.filter((p) => p.type === t).length})
              </button>
            );
          })}
          {selected && (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="h-3 w-3" /> Bütün Türkiye
            </button>
          )}
        </div>

        <div className="grid overflow-hidden rounded-lg border border-slate-200 md:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="flex min-w-0 flex-col border-b border-slate-200 bg-white md:border-b-0 md:border-r">
            <div className="relative">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${TR_VIEW_W} ${TR_VIEW_H}`}
                role="img"
                aria-label={`Türkiye haritasında ${placed.length} santral konumu`}
                className="block h-auto w-full select-none"
                onMouseLeave={() => setHoveredId(null)}
              >
                <g
                  style={{
                    transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`,
                    transformOrigin: "0 0",
                    transition: "transform 700ms cubic-bezier(.22,.8,.24,1)",
                  }}
                >
                  {TR_PROVINCES.map((p) => (
                    <path
                      key={p.plate}
                      d={p.d}
                      aria-hidden
                      fill="#e2e8f0"
                      stroke="#fff"
                      strokeWidth={0.75}
                      vectorEffect="non-scaling-stroke"
                      strokeLinejoin="round"
                    />
                  ))}
                  {selected &&
                    TR_PROVINCES.map((p) => (
                      <text
                        key={`l${p.plate}`}
                        x={p.label[0]}
                        y={p.label[1]}
                        textAnchor="middle"
                        pointerEvents="none"
                        fontSize={11 * unit}
                        fill="#64748b"
                        stroke="#fff"
                        strokeWidth={3 * unit}
                        strokeLinejoin="round"
                        paintOrder="stroke"
                      >
                        {p.name}
                      </text>
                    ))}
                  {[...sorted].reverse().map((p) => {
                    const on = p.id === selectedId || p.id === hoveredId;
                    const c = colorOf(p.type);
                    return (
                      <circle
                        key={p.id}
                        cx={p.x}
                        cy={p.y}
                        r={radius(p.capacityMw) * (on ? 1.3 : 1)}
                        fill={p.estimate ? "#fff" : c}
                        fillOpacity={p.estimate ? 0.9 : selectedId && !on ? 0.45 : 0.85}
                        stroke={on ? "#0f172a" : c}
                        strokeWidth={(on ? 2 : 1.25) * unit}
                        strokeDasharray={
                          p.estimate ? `${3 * unit} ${2 * unit}` : undefined
                        }
                        style={{ cursor: "pointer" }}
                        onMouseEnter={() => setHoveredId(p.id)}
                        onClick={() =>
                          setSelectedId((cur) => (cur === p.id ? null : p.id))
                        }
                      />
                    );
                  })}
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
              {shown ? (
                <>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium text-slate-900">
                      {shown.name}
                    </span>
                    <span className="text-slate-500">
                      {TYPE_LABEL[shown.type] ?? shown.type} ·{" "}
                      {shown.capacityMw.toLocaleString("tr-TR", {
                        maximumFractionDigits: 1,
                      })}{" "}
                      MW
                    </span>
                  </div>
                  <div className="tabular-nums text-slate-600">
                    {formatLocation({
                      latitude: shown.latitude ?? null,
                      longitude: shown.longitude ?? null,
                      locationSource: shown.locationSource,
                    })}
                    {" · "}
                    <span
                      className={shown.estimate ? "text-amber-700" : "text-slate-500"}
                    >
                      {sourceLabel(shown.locationSource)}
                    </span>
                  </div>
                  {shown.id === selectedId && shown.locationRef && (
                    <div className="mt-0.5 text-slate-500">{shown.locationRef}</div>
                  )}
                </>
              ) : (
                <span className="text-slate-400">
                  Bir noktanın üzerine gelin ya da listeden santral seçin.
                </span>
              )}
            </div>
          </div>

          <div className="flex max-h-[26rem] min-h-0 flex-col">
            <div className="px-3 pb-1 pt-3 text-sm font-semibold text-slate-800">
              Santraller (kurulu güce göre)
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
              {sorted.map((p) => {
                const on = p.id === selectedId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSelectedId((cur) => (cur === p.id ? null : p.id))}
                      onMouseEnter={() => setHoveredId(p.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onFocus={() => setHoveredId(p.id)}
                      onBlur={() => setHoveredId(null)}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-slate-100 ${on ? "bg-slate-100 font-medium" : ""}`}
                    >
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full border"
                        style={{
                          background: p.estimate ? "#fff" : colorOf(p.type),
                          borderColor: colorOf(p.type),
                          borderStyle: p.estimate ? "dashed" : "solid",
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      {p.estimate && (
                        <span className="shrink-0 text-xs text-amber-700">~</span>
                      )}
                      <span className="shrink-0 text-xs tabular-nums text-slate-500">
                        {p.capacityMw.toLocaleString("tr-TR", {
                          maximumFractionDigits: 1,
                        })}{" "}
                        MW
                      </span>
                    </button>
                  </li>
                );
              })}
              {sorted.length === 0 && (
                <li className="px-3 py-2 text-sm text-slate-500">
                  Seçili türde konumu kayıtlı santral yok.
                </li>
              )}
            </ul>
          </div>
        </div>

        {unplaced.length > 0 && (
          <details className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <summary className="cursor-pointer text-slate-700">
              <span className="font-medium">{unplaced.length} santralin konumu yok</span>,
              haritada görünmüyor
            </summary>
            <p className="mt-2 text-xs text-slate-500">
              Konum, Global Energy Monitor / OpenStreetMap kaydından ya da elle
              doğrulamayla gelir; santral adından tahmin edilip yazılmaz.
            </p>
            <ul className="mt-2 grid gap-x-4 gap-y-0.5 text-xs text-slate-600 sm:grid-cols-2">
              {unplaced.map((p) => (
                <li key={p.id} className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: colorOf(p.type) }}
                  />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="shrink-0 tabular-nums text-slate-400">
                    {p.capacityMw.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}{" "}
                    MW
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
