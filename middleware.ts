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
  // Adres tarayıcının gördüğü sunucuyla kurulur: ön sunucunun (Tailscale serve) arkasında req.nextUrl 127.0.0.1:3000'i
  // görür ve tarayıcıyı https://localhost:3000'e gönderiyordu.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const url = new URL(`${proto}://${host}/login`);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
