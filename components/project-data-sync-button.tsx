"use client";

import React, { useState } from "react";
import { DatabaseZap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Projenin eksik EPİAŞ verisini tamamlar (PLAN 10.1): piyasa verisi, resmi dengesizlik fiyatları, santrallerin ilk ve
 * son KGÜP ile UEVM serileri. Yalnız eksik olan çekilir; VPN gerekir.
 */
export function ProjectDataSyncButton({ projectId, onDone }: { projectId: string; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const d = await fetch(`/api/projects/${projectId}/sync-data`, { method: "POST" }).then((r) => r.json());
      const fetched = (d.plants ?? []).reduce((s: number, p: { fromEpias: number }) => s + p.fromEpias, 0);
      const market = (d.marketMonthsSynced?.length ?? 0) + (d.officialPriceMonthsSynced?.length ?? 0);
      if (d.success) {
        setMessage({ ok: true, text: fetched + market === 0 ? "Veri zaten tam." : `${fetched} santral-ay ve ${market} piyasa ayı tamamlandı.` });
        if (fetched + market > 0) onDone?.();
      } else {
        setMessage({ ok: false, text: d.errors?.[0] ?? d.error ?? "Tamamlanamadı (VPN açık mı?)." });
      }
    } catch {
      setMessage({ ok: false, text: "Tamamlanamadı (VPN açık mı?)." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" className="gap-1.5" onClick={run} disabled={busy} title="Eksik piyasa verisi, resmi dengesizlik fiyatları ve santrallerin ilk/son plan ile üretim verisi EPİAŞ'tan tamamlanır">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DatabaseZap className="h-3.5 w-3.5" />}
        {busy ? "Tamamlanıyor…" : "EPİAŞ verilerini tamamla"}
      </Button>
      {message && <span className={`text-xs ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</span>}
    </div>
  );
}
