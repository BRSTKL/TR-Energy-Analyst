/**
 * Uygulama hesabı: ilk kurulum, giriş denemesi ve kilit. Şimdilik tek hesap: hesap yoksa giriş sayfası kurulum formunu
 * gösterir, bir hesap varken yenisi açılamaz (şifre sıfırlama: scripts/auth-user.mts).
 */
import { prisma } from "@/lib/prisma";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * 60_000;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
const emailProblem = (email: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : "Geçerli bir e-posta adresi girin.");

export async function hasAnyUser(): Promise<boolean> {
  return (await prisma.user.count()) > 0;
}

export async function createFirstUser(emailRaw: string, password: string): Promise<{ id: string } | { error: string }> {
  const email = normalizeEmail(emailRaw);
  const problem = emailProblem(email) ?? passwordProblem(password);
  if (problem) return { error: problem };
  if (await hasAnyUser()) return { error: "Hesap zaten var. Giriş yapın." };
  const user = await prisma.user.create({ data: { email, passwordHash: await hashPassword(password) } });
  return { id: user.id };
}

export type LoginResult = { ok: true; userId: string } | { ok: false; error: string };

/**
 * Şifre denetimi. 5 yanlış denemede hesap 15 dakika kilitlenir; kilitliyken doğru şifre de reddedilir.
 * Kullanıcı yoksa da aynı hata metni (hangi e-postanın kayıtlı olduğu belli olmasın).
 */
export async function attemptLogin(emailRaw: string, password: string, now = new Date()): Promise<LoginResult> {
  const wrong: LoginResult = { ok: false, error: "E-posta ya da şifre hatalı." };
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(emailRaw) } });
  if (!user) {
    await hashPassword(password); // süre farkıyla kullanıcı varlığı anlaşılmasın
    return wrong;
  }
  if (user.lockedUntil && user.lockedUntil > now) {
    const min = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000);
    return { ok: false, error: `Çok sayıda hatalı deneme. ${min} dakika sonra yeniden deneyin.` };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(now.getTime() + LOCK_MS) : null },
    });
    return lock ? { ok: false, error: "Çok sayıda hatalı deneme. 15 dakika sonra yeniden deneyin." } : wrong;
  }
  if (user.failedLogins || user.lockedUntil) await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  return { ok: true, userId: user.id };
}

export async function setUserPassword(emailRaw: string, password: string): Promise<string | null> {
  const problem = passwordProblem(password);
  if (problem) return problem;
  const res = await prisma.user.updateMany({
    where: { email: normalizeEmail(emailRaw) },
    data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null },
  });
  return res.count ? null : "Bu e-postayla hesap yok.";
}

export async function getUserEmail(userId: string): Promise<string | null> {
  return (await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email ?? null;
}
