#!/bin/bash
# TR-Energy Analyst başlatıcısı (masaüstü ikonundan çağrılır).
# Sunucu 3000 portunda çalışmıyorsa arka planda başlatır, hazır olmasını bekler ve uygulamayı
# Chrome'da adres çubuğu olmayan ayrı bir pencerede açar. Sunucu zaten çalışıyorsa yalnızca pencereyi açar.

set -u
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
URL="http://localhost:3000"
LOG="$PROJECT_DIR/dev-server.log"
# Finder'dan açılan uygulamalar kabuk profilini yüklemez; node/npm'in yolunu açıkça ekle
export PATH="$HOME/.local/node/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

notify() {
  osascript -e "display notification \"$1\" with title \"TR-Energy Analyst\"" >/dev/null 2>&1 || true
}

is_up() {
  curl -s -o /dev/null -m 2 "$URL"
}

if ! is_up; then
  notify "Sunucu başlatılıyor…"
  cd "$PROJECT_DIR" || exit 1
  echo "--- masaüstü ikonundan başlatıldı: $(date)" >>"$LOG"
  # nohup + tüm çıktıları log'a yönlendirme: ikon kapansa da sunucu çalışmaya devam eder
  nohup npm run dev >>"$LOG" 2>&1 &

  # En fazla 90 saniye bekle
  for _ in $(seq 1 90); do
    is_up && break
    sleep 1
  done

  if ! is_up; then
    notify "Sunucu başlatılamadı. Ayrıntılar: dev-server.log"
    open -a TextEdit "$LOG"
    exit 1
  fi
fi

if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$URL"
else
  open "$URL"
fi
