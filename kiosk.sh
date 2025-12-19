#!/usr/bin/env bash
#set -eo pipefail
exec >/tmp/volumiokiosk.log 2>&1

echo "Starting Kiosk"
start=$(date +%s)

export DISPLAY=:0

xset -dpms
xset s off

[[ -e /data/volumiokiosk/Default/Preferences ]] && {
  sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' /data/volumiokiosk/Default/Preferences
  sed -i 's/"exit_type":"Crashed"/"exit_type":"None"/' /data/volumiokiosk/Default/Preferences
}

if [ -L /data/volumiokiosk/SingletonCookie ]; then
  rm -rf /data/volumiokiosk/Singleton*
fi

if [ ! -f /data/volumiokiosk/firststartdone ]; then
  echo "Volumio Kiosk Starting for the first time, giving time for Volumio To start"
  sleep 15
  touch /data/volumiokiosk/firststartdone
fi

# Wait for Volumio webUI to be available
while true; do timeout 5 bash -c "</dev/tcp/127.0.0.1/3000" >/dev/null 2>&1 && break; done
echo "Waited $(($(date +%s) - start)) sec for Volumio UI"

# Detect CPU architecture
ARCH=$(uname -m)
echo "Detected CPU architecture: ${ARCH}"

# Start Openbox
openbox-session &

# Configure Chromium flags based on CPU architecture for optimal spectrum FPS
if [[ "${ARCH}" == "x86_64" || "${ARCH}" == "amd64" ]]; then
  echo "Using AMD64/x86_64 optimized flags for high FPS"
  /usr/bin/chromium \
    --kiosk \
    --window-position=0,0 \
    --no-first-run \
    --no-sandbox \
    --user-data-dir='/data/volumiokiosk' \
    --autoplay-policy=no-user-gesture-required \
    --disable-session-crashed-bubble \
    --disable-infobars \
    --disable-sync \
    --disable-translate \
    --disable-background-networking \
    --disable-quic \
    --disable-software-rasterizer \
    --enable-features=VaapiVideoDecoder,CanvasOopRasterization \
    --disable-features=UseChromeOSDirectVideoDecoder \
    --enable-gpu-rasterization \
    --enable-oop-rasterization \
    --enable-zero-copy \
    --enable-native-gpu-memory-buffers \
    --enable-accelerated-video-decode \
    --enable-accelerated-2d-canvas \
    --ignore-gpu-blocklist \
    --disable-gpu-driver-bug-workarounds \
    --enable-hardware-overlays \
    --max-gum-fps=60 \
    --use-gl=desktop \
    --num-raster-threads=4 \
    --enable-fast-unload \
    --enable-tcp-fast-open \
    --password-store=basic \
    --touch-events \
    --disable-touch-drag-drop \
    --disable-overlay-scrollbar \
    --enable-touchview \
    --enable-pinch \
    --load-extension='/data/volumiokioskextensions/VirtualKeyboard/' \
    http://localhost:8090

elif [[ "${ARCH}" == "armv7l" || "${ARCH}" == "aarch64" || "${ARCH}" == "arm64" ]]; then
  echo "Using ARM optimized flags for high FPS"
  /usr/bin/chromium \
    --kiosk \
    --window-position=0,0 \
    --no-first-run \
    --no-sandbox \
    --user-data-dir='/data/volumiokiosk' \
    --autoplay-policy=no-user-gesture-required \
    --disable-session-crashed-bubble \
    --disable-infobars \
    --disable-sync \
    --disable-translate \
    --disable-background-networking \
    --disable-quic \
    --disable-software-rasterizer \
    --disable-gpu-compositing \
    --enable-features=CanvasOopRasterization \
    --enable-gpu-rasterization \
    --enable-zero-copy \
    --enable-native-gpu-memory-buffers \
    --ignore-gpu-blocklist \
    --use-gl=egl \
    --max-gum-fps=60 \
    --num-raster-threads=2 \
    --enable-fast-unload \
    --enable-tcp-fast-open \
    --password-store=basic \
    --disable-dev-shm-usage \
    --disable-accelerated-2d-canvas \
    --touch-events \
    --disable-touch-drag-drop \
    --disable-overlay-scrollbar \
    --enable-touchview \
    --enable-pinch \
    --load-extension='/data/volumiokioskextensions/VirtualKeyboard/' \
    http://localhost:8090

else
  echo "Unknown architecture, using default flags"
  /usr/bin/chromium \
    --kiosk \
    --window-position=0,0 \
    --no-first-run \
    --no-sandbox \
    --user-data-dir='/data/volumiokiosk' \
    --autoplay-policy=no-user-gesture-required \
    --touch-events \
    --disable-touch-drag-drop \
    --disable-overlay-scrollbar \
    --enable-touchview \
    --enable-pinch \
    --load-extension='/data/volumiokioskextensions/VirtualKeyboard/' \
    http://localhost:8090
fi
