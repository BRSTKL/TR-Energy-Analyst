"use client";

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProjectScorecard } from "@/lib/services/forecast-scorecard";
import type { ScorePair, SkyClass } from "@/lib/forecast/scorecard";
import { BASE_MODEL, BIAS_INSAMPLE_MODEL, LIVE_SERIES } from "@/lib/forecast/self-learning";

const nf = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "–");
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const ym = (s: string) => `${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
const dm = (s: string) => `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]}`;
const unit = (r: ScorePair["model"]) => (r.uevmMwh > 0 ? r.totalTl / r.uevmMwh : NaN);
/** Sürüm adları (kendi kendine öğrenme, lib/forecast/self-learning.ts) */
const MODEL_LABEL: Record<string, string> = {
  [LIVE_SERIES]: "Gönderilen tahmin (her santralin o günkü canlı sürümü)",
  [BASE_MODEL]: "Temel (4 ay eğitim)",
  [`${BASE_MODEL}-w2`]: "2 ay eğitim",
  [`${BASE_MODEL}-w6`]: "6 ay eğitim",
  [`${BASE_MODEL}-bias`]: "Günlük hata düzeltmeli",
  [BIAS_INSAMPLE_MODEL]: "Hata düzeltmeli (eğitim içi, deneme; terfi etmez)",
};
const modelLabel = (id: string) => MODEL_LABEL[id] ?? id;
const SKY_LABEL: Record<SkyClass, string> = { açık: "Açık gün", parçalı: "Parçalı bulutlu", kapalı: "Kapalı gün", bilinmiyor: "Gök bilinmiyor (uydu yok)" };

function PairCells({ p }: { p: ScorePair }) {
  const m = unit(p.model);
  const k = unit(p.kgup);
  return (
    <>
      <TableCell className="text-right tabular-nums">{p.model.hours}</TableCell>
      <TableCell className="text-right tabular-nums">
        %{nf(p.model.maePct)} / %{nf(p.kgup.maePct)}
      </TableCell>
      <TableCell className={`text-right tabular-nums ${Number.isFinite(m) && Number.isFinite(k) ? (m < k ? "text-emerald-700" : "text-slate-800") : ""}`}>
        {nf(m)} / {nf(k)}
      </TableCell>
    </>
  );
}

/**
 * Üretim tahmini sayfası: tahmin karnesi (PLAN 21.4). Günlük kayıttaki (GÖP kesiminden önce yazılmış) tahminler
 * gerçekleşen üretimle; şirketin ilk KGÜP'üyle aynı saatlerde.
 */
export function ForecastScorecardCard({ projectId }: { projectId: string }) {
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<ProjectScorecard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    fetch(`/api/projects/${projectId}/forecast/scorecard${month ? `?month=${month}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Karne yüklenemedi."));
  }, [projectId, month]);

  const card = data?.card ?? null;
  // Santral boşlukları santral başına özet
  const gaps = card
    ? Array.from(
        card.plantGaps.reduce((m, g) => m.set(g.name, [...(m.get(g.name) ?? []), g]), new Map<string, typeof card.plantGaps>()).entries()
      )
    : [];

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Karne: kayıtlı tahmin gerçekleşenle{data?.month ? ` · ${ym(data.month)}` : ""}</CardTitle>
        <CardDescription>
          Her gün GÖP kesiminden (bir önceki gün 12:30) önce yazılıp bir daha değişmeyen tahmin, gerçekleşen üretimle ve şirketin ilk planıyla (ilk KGÜP) aynı
          saatlerde karşılaştırılır. Hata: WAPE (mutlak hata ÷ üretim). Maliyet: dengesizlik + KÜPST, MWh başına, dönemin kuralıyla. Gerçekleşen üretim önce EPİAŞ
          gerçek zamanlı verisiyle (geçici, ≈ 2 gün gecikmeli), ay uzlaştırılınca UEVM ile (kesin).
        </CardDescription>
        {data && data.months.length > 1 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {data.months.map((m) => (
              <Button key={m} size="sm" variant={m === data.month ? "default" : "outline"} onClick={() => setMonth(m)}>
                {ym(m)}
              </Button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4 p-0 pb-4">
        {error && <p className="px-6 text-sm text-amber-800">{error}</p>}
        {!data && !error && (
          <p className="flex items-center gap-2 px-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Karne hesaplanıyor…
          </p>
        )}
        {data && !card && (
          <p className="px-6 text-sm text-slate-600">
            Henüz karne yok.{" "}
            {data.firstLog
              ? `İlk kayıt ${dm(data.firstLog)} için; gerçekleşen üretim ≈ 2 gün sonra gelir.`
              : "Günlük tahmin kaydı henüz yazılmadı (zamanlayıcı her sabah yarın için yazar)."}
          </p>
        )}
        {card &&
          // Ayrıntı yalnız gönderilen tahmin için ("canlı" serisi; eski kayıtlarda tek sürüm); adaylar aşağıda tek tabloda
          card.groups.filter((g, _, all) => g.modelId === (all.some((x) => x.modelId === LIVE_SERIES) ? LIVE_SERIES : all[0].modelId)).map((g) => {
            const own = card.rows.filter((r) => r.modelId === g.modelId && r.all.model.hours > 0);
            const wins = (k: "all" | "exLoss") => own.filter((r) => r[k].model.hours > 0 && r[k].model.totalTl < r[k].kgup.totalTl).length;
            return (
              <div key={g.modelId} className="space-y-2">
                <p className="px-6 text-sm text-slate-800">
                  {modelLabel(g.modelId)}, {dm(card.from)} – {dm(card.to)}, {g.plants} santral. Tüm saatler: model{" "}
                  <b>{nf(unit(g.all.model))}</b>, ilk KGÜP <b>{nf(unit(g.all.kgup))}</b> TL/MWh (model {wins("all")} / {own.length} santralde ucuz). Kayıp saatler
                  hariç: model <b>{nf(unit(g.exLoss.model))}</b>, ilk KGÜP <b>{nf(unit(g.exLoss.kgup))}</b> TL/MWh ({wins("exLoss")} / {own.length}).
                {g.all.provisionalHours > 0 && (
                    <span className="mt-1 block text-xs text-amber-700">
                      Geçici: {g.all.model.hours} saatin {g.all.provisionalHours}&apos;i EPİAŞ gerçek zamanlı üretimiyle ölçüldü; UEVM gelince karne kesinleşir.
                    </span>
                  )}
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Küme</TableHead>
                        <TableHead className="text-right">Saat</TableHead>
                        <TableHead className="text-right">WAPE model / KGÜP</TableHead>
                        <TableHead className="text-right">TL/MWh model / KGÜP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>Tüm saatler</TableCell>
                        <PairCells p={g.all} />
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Kayıp saatler hariç</TableCell>
                        <PairCells p={g.exLoss} />
                      </TableRow>
                      {(Object.keys(SKY_LABEL) as SkyClass[])
                        .filter((c) => g.bySky[c].model.hours > 0)
                        .map((c) => (
                          <TableRow key={c}>
                            <TableCell className="pl-8 text-slate-600">{SKY_LABEL[c]}</TableCell>
                            <PairCells p={g.bySky[c]} />
                          </TableRow>
                        ))}
                      {Object.entries(g.byLocation)
                        .filter(([, p]) => p.model.hours > 0)
                        .map(([c, p]) => (
                          <TableRow key={c}>
                            <TableCell className="pl-8 text-slate-600">
                              Konum {c === "kayıt" ? "koordinatlı kayıt" : "~ ilçe merkezi (tahmin)"} ({p.plants})
                            </TableCell>
                            <PairCells p={p} />
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Santral (kayıp hariç)</TableHead>
                        <TableHead className="text-right">Gün</TableHead>
                        <TableHead className="text-right">Saat</TableHead>
                        <TableHead className="text-right">WAPE model / KGÜP</TableHead>
                        <TableHead className="text-right">TL/MWh model / KGÜP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {card.rows
                        .filter((r) => r.modelId === g.modelId)
                        .map((r) => (
                          <TableRow key={r.epiasPlantId}>
                            <TableCell className="font-medium">
                              {r.location === "~ ilçe merkezi" ? "~ " : ""}
                              {r.name}
                              {r.all.provisionalHours > 0 && <span className="ml-1 text-[11px] font-normal text-amber-700">geçici</span>}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.scoredDays} / {r.days}
                            </TableCell>
                            <PairCells p={r.exLoss} />
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
        {card && card.groups.some((g) => g.modelId === LIVE_SERIES) && (
          <div className="space-y-1">
            <p className="px-6 text-sm font-medium text-slate-800">Sürümler (kendi kendine öğrenme)</p>
            <p className="px-6 text-xs text-slate-500">
              Her gün bütün sürümler aynı kurallarla tahmin yapar; her santralde son 28 günde şirket planına göre en ucuz ve anlamlı biçimde (blok önyüklemesiyle)
              daha iyi olan aday o santralin canlı sürümü olur. Bu satırlar seçim içidir (terfi eden sürüm kendisini seçtiren günleri de içerir); gerçek başarı
              yukarıdaki gönderilen tahmindir.
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sürüm</TableHead>
                    <TableHead className="text-right">Santral</TableHead>
                    <TableHead className="text-right">Saat</TableHead>
                    <TableHead className="text-right">WAPE model / KGÜP</TableHead>
                    <TableHead className="text-right">TL/MWh model / KGÜP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {card.groups
                    .filter((g) => g.modelId !== LIVE_SERIES)
                    .map((g) => (
                      <TableRow key={g.modelId}>
                        <TableCell>{modelLabel(g.modelId)}</TableCell>
                        <TableCell className="text-right tabular-nums">{g.plants}</TableCell>
                        <PairCells p={g.exLoss} />
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        {card && (card.missingDays.length > 0 || gaps.length > 0 || card.pendingDays.length > 0) && (
          <div className="space-y-1 px-6 text-xs text-slate-600">
            {card.missingDays.length > 0 && (
              <div>
                <span className="font-medium text-slate-800">Sayılmayan günler:</span>
                <ul className="ml-4 list-disc">
                  {card.missingDays.map((d) => (
                    <li key={d.date}>
                      {dm(d.date)}: {d.reason === "geç kayıt" ? "kayıt GÖP kesiminden sonra yazıldı" : "kayıt yok"}
                      {d.note ? ` (${d.note})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {gaps.length > 0 && (
              <div>
                <span className="font-medium text-slate-800">Kayıtta tahmini olmayan santraller:</span>{" "}
                {gaps.map(([name, list]) => `${name} ${list.length} gün (${list[list.length - 1].reason})`).join("; ")}
              </div>
            )}
            {card.pendingDays.length > 0 && <div>Gerçekleşen üretimi henüz gelmemiş günler: {card.pendingDays.map(dm).join(", ")}.</div>}
          </div>
        )}
        {card && (
          <p className="px-6 text-xs leading-relaxed text-slate-500">
            Maliyet santral başına, portföy içi netleşme ve topluluk KÜPST&apos;ü öncesidir: uzlaştırma tutarı değildir. Kayıp saatler (uyduyla planlı kısıntı ve
            arıza) iki taraftan da çıkarılır; şirket kendi planlı kısıntısını önceden bilir, bu küme şirketin o bilgi üstünlüğünü dışarıda bırakır, bu yüzden tüm
            saatler de verilir. Gök durumu: günlük uydu ışınımı ÷ açık gök ışınımı (açık ≥ 0,85, kapalı
            &lt; 0,5). Konumu ilçe merkezi olan santrallerde (~) hava girdisi kabadır. Şirketin ilk planı santral içi veriyle yapılır; karne bir açık referansın
            gerçek başarısını gösterir.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
