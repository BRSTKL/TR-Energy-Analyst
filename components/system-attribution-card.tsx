"use client";

import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AttrSource, Side } from "@/lib/analysis/system-attribution";
import type { AttrLevel, AttrRow, SystemAttribution } from "@/lib/services/system-attribution";
import { ownerShort } from "@/lib/format";

const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
/** Sistem yönü kartıyla aynı kaynak renkleri */
const COLOR: Record<AttrSource, string> = { wind: "#2a78d6", sun: "#eda100", river: "#1baf7a" };
const SOURCE_LABEL: Record<AttrSource, string> = { wind: "Rüzgâr", sun: "Güneş", river: "Akarsu" };
const LEVEL_LABEL: Record<AttrLevel, string> = { company: "Şirket", aggregator: "Toplayıcı", region: "Bölge", plant: "Santral" };
const LEVEL_PLURAL: Record<AttrLevel, string> = { company: "şirket", aggregator: "toplayıcı grubu", region: "bölge", plant: "santral" };
const GAP: Record<Side, Record<AttrSource, string>> = {
  deficit: { wind: "rüzgâr eksiği", sun: "güneş eksiği", river: "akarsu eksiği" },
  surplus: { wind: "rüzgâr fazlası", sun: "güneş fazlası", river: "akarsu fazlası" },
};
/** Yoğunlaşma: en büyük 10 satırın payına göre */
const concentration = (pct: number) => (pct < 35 ? "dağınık: tek bir şirket belirleyici değil" : pct < 60 ? "orta yoğunlukta" : "yoğun: birkaç satır belirleyici");
/** Planına göre oran, kaynak ortalamasına kıyasla */
function ratioTone(own: number | null, avg: number | null): { cls: string; label: string } | null {
  if (own === null || avg === null || avg <= 0) return null;
  if (own >= 1.5 * avg) return { cls: "bg-amber-100 text-amber-900", label: "ortalamanın belirgin üstü" };
  if (own <= 0.5 * avg) return { cls: "bg-emerald-50 text-emerald-800", label: "ortalamanın belirgin altı" };
  return null;
}
const SHOW = 10;
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
/** Bu kadar saatten az veriyle ay sonucu gürültülüdür */
const FEW_HOURS = 100;

/** Satırın ay ay payı (MW): küçük çubuklar, seçili ay koyu; her çubuğun üzerine gelince değeri */
function Sparkline({ values, keys, selected, color }: { values: number[]; keys: string[]; selected: string | null; color: string }) {
  const max = Math.max(...values, 0.0001);
  return (
    <div className="flex h-6 items-end gap-[2px]" aria-label="Ay ay pay">
      {values.map((v, i) => (
        <div
          key={keys[i]}
          title={`${MONTHS_SHORT[Number(keys[i]) - 1]}: ${nf(v, 1)} MW`}
          className="w-[7px] rounded-t-sm"
          style={{
            height: `${Math.max(2, (v / max) * 24)}px`,
            background: color,
            opacity: selected === null || selected === keys[i] ? 1 : 0.3,
          }}
        />
      ))}
    </div>
  );
}

function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex h-9 overflow-hidden rounded-md border border-slate-200 bg-white text-sm">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`px-3 ${value === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * "Kimden geldi?": seçilen kaynağın açık (fazla) saatlerdeki itmesinin şirket, toplayıcı ya da santrallere paylaşımı
 * (lib/analysis/system-attribution.ts; havuzdaki santral verisi, son KGÜP).
 */
export function SystemAttributionCard({ year, side }: { year: number; side: Side }) {
  const [source, setSource] = useState<AttrSource>("wind");
  const [level, setLevel] = useState<AttrLevel>("company");
  const [data, setData] = useState<SystemAttribution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [month, setMonth] = useState<string | null>(null);
  useEffect(() => setMonth(null), [year]);
  useEffect(() => {
    setError(null);
    setOpen(null);
    setAll(false);
    fetch(`/api/sector/system-attribution?year=${year}&side=${side}&source=${source}&level=${level}${month ? `&month=${month}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Santral paylaşımı yüklenemedi."));
  }, [year, side, source, level, month]);

  const gap = GAP[side][source];
  const sideWord = side === "deficit" ? "açık" : "fazla";
  const lessMore = side === "deficit" ? "az" : "fazla";
  const head = (
    <CardHeader className="gap-3 pb-3 md:flex-row md:items-start md:justify-between md:space-y-0">
      <div>
        <CardTitle className="text-base">
          Kimden geldi? {gap.charAt(0).toLocaleUpperCase("tr-TR") + gap.slice(1)}, {sideWord} saatler
        </CardTitle>
        <CardDescription className="mt-1 max-w-2xl">
          Üstteki tablodaki {gap}, her saat o saatte planından {lessMore} üreten santrallere paylaştırıldı. Paylar toplanınca o rakamı verir.
        </CardDescription>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Ay"
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
          value={month ?? ""}
          onChange={(e) => setMonth(e.target.value || null)}
          disabled={!data?.available}
        >
          <option value="">Bütün dönem</option>
          {(data?.monthKeys ?? []).map((m) => (
            <option key={m} value={m}>
              {MONTHS[Number(m) - 1]}
            </option>
          ))}
        </select>
        <Toggle label="Kaynak" value={source} onChange={setSource} options={(["wind", "sun", "river"] as const).map((s) => [s, SOURCE_LABEL[s]])} />
        <Toggle label="Düzey" value={level} onChange={setLevel} options={(["company", "aggregator", "region", "plant"] as const).map((l) => [l, LEVEL_LABEL[l]])} />
      </div>
    </CardHeader>
  );

  if (error || !data || !data.available)
    return (
      <Card className="shadow-sm">
        {head}
        <CardContent className={`text-sm ${error ? "text-amber-800" : "text-slate-600"}`}>
          {error ??
            (!data
              ? "Yükleniyor…"
              : `${data.year} için santral ayrıntısı yok: havuzda bu yılın son KGÜP'ü santrallerin çoğunda kayıtlı değil (sektör karnesi ilk KGÜP'le çalışır), santral toplamı sistem toplamını tutmuyor. Santral ayrıntısı olan yıl: ${data.years.filter((y) => y.available).map((y) => y.year).join(", ") || "yok"}.`)}
        </CardContent>
      </Card>
    );

  const t = data.totals;
  const period = data.month ? `${MONTHS[Number(data.month) - 1]} ${data.year}` : `${data.year} (${MONTHS[Number(data.monthKeys[0]) - 1]}–${MONTHS[Number(data.monthKeys[data.monthKeys.length - 1]) - 1]})`;
  const periodHours = data.month ? data.monthHours[data.monthKeys.indexOf(data.month)] : data.monthHours.reduce((a, b) => a + b, 0);
  const maxMw = Math.max(...data.rows.map((r) => r.mw), 0.0001);
  const rows = all ? data.rows : data.rows.slice(0, SHOW);
  const tiles = [
    { label: `Toplam ${gap}`, value: `${nf(t.pushers)} MW`, sub: `${period}, ${nf(periodHours)} ${sideWord} saatte ortalama; ${nf(t.rows)} ${LEVEL_PLURAL[level]}` },
    level === "region"
      ? { label: "En büyük bölge", value: data.rows[0]?.sharePct != null ? `%${nf(data.rows[0].sharePct)}` : "–", sub: data.rows[0]?.shortName ?? "" }
      : { label: `En büyük 10 ${LEVEL_PLURAL[level]}`, value: `%${nf(t.top10Pct)}`, sub: concentration(t.top10Pct) },
    {
      label: "Planına göre, ortalama",
      value: t.ownPct === null ? "–" : `%${nf(t.ownPct, 1)}`,
      sub: `bütün ${SOURCE_LABEL[source].toLocaleLowerCase("tr-TR")} santrallerinde ${side === "deficit" ? "eksik" : "fazla"} üretim ÷ plan; satırlar buna göre kıyaslanır`,
    },
  ];

  const nameCell = (r: AttrRow, expandable: boolean, isOpen: boolean) => (
    <span className="flex items-center gap-1">
      {expandable ? (
        isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        )
      ) : (
        <span className="inline-block w-3.5 shrink-0" />
      )}
      <span className="truncate" title={r.name}>
        {r.shortName}
      </span>
    </span>
  );
  const ratio = (own: number | null) => {
    const tone = ratioTone(own, t.ownPct);
    return own === null ? (
      "–"
    ) : (
      <span className={`rounded px-1.5 py-0.5 ${tone?.cls ?? ""}`} title={tone?.label}>
        %{nf(own, 1)}
      </span>
    );
  };

  return (
    <Card className="shadow-sm">
      {head}
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tiles.map((x) => (
            <div key={x.label} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-medium text-slate-500">{x.label}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{x.value}</p>
              <p className="mt-0.5 text-xs text-slate-500">{x.sub}</p>
            </div>
          ))}
        </div>

        {data.curtailment && data.curtailment.mw > 0 && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <p>
              <b>Ayrılan olası kısıntı: ortalama {nf(data.curtailment.mw)} MW</b> ({period}, {sideWord} saatler). Bu tablo kısıntı hariçtir.
              Bölgelere göre:{" "}
              {data.curtailment.byZone
                .slice(0, 5)
                .map((z) => `${z.zone} %${nf(z.pct)} (${nf(z.mw)} MW, ${nf(z.plants)} santral)`)
                .join(" · ")}
              .
            </p>
            <p className="mt-1 text-slate-500">
              Kural: planı varken en az 6 saat üst üste neredeyse sıfır üretim, arıza ya da bakım bildirimi yok. Büyük olasılıkla TEİAŞ&apos;ın
              bölgesel iletim kısıtı nedeniyle verdiği talimat; bildirilmemiş uzun arıza ya da sel duruşu da olabilir. 2025&apos;te ayrılamaz
              (havuzda son KGÜP eksik).
            </p>
          </div>
        )}
        {periodHours < FEW_HOURS && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Bu dönemde yalnız {nf(periodHours)} {sideWord} saat var
            {data.month === "05" && data.year === 2026 ? " (1–21 Mayıs güneşin planı eksik olduğu için hesap dışı)" : ""}; sonuç gürültülü, dikkatli okuyun.
          </p>
        )}
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>{LEVEL_LABEL[level]}</TableHead>
                {level !== "plant" && <TableHead className="text-right">Santral</TableHead>}
                <TableHead title={`${gap.charAt(0).toLocaleUpperCase("tr-TR") + gap.slice(1)}nin yüzde kaçı bu satırdan`}>Payı</TableHead>
                <TableHead className="text-right">MW</TableHead>
                <TableHead title="Ay ay pay, MW; seçili ay koyu">Aylık</TableHead>
                <TableHead className="text-right" title="Satırın payı, kendi planının (KGÜP) yüzde kaçı: büyüklükten bağımsız ölçü">
                  Planına göre
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => {
                const expandable = !!r.top?.length;
                const isOpen = open === r.key;
                return (
                  <React.Fragment key={r.key}>
                    <TableRow className={expandable ? "cursor-pointer" : undefined} onClick={expandable ? () => setOpen(isOpen ? null : r.key) : undefined}>
                      <TableCell className="tabular-nums text-slate-500">{i + 1}</TableCell>
                      <TableCell className="max-w-[18rem] font-medium">{nameCell(r, expandable, isOpen)}</TableCell>
                      {level !== "plant" && <TableCell className="text-right tabular-nums">{nf(r.plants)}</TableCell>}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-28 shrink-0 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                            <div style={{ width: `${(r.mw / maxMw) * 100}%`, background: COLOR[source] }} className="h-full rounded-full" />
                          </div>
                          <span className="whitespace-nowrap text-xs font-medium tabular-nums text-slate-800">{r.sharePct === null ? "–" : `%${nf(r.sharePct, 1)}`}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{nf(r.mw, 1)}</TableCell>
                      <TableCell>
                        <Sparkline values={r.monthly} keys={data.monthKeys} selected={data.month} color={COLOR[source]} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{ratio(r.ownPct)}</TableCell>
                    </TableRow>
                    {isOpen &&
                      r.top!.map((p) => (
                        <TableRow key={`${r.key}:${p.name}`} className="bg-slate-50/70 text-xs">
                          <TableCell />
                          <TableCell className="pl-8 text-slate-600" title={p.name}>
                            {ownerShort(p.name)}
                          </TableCell>
                          {level !== "plant" && <TableCell />}
                          <TableCell />
                          <TableCell className="text-right tabular-nums text-slate-600">{nf(p.mw, 1)}</TableCell>
                          <TableCell />
                          <TableCell className="text-right tabular-nums text-slate-600">{ratio(p.ownPct)}</TableCell>
                        </TableRow>
                      ))}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <p>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">sarı</span>: planına göre ortalamanın 1,5 katından fazla
            {side === "deficit" ? " eksik" : " fazla"} üretti; <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">yeşil</span>:
            yarısından az. {level !== "plant" && "Satıra tıklayınca en büyük santralleri açılır."}
          </p>
          {data.rows.length > SHOW && (
            <button type="button" onClick={() => setAll(!all)} className="font-medium text-indigo-600 hover:text-indigo-800">
              {all ? `İlk ${SHOW} satır` : `İlk ${nf(data.rows.length)} satırı göster`}
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400">
          Havuzdaki santral verisi (son KGÜP ve UEVM); Türkiye toplamının rüzgârda ve güneşte tamamı, hidroda %98&apos;i. Kısıntı akarsuda santral bazında
          ayrılır; rüzgâr ve güneşte yapılmaz.
          {level === "aggregator" && data.membershipAsOf && ` Toplayıcı üyeliği ${data.membershipAsOf.split("-").reverse().join(".")} itibarıyla.`}
          {source === "sun" && " Güneşte üretimin çoğu lisanssız: binlerce küçük tesis dağıtım bölgesine göre tek satırda."}
          {source === "river" && " Yalnız EPİAŞ'ın akarsu saydığı hidro santraller; barajlılar dengeleyen olduğu için dahil değil."} Dışarıya giden
          metinlerde şirket adları isimsiz kullanılır.
        </p>
      </CardContent>
    </Card>
  );
}
