import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout: oturum çerezini siler. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
