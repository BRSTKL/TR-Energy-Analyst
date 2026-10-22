/**
 * Oturum çerezi: `base64url(JSON {u: kullanıcı id, e: bitiş ms}).base64url(HMAC-SHA256)`, anahtar `AUTH_SECRET`.
 * Web Crypto kullanır; hem middleware'de (Edge) hem sunucu kodunda çalışır. Veritabanına bakmaz: çıkış çerezi siler.
 */

export const SESSION_COOKIE = "tre_session";
export const SESSION_TTL_MS = 7 * 24 * 3_600_000;

export interface Session {
  userId: string;
  expiresAt: number;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

function authSecret(secret?: string): string {
  const s = secret ?? process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET tanımlı değil ya da kısa (en az 32 karakter).");
  return s;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(session: Session, secret?: string): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ u: session.userId, e: session.expiresAt })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(authSecret(secret)), enc.encode(payload)));
  return `${payload}.${b64url(sig)}`;
}

/** Geçerli ve süresi dolmamış çerezde oturumu, değilse null döner. AUTH_SECRET yoksa da null (kapalı kalır). */
export async function verifySession(token: string | undefined, now = Date.now(), secret?: string): Promise<Session | null> {
  if (!token) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  let key: CryptoKey;
  try {
    key = await hmacKey(authSecret(secret));
  } catch {
    return null;
  }
  try {
    const ok = await crypto.subtle.verify("HMAC", key, fromB64url(sig), enc.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { u?: unknown; e?: unknown };
    if (typeof data.u !== "string" || typeof data.e !== "number" || data.e <= now) return null;
    return { userId: data.u, expiresAt: data.e };
  } catch {
    return null;
  }
}
