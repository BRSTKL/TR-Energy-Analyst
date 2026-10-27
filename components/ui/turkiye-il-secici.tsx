"use client";

import * as React from "react";
import { TR_PROVINCES, TR_REGION_BORDER, TR_VIEW_H, TR_VIEW_W } from "./turkiye-map-data";
import { useElementWidth } from "./use-element-width";

/**
 * Türkiye il seçici: bölge → il, posta kodu (ilk iki hane = plaka kodu) ile arama.
 * Tasarım dili Nepal adres seçicisinden alındı: kapsamlı CSS (.tip), kırıntı yolu, hover rozeti,
 * ek konum haritası, liste paneli, adres satırı + sonuç + kopyala.
 *
 * Harita verisi: geoBoundaries TUR ADM1 (CC BY-SA 2.0), components/ui/turkiye-map-data.ts.
 */

type BBox = [number, number, number, number];

export interface TrIl {
  /** Plaka kodu, "01"–"81" */
  id: string;
  name: string;
  regionId: string;
  /** Posta kodunun ilk iki hanesi plaka koduyla aynı; örnek posta kodu */
  postalCode: string;
  d: string;
  label: [number, number];
  bbox: BBox;
}

export interface TrRegion {
  id: string;
  name: string;
  color: string;
  label: [number, number];
  bbox: BBox;
}

export interface TrAddress {
  regionId: string;
  region: string;
  ilId: string;
  il: string;
  postalCode: string;
  addressLine: string;
  formatted: string;
}

export interface TurkiyeIlSeciciProps {
  /** Başlangıç ili (plaka kodu, ör. "34") */
  defaultIlId?: string;
  defaultAddressLine?: string;
  onChange?: (address: TrAddress | null) => void;
  /** Verilmezse sayfanın .dark sınıfı izlenir */
  theme?: "light" | "dark" | "system";
  className?: string;
}

const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(" ");

/* -- veri ------------------------------------------------------------------ */

const REGION_META: Array<{ id: string; name: string; color: string }> = [
  { id: "marmara", name: "Marmara", color: "#3E7C8C" },
  { id: "ege", name: "Ege", color: "#D9577A" },
  { id: "akdeniz", name: "Akdeniz", color: "#5A5FB0" },
  { id: "ic-anadolu", name: "İç Anadolu", color: "#8E9A2F" },
  { id: "karadeniz", name: "Karadeniz", color: "#3F9152" },
  { id: "dogu-anadolu", name: "Doğu Anadolu", color: "#AA5EB0" },
  { id: "guneydogu", name: "Güneydoğu Anadolu", color: "#3FA587" },
];

const ILS: TrIl[] = TR_PROVINCES.map((p) => ({
  id: p.plate,
  name: p.name,
  regionId: p.region,
  postalCode: `${p.plate}000`,
  d: p.d,
  label: p.label,
  bbox: p.bbox,
}));

function unionBBox(items: { bbox: BBox }[]): BBox {
  return items.reduce<BBox>(
    (a, { bbox: b }) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}

const bboxArea = (b: BBox) => (b[2] - b[0]) * (b[3] - b[1]);

const REGIONS: TrRegion[] = REGION_META.map((m) => {
  const members = ILS.filter((i) => i.regionId === m.id);
  const bbox = unionBBox(members);
  // etiket: bölge ağırlık merkezine en yakın ilin etiket noktası (bölge içinde kalır)
  const total = members.reduce((s, i) => s + bboxArea(i.bbox), 0);
  const cx0 = members.reduce((s, i) => s + i.label[0] * bboxArea(i.bbox), 0) / total;
  const cy0 = members.reduce((s, i) => s + i.label[1] * bboxArea(i.bbox), 0) / total;
  const nearest = members.reduce((a, b) =>
    Math.hypot(a.label[0] - cx0, a.label[1] - cy0) <= Math.hypot(b.label[0] - cx0, b.label[1] - cy0) ? a : b,
  );
  return { ...m, label: nearest.label, bbox };
});

const REGION_BY_ID = new Map(REGIONS.map((r) => [r.id, r]));
const IL_BY_ID = new Map(ILS.map((i) => [i.id, i]));
const ILS_BY_REGION = new Map(REGIONS.map((r) => [r.id, ILS.filter((i) => i.regionId === r.id).sort((a, b) => a.name.localeCompare(b.name, "tr"))]));

/** Posta kodunun ilk haneleriyle eşleşen iller: 1 hane → o rakamla başlayan plakalar, 2+ hane → o plaka */
export function findIllerByPostalCode(code: string): TrIl[] {
  const digits = code.replace(/\D/g, "");
  if (!digits) return [];
  if (digits.length === 1) return ILS.filter((i) => i.id.startsWith(digits));
  const plate = digits.slice(0, 2);
  const il = IL_BY_ID.get(plate);
  return il ? [il] : [];
}

/* -- stil ------------------------------------------------------------------ */

const DARK_TOKENS = "--tip-bg:#09090b;--tip-fg:#fafafa;--tip-muted:#27272a;--tip-muted-fg:#a1a1aa;--tip-border:#27272a;--tip-ring:#d4d4d8;";

const CSS = `
.tip{--tip-bg:#fff;--tip-fg:#18181b;--tip-muted:#f4f4f5;--tip-muted-fg:#71717a;--tip-border:#e4e4e7;--tip-ring:#18181b;
  width:100%;box-sizing:border-box;overflow:hidden;border:1px solid var(--tip-border);border-radius:12px;
  background:var(--tip-bg);color:var(--tip-fg);font-size:14px;line-height:1.4;font-family:inherit}
.dark .tip:not([data-theme=light]),.tip[data-theme=dark]{${DARK_TOKENS}}
@media (prefers-color-scheme:dark){.tip[data-theme=system]{${DARK_TOKENS}}}
.tip *,.tip *::before,.tip *::after{box-sizing:border-box}
.tip button,.tip input{font:inherit;color:inherit;margin:0}
.tip button{background:none;border:0;padding:0;cursor:pointer;text-align:left}
.tip h3,.tip p{margin:0}
.tip :focus-visible{outline:2px solid var(--tip-ring);outline-offset:1px}
.tip-header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--tip-border)}
.tip-crumbs{display:flex;align-items:center;gap:6px;min-width:0}
.tip .tip-crumb{border-radius:4px;padding:2px 4px;color:var(--tip-muted-fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .15s}
.tip .tip-crumb:hover{color:var(--tip-fg)}
.tip .tip-crumb[aria-current]{color:var(--tip-fg);font-weight:600}
.tip-chev{width:14px;height:14px;flex-shrink:0;color:var(--tip-muted-fg);opacity:.6}
.tip-inline{display:flex;align-items:center;gap:8px}
.tip-label{color:var(--tip-muted-fg)}
.tip .tip-input{height:36px;border:1px solid var(--tip-border);border-radius:6px;background:var(--tip-bg);padding:0 12px;outline:none;min-width:0}
.tip .tip-input::placeholder{color:var(--tip-muted-fg);opacity:.6}
.tip .tip-input:focus-visible{outline:2px solid var(--tip-ring);outline-offset:0}
.tip .tip-postal{width:96px;font-variant-numeric:tabular-nums;letter-spacing:.05em}
.tip-body{display:grid}
.tip-map{position:relative;display:flex;align-items:center;border-bottom:1px solid var(--tip-border)}
.tip-svg{display:block;width:100%;height:auto;user-select:none;-webkit-user-select:none}
.tip-zoom{transition:transform 700ms cubic-bezier(.22,.8,.24,1)}
.tip-region{cursor:pointer;transition:fill-opacity .3s}
.tip-readout{pointer-events:none;position:absolute;left:12px;top:12px;display:flex;flex-direction:column;align-items:flex-start;gap:4px}
.tip-chip{display:flex;align-items:baseline;gap:8px;border:1px solid var(--tip-border);border-radius:6px;padding:4px 8px;
  background:color-mix(in srgb,var(--tip-bg) 90%,transparent);backdrop-filter:blur(6px);box-shadow:0 1px 2px rgba(0,0,0,.06)}
.tip-chip-status{font-size:12px;color:var(--tip-muted-fg)}
.tip .tip-inset{position:absolute;left:12px;bottom:12px;width:112px;padding:6px;border:1px solid var(--tip-border);border-radius:6px;
  background:color-mix(in srgb,var(--tip-bg) 90%,transparent);backdrop-filter:blur(6px);box-shadow:0 1px 2px rgba(0,0,0,.06)}
.tip .tip-inset:hover{background:var(--tip-bg)}
.tip-inset svg{display:block;width:100%;height:auto}
.tip-credit{position:absolute;right:10px;bottom:6px;font-size:10px;color:var(--tip-muted-fg);opacity:.8}
.tip-credit a{color:inherit;text-decoration:underline}
.tip-list{display:flex;flex-direction:column;min-height:0;max-height:18rem}
.tip-list-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:12px 16px 8px}
.tip-list-head h3{font-size:14px;font-weight:600}
.tip-ul{list-style:none;margin:0;padding:0 8px 8px;flex:1;min-height:0;overflow-y:auto}
.tip .tip-item{position:relative;display:flex;width:100%;align-items:center;gap:12px;border-radius:6px;padding:6px 12px;transition:background .15s}
.tip .tip-item.tip-item-lg{padding:8px}
.tip .tip-item:hover,.tip .tip-item[aria-pressed=true]{background:var(--tip-muted)}
.tip .tip-item[aria-pressed=true]{font-weight:500}
.tip-swatch{width:12px;height:12px;border-radius:999px;flex-shrink:0}
.tip-bar{position:absolute;left:0;top:6px;bottom:6px;width:4px;border-radius:999px}
.tip-grow{flex:1;min-width:0}
.tip-trunc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tip-block{display:block}
.tip-strong{font-weight:500}
.tip-sub{font-size:12px;font-weight:400;color:var(--tip-muted-fg)}
.tip-num{flex-shrink:0;font-size:12px;color:var(--tip-muted-fg);font-variant-numeric:tabular-nums}
.tip-footer{display:grid;gap:12px;padding:12px 16px;border-top:1px solid var(--tip-border)}
.tip-field{display:grid;gap:6px}
.tip-result{display:flex;align-items:center;gap:8px;min-height:36px;border-radius:6px;background:var(--tip-muted);padding:8px 12px}
.tip-result p{flex:1;min-width:0}
.tip-result .tip-empty{color:var(--tip-muted-fg)}
.tip .tip-btn{flex-shrink:0;border:1px solid var(--tip-border);border-radius:6px;background:var(--tip-bg);padding:4px 10px;font-size:12px;font-weight:500;transition:background .15s}
.tip .tip-btn:hover{background:var(--tip-muted)}
.tip-fill-muted{fill:var(--tip-muted-fg)}
.tip-fill-muted-soft{fill:var(--tip-muted-fg);fill-opacity:.3}
.tip-stroke-bg{stroke:var(--tip-bg)}
.tip-stroke-fg{stroke:var(--tip-fg)}
.tip-stroke-fg-soft{stroke:var(--tip-fg);stroke-opacity:.7}
.tip-text{fill:var(--tip-fg);stroke:var(--tip-bg)}
@media (min-width:640px){
  .tip .tip-inset{width:144px}
  .tip-footer{grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);align-items:end}
}
@media (min-width:768px){
  .tip-body{grid-template-columns:minmax(0,1fr) 17rem}
  .tip-map{border-bottom:0;border-right:1px solid var(--tip-border)}
  .tip-list{max-height:30rem}
}
@media (prefers-reduced-motion:reduce){.tip-zoom,.tip-region{transition:none}}
`;

/* -- görünüm yardımcıları --------------------------------------------------- */

type View = { s: number; tx: number; ty: number };
const FULL_VIEW: View = { s: 1, tx: 0, ty: 0 };

function fitView(b: BBox, padding = 1.16, maxScale = 7): View {
  const w = (b[2] - b[0]) * padding;
  const h = (b[3] - b[1]) * padding;
  const s = Math.min(TR_VIEW_W / w, TR_VIEW_H / h, maxScale);
  const cx0 = (b[0] + b[2]) / 2;
  const cy0 = (b[1] + b[3]) / 2;
  return { s, tx: TR_VIEW_W / 2 - cx0 * s, ty: TR_VIEW_H / 2 - cy0 * s };
}

/* -- bileşen --------------------------------------------------------------- */

export function TurkiyeIlSecici({ defaultIlId, defaultAddressLine = "", onChange, theme, className }: TurkiyeIlSeciciProps) {
  const initial = defaultIlId ? IL_BY_ID.get(defaultIlId) : undefined;

  const [regionId, setRegionId] = React.useState<string | null>(initial?.regionId ?? null);
  const [ilId, setIlId] = React.useState<string | null>(initial?.id ?? null);
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const [hoveredRegionId, setHoveredRegionId] = React.useState<string | null>(null);
  const [postal, setPostal] = React.useState(initial?.postalCode ?? "");
  const [searching, setSearching] = React.useState(false);
  const [addressLine, setAddressLine] = React.useState(defaultAddressLine);
  const [copied, setCopied] = React.useState(false);
  const [svgRef, svgWidth] = useElementWidth<SVGSVGElement>();
  const uid = React.useId();

  const region = regionId ? REGION_BY_ID.get(regionId) ?? null : null;
  const il = ilId ? IL_BY_ID.get(ilId) ?? null : null;
  const hovered = hoveredId ? IL_BY_ID.get(hoveredId) ?? null : null;

  const matches = React.useMemo(
    () => (searching ? findIllerByPostalCode(postal).sort((a, b) => a.id.localeCompare(b.id)) : []),
    [searching, postal],
  );
  const matchSet = React.useMemo(() => new Set(matches.map((d) => d.id)), [matches]);

  const view = React.useMemo<View>(() => {
    if (matches.length) return fitView(unionBBox(matches));
    if (region) return fitView(region.bbox);
    return FULL_VIEW;
  }, [matches, region]);

  // harita kayınca imlecin altında kalan il vurgulu kalmasın
  React.useEffect(() => setHoveredId(null), [view]);

  const pxPerUnit = svgWidth ? svgWidth / TR_VIEW_W : 0.8;
  const unit = 1 / (view.s * pxPerUnit); // bir ekran pikseli, harita biriminde
  const zoomed = view.s > 1.01;

  /* eylemler */

  const selectIl = React.useCallback((d: TrIl) => {
    setRegionId(d.regionId);
    setIlId(d.id);
    setSearching(false);
    setPostal((prev) => (prev.length === 5 && prev.startsWith(d.id) ? prev : d.postalCode));
  }, []);

  const selectRegion = React.useCallback(
    (id: string) => {
      setRegionId(id);
      setHoveredRegionId(null);
      setSearching(false);
      if (il && il.regionId !== id) {
        setIlId(null);
        setPostal("");
      }
    },
    [il],
  );

  const showAll = () => {
    setRegionId(null);
    setSearching(false);
  };

  const handlePostal = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 5);
    setPostal(digits);
    if (!digits) {
      setSearching(false);
      return;
    }
    const found = findIllerByPostalCode(digits);
    if (digits.length >= 2 && found.length === 1) {
      setRegionId(found[0].regionId);
      setIlId(found[0].id);
      setSearching(false);
    } else {
      setSearching(true);
    }
  };

  const handleMapClick = (d: TrIl) => {
    if (matches.length || (region && region.id === d.regionId)) selectIl(d);
    else selectRegion(d.regionId);
  };

  /* çıktı */

  const selectedRegion = il ? REGION_BY_ID.get(il.regionId)! : null;
  const postalCode = il && postal.length === 5 && postal.startsWith(il.id) ? postal : il?.postalCode ?? "";
  const formatted =
    il && selectedRegion ? [addressLine.trim(), `${postalCode} ${il.name}`, "Türkiye"].filter(Boolean).join(", ") : "";

  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmitted = React.useRef<string | null>(null);
  React.useEffect(() => {
    const value: TrAddress | null =
      il && selectedRegion
        ? {
            regionId: selectedRegion.id,
            region: selectedRegion.name,
            ilId: il.id,
            il: il.name,
            postalCode,
            addressLine: addressLine.trim(),
            formatted,
          }
        : null;
    const key = JSON.stringify(value);
    if (key === lastEmitted.current) return;
    lastEmitted.current = key;
    onChangeRef.current?.(value);
  }, [il, selectedRegion, postalCode, addressLine, formatted]);

  const copy = async () => {
    if (!formatted) return;
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* pano kullanılamıyor */
    }
  };

  /* harita boyaması */

  const fillFor = (d: TrIl): { color: string | null; opacity: number } => {
    const color = REGION_BY_ID.get(d.regionId)!.color;
    if (matches.length) {
      return matchSet.has(d.id) ? { color, opacity: d.id === hoveredId ? 1 : 0.85 } : { color: null, opacity: 0.14 };
    }
    if (!region) {
      const hr = hovered?.regionId ?? hoveredRegionId;
      if (d.id === ilId) return { color, opacity: 1 };
      return { color, opacity: hr ? (d.regionId === hr ? 0.95 : 0.4) : 0.8 };
    }
    if (d.regionId !== region.id) return { color: null, opacity: hovered?.regionId === d.regionId ? 0.3 : 0.16 };
    if (d.id === ilId) return { color, opacity: 1 };
    if (d.id === hoveredId) return { color, opacity: 0.75 };
    return { color, opacity: 0.42 };
  };

  const labelled = React.useMemo(() => (matches.length ? matches : region ? ILS_BY_REGION.get(region.id)! : []), [matches, region]);

  // Yakın çekimde il adları çakışmadan yerleşir: önce seçili, sonra büyük iller
  const labelLayout = React.useMemo(() => {
    const placed = new Set<string>();
    if (!zoomed) return placed;
    const k = view.s * pxPerUnit; // harita birimi → ekran pikseli
    const boxes: BBox[] = [];
    const free = (b: BBox) => !boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    const order = [...labelled].sort((a, b) => Number(b.id === ilId) - Number(a.id === ilId) || bboxArea(b.bbox) - bboxArea(a.bbox));
    for (const d of order) {
      const x = d.label[0] * k;
      const y = d.label[1] * k;
      const w = d.name.length * 7.2 + 8;
      const box: BBox = [x - w / 2, y - 12, x + w / 2, y + 5];
      if (free(box)) {
        boxes.push(box);
        placed.add(d.id);
      }
    }
    return placed;
  }, [zoomed, view.s, pxPerUnit, labelled, ilId]);

  const listMode: "matches" | "region" | "overview" = matches.length ? "matches" : region ? "region" : "overview";

  const status = searching
    ? matches.length
      ? `${matches.length} il ${postal.slice(0, 2)} ile başlıyor`
      : `${postal.slice(0, 2)} plaka kodlu il yok`
    : null;

  const crumbIl = region && il?.regionId === region.id ? il : null;
  const regionTitle = (r: TrRegion) => `${r.name} Bölgesi`;

  return (
    <div
      className={cx("tip", className)}
      data-theme={theme}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        if (searching) setSearching(false);
        else if (region) showAll();
      }}
    >
      <style>{CSS}</style>

      {/* üst çubuk */}
      <div className="tip-header">
        <nav aria-label="Konum" className="tip-crumbs">
          <button type="button" className="tip-crumb" aria-current={!region ? "location" : undefined} onClick={showAll}>
            Türkiye
          </button>
          {region && (
            <>
              <Chevron />
              <button
                type="button"
                className="tip-crumb"
                aria-current={!crumbIl ? "location" : undefined}
                onClick={() => selectRegion(region.id)}
              >
                {region.name}
              </button>
            </>
          )}
          {crumbIl && (
            <>
              <Chevron />
              <span className="tip-crumb" aria-current="location">
                {crumbIl.name}
              </span>
            </>
          )}
        </nav>

        <label htmlFor={`${uid}-postal`} className="tip-inline">
          <span className="tip-label">Posta kodu</span>
          <input
            id={`${uid}-postal`}
            className="tip-input tip-postal"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="34000"
            value={postal}
            onChange={(e) => handlePostal(e.target.value)}
          />
        </label>
      </div>

      {/* gövde */}
      <div className="tip-body">
        {/* harita */}
        <div className="tip-map">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${TR_VIEW_W} ${TR_VIEW_H}`}
            role="img"
            aria-label={region ? `${region.name} bölgesi haritası, Türkiye` : "Türkiye'nin yedi coğrafi bölgesi haritası"}
            className="tip-svg"
            onMouseLeave={() => setHoveredId(null)}
          >
            <g
              className="tip-zoom"
              style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, transformOrigin: "0 0" }}
            >
              {ILS.map((d) => {
                const { color, opacity } = fillFor(d);
                return (
                  <path
                    key={d.id}
                    d={d.d}
                    aria-hidden
                    vectorEffect="non-scaling-stroke"
                    strokeWidth={0.75}
                    strokeLinejoin="round"
                    className={cx("tip-region tip-stroke-bg", !color && "tip-fill-muted")}
                    style={color ? { fill: color, fillOpacity: opacity } : { fillOpacity: opacity }}
                    onMouseEnter={() => setHoveredId(d.id)}
                    onClick={() => handleMapClick(d)}
                  />
                );
              })}

              {/* bölge sınırı: komşu bölge ilinin sınırı kalın çizilir */}
              <path
                d={TR_REGION_BORDER}
                aria-hidden
                fill="none"
                pointerEvents="none"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeWidth={region && !matches.length ? 1.5 : 2.5}
                className={region && !matches.length ? "tip-stroke-fg-soft" : "tip-stroke-bg"}
              />

              {il && (
                <path
                  d={il.d}
                  aria-hidden
                  fill="none"
                  pointerEvents="none"
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  className="tip-stroke-fg"
                />
              )}

              {/* bölge adları (genel görünüm); dar ekranda liste taşır */}
              {!zoomed &&
                !matches.length &&
                pxPerUnit >= 0.45 &&
                REGIONS.map((r) => (
                  <text
                    key={r.id}
                    x={r.label[0]}
                    y={r.label[1]}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    pointerEvents="none"
                    fill="#fff"
                    fontWeight={600}
                    fontSize={13 * unit}
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,.35)" }}
                  >
                    {r.name}
                  </text>
                ))}

              {/* il adları (yakın çekim): yerleşenler ve üstündeki il */}
              {zoomed &&
                labelled
                  .filter((d) => labelLayout.has(d.id) || d.id === hoveredId)
                  .sort((a, b) => Number(a.id === hoveredId) - Number(b.id === hoveredId))
                  .map((d) => (
                    <text
                      key={d.id}
                      x={d.label[0]}
                      y={d.label[1]}
                      textAnchor="middle"
                      pointerEvents="none"
                      fontSize={12 * unit}
                      fontWeight={d.id === ilId ? 700 : 500}
                      strokeWidth={3 * unit}
                      strokeLinejoin="round"
                      paintOrder="stroke"
                      className="tip-text"
                    >
                      {d.name}
                    </text>
                  ))}
            </g>
          </svg>

          {/* üzerine gelince / durum rozeti */}
          <div aria-live="polite" className="tip-readout">
            {status && <span className="tip-chip tip-chip-status">{status}</span>}
            {hovered && (
              <span className="tip-chip">
                {zoomed ? (
                  <>
                    <span className="tip-strong">{hovered.name}</span>
                    <span className="tip-num">{hovered.id}</span>
                  </>
                ) : (
                  <>
                    <span className="tip-strong">{regionTitle(REGION_BY_ID.get(hovered.regionId)!)}</span>
                    <span className="tip-sub">{hovered.name}</span>
                  </>
                )}
              </span>
            )}
          </div>

          {/* ek harita: neredeyim */}
          {zoomed && (
            <button type="button" className="tip-inset" onClick={showAll} aria-label="Bütün Türkiye'yi göster" title="Bütün Türkiye'yi göster">
              <svg viewBox={`0 0 ${TR_VIEW_W} ${TR_VIEW_H}`} aria-hidden>
                {ILS.map((d) => {
                  const active = matches.length ? matchSet.has(d.id) || matches.some((m) => m.regionId === d.regionId) : region?.id === d.regionId;
                  return (
                    <path
                      key={d.id}
                      d={d.d}
                      strokeWidth={3}
                      className={cx("tip-stroke-bg", !active && "tip-fill-muted-soft")}
                      style={active ? { fill: REGION_BY_ID.get(d.regionId)!.color } : undefined}
                    />
                  );
                })}
                <rect
                  x={-view.tx / view.s}
                  y={-view.ty / view.s}
                  width={TR_VIEW_W / view.s}
                  height={TR_VIEW_H / view.s}
                  fill="none"
                  strokeWidth={8}
                  className="tip-stroke-fg"
                />
              </svg>
            </button>
          )}

          <span className="tip-credit">
            Sınırlar: <a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">geoBoundaries</a> (CC BY-SA 2.0)
          </span>
        </div>

        {/* liste */}
        <div className="tip-list">
          <div className="tip-list-head">
            <h3>
              {listMode === "matches"
                ? `Plaka kodu ${postal.slice(0, 2)} ile başlayanlar`
                : listMode === "region"
                  ? regionTitle(region!)
                  : "Bölge seçin"}
            </h3>
            {listMode === "region" && <span className="tip-label">{ILS_BY_REGION.get(region!.id)!.length} il</span>}
          </div>

          <ul className="tip-ul" role="list">
            {listMode === "overview"
              ? REGIONS.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="tip-item tip-item-lg"
                      onClick={() => selectRegion(r.id)}
                      onMouseEnter={() => setHoveredRegionId(r.id)}
                      onMouseLeave={() => setHoveredRegionId(null)}
                      onFocus={() => setHoveredRegionId(r.id)}
                      onBlur={() => setHoveredRegionId(null)}
                    >
                      <span aria-hidden className="tip-swatch" style={{ background: r.color }} />
                      <span className="tip-grow">
                        <span className="tip-block tip-strong">{regionTitle(r)}</span>
                      </span>
                      <span className="tip-num">{ILS_BY_REGION.get(r.id)!.length} il</span>
                    </button>
                  </li>
                ))
              : (listMode === "matches" ? matches : ILS_BY_REGION.get(region!.id)!).map((d) => {
                  const selected = d.id === ilId;
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        className="tip-item"
                        aria-pressed={selected}
                        onClick={() => selectIl(d)}
                        onMouseEnter={() => setHoveredId(d.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onFocus={() => setHoveredId(d.id)}
                        onBlur={() => setHoveredId(null)}
                      >
                        {selected && <span aria-hidden className="tip-bar" style={{ background: REGION_BY_ID.get(d.regionId)!.color }} />}
                        <span className="tip-grow tip-trunc">{d.name}</span>
                        <span className="tip-num">{d.id}</span>
                      </button>
                    </li>
                  );
                })}
          </ul>
        </div>
      </div>

      {/* alt: adres satırı + sonuç */}
      <div className="tip-footer">
        <label htmlFor={`${uid}-line`} className="tip-field">
          <span className="tip-label">Cadde, sokak, mahalle</span>
          <input
            id={`${uid}-line`}
            className="tip-input"
            autoComplete="address-line1"
            placeholder="Atatürk Cd. No: 12"
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
          />
        </label>

        <div className="tip-result">
          <p className={formatted ? "tip-strong" : "tip-empty"}>{formatted || "Haritadan bir il seçin ya da posta kodunu yazın."}</p>
          {formatted && (
            <button type="button" className="tip-btn" onClick={copy}>
              {copied ? "Kopyalandı" : "Kopyala"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="tip-chev" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}
