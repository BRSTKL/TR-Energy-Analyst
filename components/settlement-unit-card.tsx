"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Projenin uzlaştırma birimi: her santral sahibinin dengesinde (varsayılan) ya da tek bir toplayıcı portföyünde.
 * Toplayıcı modunda sonuçlar, DSG sayfası ve PowerPoint raporu portföyün netleşme değerini gösterir.
 */
export function SettlementUnitCard({ projectId }: { projectId: string }) {
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [mode, setMode] = useState<"owner" | "aggregator">("owner");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const v: string | null = d.project?.aggregatorName ?? null;
        setSaved(v);
        setMode(v ? "aggregator" : "owner");
        setName(v ?? "");
      })
      .catch(() => setSaved(null));
  }, [projectId]);

  const dirty = (mode === "owner" ? null : name.trim() || null) !== (saved ?? null);

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
        body: JSON.stringify({ aggregatorName: mode === "owner" ? null : name.trim() }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || "Kaydedilemedi.");
      setSaved(d.aggregatorName);
      setMessage({ kind: "ok", text: "Kaydedildi. Sonuçlar ve rapor bu uzlaştırma birimiyle hesaplanacak." });
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
            {mode === "aggregator" && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Toplayıcının adı, ör. Gain Toplayıcı"
                className="mt-2 h-9 w-full max-w-sm rounded-md border border-slate-200 px-2 text-sm"
              />
            )}
          </span>
        </label>
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
