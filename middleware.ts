/**
 * Giriş denetimi: geçerli oturum çerezi yoksa sayfalar /login'e yönlenir, API'ler 401 döner. Açık kalanlar: giriş
 * sayfası, /api/auth/*, Next'in kendi dosyaları ve simge. AUTH_SECRET tanımlı değilse hiçbir oturum geçerli sayılmaz.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

const PUBLIC_PATHS = [/^\/login(\/|$)/, /^\/api\/auth\//];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.some((re) => re.test(pathname))) return NextResponse.next();
  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Giriş gerekli." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
