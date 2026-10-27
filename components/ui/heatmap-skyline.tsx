"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, LayoutGrid, RotateCcw, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Isı haritası "silüet" görünümü (21st.dev contribution-skyline'dan esinlenen, bağımlılıksız SVG): düz ızgara (2B) ile aynı
 * veriyi izometrik 3B sütunlara dönüştürür. Sütun yüksekliği `height`, rengi `color`. Fareyle üzerine gelince ya da klavyeyle
 * (ok tuşları) kart açılır; 3B'de sürükleyerek ya da düğmelerle döndürülür. Kaynak bileşenin kodu elde olmadığı için davranış
 * (2B ↔ 3B geçiş animasyonu, sürükle-döndür, klavye gezintisi, ipucu, istatistik) kendi koduyla yazılmıştır.
 */

export interface SkylineCell {
  row: number;
  col: number;
  /** Sütun yüksekliği (0..1, en yüksek hücreye göre) */
  height: number;
  /** Üst yüz rengi (#rrggbb) */
  color: string;
  empty?: boolean;
  title: string;
  lines: Array<[string, string]>;
}

export interface SkylineProps {
  rowLabels: string[];
  cols: number;
  colLabel: (col: number) => string;
  cells: SkylineCell[];
  legend: Array<{ label: string; color: string }>;
  /** Yükseklik neyi gösteriyor (altyazı) */
  heightCaption: string;
  stats?: Array<{ label: string; value: string }>;
  className?: string;
}

const S = 20; // hücre kenarı
const GAP = 1.4; // sütunlar arası boşluk
const H_MAX = 70; // en yüksek sütun
const ISO_TILT = 34; // 3B bakış yüksekliği (derece; 90 = tepeden)
const ISO_AZIMUTH = 40; // 3B başlangıç dönüşü (derece)
const MORPH_MS = 750;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const rad = (d: number) => (d * Math.PI) / 180;

/** #rrggbb rengi koyulaştırır (f < 1) */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

export function HeatmapSkyline({ rowLabels, cols, colLabel, cells, legend, heightCaption, stats, className }: SkylineProps) {
  const rows = rowLabels.length;
  const [mode, setMode] = useState<"flat" | "3d">("flat");
  const [t, setT] = useState(0); // 0: düz, 1: 3B
  const [azimuth, setAzimuth] = useState(ISO_AZIMUTH);
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  const [focus, setFocus] = useState<{ row: number; col: number } | null>(null);
  const drag = useRef<{ x: number; az: number } | null>(null);
  const raf = useRef<number | null>(null);
  const tRef = useRef(0);
  tRef.current = t;

  // 2B ↔ 3B geçişi: t hedefe doğru yumuşakça akar
  useEffect(() => {
    const from = tRef.current;
    const to = mode === "3d" ? 1 : 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / MORPH_MS);
      setT(from + (to - from) * ease(p));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [mode]);

  const theta = rad(t * azimuth);
  const phi = rad(90 + (ISO_TILT - 90) * t);
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  const sinP = Math.sin(phi);
  const cosP = Math.cos(phi);

  const project = useCallback(
    (x: number, y: number, z: number): [number, number] => [x * cosT - y * sinT, (x * sinT + y * cosT) * sinP - z * cosP],
    [cosT, sinT, sinP, cosP]
  );

  // Çizim sırası: arkadan öne (ekranda aşağıdaki öndedir)
  const bars = useMemo(() => {
    const out: Array<{ cell: SkylineCell; depth: number; polys: Array<{ points: string; fill: string }>; top: [number, number] }> = [];
    for (const cell of cells) {
      const cx = (cell.col + 0.5) * S - (cols * S) / 2;
      const cy = (cell.row + 0.5) * S - (rows * S) / 2;
      const x0 = cx - S / 2 + GAP / 2;
      const x1 = cx + S / 2 - GAP / 2;
      const y0 = cy - S / 2 + GAP / 2;
      const y1 = cy + S / 2 - GAP / 2;
      const h = cell.empty ? 0.6 * t : Math.max(2, cell.height * H_MAX) * t;
      const corners: Array<[number, number]> = [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ];
      const pts = (list: Array<[number, number, number]>) => list.map(([x, y, z]) => project(x, y, z).map((v) => v.toFixed(2)).join(",")).join(" ");
      const polys: Array<{ points: string; fill: string }> = [];
      // Yan yüzler: dışa bakan normali ekranda aşağı bakanlar görünür
      const normals: Array<[number, number]> = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ];
      if (h * cosP > 0.2) {
        normals.forEach(([nx, ny], i) => {
          const nyRot = nx * sinT + ny * cosT;
          if (nyRot <= 0.001) return;
          const nxRot = nx * cosT - ny * sinT;
          const a = corners[i];
          const b = corners[(i + 1) % 4];
          polys.push({ points: pts([[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], h], [a[0], a[1], h]]), fill: shade(cell.color, nxRot < 0 ? 0.8 : 0.62) });
        });
      }
      polys.push({ points: pts(corners.map(([x, y]) => [x, y, h] as [number, number, number])), fill: cell.color });
      out.push({ cell, depth: cx * sinT + cy * cosT, polys, top: project(cx, cy, h) });
    }
    return out.sort((a, b) => a.depth - b.depth);
  }, [cells, cols, rows, t, project, sinT, cosT, cosP]);

  // Görüş penceresi: düz ızgara ile 3B'nin pencereleri arasında geçiş
  const D = Math.sqrt(cols * cols + rows * rows) * S;
  const flat = { x: (-cols * S) / 2 - 46, y: (-rows * S) / 2 - 22, w: cols * S + 52, h: rows * S + 44 };
  const isoPhi = rad(ISO_TILT);
  const isoTop = -(D / 2) * Math.sin(isoPhi) - H_MAX * Math.cos(isoPhi) - 14;
  const isoBottom = (D / 2) * Math.sin(isoPhi) + 14;
  const iso = { x: -D / 2 - 14, y: isoTop, w: D + 28, h: isoBottom - isoTop };
  const lerp = (a: number, b: number) => a + (b - a) * t;
  const vb = { x: lerp(flat.x, iso.x), y: lerp(flat.y, iso.y), w: lerp(flat.w, iso.w), h: lerp(flat.h, iso.h) };

  const active = hover ?? focus;
  const activeBar = active ? bars.find((b) => b.cell.row === active.row && b.cell.col === active.col) : null;
  const tip = activeBar ? { left: ((activeBar.top[0] - vb.x) / vb.w) * 100, top: ((activeBar.top[1] - vb.y) / vb.h) * 100, cell: activeBar.cell } : null;

  const onKey = (e: React.KeyboardEvent) => {
    const cur = focus ?? { row: 0, col: 0 };
    let { row, col } = cur;
    if (e.key === "ArrowRight") col = Math.min(cols - 1, col + 1);
    else if (e.key === "ArrowLeft") col = Math.max(0, col - 1);
    else if (e.key === "ArrowDown") row = Math.min(rows - 1, row + 1);
    else if (e.key === "ArrowUp") row = Math.max(0, row - 1);
    else if (e.key === "Home") col = 0;
    else if (e.key === "End") col = cols - 1;
    else if (e.key === "Escape") return setFocus(null);
    else if (e.key === "r" || e.key === "R") return setAzimuth((a) => a + (e.shiftKey ? -15 : 15));
    else return;
    e.preventDefault();
    setFocus({ row, col });
    setHover(null);
  };

  const labelOpacity = Math.max(0, 1 - t * 2.5);

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {/* Projedeki diğer düğme grupları gibi (Piyasa sayfasındaki birim seçici): ince kenarlıklı, beyaz, seçili olan koyu */}
        <div role="group" aria-label="Görünüm" className="flex h-7 overflow-hidden rounded-md border border-slate-200 bg-white text-sm">
          {(
            [
              ["flat", "2B ısı haritası", LayoutGrid],
              ["3d", "3B silüet", Box],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              aria-label={label}
              title={label}
              onClick={() => setMode(m)}
              className={cn("flex w-8 items-center justify-center transition-colors", mode === m ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900")}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
        {mode === "3d" && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="hidden sm:inline">Sürükleyerek döndürün</span>
            <div className="flex h-7 overflow-hidden rounded-md border border-slate-200 bg-white">
              <button type="button" aria-label="Sola döndür" title="Sola döndür" className="flex w-7 items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-900" onClick={() => setAzimuth((a) => a - 15)}>
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button type="button" aria-label="Sağa döndür" title="Sağa döndür" className="flex w-7 items-center justify-center border-l border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900" onClick={() => setAzimuth((a) => a + 15)}>
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="relative">
        <svg
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          className={cn("w-full select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring", mode === "3d" && t > 0.9 ? "cursor-grab active:cursor-grabbing" : "")}
          style={{ aspectRatio: `${vb.w} / ${vb.h}` }}
          tabIndex={0}
          role="img"
          aria-label="Gün ve saate göre ısı haritası; ok tuşlarıyla gezinilir, R ile döndürülür"
          onKeyDown={onKey}
          onPointerDown={(e) => {
            if (mode !== "3d") return;
            drag.current = { x: e.clientX, az: azimuth };
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current) setAzimuth(drag.current.az + (e.clientX - drag.current.x) * 0.45);
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => {
            drag.current = null;
            setHover(null);
          }}
        >
          {/* Satır ve saat etiketleri: yalnız düz görünümde */}
          {labelOpacity > 0.02 && (
            <g opacity={labelOpacity} fontSize={7.5} fill="hsl(var(--muted-foreground))">
              {rowLabels.map((label, r) => {
                const [x, y] = project((-cols * S) / 2 - 5, (r + 0.5) * S - (rows * S) / 2, 0);
                return (
                  <text key={label} x={x} y={y + 2.5} textAnchor="end">
                    {label}
                  </text>
                );
              })}
              {Array.from({ length: cols }, (_, c) => c)
                .filter((c) => c % 3 === 0)
                .map((c) => {
                  const [x, y] = project((c + 0.5) * S - (cols * S) / 2, (-rows * S) / 2 - 5, 0);
                  return (
                    <text key={c} x={x} y={y} textAnchor="middle">
                      {colLabel(c)}
                    </text>
                  );
                })}
            </g>
          )}
          {bars.map(({ cell, polys }) => {
            const isActive = active?.row === cell.row && active?.col === cell.col;
            return (
              <g
                key={`${cell.row}:${cell.col}`}
                onMouseEnter={() => {
                  setHover({ row: cell.row, col: cell.col });
                }}
                onMouseLeave={() => setHover(null)}
                opacity={active && !isActive && t > 0.5 ? 0.55 : 1}
                style={{ transition: "opacity 120ms" }}
              >
                {polys.map((p, i) => (
                  <polygon key={i} points={p.points} fill={p.fill} stroke={isActive ? "#0f172a" : "rgba(255,255,255,0.35)"} strokeWidth={isActive ? 1.1 : 0.3} strokeLinejoin="round" />
                ))}
              </g>
            );
          })}
        </svg>

        {tip && (
          <div className="pointer-events-none absolute z-10 min-w-[170px] -translate-x-1/2 -translate-y-full rounded-lg border bg-popover p-3 shadow-sm shadow-black/5" style={{ left: `${Math.min(88, Math.max(12, tip.left))}%`, top: `${Math.max(12, tip.top) - 1.5}%` }}>
            <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">{tip.cell.title}</div>
            <div className="space-y-1">
              {tip.cell.lines.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4 text-xs">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-semibold text-popover-foreground">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
        {legend.map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: l.color }} />
            <span className="text-xs text-muted-foreground">{l.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">{mode === "3d" ? `Sütun yüksekliği: ${heightCaption}. Renk: verimlilik.` : "Renk: verimlilik oranı."}</p>

      {stats && stats.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-sm font-semibold text-foreground">{s.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
