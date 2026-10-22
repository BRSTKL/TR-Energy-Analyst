/**
 * Uygulama hesabının şifresini sıfırlar (şifre unutulunca ya da kilit açmak için). Şifre ekranda görünmeden sorulur.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/auth-user.mts reset <e-posta>
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/auth-user.mts list
 *
 * Sunucuda: ssh -t root@5.180.187.237 'cd /srv/tr-energy && sudo -u tre node --env-file=.env node_modules/.bin/tsx --tsconfig tsconfig.json scripts/auth-user.mts reset <e-posta>'
 */
import readline from "node:readline";
import { Writable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { setUserPassword } from "@/lib/services/auth-users";

function askHidden(question: string): Promise<string> {
  let muted = false;
  const out = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

const [cmd, email] = process.argv.slice(2);
if (cmd === "list") {
  for (const u of await prisma.user.findMany({ select: { email: true, createdAt: true, lockedUntil: true } })) {
    console.log(`${u.email}  (açılış ${u.createdAt.toISOString().slice(0, 10)}${u.lockedUntil && u.lockedUntil > new Date() ? ", KİLİTLİ" : ""})`);
  }
} else if (cmd === "reset" && email) {
  const p1 = await askHidden("Yeni şifre: ");
  const p2 = await askHidden("Yeni şifre (tekrar): ");
  if (p1 !== p2) {
    console.error("Şifreler aynı değil.");
    process.exit(1);
  }
  const problem = await setUserPassword(email, p1);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  console.log("Şifre değişti; kilit açıldı.");
} else {
  console.error("Kullanım: auth-user.mts reset <e-posta> | list");
  process.exit(1);
}
await prisma.$disconnect();
