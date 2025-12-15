#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Uninstalling Spectrum Web Plugin"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PLUGIN_DIR="/data/plugins/user_interface/spectrum-web"
CONFIG_DIR="/data/configuration/user_interface/spectrum-web"

echo ""
echo "Stopping and disabling kiosk mode..."
if systemctl is-active --quiet spectrum-kiosk.service; then
    systemctl stop spectrum-kiosk.service
    echo "[OK] Kiosk service stopped"
fi

if systemctl is-enabled --quiet spectrum-kiosk.service 2>/dev/null; then
    systemctl disable spectrum-kiosk.service
    echo "[OK] Kiosk service disabled"
fi

if [ -f /etc/systemd/system/spectrum-kiosk.service ]; then
    rm -f /etc/systemd/system/spectrum-kiosk.service
    systemctl daemon-reload
    echo "[OK] Kiosk service removed"
fi

echo ""
echo "Removing MPD FIFO configuration..."
if grep -q "# SpectrumWeb FIFO" /etc/mpd.conf; then
    # Create backup
    cp /etc/mpd.conf /etc/mpd.conf.backup.$(date +%Y%m%d_%H%M%S)
    
    # Remove the FIFO section
    sed -i '/# SpectrumWeb FIFO/,/# End SpectrumWeb FIFO/d' /etc/mpd.conf
    
    echo "[OK] MPD FIFO configuration removed"
    echo "[INFO] Backup created at /etc/mpd.conf.backup.*"
    
    # Restart MPD
    systemctl restart mpd
    echo "[OK] MPD restarted"
else
    echo "[INFO] MPD FIFO configuration not found"
fi

echo ""
echo "Removing FIFO file..."
if [ -e /tmp/mpd.fifo ]; then
    rm -f /tmp/mpd.fifo
    echo "[OK] FIFO file removed"
fi

echo ""
echo "Removing configuration directory..."
if [ -d "$CONFIG_DIR" ]; then
    rm -rf "$CONFIG_DIR"
    echo "[OK] Configuration directory removed"
else
    echo "[INFO] Configuration directory not found"
fi

echo ""
echo "Cleaning up plugin files..."
if [ -d "$PLUGIN_DIR/node_modules" ]; then
    rm -rf "$PLUGIN_DIR/node_modules"
    echo "[OK] Node modules removed"
fi

if [ -f "$PLUGIN_DIR/package-lock.json" ]; then
    rm -f "$PLUGIN_DIR/package-lock.json"
    echo "[OK] Package lock file removed"
fi

echo ""
echo "=========================================="
echo "[SUCCESS] Spectrum Web uninstalled successfully!"
echo "=========================================="
echo ""
echo "[INFO] Plugin files remain at: $PLUGIN_DIR"
echo "[INFO] These will be removed when the plugin is deleted from Volumio UI"
echo ""

exit 0
