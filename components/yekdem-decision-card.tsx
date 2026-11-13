"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ELIGIBILITY_LABEL, VERDICT_LABEL, type DecisionRow, type Eligibility } from "@/lib/analysis/yekdem-decision";
import { monthLabelTr } from "@/lib/macro/price-units";
import type { YekdemDecisionData } from "@/lib/services/yekdem-decision";

/**
 * YEKDEM 2027 kararı: kalmak mı, çıkmak mı? Veri /api/yekdem/decision (kural lib/analysis/yekdem-decision.ts). Karşılaştırma
 * YEKDEM birim fiyatı ile 2026'da piyasada yakalanan fiyat (üretim ağırlıklı PTF); dengesizlik iki seçenekte de santralde.
 */

const TECH: Record<string, string> = { RES: "Rüzgâr", GES: "Güneş", HES: "Hidro" };
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const mtl = (v: number) => `${nf(v / 1e6, Math.abs(v) < 1e7 ? 1 : 0)} M`;
const dateTr = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

type Filter = "ALL" | "STAY" | "RETURN";
const FILTERS: { key: Filter; label: string; match: (e: Eligibility) => boolean }[] = [
  { key: "ALL", label: "Tümü", match: () => true },
  { key: "STAY", label: "YEKDEM'de", match: (e) => e === "STAY" || e === "STAY_UNCERTAIN" },
  { key: "RETURN", label: "Çıkmış", match: (e) => e === "RETURN" || e === "RETURN_UNCERTAIN" },
];

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

const price = (r: DecisionRow) =>
  Math.round(r.tariff.low) === Math.round(r.tariff.high) ? nf(r.tariff.low) : `${nf(r.tariff.low)}–${nf(r.tariff.high)}`;
const REGIME: Record<DecisionRow["regime"], string> = { USD: "dolar tarifesi", TL: "TL tarifesi", UNSURE: "tarife belirsiz" };

export function YekdemDecisionCard() {
  const [data, setData] = useState<YekdemDecisionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [all, setAll] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/yekdem/decision")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j.success) setError(j.error ?? "YEKDEM karar listesi alınamadı");
        else setData(j);
      })
      .catch(() => alive && setError("YEKDEM karar listesi alınamadı"));
    return () => {
      alive = false;
    };
  }, []);

  const list = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    return (data?.rows ?? []).filter((r) => f.match(r.eligibility));
  }, [data, filter]);

  const medians = useMemo(() => {
    const rows = data?.rows ?? [];
    return (["RES", "GES", "HES"] as const).map((t) => ({ t, v: median(rows.filter((r) => r.type === t && r.capturePriceTl !== null).map((r) => r.capturePriceTl!)) }));
  }, [data]);

  if (error) return <p className="text-sm text-amber-700">{error}</p>;
  if (!data)
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> YEKDEM karar listesi hazırlanıyor
      </div>
    );

  const s = data.summary;
  const periodText = data.period ? `${monthLabelTr(data.period.start.slice(0, 7))}–${monthLabelTr(data.period.end.slice(0, 7))}` : "–";
  const shown = all ? list : list.slice(0, 40);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {data.decisionYear} kararı: YEKDEM&apos;de kalmak mı, piyasaya çıkmak mı?
        </CardTitle>
        <CardDescription>
          YEKDEM&apos;e katılım her yıl yeniden başvuruyla olur; {data.decisionYear} için son gün <b>{dateTr(data.deadline)}</b>. YEKDEM&apos;deki santral da
          dengesizliğini kendisi öder, bu yüzden karar iki fiyat arasındadır: YEKDEM birim fiyatı ve santralin piyasada eline geçen ortalama
          fiyat (üretimine göre ağırlıklı PTF, {periodText}).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Stat label="Karar verebilecek santral" value={`${nf(s.plants)} santral`} sub={`${nf(s.mw)} MW (gücü kayıtlı olanlar)`} />
          <Stat
            label="YEKDEM fiyatı piyasadan yüksek"
            value={`${nf(s.byVerdict.YEKDEM.plants)} santral`}
            sub={`piyasa yüksek: ${nf(s.byVerdict.MARKET.plants)}, yakın: ${nf(s.byVerdict.CLOSE.plants)}, verisi yok: ${nf(s.byVerdict.NO_DATA.plants)}`}
          />
          <Stat
            label={`${data.decisionYear}'de beklenen hareket`}
            value={`${nf(s.likelyExit)} çıkış · ${nf(s.likelyReturn)} dönüş`}
            sub={`çıkmış olup süresi 2026'da dolmuş olabilecek ${nf(s.uncertainReturn)} santral için de YEKDEM yüksek (dönüş hakkı belirsiz)`}
          />
        </div>

        <p className="text-sm text-slate-700">
          Bugünkü fiyatlarla çıkmak ancak piyasada yakalanan fiyat YEKDEM fiyatını aşarsa kazandırır. Dolar tarifeli (2021&apos;e kadar devreye
          giren) rüzgâr ve hidroda bu eşik {nf(73 * data.fx.usdTry)} TL/MWh, güneşte {nf(133 * data.fx.usdTry)} TL/MWh (kur {nf(data.fx.usdTry, 2)}, {monthLabelTr(data.fx.month)});
          TL tarifeli rüzgâr ve güneşte {nf(data.tlTariff.RES, 2)} TL/MWh ({monthLabelTr(data.tlTariff.period)}). 2026&apos;da yakalanan fiyatın ortası:{" "}
          {medians.map((m, i) => (
            <span key={m.t}>
              {i > 0 && ", "}
              {TECH[m.t].toLowerCase()} {m.v === null ? "–" : `${nf(m.v)} TL/MWh`}
            </span>
          ))}
          . Bu yüzden YEKDEM&apos;den gönüllü çıkış beklenmez; serbest piyasaya geçecek santraller süresi dolanlardır (yukarıdaki takvim).
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3 py-1 text-xs ${filter === f.key ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              {f.label}
            </button>
          ))}
          <span className="text-sm text-slate-500">{list.length} santral · fark büyüklüğüne göre</span>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Santral</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">YEKDEM (TL/MWh)</TableHead>
                <TableHead className="text-right">Piyasada (TL/MWh)</TableHead>
                <TableHead className="text-right">YEKDEM farkı ({periodText}, TL)</TableHead>
                <TableHead>Sonuç</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <Link href={`/santraller/${r.id}`} className="text-indigo-700 hover:underline">
                      {r.name}
                    </Link>
                    <div className="max-w-[16rem] truncate text-xs font-normal text-slate-500" title={r.owner ?? ""}>
                      {r.owner ?? "–"}
                      {r.mw !== null ? ` · ${nf(r.mw, r.mw < 10 ? 1 : 0)} MW` : ""}
                    </div>
                  </TableCell>
                  <TableCell>{TECH[r.type]}</TableCell>
                  <TableCell className="text-slate-600">
                    {ELIGIBILITY_LABEL[r.eligibility]}
                    {r.termEnds && <div className="text-xs text-slate-500">süre ~{r.termEnds.earliest === r.termEnds.latest ? r.termEnds.latest : `${r.termEnds.earliest}–${r.termEnds.latest}`}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {price(r)}
                    <div className="text-xs text-slate-500">{REGIME[r.regime]}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.capturePriceTl === null ? "veri yok" : nf(r.capturePriceTl)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.differenceTl === null
                      ? "–"
                      : Math.round(r.differenceTl.low / 1e5) === Math.round(r.differenceTl.high / 1e5)
                        ? mtl(r.differenceTl.low)
                        : `${mtl(r.differenceTl.low)} – ${mtl(r.differenceTl.high)}`}
                  </TableCell>
                  <TableCell className={r.verdict === "YEKDEM" ? "text-emerald-700" : r.verdict === "MARKET" ? "text-amber-700" : "text-slate-600"}>
                    {r.verdict ? VERDICT_LABEL[r.verdict] : "–"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {list.length > shown.length && (
          <button onClick={() => setAll(true)} className="text-sm text-indigo-700 hover:underline">
            Tümünü göster ({list.length})
          </button>
        )}

        <p className="text-xs text-slate-500">
          Tahmin, kesin hak değil. İşletmeye giriş tarihi açık veride yok: tarife türü ve 10 yıllık sürenin bitişi santralin YEKDEM
          listelerinde ilk görüldüğü yıldan çıkarılır (±1 yıl; 2022&apos;de ilk görülen santralde tarife belirsiz, iki fiyat aralık olarak).
          YEKDEM fiyatına yerli katkı ilavesi eklenmedi (YEKDEM tarafı için alt sınır). Dolar tarifesi 5346 sayılı Kanun I sayılı Cetvel
          (hidro ve rüzgâr 7,3, güneş 13,3 ABD doları cent/kWh); TL tarifesi EPİAŞ&apos;ın {monthLabelTr(data.tlTariff.period)} fiyatı, üç ayda bir
          güncellenir. Piyasa tarafı geçmiş fiyattır; {data.decisionYear} fiyatları bilinmez, PTF tavanı 4.500 TL/MWh. Fark, dönemdeki üretimle
          YEKDEM&apos;in piyasaya göre fazladan sağlayacağı tutardır.
          {data.excludedYeka.length > 0 && ` YEKA santralleri (${data.excludedYeka.join(", ")}) yarışma sözleşmesindeki fiyattan ödendiği için listede yok.`}
          {data.errors.length > 0 && <span className="text-amber-700"> Uyarı: {data.errors.join("; ")}</span>}
        </p>
      </CardContent>
    </Card>
  );
}
