"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const inputCls = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";

/** Yalnız uygulama içi yol ("/..." ama "//..." değil): dışarıya yönlendirme olmasın. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function LoginForm() {
  const params = useSearchParams();
  const [hasUser, setHasUser] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => setHasUser(Boolean(d.hasUser)))
      .catch(() => setError("Sunucuya ulaşılamadı."));
  }, []);

  const setup = hasUser === false;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (setup && password !== password2) return setError("Şifreler aynı değil.");
    setBusy(true);
    try {
      const r = await fetch(setup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.error ?? "Giriş yapılamadı.");
      window.location.assign(setup ? "/account" : safeNext(params.get("next")));
    } catch {
      setError("Sunucuya ulaşılamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow">
            <Zap className="h-4 w-4" />
          </span>
          <span className="font-semibold text-slate-900">TR-Energy Analyst</span>
        </div>
        <CardTitle className="text-xl">{setup ? "Hesap oluştur" : "Giriş"}</CardTitle>
        <CardDescription>
          {setup
            ? "İlk kurulum: uygulamaya girmek için kullanacağınız e-posta ve şifreyi belirleyin. Şifre en az 12 karakter."
            : "Devam etmek için giriş yapın."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasUser === null && !error ? (
          <p className="text-sm text-slate-500">Yükleniyor…</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">E-posta</span>
              <input className={inputCls} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">Şifre</span>
              <input
                className={inputCls}
                type="password"
                autoComplete={setup ? "new-password" : "current-password"}
                required
                minLength={setup ? 12 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {setup && (
              <label className="block text-sm">
                <span className="mb-1 block text-slate-700">Şifre (tekrar)</span>
                <input className={inputCls} type="password" autoComplete="new-password" required value={password2} onChange={(e) => setPassword2(e.target.value)} />
              </label>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full gap-2">
              <Lock className="h-4 w-4" /> {busy ? "Bekleyin…" : setup ? "Hesabı oluştur" : "Giriş yap"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50/50 p-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
