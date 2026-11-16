#!/bin/sh
# TR-Energy Analyst uygulama turu: tek komutla yeniden üretir.
#   LIB=<lemo-opuscar kütüphanesi> sh build.sh
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
LIB=${LIB:-$HOME/lemo-opuscar}
export LIB
[ -f "$LIB/core/render/video.mjs" ] || { echo "LIB değişkenini kütüphane klasörüne ayarlayın"; exit 1; }
cd "$LIB"
node core/render/events.mjs "$HERE"                                   # olaylar → events.json
"$LIB/.venv/bin/python" "$HERE/sound.py"                              # müzik + efekt → out/mix.wav
node core/render/video.mjs "$HERE" --fps 30 --workers 6 --out "$HERE/out/video.mp4"
sh core/render/mux.sh "$HERE/out/video.mp4" "$HERE/out/mix.wav" "$HERE/tr-energy-tur.mp4" 30 0
node "$HERE/subs.mjs" "$HERE"
"$LIB/.venv/bin/python" core/render/srt.py "$HERE/out/subs.json" "$HERE/tr-energy-tur.srt"
node core/render/still.mjs "$HERE" 51 --prefix po_ --out "$HERE/out/stills" && cp "$HERE/out/stills/po_51.jpg" "$HERE/poster.jpg"
echo "tamam: $HERE/tr-energy-tur.mp4"
