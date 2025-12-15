# Tóm tắt nội dung file ui/spectrum.js

## Mô tả tổng quan
File `ui/spectrum.js` là file JavaScript chính điều khiển giao diện spectrum analyzer cho Volumio. File này quản lý việc hiển thị phổ âm thanh thời gian thực, tích hợp với Volumio music player, và cung cấp giao diện người dùng để cấu hình các thiết lập trực quan.

## Cấu trúc chính

### 1. GLOBALS (Biến toàn cục)
Các biến toàn cục quản lý trạng thái ứng dụng:
- **audioMotion**: Instance của AudioMotion Analyzer để hiển thị phổ âm thanh
- **ws**: WebSocket connection để nhận dữ liệu audio PCM
- **pcmPlayer**: Class xử lý audio PCM và chuyển đổi thành float samples
- **sharedAudioContext**: Web Audio API context được chia sẻ
- **audioFormat**: Cấu hình format audio (sampleRate, channels, bitsPerSample)
- **backgroundFiles**: Danh sách file background (images, videos)
- **queuePanelVisible, settingsPanelVisible**: Trạng thái hiển thị các panel

### 2. GRADIENTS & PRESETS (Gradient và Preset)
- **gradients**: Mảng 17 gradient có sẵn (apple, aurora, borealis, candy, classic, cool, dusk, miami, orient, outrun, pacific, prism, rainbow, shahabi, summer, sunset, tiedye)
- **builtInPresets**: 6 preset có sẵn với cấu hình khác nhau:
  - **outline**: Spectrum viền ngoài với gradient prism
  - **ledbars**: LED bars cổ điển
  - **dual**: Đồ thị 2 kênh
  - **bands**: Octave bands với hiệu ứng phản chiếu
  - **radial**: Hiển thị radial với màu theo level
  - **round**: Bars tròn với màu theo index

### 3. PCMPlayer CLASS
Class xử lý audio PCM stream:
- **constructor**: Khởi tạo ScriptProcessor node và gain node
- **feed**: Nhận PCM chunks và chuyển đổi Int16 sang Float32
- **processAudio**: Xử lý audio buffer và output sang analyzer
- **getSourceNode**: Trả về analyzer gain node để kết nối với AudioMotion

### 4. UI FUNCTIONS (Hàm giao diện)

#### Quản lý cấu hình
- **initializeUI()**: Khởi tạo dropdown gradients và presets
- **setupEventListeners()**: Thiết lập event listeners cho tất cả controls:
  - Mode selection (10 modes khác nhau)
  - Gradient và color mode
  - Sensitivity (3 mức: normal, medium, high)
  - Effects (alphaBars, lumiBars, ledBars, outlineBars, radial, roundBars)
  - Reflex settings (4 mức)
  - Scale labels (X và Y)
  - Frequency range và scale
  - Bar adjustments (barSpace, fillAlpha, lineWidth)
  - Radial settings (radius, spinSpeed)
  - FFT settings (size, smoothing, ansiBands, linearAmplitude)
  - Peak settings (gravity, peakFade, peakHold)

- **toggleSettings()**: Hiển thị/ẩn settings panel
- **switchTab()**: Chuyển đổi giữa các tabs trong settings

#### Helper functions
- **updateValueDisplay()**: Cập nhật giá trị hiển thị cho sliders
- **getSelectedRadio()**: Lấy giá trị radio button được chọn
- **setRadioValue()**: Đặt giá trị cho radio button
- **updateFreqRange()**: Cập nhật dải tần số

### 5. PRESET FUNCTIONS (Hàm preset)
- **getCurrentSettings()**: Lấy tất cả cấu hình hiện tại
- **applyPreset()**: Áp dụng preset vào AudioMotion và UI
- **savePreset()**: Lưu preset vào localStorage
- **applySelectedPreset()**: Áp dụng preset đã chọn
- **loadUserPresets()**: Load user presets từ localStorage

### 6. BACKGROUND MANAGEMENT (Quản lý background)
- **refreshBackgroundFiles()**: Lấy danh sách file background từ server
- **populateBackgroundSelects()**: Populate dropdown với images/videos
- **applyBackground()**: Áp dụng background (none, cover, image/video)
- **updateCoverBackground()**: Cập nhật background từ album art
- **updateBackgroundDim()**: Điều chỉnh độ sáng background
- **updateBackgroundFit()**: Thay đổi object-fit (cover, contain, fill)
- **uploadBackground()**: Upload file background mới lên server

### 7. IMPORT/EXPORT (Nhập/Xuất)
- **exportSettings()**: Xuất settings ra file JSON
- **importSettings()**: Nhập settings từ file JSON

### 8. VOLUMIO INTEGRATION (Tích hợp Volumio)

#### State management
- **fetchVolumioState()**: Lấy trạng thái phát nhạc từ Volumio API
- **updateNowPlaying()**: Cập nhật thông tin bài hát đang phát
- **updateProgress()**: Cập nhật progress bar
- **updateProgressBar()**: Cập nhật progress bar theo thời gian thực

#### Playback controls
- **volumioTogglePlay()**: Phát/Tạm dừng
- **volumioPrevious()**: Bài trước
- **volumioNext()**: Bài tiếp theo

#### Queue management
- **toggleQueue()**: Hiển thị/ẩn queue panel
- **fetchQueue()**: Lấy danh sách queue từ Volumio
- **displayQueue()**: Hiển thị queue với album art
- **playQueueItem()**: Phát bài hát tại vị trí trong queue

#### Browse music library
- **toggleBrowse()**: Hiển thị/ẩn browse panel
- **browseMusicLibrary()**: Duyệt thư viện nhạc theo URI
- **displayBrowseItems()**: Hiển thị items (folders, songs, albums, artists)
- **handleBrowseItemClick()**: Xử lý click vào item (browse hoặc play)
- **playBrowseItem()**: Phát item từ browse
- **addBrowseItemToQueue()**: Thêm item vào queue
- **browseGoBack()**: Quay lại thư mục trước

#### Helper functions
- **getVolumioUrl()**: Lấy Volumio API URL
- **formatTime()**: Format giây thành mm:ss
- **testVolumioConnection()**: Test kết nối Volumio

### 9. WEBSOCKET (WebSocket)
- **connectWebSocket()**: Kết nối WebSocket để nhận audio data
  - Xử lý binary data (PCM audio chunks)
  - Xử lý JSON messages (settings, format)
- **reconnectWebSocket()**: Kết nối lại WebSocket
- **updateStatus()**: Cập nhật trạng thái kết nối (connected, connecting, disconnected)

### 10. AUDIO START (Khởi động audio)
- **startAudio()**: Khởi động AudioContext và PCMPlayer
  - Tạo shared AudioContext
  - Khởi tạo PCMPlayer với audio format
  - Kết nối PCMPlayer với AudioMotion
  - Bắt đầu polling Volumio state

### 11. AUDIOMOTION INIT (Khởi tạo AudioMotion)
- **initAudioMotion()**: Khởi tạo AudioMotion Analyzer
  - Tạo AudioContext
  - Fetch settings từ server
  - Merge với default config
  - Tạo AudioMotionAnalyzer instance
  - Sync UI với server settings
  - Khởi động WebSocket và FPS counter

#### Settings API
- **fetchServerSettings()**: Lấy settings từ settings API
- **applyServerSettings()**: Áp dụng settings update từ server
- **uploadSettings()**: Upload settings lên server
- **syncUIWithSettings()**: Đồng bộ UI elements với settings

### 12. FPS COUNTER
- **updateFPS()**: Cập nhật FPS counter mỗi giây
  - Hiển thị FPS (frames per second)
  - Hiển thị số packets nhận được
  - Hiển thị buffer size (ms)

### 13. PROGRESS BAR HANDLER
- Event listener cho progress bar để seek tới vị trí trong bài hát

### 14. STARTUP (Khởi động)
Event listener cho DOMContentLoaded:
- Khởi tạo UI
- Set auto-detected URLs
- Khởi tạo AudioMotion
- Auto-start audio
- Thiết lập cleanup khi unload

## Các tính năng chính

### Spectrum Visualization
- Hỗ trợ 10+ visualization modes
- 17 gradient colors có sẵn
- Nhiều effects: LED bars, outline bars, radial, round bars
- Reflex (phản chiếu)
- Dual channel support
- Frequency range và scale tùy chỉnh
- FFT size và smoothing điều chỉnh được

### Volumio Integration
- Hiển thị Now Playing với album art
- Playback controls (play/pause, next, previous)
- Queue management
- Music library browser
- Progress bar với seek support
- Auto-update state mỗi 2 giây

### Settings Management
- 6 presets có sẵn
- Save/load custom presets
- Import/export settings JSON
- Upload settings to server
- Sync settings từ server qua WebSocket

### Background Support
- None (solid color)
- Album cover art
- Custom images
- Custom videos
- Brightness adjustment
- Fit modes (cover, contain, fill)
- Upload new backgrounds

### Audio Processing
- WebSocket PCM audio streaming
- Real-time audio visualization
- Adjustable sensitivity
- Peak detection và display
- Buffer monitoring

## APIs sử dụng

### Volumio API
- `GET /api/v1/getState` - Lấy playback state
- `GET /api/v1/getQueue` - Lấy queue
- `GET /api/v1/browse` - Browse music library
- `GET /api/v1/commands/?cmd=<command>` - Playback commands
- `POST /api/v1/replaceAndPlay` - Play item
- `POST /api/v1/addToQueue` - Add to queue

### Settings API (Port 8090)
- `GET /api/settings` - Lấy settings
- `POST /api/settings` - Upload settings

### Background API
- `GET /api/backgrounds` - Lấy danh sách backgrounds
- `POST /api/backgrounds` - Upload background file

### WebSocket (Port 9001)
- Binary messages: PCM audio data
- JSON messages: settings updates, format info

## Dependencies
- **AudioMotion Analyzer**: Library hiển thị spectrum analyzer
- **Web Audio API**: Xử lý audio trong browser
- **WebSocket API**: Real-time communication
- **Fetch API**: HTTP requests tới Volumio và Settings APIs
- **LocalStorage API**: Lưu user presets

## Luồng hoạt động chính

1. **Initialization**:
   - DOM loaded → initializeUI()
   - Auto-detect URLs (WebSocket, Volumio)
   - initAudioMotion() → fetch server settings
   - startAudio() → create AudioContext và PCMPlayer
   - connectWebSocket() → nhận audio data

2. **Audio Visualization**:
   - WebSocket nhận PCM chunks
   - PCMPlayer feed → convert Int16 to Float32
   - processAudio → output to analyzer gain
   - AudioMotion reads from analyzer gain → render spectrum

3. **Volumio Sync**:
   - Poll Volumio state mỗi 2s
   - Update Now Playing info
   - Update progress bar
   - Sync album art → background (nếu chọn cover mode)

4. **Settings Management**:
   - User thay đổi settings → update AudioMotion properties
   - Save preset → localStorage
   - Upload settings → POST to settings API
   - WebSocket nhận settings update → applyServerSettings()

## Kết luận
File `ui/spectrum.js` là một ứng dụng web phức tạp tích hợp nhiều thành phần:
- Real-time audio visualization với AudioMotion
- Volumio music player integration
- WebSocket streaming
- Settings management với server sync
- Background customization
- Preset system

Code được tổ chức tốt với comments phân chia các phần rõ ràng, dễ bảo trì và mở rộng.
