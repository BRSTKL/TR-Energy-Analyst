"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Scale, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { aggregatorDisplayName, describePortfolioMix, type AggregatorPortfolio } from "@/lib/projects/aggregator";

interface AggregatorOption {
  id: number;
  name: string;
  shortName?: string | null;
}

/**
 * Projenin uzlaştırma birimi: her santral sahibinin dengesinde (varsayılan) ya da tek bir toplayıcı portföyünde.
 * Toplayıcı modunda sonuçlar, DSG sayfası ve PowerPoint raporu portföyün netleşme değerini gösterir. Toplayıcı EPİAŞ'tan
 * seçilirse portföyünün santral sayısı ve teknoloji dağılımı kaydedilir; rapor kapsamı buna göre yazar.
 */
export function SettlementUnitCard({ projectId }: { projectId: string }) {
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [portfolio, setPortfolio] = useState<AggregatorPortfolio | null>(null);
  const [mode, setMode] = useState<"owner" | "aggregator">("owner");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<AggregatorOption | null>(null);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<AggregatorOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const v: string | null = d.project?.aggregatorName ?? null;
        setSaved(v);
        setPortfolio(d.project?.aggregatorPortfolio ?? null);
        setMode(v ? "aggregator" : "owner");
        setName(v ?? "");
      })
      .catch(() => setSaved(null));
  }, [projectId]);

  const dirty = (mode === "owner" ? null : name.trim() || null) !== (saved ?? null) || picked !== null;

  async function search() {
    setSearching(true);
    setMessage(null);
    try {
      const d = await fetch(`/api/epias/aggregators?q=${encodeURIComponent(query.trim())}`).then((r) => r.json());
      if (!d.success) throw new Error(d.error);
      setOptions(d.aggregators);
      if (d.aggregators.length === 0) setMessage({ kind: "error", text: "Eşleşen toplayıcı bulunamadı." });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "EPİAŞ'ta aranamadı." });
    } finally {
      setSearching(false);
    }
  }

  function pick(o: AggregatorOption) {
    setPicked(o);
    setOptions([]);
    // Kısa ad yoksa unvanın ilk iki kelimesi + "Toplayıcı" (ör. "GAİN TOPLAYICILIK …" → "Gain Toplayıcı")
    if (!name.trim()) setName(aggregatorDisplayName(o.name, o.shortName));
  }

  async function save() {
    if (mode === "aggregator" && !name.trim()) {
      setMessage({ kind: "error", text: "Toplayıcının adını yazın (ör. Gain Toplayıcı)." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aggregatorName: mode === "owner" ? null : name.trim(),
          ...(mode === "aggregator" && picked ? { aggregatorOrgId: picked.id, aggregatorOrgName: picked.name } : {}),
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || "Kaydedilemedi.");
      setSaved(d.aggregatorName);
      setPortfolio(d.aggregatorPortfolio ?? null);
      setPicked(null);
      setMessage(
        d.warning
          ? { kind: "error", text: d.warning }
          : { kind: "ok", text: "Kaydedildi. Sonuçlar ve rapor bu uzlaştırma birimiyle hesaplanacak." }
      );
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Kaydedilemedi." });
    } finally {
      setBusy(false);
    }
  }

  if (saved === undefined) return null;
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4 text-indigo-600" /> Uzlaştırma birimi
        </CardTitle>
        <CardDescription>
          Dengesizlik, dengeden sorumlu taraf düzeyinde saat saat netleşir. Santraller bir toplayıcının portföyündeyse tek dengede
          uzlaştırılır; rapor bu durumda portföyün netleşme değerini de gösterir.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="radio" className="mt-1" checked={mode === "owner"} onChange={() => setMode("owner")} />
          <span>
            <b>Her santral sahibinin dengesinde</b>
            <span className="block text-xs text-slate-500">Aynı şirketin santralleri birlikte netleşir (varsayılan).</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="radio" className="mt-1" checked={mode === "aggregator"} onChange={() => setMode("aggregator")} />
          <span className="flex-1">
            <b>Toplayıcı portföyü: tüm santraller tek dengede</b>
            <span className="block text-xs text-slate-500">
              Farklı sahiplerin santralleri toplayıcının portföyünde birlikte netleşir. Santral sahipleri raporda korunur.
            </span>
          </span>
        </label>

        {mode === "aggregator" && (
          <div className="ml-6 space-y-2 rounded-md border border-slate-200 bg-slate-50/60 p-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Raporda görünecek ad, ör. Gain Toplayıcı"
              className="h-9 w-full max-w-sm rounded-md border border-slate-200 bg-white px-2 text-sm"
            />
            <div>
              <p className="text-xs text-slate-600">
                EPİAŞ&apos;taki toplayıcıyı seçin (isteğe bağlı): portföyün santral sayısı ve dağılımı kaydedilir, rapor
                &quot;portföyün 40 santralinin 6 tanesi&quot; gibi kapsamı yazar. VPN açık olmalı.
              </p>
              <div className="mt-1.5 flex max-w-sm gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && search()}
                  placeholder="Toplayıcı ara, ör. gain"
                  className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm"
                />
                <Button size="sm" variant="outline" className="h-8 gap-1" onClick={search} disabled={searching}>
                  {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Ara
                </Button>
              </div>
              {options.length > 0 && (
                <ul className="mt-1.5 max-h-48 max-w-lg overflow-auto rounded-md border border-slate-200 bg-white text-sm">
                  {options.map((o) => (
                    <li key={o.id}>
                      <button type="button" className="w-full px-2 py-1.5 text-left hover:bg-sky-50" onClick={() => pick(o)}>
                        {o.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {picked && <p className="mt-1.5 text-xs text-sky-800">Seçilen: {picked.name} (kaydedince portföyü çekilir)</p>}
              {!picked && portfolio && (
                <p className="mt-1.5 text-xs text-slate-600">
                  EPİAŞ kaydı: <b>{portfolio.orgName}</b> · {portfolio.plantCount} santral ({describePortfolioMix(portfolio.byType)}) ·{" "}
                  {portfolio.asOf}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={save} disabled={busy || !dirty}>
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Kaydet
          </Button>
          {message && <span className={`text-xs ${message.kind === "ok" ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
