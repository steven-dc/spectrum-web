# Spectrum Web

A modern Spectrum Analyzer plugin for Volumio with a beautiful Web UI.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Volumio](https://img.shields.io/badge/Volumio-Plugin-orange.svg)

## 📋 Description
Beta testing.
Spectrum Web is a user interface plugin for Volumio that provides a real-time audio spectrum analyzer with a beautiful web interface and extensive customization options.

### ✨ Key Features

- 🎵 **Real-time Audio Spectrum Analysis** - Visualize your music as it plays
- 🎨 **Extensive Customization** - Multiple color modes, gradients, and visual effects
- 🖼️ **Custom Backgrounds** - Upload and manage background images/videos
- 🎧 **Now Playing Display** - Shows track info, album art, and playback controls
- 📊 **Multiple Analysis Modes** - Adjustable FFT size, frequency scale, and weighting filters
- 🌐 **WebSocket Integration** - Low-latency real-time audio data streaming
- 🖥️ **Kiosk Mode** - Full-screen mode for dedicated displays

## 🚀 Installation

### System Requirements

- Volumio  3.x
- CPU x64
- ARM (not tested)


### Install from Source

1. SSH into your Volumio device:
```bash
ssh volumio@volumio.local
```

2. Navigate to the plugins directory:
```bash
cd /data/plugins/user_interface
```

3. Clone the repository:
```bash
git clone https://github.com/steven-dc/spectrum-web.git
cd spectrum-web
```

4. Install dependencies:
```bash
npm install
```

5. Restart Volumio:
```bash
sudo systemctl restart volumio
```

6. Enable the plugin from Volumio UI → Plugins → User Interface → Spectrum Web

### Quick Install

Use the automated installation script:
```bash
chmod +x install.sh
./install.sh
```

## ⚙️ Configuration

### General Settings

The plugin can be configured via Volumio UI or directly from the `config.json` file:

```json
{
  "appPort": 8090,          // HTTP server port
  "wsPort": 9001,           // WebSocket server port
  "fifoPath": "/tmp/mpd.fifo", // Path to MPD FIFO
  "kioskEnabled": false,    // Enable/disable Kiosk mode
  "kioskUrl": "http://localhost:8090"
}
```

### Analyzer Configuration

Access `http://volumio.local:8090` and click the ⚙️ icon to open the settings panel:

#### Frequency Analysis
- **Mode**: Display mode (bars, octave bands, etc.)
- **FFT Size**: FFT size (512 - 32768)
- **Frequency Scale**: Linear or Logarithmic
- **Min/Max Frequency**: Frequency range to display
- **Min/Max Decibels**: Volume range
- **Smoothing**: Animation smoothness (0.0 - 0.9)
- **Weighting Filter**: A, B, C, D, ITU, or Z

#### Visual Appearance
- **Color Mode**: Gradient, RGB bars, or LED effect
- **Gradient Preset**: 20+ built-in gradients
- **Channel Layout**: Single, dual horizontal/vertical
- **Gravity**: Bar falling effect
- **Bar Spacing**: Space between bars
- **LED Effect**: LED bars effect
- **Mirror**: Symmetrical mirror effect

#### Display Options
- **Show FPS**: Display FPS counter
- **Show Scale**: Display frequency scale
- **Show Peaks**: Display peaks
- **Show Now Playing**: Display track information
- **Background Image**: Upload and select background images/videos

## 📖 Usage

### Accessing the Interface

Open your web browser and navigate to:
```
http://volumio.local:8090
```
or
```
http://<VOLUMIO_IP>:8090
```


### File Structure

```
spectrum-web/
├── index.js              # Main plugin file
├── package.json          # Dependencies
├── config.json           # Server configuration
├── UIConfig.json         # Volumio UI configuration
├── settings.json         # Analyzer settings
├── install.sh            # Installation script
├── uninstall.sh          # Uninstallation script
├── build.sh              # Build script
├── kiosk.sh              # Kiosk mode script
├── i18n/                 # Internationalization
│   └── strings_en.json
└── ui/                   # Web UI
    ├── index.html
    ├── style.css
    ├── spectrum.js       # Main logic
    ├── audiomotion-analyzer.min.js
    ├── pcm-worklet.js
    └── backgrounds/      # Background images
```

## 🔧 API Endpoints

### HTTP Endpoints

- `GET /` - Main interface
- `GET /api/config` - Get analyzer configuration
- `POST /api/config` - Update analyzer configuration
- `POST /api/upload-background` - Upload background image
- `GET /api/backgrounds` - List background images
- `DELETE /api/background/:filename` - Delete background image

### WebSocket

Connect to `ws://volumio.local:9001` to receive:
- Real-time PCM audio data
- Now Playing information
- Playback status

## 🐛 Troubleshooting

### No spectrum displayed

1. Check if MPD FIFO is configured:
```bash
cat /etc/mpd.conf | grep fifo
```

2. Ensure FIFO output is enabled:
```
audio_output {
    type            "fifo"
    name            "my_fifo"
    path            "/tmp/mpd.fifo"
    format          "44100:16:2"
}
```

3. Restart MPD:
```bash
sudo systemctl restart mpd
```

### WebSocket connection issues

1. Check if port 9001 is in use:
```bash
netstat -tuln | grep 9001
```

2. Check firewall settings

3. Try changing `wsPort` in `config.json`

### Performance issues

1. Reduce `fftSize` to 8192 or 4096
2. Increase `smoothing` to 0.7-0.8
3. Disable unnecessary effects (peaks, mirror, LED, video background)

## 📝 License

MIT License - Copyright (c) 2025 CuongDao

## 👤 Author

**CuongDao**

## 🙏 Credits

- [audioMotion-analyzer](https://audiomotion.dev/) - Spectrum analyzer library
- Volumio Community

## 📮 Support

If you encounter any issues or have suggestions, please create an issue on the GitHub repository.

---

