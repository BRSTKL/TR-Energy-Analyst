import { NextResponse } from "next/server";
import { attemptLogin } from "@/lib/services/auth-users";
import { setSessionCookie } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** POST /api/auth/login {email, password}: doğruysa oturum çerezi. 5 hatalı denemede 15 dakika kilit. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "E-posta ve şifre gerekli." }, { status: 400 });
  }
  const result = await attemptLogin(body.email, body.password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  await setSessionCookie(res, result.userId);
  return res;
}
