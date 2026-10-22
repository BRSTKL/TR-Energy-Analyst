#!/bin/bash
# Sunucu verisinin Mac'e günlük kopyası (sunucu dışı yedek). launchd: scripts/launchd/com.tr-energy.server-backup.plist.
# Kopya proje klasörüne değil ~/TR-Energy-Yedek/ altına gider; projedeki geliştirme verisine dokunmaz.
# Silme yok: sunucuda silinen dosya kopyada kalır (forecast-log değişmez kaydının korunması için).
set -u
SERVER="root@5.180.187.237"
SRC="/srv/tr-energy"
DEST="$HOME/TR-Energy-Yedek"
mkdir -p "$DEST"
echo "$(date '+%F %T') yedek başladı"
ok=1
for p in prisma/backups data .cache; do
  # Henüz oluşmamış klasör (ör. ilk gece yedeğinden önce prisma/backups) hata sayılmaz
  ssh -o BatchMode=yes -o ConnectTimeout=20 "$SERVER" "test -e '$SRC/$p'" || { echo "  $p sunucuda yok, atlandı"; continue; }
  mkdir -p "$DEST/$(dirname "$p")"
  rsync -az -e "ssh -o BatchMode=yes -o ConnectTimeout=20" "$SERVER:$SRC/$p" "$DEST/$(dirname "$p")/" || ok=0
done
if [ "$ok" = 1 ]; then
  date '+%F %T' > "$DEST/son-yedek.txt"
  echo "$(date '+%F %T') yedek tamam ($(du -sh "$DEST" | cut -f1))"
else
  echo "$(date '+%F %T') yedek HATA"
  osascript -e 'display notification "Sunucudan yedek alınamadı" with title "TR-Energy yedek"' >/dev/null 2>&1
  exit 1
fi
