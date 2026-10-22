import { NextResponse } from "next/server";
import { hasAnyUser } from "@/lib/services/auth-users";

export const dynamic = "force-dynamic";

/** GET /api/auth/status: hesap var mı (yoksa giriş sayfası ilk kurulum formunu gösterir). */
export async function GET() {
  return NextResponse.json({ hasUser: await hasAnyUser() });
}
