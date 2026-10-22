/**
 * Route handler ve sunucu bileşenleri için oturum yardımcıları (Node). Middleware yalnız lib/auth/session.ts'i kullanır.
 */
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_MS, signSession, verifySession, type Session } from "@/lib/auth/session";

export async function currentSession(): Promise<Session | null> {
  return verifySession(cookies().get(SESSION_COOKIE)?.value);
}

/** Tailscale serve gibi bir ön sunucu HTTPS'i X-Forwarded-Proto ile bildirir; yerel geliştirmede (http) secure olmaz. */
function isHttps(): boolean {
  return headers().get("x-forwarded-proto") === "https";
}

export async function setSessionCookie(res: NextResponse, userId: string) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  res.cookies.set(SESSION_COOKIE, await signSession({ userId, expiresAt }), {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(),
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: isHttps(), path: "/", maxAge: 0 });
}

/** API'de oturum yoksa 401 yanıtı, varsa oturum. */
export async function requireSession(): Promise<Session | NextResponse> {
  const s = await currentSession();
  return s ?? NextResponse.json({ error: "Giriş gerekli." }, { status: 401 });
}
