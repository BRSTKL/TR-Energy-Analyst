"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { NettingGroupResult, NettingResult } from "@/lib/analysis/portfolio-netting";

const tl = (v: number) => `${v.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺`;
const mwh = (v: number) => v.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
const pct = (v: number, digits = 1) =>
  `%${(v * 100).toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

function GroupRow({ group }: { group: NettingGroupResult }) {
  return (
    <TableRow
      className={
        group.kind === "portfolio"
          ? "bg-slate-100/80 font-semibold"
          : group.kind === "technology"
            ? "bg-slate-50/80 font-medium"
            : undefined
      }
    >
      <TableCell className={group.kind === "pair" ? "pl-6 text-slate-800" : "text-slate-900"}>
        {group.label}
      </TableCell>
      <TableCell className="text-right font-mono">{tl(group.standaloneCost)}</TableCell>
      <TableCell className="text-right font-mono">{tl(group.nettedCost)}</TableCell>
      <TableCell className="text-right font-mono font-semibold text-emerald-700">
        {tl(group.benefitTl)}
      </TableCell>
      <TableCell className="text-right font-mono text-emerald-700">{pct(group.benefitRatio)}</TableCell>
      <TableCell className="text-right font-mono text-slate-600">
        {mwh(group.grossImbalanceMwh)} → {mwh(group.netImbalanceMwh)}
      </TableCell>
      <TableCell className="text-right font-mono">{pct(group.offsettingHourShare, 0)}</TableCell>
    </TableRow>
  );
}

/**
 * Dengeden sorumlu grup (DSG) netleştirme faydası: santrallerin tek başına ve grup halinde netleşmiş
 * dengesizlik maliyetlerini karşılaştırır.
 */
export function NettingCard({
  netting,
  projectId,
  companies,
  crossCompanyBenefitTl = null,
  aggregatorName = null,
}: {
  netting: NettingResult;
  projectId?: string;
  /** Santrallerin sahip şirketleri: dengesizlik şirket bazında uzlaştırıldığı için aynı şirket içi netleşme zaten gerçekleşir */
  companies?: Array<{ name: string | null; plantNames: string[] }>;
  /** Yalnızca farklı şirketler arasındaki ek netleşme faydası (en az iki şirket varsa) */
  crossCompanyBenefitTl?: number | null;
  /** Proje bir toplayıcı portföyüyse: netleşme toplayıcının yarattığı değerdir */
  aggregatorName?: string | null;
}) {
  const portfolio = netting.portfolio;
  if (!portfolio) return null;
  const sameCompanyGroups = (companies ?? []).filter((c) => c.name && c.plantNames.length > 1);
  const allOneCompany = companies?.length === 1 && !!companies[0].name;

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Dengeden Sorumlu Grup (DSG) Netleştirme Analizi
        </CardTitle>
        <CardDescription>
          Santraller aynı dengeden sorumlu grupta olsaydı, aynı saatteki fazla ve eksik üretimler
          birbirini dengelerdi. Bağımsız maliyet, santrallerin tek başına dengesizlik maliyetlerinin
          toplamı; netleşmiş maliyet, grubun saatlik toplam dengesizliğinin aynı fiyatlarla maliyetidir.
          Grup düzeyinde aynı fiyat formülü varsayılır; maliyetin üyeler arasında paylaşımı DSG
          sözleşmesine bağlıdır.
          {projectId && (
            <>
              {" "}
              <Link href={`/projects/${projectId}/dsg`} className="font-medium text-indigo-600 hover:underline">
                Grup seçimi ve paylaştırma seçenekleri için DSG Senaryoları →
              </Link>
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {sameCompanyGroups.length > 0 && (
          <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
            {aggregatorName ? (
              <>
                <span className="font-semibold">Tüm santraller {aggregatorName} portföyünde.</span> Toplayıcı portföyü tek
                dengede uzlaştırıldığı için aşağıdaki netleşme uzlaştırmada zaten gerçekleşiyor: bu, portföyün farklı
                sahiplerin santrallerini bir araya getirerek yarattığı değerdir. Sahiplere göre paylaştırma için DSG
                Senaryoları sayfasına bakın.
              </>
            ) : allOneCompany ? (
              <>
                <span className="font-semibold">Tüm santraller aynı şirkette ({companies![0].name}).</span> Dengesizlik şirket
                bazında uzlaştırıldığı için aşağıdaki netleşme uzlaştırmada zaten gerçekleşiyor; bu, yeni bir DSG faydası
                değildir. Ek fayda ancak başka şirketlerin santralleriyle grup kurularak sağlanabilir.
              </>
            ) : (
              <>
                <span className="font-semibold">Aynı şirketin santralleri zaten birlikte uzlaştırılıyor</span> (
                {sameCompanyGroups.map((c) => c.name).join(", ")}). Aşağıdaki fayda bu şirket içi netleşmeyi de içerir;
                yalnızca farklı şirketler arasındaki ek fayda
                {crossCompanyBenefitTl !== null
                  ? ` ${Math.round(crossCompanyBenefitTl).toLocaleString("tr-TR")} ₺`
                  : " hesaplanamadı"}
                .
              </>
            )}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <span className="text-xs text-slate-500">Bağımsız Toplam Maliyet</span>
            <p className="font-mono text-lg font-bold text-slate-900">{tl(portfolio.standaloneCost)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <span className="text-xs text-slate-500">DSG İçinde Netleşmiş Maliyet</span>
            <p className="font-mono text-lg font-bold text-slate-900">{tl(portfolio.nettedCost)}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
            <span className="text-xs text-emerald-800">Netleştirme Faydası</span>
            <p className="font-mono text-lg font-bold text-emerald-700">
              {tl(portfolio.benefitTl)}{" "}
              <span className="text-sm font-semibold">({pct(portfolio.benefitRatio)})</span>
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>Grup</TableHead>
                <TableHead className="text-right">Bağımsız Maliyet</TableHead>
                <TableHead className="text-right">Netleşmiş Maliyet</TableHead>
                <TableHead className="text-right">Fayda</TableHead>
                <TableHead className="text-right">Fayda %</TableHead>
                <TableHead className="text-right">Dengesizlik MWh (Brüt → Net)</TableHead>
                <TableHead className="text-right">Ters Yönlü Saat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <GroupRow group={portfolio} />
              {netting.technologies.map((g) => (
                <GroupRow key={g.key} group={g} />
              ))}
              <TableRow>
                <TableCell colSpan={7} className="pt-4 text-xs font-semibold text-slate-500">
                  {netting.pairsAmongTop
                    ? `En iyi ${netting.pairs.length} santral çifti (tek başına maliyeti en yüksek ${netting.pairsAmongTop} santral arasında)`
                    : `En iyi ${netting.pairs.length} santral çifti (faydaya göre sıralı)`}
                </TableCell>
              </TableRow>
              {netting.pairs.map((g) => (
                <GroupRow key={g.key} group={g} />
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-2xs text-slate-500">
          Ters yönlü saat: grupta en az bir santralin fazla, en az birinin eksik ürettiği saatlerin
          payı. Netleştirme maliyeti hiçbir saatte artırmaz; fayda tamamen bu saatlerden gelir.
        </p>
      </CardContent>
    </Card>
  );
}
