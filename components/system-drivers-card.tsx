"use client";

import React, { useEffect, useMemo, useState } from "react";
import { BarChart, ResponsiveContainer } from "recharts";
import { ChartBar as Bar, ChartGrid as CartesianGrid, ChartLegend as Legend, ChartTip as Tooltip, ChartXAxis as XAxis, ChartYAxis as YAxis } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MethodLink } from "@/components/method-link";
import { SystemAttributionCard } from "@/components/system-attribution-card";
import { DRIVERS, type DirectionSide, type Driver, type DriverSummary } from "@/lib/analysis/system-drivers";
import type { SystemDrivers, SystemDriversYear } from "@/lib/services/system-drivers";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
/** Doğrulanmış kategorik sıra (validate_palette: açık zemin, bitişik çiftler) */
const COLOR: Record<Driver, string> = { wind: "#2a78d6", sun: "#eda100", river: "#1baf7a", load: "#eb6834" };
const GRID = "#e2e8f0";
const AXIS = "#64748b";
const GEN: Driver[] = ["wind", "sun", "river"];
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const pctOf = (n: number, of: number) => (of ? (n / of) * 100 : 0);

type Side = "deficit" | "surplus";
/** Yöne göre sözcükler: açıkta tüketim "fazla", üretim "eksik"; fazlada tersi */
const WORDS: Record<Side, { hours: string; gap: string; load: string; gen: string; label: Record<Driver, string> }> = {
  deficit: {
    hours: "Açık saatler",
    gap: "açığı",
    load: "tüketim tahminden fazla",
    gen: "santraller planından az üretti",
    label: { load: "Tüketim fazlası", wind: "Rüzgâr eksiği", sun: "Güneş eksiği", river: "Akarsu eksiği" },
  },
  surplus: {
    hours: "Fazla saatler",
    gap: "fazlayı",
    load: "tüketim tahminden az",
    gen: "santraller planından fazla üretti",
    label: { load: "Tüketim eksiği", wind: "Rüzgâr fazlası", sun: "Güneş fazlası", river: "Akarsu fazlası" },
  },
};
/** Yığın sırası alttan üste: önce tüketim, sonra üretim tarafı */
const STACK: Driver[] = ["load", "wind", "sun", "river"];

const totalPush = (s: DirectionSide) => DRIVERS.reduce((a, d) => a + s.push[d], 0);
const genPush = (s: DirectionSide) => GEN.reduce((a, d) => a + s.push[d], 0);
const loadShare = (s: DirectionSide) => pctOf(s.push.load, totalPush(s));

const monthsLabel = (nums: string[]) => {
  const a = MONTHS[Number(nums[0]) - 1];
  const b = MONTHS[Number(nums[nums.length - 1]) - 1];
  return nums.length === 1 ? a : `${a}–${b}`;
};
const periodOf = (y: SystemDriversYear) => {
  const nums = y.months.map((m) => m.month.slice(5));
  return nums.length === 12 ? String(y.year) : `${y.year} (${monthsLabel(nums)})`;
};

/** Ardışık günleri aralık olarak: "1–21 Mayıs 2026" */
function dayRanges(days: string[]): string[] {
  const out: string[] = [];
  let start = days[0];
  let prev = days[0];
  const fmt = (a: string, b: string) => {
    const [ay, am, ad] = a.split("-");
    const [by, bm, bd] = b.split("-");
    if (a === b) return `${Number(ad)} ${MONTHS[Number(am) - 1]} ${ay}`;
    if (ay === by && am === bm) return `${Number(ad)}–${Number(bd)} ${MONTHS[Number(am) - 1]} ${ay}`;
    return `${Number(ad)} ${MONTHS[Number(am) - 1]}${ay === by ? "" : ` ${ay}`} – ${Number(bd)} ${MONTHS[Number(bm) - 1]} ${by}`;
  };
  for (const d of days.slice(1)) {
    if (Date.parse(d) - Date.parse(prev) === 86_400_000) prev = d;
    else {
      out.push(fmt(start, prev));
      start = prev = d;
    }
  }
  if (days.length) out.push(fmt(start, prev));
  return out;
}

/**
 * Sistem yönünü ne belirledi? Açık (fazla) saatlerde sistemi o yöne iten sapmaların ortalaması: tüketim tarafı (yük
 * tahmini hatası) ve üretim tarafı (rüzgâr, güneş, akarsu plan sapması). Dengeleyenler (talimatla yön değiştiren) tabloda.
 */
export function SystemDriversCard() {
  const [data, setData] = useState<SystemDrivers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [side, setSide] = useState<Side>("deficit");
  useEffect(() => {
    fetch("/api/sector/system-drivers")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setData(d);
        setYear(d.years[0]?.year ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Sistem yönü verisi yüklenemedi."));
  }, []);

  const w = WORDS[side];
  const y = data?.years.find((x) => x.year === year) ?? null;
  const row = (label: string, push: Record<Driver, number>) => ({ label, ...Object.fromEntries(STACK.map((d) => [w.label[d], push[d]])) });
  const monthly = useMemo(() => (y?.months ?? []).map((m) => row(MONTHS_SHORT[Number(m.month.slice(5, 7)) - 1], m[side].push)), [y, side]); // eslint-disable-line react-hooks/exhaustive-deps
  const hourly = useMemo(() => (y?.hourOfDay ?? []).map((h) => row(String(h.hour).padStart(2, "0"), h.push[side])), [y, side]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error || !data || !y)
    return (
      <Card className="shadow-sm">
        <CardContent className={`p-4 text-sm ${error ? "text-amber-800" : "text-slate-500"}`}>{error ?? "Yükleniyor…"}</CardContent>
      </Card>
    );

  const t = y.total;
  const s = t[side];
  const cmp = y.comparison;
  const cmpFull = cmp !== null && cmp.months.length === y.months.length;
  /** Önceki yılla kıyas satırı: ortak aylar dönemin tamamı değilse aylar yazılır, bu yılın aynı aylardaki değeriyle */
  const prevLine = (f: (x: DriverSummary) => string) =>
    !cmp ? undefined : cmpFull ? `${y.year - 1}: ${f(cmp.previous)}` : `${monthsLabel(cmp.months)} kıyası: ${y.year - 1} ${f(cmp.previous)}, ${y.year} ${f(cmp.current)}`;
  const lastMonth = MONTHS[Number(y.months[y.months.length - 1].month.slice(5, 7)) - 1];
  const excluded = y.excludedDays.map((d) => d.day);

  const tiles: Array<{ label: string; value: string; sub: string; prev?: string; color?: string }> = [
    {
      label: "Açık saatler",
      value: `%${nf(pctOf(t.deficit.hours, t.hours))}`,
      sub: `${nf(t.deficit.hours)} saat açık, ${nf(t.surplus.hours)} saat fazla`,
      prev: prevLine((x) => `%${nf(pctOf(x.deficit.hours, x.hours))}`),
    },
    {
      label: `${w.hours}: tüketim tarafı`,
      value: `%${nf(loadShare(s))}`,
      sub: `${w.load}: ortalama ${nf(s.push.load)} MW. Üst sınır: tüketim serisi tahminle aynı temelde ölçülmüyor, sapmanın bir kısmı ölçüm farkı.`,
      prev: prevLine((x) => `%${nf(loadShare(x[side]))}`),
      color: COLOR.load,
    },
    {
      label: `${w.hours}: üretim tarafı`,
      value: `%${nf(100 - loadShare(s))}`,
      sub: `${w.gen}: ${nf(genPush(s))} MW (rüzgâr ${nf(s.push.wind)}, güneş ${nf(s.push.sun)}, akarsu ${nf(s.push.river)})`,
      prev: prevLine((x) => `%${nf(100 - loadShare(x[side]))}`),
      color: COLOR.wind,
    },
    {
      label: "Yöntemin isabeti",
      value: t.balancedAgreementPct === null ? "–" : `%${nf(t.balancedAgreementPct)}`,
      sub:
        `tüketim, rüzgâr, güneş ve akarsu sapmasının toplamı saatin yönünü ne sıklıkla doğru gösteriyor: açık saatlerde ` +
        `%${nf(t.deficitAgreementPct ?? 0)}, fazla saatlerde %${nf(t.surplusAgreementPct ?? 0)}; ortalaması. Rastgele tahmin %50.`,
      prev: prevLine((x) => (x.balancedAgreementPct === null ? "–" : `%${nf(x.balancedAgreementPct)}`)),
    },
  ];

  const chart = (rows: Array<Record<string, number | string>>, interval?: number) => (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke={AXIS} tickLine={false} interval={interval} />
        <YAxis tick={{ fontSize: 11 }} stroke={AXIS} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => nf(v)} />
        <Tooltip
          formatter={(v: unknown) => `${nf(Number(v ?? 0))} MW`}
          itemSorter={(item) => -STACK.findIndex((d) => w.label[d] === item.name)}
          cursor={{ fill: "#f1f5f9" }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          itemSorter={(item) => STACK.findIndex((d) => w.label[d] === item.value)}
          formatter={(v: string) => <span className="text-slate-600">{v}</span>}
        />
        {STACK.map((d, i) => (
          <Bar
            key={d}
            isAnimationActive={false}
            stackId="p"
            dataKey={w.label[d]}
            fill={COLOR[d]}
            stroke="#fff"
            strokeWidth={2}
            radius={i === STACK.length - 1 ? [4, 4, 0, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="gap-3 pb-3 md:flex-row md:items-start md:justify-between md:space-y-0">
          <div>
            <CardTitle className="text-base">Sistem yönünü ne belirledi? {periodOf(y)}</CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              Sistem açıktaysa iki sebep olabilir: <b>tüketim</b> tahminden fazladır ya da <b>santraller</b> (rüzgâr, güneş, akarsu) planından az
              üretmiştir; çoğu saatte ikisi birlikte. Burada her açık saatte ikisi de MW olarak ölçülür: turuncu çubuk büyükse açığı tüketim,
              mavi, sarı ve yeşil büyükse santraller yaratmış. Fazla saatlerde tersi. Türkiye toplamı, EPİAŞ uzlaştırma verisi; {lastMonth}{" "}
              sonuna kadar (UEVM ay bitince yayımlanır).
            </CardDescription>
            <MethodLink section="sistem-yonu" label="Yöntem ve sınırları" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Yıl" className="flex h-9 overflow-hidden rounded-md border border-slate-200 bg-white text-sm">
              {data.years.map((x) => (
                <button
                  key={x.year}
                  type="button"
                  aria-pressed={x.year === year}
                  onClick={() => setYear(x.year)}
                  className={`px-3 ${x.year === year ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {x.year}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Yön" className="flex h-9 overflow-hidden rounded-md border border-slate-200 bg-white text-sm">
              {(["deficit", "surplus"] as const).map((x) => (
                <button
                  key={x}
                  type="button"
                  aria-pressed={side === x}
                  onClick={() => setSide(x)}
                  className={`px-3 ${side === x ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {WORDS[x].hours}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((tile) => (
              <div key={tile.label} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  {tile.color && <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: tile.color }} aria-hidden />}
                  {tile.label}
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{tile.value}</p>
                <p className="mt-0.5 text-xs text-slate-500">{tile.sub}</p>
                {tile.prev && <p className="mt-1 text-xs font-medium text-slate-700">{tile.prev}</p>}
              </div>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-slate-800">{w.hours}: {w.gap} kim yarattı, aylık</p>
              <p className="text-xs text-slate-500">O ayın {side === "deficit" ? "açık" : "fazla"} saatlerinde ortalama, MW.</p>
              <div className="mt-2 h-[280px] w-full">{chart(monthly)}</div>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">{w.hours}: {w.gap} kim yarattı, günün saatine göre</p>
              <p className="text-xs text-slate-500">Türkiye saati; dönemdeki {side === "deficit" ? "açık" : "fazla"} saatlerde ortalama, MW.</p>
              <div className="mt-2 h-[280px] w-full">{chart(hourly, 2)}</div>
            </div>
          </div>
          {excluded.length > 0 && (
            <p className="text-xs text-slate-500">
              Hesaba katılmayan günler: {dayRanges(excluded).join(", ")}. Bu günlerde güneşin planı (KGÜP) EPİAŞ toplamında eksik kayıtlı
              (üretim planının 1,5 katını aşıyor), bu yüzden sapma ölçülemiyor.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ay ay: {w.gap} kim yarattı, kim kapattı?</CardTitle>
          <CardDescription className="max-w-3xl">
            {w.hours === "Açık saatler" ? "Sistemin açık olduğu" : "Sistemin fazla olduğu"} saatlerde ortalama, MW. <b>Yaratanlar</b>: tüketim
            tahmininden ve rüzgâr, güneş, akarsu planından sapma. <b>Kapatanlar</b>: TEİAŞ&apos;ın o saatlerde santrallere verip teslim
            edilen {side === "deficit" ? "yukarı (YAL)" : "aşağı (YAT)"} talimatı, EPİAŞ verisi; sebep değil cevaptır.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-auto p-0">
          <MonthTable y={y} side={side} />
        </CardContent>
        {y.curtailmentFlags.length > 0 && (
          <CardContent className="border-t border-slate-100 pt-3 text-xs text-slate-700">
            <p>
              <b>⚠ Yüksek kısıntılı aylar:</b>{" "}
              {y.curtailmentFlags
                .map(
                  (f) =>
                    `${MONTHS[Number(f.month.slice(5, 7)) - 1]} (fazla saatlerde YAT ${nf(f.yatMw)} MW; plansız kısıntı ${nf(f.curtailedMw)} MW ayrıldı` +
                    (f.windPlannedPct !== null ? `; karnede kaybın planlı payı rüzgâr %${nf(f.windPlannedPct)}${f.solarPlannedPct !== null ? `, güneş %${nf(f.solarPlannedPct)}` : ""}` : "") +
                    ")"
                )
                .join(", ")}
              . TEİAŞ bu aylarda çok kısma talimatı verdi. Rüzgâr, güneş ve akarsu sütunları kısıntı hariçtir: rüzgâr ve güneşte karnedeki
              lisanslı santrallerin ölçülen plansız kaybı, akarsuda planı varken en az 6 saat sıfıra yakın üretim (olası kısıntı, büyük ölçüde
              Doğu Karadeniz ve Akdeniz) sapmaya geri eklendi. Rüzgâr kısıntısının çoğu bir gün önceden plana (KGÜP) yansıtılmış; plandaki
              düşüş sapma yaratmaz. Ölçülemeyen kısım: 6 saatten kısa ve kısmi kısıntılar; geri kalan talimat büyük olasılıkla baraj ve
              termik santrallere gitti. 2025&apos;te akarsu kısıntısı ayrılamaz (havuzda son KGÜP eksik).
            </p>
          </CardContent>
        )}
      </Card>

      <SystemAttributionCard year={y.year} side={side} />
    </div>
  );
}

/** Tüketim ile santrallerin payı: turuncu / mavi çubuk ve yazıyla baskın taraf */
function ShareBar({ side }: { side: DirectionSide }) {
  if (!side.hours || totalPush(side) === 0) return <span className="text-slate-400">–</span>;
  const load = loadShare(side);
  const lead = load >= 50 ? `Tüketim %${nf(load)}` : `Santraller %${nf(100 - load)}`;
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-2.5 w-24 shrink-0 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div style={{ width: `${load}%`, background: COLOR.load }} />
        <div style={{ width: `${100 - load}%`, background: COLOR.wind }} className="border-l-2 border-white" />
      </div>
      <span className="whitespace-nowrap text-xs text-slate-700">{lead}</span>
    </div>
  );
}

function MonthTable({ y, side }: { y: SystemDriversYear; side: Side }) {
  const w = WORDS[side];
  const rows: Array<{ key: string; label: string; s: DriverSummary }> = [
    ...y.months.map((m) => ({ key: m.month, label: `${MONTHS[Number(m.month.slice(5, 7)) - 1]} ${m.month.slice(0, 4)}`, s: m as DriverSummary })),
    { key: "total", label: "Dönem", s: y.total },
  ];
  /** EPİAŞ'ın teslim edilen talimatı: açıkta yukarı (YAL), fazlada aşağı (YAT) */
  const response = (d: DirectionSide) => (d.instructed ? (side === "deficit" ? d.instructed.up : d.instructed.down) : null);
  const group = "border-l border-slate-200";
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead rowSpan={2} className="align-bottom">
            Ay
          </TableHead>
          <TableHead rowSpan={2} className="text-right align-bottom">
            {side === "deficit" ? "Açık" : "Fazla"} saat
          </TableHead>
          <TableHead rowSpan={2} className={`${group} align-bottom`}>
            Kim yarattı?
          </TableHead>
          <TableHead colSpan={5} className={`${group} h-8 text-center text-xs font-semibold uppercase tracking-wide text-slate-500`}>
            {w.gap} yaratanlar, MW
          </TableHead>
          <TableHead rowSpan={2} className={`${group} text-right align-bottom`}>
            Ayrılan kısıntı, MW
            <span className="block text-xs font-normal">rüzgâr, güneş, akarsu</span>
          </TableHead>
          <TableHead rowSpan={2} className={`${group} text-right align-bottom`}>
            Kapatanlar, MW
            <span className="block text-xs font-normal">teslim edilen {side === "deficit" ? "YAL (artır)" : "YAT (kıs)"}</span>
          </TableHead>
        </TableRow>
        <TableRow>
          {STACK.map((d, i) => (
            <TableHead key={d} className={`text-right ${i === 0 ? group : ""}`}>
              <span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: COLOR[d] }} aria-hidden />
              {w.label[d].split(" ")[0]}
            </TableHead>
          ))}
          <TableHead className="text-right">Toplam</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ key, label, s }) => {
          const d = s[side];
          const days = key === "total" ? null : new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();
          return (
            <TableRow key={key} className={key === "total" ? "bg-slate-50 font-semibold" : undefined}>
              <TableCell className="whitespace-nowrap font-medium">
                {label}
                {y.curtailmentFlags.some((f) => f.month === key) && (
                  <span className="ml-1 text-amber-700" title="Yüksek kısıntılı ay: tablonun altına bakın">
                    ⚠
                  </span>
                )}
                {days !== null && s.hours < days * 24 * 0.95 && <span className="ml-1 text-xs font-normal text-slate-500">({nf(s.hours / 24)} gün)</span>}
              </TableCell>
              <TableCell className="text-right tabular-nums">%{nf(pctOf(d.hours, s.hours))}</TableCell>
              <TableCell className={group}>
                <ShareBar side={d} />
              </TableCell>
              {STACK.map((g, i) => (
                <TableCell key={g} className={`text-right tabular-nums ${i === 0 ? group : ""}`}>
                  {d.hours ? nf(d.push[g]) : "–"}
                </TableCell>
              ))}
              <TableCell className="text-right font-medium tabular-nums">{d.hours ? nf(totalPush(d)) : "–"}</TableCell>
              <TableCell className={`${group} text-right tabular-nums text-slate-500`}>{d.hours ? nf(d.curtailed.wind + d.curtailed.sun + d.curtailed.river) : "–"}</TableCell>
              <TableCell className={`${group} text-right tabular-nums`}>{(() => {
                const r = response(d);
                return r === null ? "–" : nf(r);
              })()}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
