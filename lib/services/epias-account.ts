/**
 * Kayıtlı EPİAŞ hesabı ("Hesabım" sayfası). Uygulama ve zamanlanmış işler EPİAŞ'a bu hesapla girer; kayıt yoksa
 * `.env`'deki EPIAS_USERNAME / EPIAS_PASSWORD kullanılır (lib/services/epias-service.ts `getEpiasCredentials`).
 * Şimdilik tek hesap: zamanlanmış işler (oturum yok) ilk kaydı kullanır.
 */
import { prisma } from "@/lib/prisma";
import { openSecret, sealSecret } from "@/lib/auth/secret-box";

export interface EpiasAccountInfo {
  username: string;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckError: string | null;
  updatedAt: string;
}

const toInfo = (a: { username: string; lastCheckAt: Date | null; lastCheckOk: boolean | null; lastCheckError: string | null; updatedAt: Date }): EpiasAccountInfo => ({
  username: a.username,
  lastCheckAt: a.lastCheckAt?.toISOString() ?? null,
  lastCheckOk: a.lastCheckOk,
  lastCheckError: a.lastCheckError,
  updatedAt: a.updatedAt.toISOString(),
});

/** Kullanıcının kaydı (şifresiz özet) ya da null. */
export async function getEpiasAccountInfo(userId: string): Promise<EpiasAccountInfo | null> {
  const a = await prisma.epiasAccount.findUnique({ where: { userId } });
  return a ? toInfo(a) : null;
}

/** Kayıtlı EPİAŞ kullanıcı adı ve şifresi (userId verilmezse ilk kayıt), yoksa null. */
export async function getStoredEpiasCredentials(userId?: string): Promise<{ username: string; password: string } | null> {
  let a;
  try {
    a = userId ? await prisma.epiasAccount.findUnique({ where: { userId } }) : await prisma.epiasAccount.findFirst({ orderBy: { createdAt: "asc" } });
  } catch {
    // Şema henüz uygulanmamış (eski veritabanı): .env'ye düş
    return null;
  }
  if (!a) return null;
  return { username: a.username, password: openSecret(a.passwordSealed) };
}

export async function saveEpiasAccount(userId: string, username: string, password: string) {
  const data = { username: username.trim(), passwordSealed: sealSecret(password), lastCheckAt: null, lastCheckOk: null, lastCheckError: null };
  await prisma.epiasAccount.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

export async function recordEpiasCheck(userId: string, ok: boolean, error?: string) {
  await prisma.epiasAccount.update({ where: { userId }, data: { lastCheckAt: new Date(), lastCheckOk: ok, lastCheckError: ok ? null : (error ?? "").slice(0, 300) } });
}

export async function deleteEpiasAccount(userId: string) {
  await prisma.epiasAccount.deleteMany({ where: { userId } });
}
