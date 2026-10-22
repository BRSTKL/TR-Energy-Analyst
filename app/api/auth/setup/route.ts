import { NextResponse } from "next/server";
import { createFirstUser } from "@/lib/services/auth-users";
import { setSessionCookie } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** POST /api/auth/setup {email, password}: ilk hesabı açar ve oturum başlatır. Bir hesap varken reddedilir. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "E-posta ve şifre gerekli." }, { status: 400 });
  }
  const created = await createFirstUser(body.email, body.password);
  if ("error" in created) return NextResponse.json({ error: created.error }, { status: 400 });
  const res = NextResponse.json({ ok: true });
  await setSessionCookie(res, created.id);
  return res;
}
