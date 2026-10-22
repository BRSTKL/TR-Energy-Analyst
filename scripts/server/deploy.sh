#!/bin/bash
# GitHub'daki main'i sunucuya yükler (Mac'ten çalıştırılır): bash scripts/server/deploy.sh
# Sırayla: çekme, paketler değiştiyse npm ci, şema değiştiyse yedek + prisma db push, next build, web servisini yeniden
# başlatma ve sayfa denetimi. Zamanlanmış işler bir sonraki çalışmada yeni kodu kullanır. Ayrıntı: scripts/server/README.md.
set -euo pipefail
SERVER="root@5.180.187.237"

git fetch -q origin
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "Yerel main ile GitHub'daki main farklı: önce commit ve push. Sunucuya yalnız GitHub'daki hâl gider." >&2
  exit 1
fi
[ -z "$(git status --porcelain)" ] || echo "Not: commit'lenmemiş değişiklikler sunucuya gitmez."

ssh -o BatchMode=yes "$SERVER" 'bash -s' <<'EOF'
set -euo pipefail
cd /srv/tr-energy
# .env kabukta okunmaz (şifrede özel karakter olabilir); Prisma ve Next onu kendileri okur
as_tre() { sudo -u tre bash -c "set -a; . ./.env.build; set +a; $1"; }
old=$(sudo -u tre git rev-parse HEAD)
sudo -u tre git pull -q --ff-only
new=$(sudo -u tre git rev-parse HEAD)
echo "kod: ${old:0:7} -> ${new:0:7}"
changed=$(sudo -u tre git diff --name-only "$old" "$new")
if echo "$changed" | grep -qx "package-lock.json"; then echo "paketler kuruluyor"; as_tre "npm ci --no-audit --no-fund >/dev/null"; fi
if echo "$changed" | grep -qx "prisma/schema.prisma"; then
  echo "şema değişti: yedek ve prisma db push"
  as_tre "node_modules/.bin/tsx scripts/backup-db.mts deploy && npx prisma db push --skip-generate"
fi
as_tre "npx prisma generate >/dev/null"
if ! as_tre "NEXT_TELEMETRY_DISABLED=1 npm run build > /var/log/tr-energy/build.log 2>&1"; then
  tail -20 /var/log/tr-energy/build.log
  /usr/local/bin/tr-energy-notify "TR-Energy: yükleme başarısız" "next build hata verdi (${new:0:7}); web servisi yeniden başlatılmadı."
  exit 1
fi
systemctl restart tr-energy-web
sleep 5
for p in / /sector /market; do
  c=$(curl -s -o /dev/null -w "%{http_code}" -m 30 "http://127.0.0.1:3000$p")
  echo "$c $p"
  [ "$c" = 200 ] || { /usr/local/bin/tr-energy-notify "TR-Energy: yükleme sonrası hata" "$p HTTP $c (${new:0:7})"; exit 1; }
done
echo "yükleme tamam"
EOF
