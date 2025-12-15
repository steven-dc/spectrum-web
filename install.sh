#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Installing Spectrum Web Plugin"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PLUGIN_DIR="/data/plugins/user_interface/spectrum-web"
CONFIG_DIR="/data/configuration/user_interface/spectrum-web"

echo ""
echo "📦 Installing Node.js dependencies..."
cd "$PLUGIN_DIR"
npm install --production --no-optional

echo ""
echo "📁 Creating configuration directory..."
mkdir -p "$CONFIG_DIR"

echo ""
echo "📝 Copying default configuration..."
if [ ! -f "$CONFIG_DIR/config.json" ]; then
    cp "$PLUGIN_DIR/config.json" "$CONFIG_DIR/config.json"
    echo "✓ Default config.json created"
else
    echo "ℹ Config file already exists, keeping current settings"
fi

echo ""
echo "🎨 Creating UI directories..."
mkdir -p "$PLUGIN_DIR/ui/backgrounds"


echo ""
echo "🔑 Setting permissions..."
#chown -R volumio:volumio "$CONFIG_DIR"
#chown -R volumio:volumio "$PLUGIN_DIR/ui"
chmod -R 755 "$PLUGIN_DIR/ui"

echo ""
echo "🔧 Configuring MPD FIFO..."
if ! grep -q "# SpectrumWeb FIFO" /etc/mpd.conf; then
    cat >> /etc/mpd.conf << 'EOF'

# SpectrumWeb FIFO - DO NOT EDIT MANUALLY
audio_output {
    type "fifo"
    name "spectrum_visualizer"
    path "/tmp/mpd.fifo"
    format "44100:16:2"
    always_on "yes"
}
# End SpectrumWeb FIFO
EOF
    echo "✓ MPD FIFO configured"
    systemctl restart mpd
else
    echo "ℹ MPD FIFO already configured"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Spectrum Web installed successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📍 Configuration file: $CONFIG_DIR/config.json"
echo "🌐 After enabling the plugin, access visualizer at:"
echo "   http://volumio.local:8090"
echo ""

exit 0
