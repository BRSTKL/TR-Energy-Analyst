import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "@/lib/auth/session";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { openSecret, sealSecret } from "@/lib/auth/secret-box";

const SECRET = "x".repeat(40);
const KEY = "ab".repeat(32);

describe("oturum çerezi", () => {
  it("imzalı çerez doğrulanır, süre ve kullanıcı korunur", async () => {
    const t = await signSession({ userId: "u1", expiresAt: 2_000 }, SECRET);
    expect(await verifySession(t, 1_000, SECRET)).toEqual({ userId: "u1", expiresAt: 2_000 });
  });

  it("süresi dolmuş, değiştirilmiş ya da başka anahtarla imzalanmış çerez reddedilir", async () => {
    const t = await signSession({ userId: "u1", expiresAt: 2_000 }, SECRET);
    expect(await verifySession(t, 2_000, SECRET)).toBeNull();
    const [payload, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "admin", e: 9e15 })).toString("base64url");
    expect(await verifySession(`${forged}.${sig}`, 1_000, SECRET)).toBeNull();
    expect(await verifySession(`${payload}.${sig}x`, 1_000, SECRET)).toBeNull();
    expect(await verifySession(t, 1_000, "y".repeat(40))).toBeNull();
    expect(await verifySession(`${t}.extra`, 1_000, SECRET)).toBeNull();
    expect(await verifySession(undefined, 1_000, SECRET)).toBeNull();
  });

  it("anahtar yok ya da kısaysa hiçbir çerez geçerli değil", async () => {
    const t = await signSession({ userId: "u1", expiresAt: 2_000 }, SECRET);
    expect(await verifySession(t, 1_000, "kısa")).toBeNull();
    await expect(signSession({ userId: "u1", expiresAt: 2_000 }, "kısa")).rejects.toThrow(/AUTH_SECRET/);
  });
});

describe("şifre karması", () => {
  it("doğru şifre geçer, yanlışı geçmez; karma açık şifreyi içermez", async () => {
    const h = await hashPassword("doğru-at-pil-zımba");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(h).not.toContain("doğru-at-pil-zımba");
    expect(await verifyPassword("doğru-at-pil-zımba", h)).toBe(true);
    expect(await verifyPassword("doğru-at-pil-zimba", h)).toBe(false);
    expect(await verifyPassword("x", "bozuk")).toBe(false);
  });

  it("aynı şifre iki kez farklı karma verir (tuz)", async () => {
    expect(await hashPassword("aynı-şifre-12345")).not.toBe(await hashPassword("aynı-şifre-12345"));
  });

  it("en az 12 karakter", () => {
    expect(passwordProblem("kısa")).toMatch(/12/);
    expect(passwordProblem("on-iki-karakt")).toBeNull();
  });
});

describe("EPİAŞ şifresinin şifrelenmesi", () => {
  it("açılır; şifreli metin açık şifreyi içermez", () => {
    const sealed = sealSecret("Epias!Şifre$1", KEY);
    expect(sealed).not.toContain("Epias");
    expect(openSecret(sealed, KEY)).toBe("Epias!Şifre$1");
  });

  it("değiştirilmiş kayıt ya da yanlış anahtar açılmaz", () => {
    const sealed = sealSecret("gizli", KEY);
    const parts = sealed.split(":");
    parts[3] = Buffer.from("başka").toString("base64");
    expect(() => openSecret(parts.join(":"), KEY)).toThrow();
    expect(() => openSecret(sealed, "cd".repeat(32))).toThrow();
    expect(() => sealSecret("x", "kısa")).toThrow(/CREDENTIALS_KEY/);
  });
});
