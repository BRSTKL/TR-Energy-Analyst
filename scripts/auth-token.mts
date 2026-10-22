/**
 * Duman testi için kısa ömürlü oturum çerezi değeri yazar (varsayılan 30 dakika, ilk hesap). Şifre gerekmez; AUTH_SECRET
 * gerekir, bu yüzden testin yapılacağı sunucuda çalıştırılır. Çıktı yalnız çerez değeridir.
 *
 *   SMOKE_COOKIE=$(ssh root@5.180.187.237 'cd /srv/tr-energy && sudo -u tre node --env-file=.env node_modules/.bin/tsx --tsconfig tsconfig.json scripts/auth-token.mts') \
 *     SMOKE_BASE=https://tr-energy.tail342501.ts.net npm run test:smoke
 */
import { prisma } from "@/lib/prisma";
import { signSession } from "@/lib/auth/session";

const minutes = Number(process.argv[2] ?? 30);
const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
if (!user) {
  console.error("Hesap yok: önce /login'den hesap oluşturun.");
  process.exit(1);
}
process.stdout.write(await signSession({ userId: user.id, expiresAt: Date.now() + minutes * 60_000 }));
await prisma.$disconnect();
