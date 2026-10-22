import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/server";
import { deleteEpiasAccount, getEpiasAccountInfo, recordEpiasCheck, saveEpiasAccount } from "@/lib/services/epias-account";
import { resetEpiasTgt, testEpiasConnection } from "@/lib/services/epias-service";
import { getUserEmail } from "@/lib/services/auth-users";

export const dynamic = "force-dynamic";

/** GET /api/account/epias: hesap e-postası ve kayıtlı EPİAŞ hesabının özeti (şifre dönmez). */
export async function GET() {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  return NextResponse.json({
    email: await getUserEmail(s.userId),
    account: await getEpiasAccountInfo(s.userId),
    envFallback: Boolean(process.env.EPIAS_USERNAME && process.env.EPIAS_PASSWORD),
  });
}

/** PUT /api/account/epias {username, password}: kaydeder ve hemen dener (EPİAŞ'tan bilet alır). */
export async function PUT(req: Request) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const body = (await req.json().catch(() => ({}))) as { username?: unknown; password?: unknown };
  if (typeof body.username !== "string" || !body.username.trim() || typeof body.password !== "string" || !body.password) {
    return NextResponse.json({ error: "EPİAŞ kullanıcı adı ve şifresi gerekli." }, { status: 400 });
  }
  await saveEpiasAccount(s.userId, body.username, body.password);
  resetEpiasTgt();
  const test = await testEpiasConnection();
  await recordEpiasCheck(s.userId, test.ok, test.error);
  return NextResponse.json({ account: await getEpiasAccountInfo(s.userId), test });
}

/** DELETE /api/account/epias: kayıtlı hesabı siler (.env'de hesap varsa o kullanılır). */
export async function DELETE() {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  await deleteEpiasAccount(s.userId);
  resetEpiasTgt();
  return NextResponse.json({ ok: true });
}
