"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, LogOut, PlugZap, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EpiasAccountInfo } from "@/lib/services/epias-account";

const inputCls = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";
const fmt = (iso: string) => new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" });

interface AccountResponse {
  email: string | null;
  account: EpiasAccountInfo | null;
  envFallback: boolean;
}

export default function AccountPage() {
  const [data, setData] = useState<AccountResponse | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "save" | "test" | "delete">(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () =>
    fetch("/api/account/epias")
      .then((r) => r.json())
      .then((d: AccountResponse) => {
        setData(d);
        setUsername((u) => u || d.account?.username || "");
      })
      .catch(() => setMessage({ ok: false, text: "Sunucuya ulaşılamadı." }));

  useEffect(() => {
    load();
  }, []);

  async function call(kind: "save" | "test" | "delete") {
    setBusy(kind);
    setMessage(null);
    try {
      const r =
        kind === "save"
          ? await fetch("/api/account/epias", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) })
          : kind === "test"
            ? await fetch("/api/account/epias/test", { method: "POST" })
            : await fetch("/api/account/epias", { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setMessage({ ok: false, text: d.error ?? "İşlem yapılamadı." });
      else if (kind === "delete") setMessage({ ok: true, text: "Kayıtlı EPİAŞ hesabı silindi." });
      else if (d.test?.ok) setMessage({ ok: true, text: kind === "save" ? "Kaydedildi; EPİAŞ'a giriş başarılı." : "EPİAŞ'a giriş başarılı." });
      else setMessage({ ok: false, text: `${kind === "save" ? "Kaydedildi, ama " : ""}EPİAŞ'a girilemedi: ${d.test?.error ?? "bilinmeyen hata"}` });
      if (kind === "save") setPassword("");
      await load();
    } catch {
      setMessage({ ok: false, text: "Sunucuya ulaşılamadı." });
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.assign("/login");
  }

  const acc = data?.account;
  return (
    <main className="min-h-screen bg-slate-50/50 p-6 md:p-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Bugün
          </Link>
          <Button variant="outline" size="sm" className="gap-2" onClick={logout}>
            <LogOut className="h-4 w-4" /> Çıkış
          </Button>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hesabım</h1>
        {data?.email && <p className="text-sm text-slate-600">Giriş: {data.email}</p>}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">EPİAŞ hesabım</CardTitle>
            <CardDescription>
              Uygulama ve zamanlanmış işler (sabah tahmini, saatlik güncelleme) EPİAŞ şeffaflık platformuna bu hesapla girer. Şifre şifrelenmiş
              olarak saklanır ve bir daha gösterilmez; değiştirmek için yenisini yazın.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {acc ? (
              <div className="rounded-md border bg-white p-3 text-sm">
                <p>
                  Kayıtlı kullanıcı: <span className="font-medium">{acc.username}</span>
                </p>
                <p className="mt-1 flex items-center gap-1 text-slate-600">
                  {acc.lastCheckOk === true && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  {acc.lastCheckOk === false && <XCircle className="h-4 w-4 text-red-600" />}
                  {acc.lastCheckAt
                    ? `Son deneme ${fmt(acc.lastCheckAt)}: ${acc.lastCheckOk ? "giriş başarılı" : `başarısız (${acc.lastCheckError ?? "?"})`}`
                    : "Henüz denenmedi."}
                </p>
              </div>
            ) : (
              data && (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Kayıtlı EPİAŞ hesabı yok.{" "}
                  {data.envFallback ? "Şimdilik sunucunun ayar dosyasındaki hesap kullanılıyor." : "EPİAŞ verisi çekilemez; aşağıdan hesabınızı girin."}
                </p>
              )
            )}

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                call("save");
              }}
            >
              <label className="block text-sm">
                <span className="mb-1 block text-slate-700">EPİAŞ kullanıcı adı (e-posta)</span>
                <input className={inputCls} autoComplete="off" required value={username} onChange={(e) => setUsername(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-700">EPİAŞ şifresi</span>
                <input className={inputCls} type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy !== null} className="gap-2">
                  <PlugZap className="h-4 w-4" /> {busy === "save" ? "Kaydediliyor…" : "Kaydet ve dene"}
                </Button>
                <Button type="button" variant="outline" disabled={busy !== null || (!acc && !data?.envFallback)} onClick={() => call("test")}>
                  {busy === "test" ? "Deneniyor…" : "Bağlantıyı dene"}
                </Button>
                {acc && (
                  <Button type="button" variant="outline" disabled={busy !== null} className="gap-2 text-red-700" onClick={() => call("delete")}>
                    <Trash2 className="h-4 w-4" /> Sil
                  </Button>
                )}
              </div>
            </form>
            {message && <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
