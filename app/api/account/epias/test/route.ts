import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/server";
import { getEpiasAccountInfo, recordEpiasCheck } from "@/lib/services/epias-account";
import { resetEpiasTgt, testEpiasConnection } from "@/lib/services/epias-service";

export const dynamic = "force-dynamic";

/** POST /api/account/epias/test: kayıtlı (yoksa .env) EPİAŞ hesabıyla yeni bilet alarak bağlantıyı dener. */
export async function POST() {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  resetEpiasTgt();
  const test = await testEpiasConnection();
  if (await getEpiasAccountInfo(s.userId)) await recordEpiasCheck(s.userId, test.ok, test.error);
  return NextResponse.json({ test, account: await getEpiasAccountInfo(s.userId) });
}
