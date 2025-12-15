#!/usr/bin/env bash
#set -eo pipefail
exec >/tmp/volumiokiosk.log 2>&1

echo "Starting Kiosk"
start=$(date +%s)

export DISPLAY=:0
# in case we want to cap hires monitors (e.g. 4K) to HD (1920x1080)
#CAPPEDRES="1920x1080"
#SUPPORTEDRES=""
#if [ -z "" ]; then
#  echo "Resolution  not found, skipping"
#else
#  echo "Capping resolution to "
#  xrandr -s ""
#fi

#TODO xpdyinfo does not work on a fresh install (freezes), skipping it just now
#Perhaps xrandr can be parsed instead? (Needs DISPLAY:=0 to be exported first)
#res=$(xdpyinfo | awk '/dimensions:/ { print $2; exit }')
#res=${res/x/,}
#echo "Current probed resolution: ${res}"

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

# Start Openbox
openbox-session &
  /usr/bin/chromium \
    --kiosk \
    --touch-events \
    --disable-touch-drag-drop \
    --disable-overlay-scrollbar \
    --enable-touchview \
    --enable-pinch \
    --window-position=0,0 \
    --disable-session-crashed-bubble \
    --disable-infobars \
    --disable-sync \
    --no-first-run \
    --no-sandbox \
    --user-data-dir='/data/volumiokiosk' \
    --disable-translate \
    --show-component-extension-options \
    --disable-background-networking \
    --enable-remote-extensions \
    --enable-native-gpu-memory-buffers \
    --disable-quic \
    --password-store=basic \
    --enable-fast-unload \
    --enable-tcp-fast-open \
    --autoplay-policy=no-user-gesture-required \
    --load-extension='/data/volumiokioskextensions/VirtualKeyboard/' \
    --ignore-gpu-blacklist \
    --use-gl=desktop \
    --disable-gpu-compositing \
    --force-gpu-rasterization \
    --enable-zero-copy \
    http://localhost:8090

