import { state } from "./state.js";
import { getVolumioUrl, formatTime } from "./utils.js";
import { updateCoverBackground } from "./background.js";

// ===========================
// VOLUMIO INTEGRATION & QUEUE MANAGEMENT
// ===========================

// ===========================
function getVolumioUrl() {
    return getVolumioApiUrl();
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function updateProgressBar() {
    const progressFill = document.getElementById("progressFill");
    const currentTimeEl = document.getElementById("currentTime");

    if (!progressFill || !currentTimeEl) return;

    // Fetch latest state to check if still playing
    fetch(`${getVolumioUrl()}/api/v1/getState`)
        .then(res => res.json())
        .then(state => {
            if (state.status === 'play') {
                updateProgress(state);
            } else {
                // Stop interval if not playing anymore
                if (state.progressInterval) {
                    clearInterval(state.progressInterval);
                    state.progressInterval = null;
                }
            }
        })
        .catch(e => {
            console.warn('[Progress] Update failed:', e);
        });
}

async export function fetchVolumioState(progressOnly = false) {
    try {
        const response = await fetch(`${getVolumioUrl()}/api/v1/getState`);
        if (!response.ok) throw new Error('Failed to fetch state');

        const state = await response.json();

        if (progressOnly) {
            updateProgress(state);
        } else {
            updateNowPlaying(state);
        }
    } catch (e) {
        console.warn('[Volumio] Failed to fetch state:', e.message);
    }
}

export function updateProgress(state) {
    const progressFill = document.getElementById("progressFill");
    const currentTimeEl = document.getElementById("currentTime");
    const durationEl = document.getElementById("duration");

    if (!progressFill || !currentTimeEl || !durationEl) return;

    if (state && state.duration) {
        const current = state.seek ? state.seek / 1000 : 0;
        const duration = state.duration || 0;
        const percentage = duration > 0 ? (current / duration) * 100 : 0;

        progressFill.style.width = percentage + '%';
        currentTimeEl.textContent = formatTime(current);
        durationEl.textContent = formatTime(duration);
    } else {
        progressFill.style.width = '0%';
        currentTimeEl.textContent = '0:00';
        durationEl.textContent = '0:00';
    }
}

export function updateNowPlaying(state) {
    const nowPlaying = document.getElementById('nowPlaying');
    const playPauseBtn = document.getElementById('playPauseBtn');

    if (!nowPlaying) return;

    if (state) {
        const setTextContent = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        setTextContent('trackTitle', state.title || 'No Track');
        setTextContent('trackArtist', state.artist || 'No Artist');
        setTextContent('trackAlbum', state.album || 'No Album');

        const artImg = document.getElementById('trackArt');
        if (artImg && state.albumart) {
            artImg.src = state.albumart.startsWith('http') ? state.albumart :
                `${getVolumioUrl()}${state.albumart}`;
        } else if (artImg) {
            artImg.src = '/albumart';
        }

        setTimeout(() => updateCoverBackground(), 100);
        updateProgress(state);

        if (state.status === 'play') {
            if (!state.progressInterval) {
                state.progressInterval = setInterval(updateProgressBar, 1000);
            }
        } else {
            if (state.progressInterval) {
                clearInterval(state.progressInterval);
                state.progressInterval = null;
            }
        }

        if (playPauseBtn) {
            if (state.status === 'play') {
                playPauseBtn.innerHTML = '⏸';
                playPauseBtn.title = 'Pause';
            } else {
                playPauseBtn.innerHTML = '▶';
                playPauseBtn.title = 'Play';
            }
        }

        nowPlaying.classList.remove('hidden');
        nowPlaying.classList.add('show');
    } else {
        if (state.progressInterval) {
            clearInterval(state.progressInterval);
            state.progressInterval = null;
        }
        nowPlaying.classList.remove('show');
        setTimeout(() => nowPlaying.classList.add('hidden'), 300);
    }
}

// ===========================
// QUEUE MANAGEMENT
// ===========================
let state.browsePanelVisible = false;
let state.browseHistory = [];
let state.currentBrowsePath = null;

export function openVolumioMusic() {
    toggleBrowse();
}

export function toggleBrowse() {
    state.browsePanelVisible = !state.browsePanelVisible;
    const panel = document.getElementById('browsePanel');
    const controlBar = document.getElementById('controlBar');

    if (state.browsePanelVisible) {
        panel.classList.add('show');
        if (controlBar) {
            controlBar.classList.add('with-queue');
        }
        // Start from root if no history
        if (state.browseHistory.length === 0) {
            browseMusicLibrary();
        }
    } else {
        panel.classList.remove('show');
        if (controlBar) {
            controlBar.classList.remove('with-queue');
        }
    }
}

async export function browseMusicLibrary(uri = null) {
    try {
        const volumioUrl = getVolumioUrl();
        let url = `${volumioUrl}/api/v1/browse`;
        
        if (uri) {
            url += `?uri=${encodeURIComponent(uri)}`;
        }

        console.log('[Browse] Fetching:', url);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`API returned ${response.status}`);

        const data = await response.json();
        console.log('[Browse] Response:', data);

        // Update history
        if (uri) {
            state.browseHistory.push(state.currentBrowsePath);
        }
        state.currentBrowsePath = { uri: uri, title: data.title || 'Music Library' };

        displayBrowseItems(data);
    } catch (e) {
        console.error('[Browse] Failed:', e);
        const browseList = document.getElementById('browseList');
        if (browseList) {
            browseList.innerHTML = `<div style="padding: 20px; text-align: center; color: #f87171;">Error: ${e.message}</div>`;
        }
    }
}

export function displayBrowseItems(data) {
    const browseList = document.getElementById('browseList');
    const browsePath = document.getElementById('browsePath');
    const browseTitle = document.getElementById('browseTitle');
    
    if (!browseList) return;

    // Update title and path
    if (browseTitle) {
        browseTitle.textContent = data.title || '🎶 Music Library';
    }
    
    if (browsePath) {
        let pathText = '';
        if (state.browseHistory.length > 0) {
            pathText = `<span style="cursor: pointer; color: #60a5fa;" onclick="browseGoBack()">← Back</span>`;
        }
        browsePath.innerHTML = pathText;
    }

    // Volumio API returns items in different structures:
    // 1. Root browse: data.navigation.lists = array of items
    // 2. Folder browse: data.navigation.lists[0].items = array of items
    let items = [];
    
    if (data.navigation && data.navigation.lists) {
        if (Array.isArray(data.navigation.lists) && data.navigation.lists.length > 0) {
            // Check if first element has 'items' property (folder structure)
            if (data.navigation.lists[0].items) {
                items = data.navigation.lists[0].items;
            } else {
                // Root structure - lists itself is the items array
                items = data.navigation.lists;
            }
        }
    }

    console.log('[Browse] Displaying', items.length, 'items');

    if (!items || items.length === 0) {
        browseList.innerHTML = '<div style="padding: 20px; text-align: center; color: #8b9dc3;">No items found</div>';
        return;
    }

    browseList.innerHTML = '';
    console.log('[Browse] Displaying', items.length, 'items');

    items.forEach((item, index) => {
        const element = document.createElement('div');
        element.className = 'queue-item'; // Reuse queue-item styling
        
        // Determine icon based on type
        let icon = '📁'; // folder
        if (item.type === 'song' || item.type === 'webradio') {
            icon = '🎵';
        } else if (item.type === 'playlist') {
            icon = '📋';
        } else if (item.type === 'album') {
            icon = '💿';
        } else if (item.type === 'artist') {
            icon = '🎤';
        }

        // Get album art if available
        let albumart = '';
        if (item.albumart) {
            albumart = item.albumart.startsWith('http') ? item.albumart : `${getVolumioUrl()}${item.albumart}`;
        }

        const title = item.title || item.name || 'Unknown';
        const service = item.service || '';

        element.innerHTML = `
            <div class="queue-item-index">${icon}</div>
            <div class="queue-item-art">
                ${albumart ? `<img src="${albumart}" alt="" onerror="this.style.display='none'">` : ''}
            </div>
            <div class="queue-item-info">
                <div class="queue-item-title">${title}</div>
                <div class="queue-item-artist">${service}</div>
            </div>
            <div class="browse-item-menu" onclick="event.stopPropagation(); showBrowseMenu(event, ${index});">⋮</div>
        `;

        element.onclick = () => handleBrowseItemClick(item);
        element.dataset.itemIndex = index;
        browseList.appendChild(element);
    });

    // Store items for menu actions
    state.currentBrowseItems = items;
}

export function handleBrowseItemClick(item) {
    console.log('[Browse] Item clicked:', item);
    
    // If it's a song/track, play it
    if (item.type === 'song' || item.type === 'webradio') {
        playBrowseItem(item);
    } else {
        // Otherwise, browse into it
        browseMusicLibrary(item.uri);
    }
}

async export function playBrowseItem(item) {
    try {
        const volumioUrl = getVolumioUrl();
        
        // Use replaceAndPlay endpoint to play the item
        const response = await fetch(`${volumioUrl}/api/v1/replaceAndPlay`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ item: item })
        });
        
        if (response.ok) {
            console.log('[Browse] Playing:', item.title || item.name);
            setTimeout(() => fetchVolumioState(), 500);
        } else {
            const error = await response.text();
            console.error('[Browse] Play failed:', response.status, error);
        }
    } catch (e) {
        console.error('[Browse] Play error:', e);
    }
}

export function showBrowseMenu(event, itemIndex) {
    const existingMenu = document.getElementById('browseContextMenu');
    if (existingMenu) existingMenu.remove();

    const item = state.currentBrowseItems[itemIndex];
    if (!item) return;

    const menu = document.createElement('div');
    menu.id = 'browseContextMenu';
    menu.className = 'context-menu';

    const actions = [
        { label: '▶ Play Now', action: () => playBrowseItem(item) },
        { label: '⏭ Play Next', action: () => addBrowseItemToQueue(item, 'next') },
        { label: '➕ Add to Queue', action: () => addBrowseItemToQueue(item, 'end') },
        { label: '📋 Add to Playlist', action: () => addBrowseItemToPlaylist(item) }
    ];

    actions.forEach(action => {
        const option = document.createElement('div');
        option.className = 'context-menu-item';
        option.textContent = action.label;
        option.onclick = () => {
            action.action();
            menu.remove();
        };
        menu.appendChild(option);
    });

    document.body.appendChild(menu);

    const rect = event.target.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 5}px`;
    menu.style.left = `${rect.left - menu.offsetWidth + 30}px`;

    setTimeout(() => {
        document.addEventListener('click', function closeMenu() {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        });
    }, 0);
}

async export function addBrowseItemToQueue(item, position = 'end') {
    try {
        const volumioUrl = getVolumioUrl();
        const response = await fetch(`${volumioUrl}/api/v1/addToQueue`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(item)
        });
        
        if (response.ok) {
            console.log('[Browse] Added to queue:', item.title || item.name);
            setTimeout(() => fetchQueue(), 300);
        } else {
            const error = await response.text();
            console.error('[Browse] Add to queue failed:', response.status, error);
        }
    } catch (e) {
        console.error('[Browse] Add to queue error:', e);
    }
}

async export function addBrowseItemToPlaylist(item) {
    const playlistName = prompt('Enter playlist name:');
    if (!playlistName) return;

    try {
        console.log('[Browse] Add to playlist:', playlistName, item);
        alert('Playlist functionality requires additional API implementation');
    } catch (e) {
        console.error('[Browse] Add to playlist error:', e);
    }
}

export function browseGoBack() {
    if (state.browseHistory.length > 0) {
        const previousPath = state.browseHistory.pop();
        state.currentBrowsePath = previousPath;
        browseMusicLibrary(previousPath?.uri);
    }
}

export function toggleQueue() {
    state.queuePanelVisible = !state.queuePanelVisible;
    const panel = document.getElementById('queuePanel');
    const controlBar = document.getElementById('controlBar');

    if (state.queuePanelVisible) {
        panel.classList.add('show');
        if (controlBar) {
            controlBar.classList.add('with-queue');
        }
        fetchQueue();
    } else {
        panel.classList.remove('show');
        if (controlBar) {
            controlBar.classList.remove('with-queue');
        }
    }
}

async export function fetchQueue() {
    try {
        const volumioUrl = getVolumioUrl();
        console.log('[Queue] Fetching from:', `${volumioUrl}/api/v1/getQueue`);
        const response = await fetch(`${volumioUrl}/api/v1/getQueue`);
        if (!response.ok) throw new Error(`API returned ${response.status}`);

        const data = await response.json();
        console.log('[Queue] Response:', data);

        // Volumio returns { queue: [...] } structure or direct array
        const queue = Array.isArray(data) ? data : (data.queue || []);
        console.log('[Queue] Parsed queue length:', queue.length);
        displayQueue(queue);
    } catch (e) {
        console.error('[Queue] Failed to fetch:', e);
        const queueList = document.getElementById('queueList');
        if (queueList) {
            queueList.innerHTML = `<div style="padding: 20px; text-align: center; color: #f87171;">Error: ${e.message}</div>`;
        }
    }
}

async export function displayQueue(queue) {
    const queueList = document.getElementById('queueList');
    if (!queueList) return;

    if (!Array.isArray(queue)) {
        console.error('[Queue] Queue is not an array:', queue);
        queueList.innerHTML = '<div style="padding: 20px; text-align: center; color: #f87171;">Invalid queue format</div>';
        return;
    }

    let currentPosition = -1;
    try {
        const stateResponse = await fetch(`${getVolumioUrl()}/api/v1/getState`);
        if (stateResponse.ok) {
            const state = await stateResponse.json();
            currentPosition = state.position !== undefined ? state.position : -1;
            console.log('[Queue] Current position:', currentPosition);
        }
    } catch (e) {
        console.warn('[Queue] Could not get current position:', e);
    }

    if (queue.length === 0) {
        queueList.innerHTML = '<div style="padding: 20px; text-align: center; color: #8b9dc3;">Queue is empty</div>';
        return;
    }

    queueList.innerHTML = '';
    console.log('[Queue] Displaying', queue.length, 'tracks');

    queue.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = 'queue-item';
        if (index === currentPosition) {
            item.classList.add('playing');
        }

        // Extract title and artist with fallbacks
        const title = track.name || track.title || 'Unknown Track';
        const artist = track.artist || (track.artists ? track.artists.join(', ') : 'Unknown Artist');

        // Handle album art from various possible locations
        let albumart = '';
        if (track.albumart) {
            albumart = track.albumart.startsWith('http') ? track.albumart : `${getVolumioUrl()}${track.albumart}`;
        } else if (track.image) {
            albumart = track.image.startsWith('http') ? track.image : `${getVolumioUrl()}${track.image}`;
        }

        item.innerHTML = `
            <div class="queue-item-index">${index + 1}</div>
            <div class="queue-item-art">
                ${albumart ? `<img src="${albumart}" alt="" onerror="this.style.display='none'">` : ''}
            </div>
            <div class="queue-item-info">
                <div class="queue-item-title">${title}</div>
                <div class="queue-item-artist">${artist}</div>
            </div>
        `;

        item.onclick = () => playQueueItem(index);
        queueList.appendChild(item);
    });
}

async export function playQueueItem(position) {
    try {
        const volumioUrl = getVolumioUrl();
        // Volumio API: play specific queue index
        const url = `${volumioUrl}/api/v1/commands/?cmd=play&N=${position}`;
        console.log('[Queue] Playing position:', position, 'URL:', url);
        const response = await fetch(url);
        if (response.ok) {
            console.log('[Queue] Playing item at position:', position);
            setTimeout(() => {
                fetchVolumioState();
                fetchQueue();
            }, 200);
        } else {
            console.error('[Queue] Play failed:', response.status);
        }
    } catch (e) {
        console.error('[Queue] Play error:', e);
    }
}

async export function volumioTogglePlay() {
    try {
        const response = await fetch(`${getVolumioUrl()}/api/v1/commands/?cmd=toggle`);
        if (response.ok) {
            console.log('[Volumio] Toggle play/pause');
            setTimeout(() => fetchVolumioState(), 200);
        }
    } catch (e) {
        console.error('[Volumio] Toggle error:', e);
    }
}

async export function volumioPrevious() {
    try {
        const response = await fetch(`${getVolumioUrl()}/api/v1/commands/?cmd=prev`);
        if (response.ok) {
            console.log('[Volumio] Previous track');
            setTimeout(() => fetchVolumioState(), 200);
        }
    } catch (e) {
        console.error('[Volumio] Previous error:', e);
    }
}

async export function volumioNext() {
    try {
        const response = await fetch(`${getVolumioUrl()}/api/v1/commands/?cmd=next`);
        if (response.ok) {
            console.log('[Volumio] Next track');
            setTimeout(() => fetchVolumioState(), 200);
        }
    } catch (e) {
        console.error('[Volumio] Next error:', e);
    }
}

async export function testVolumioConnection() {
    try {
        const response = await fetch(`${getVolumioUrl()}/api/v1/getState`);
        if (response.ok) {
            alert('✓ Connected to Volumio successfully!');
            fetchVolumioState();
        } else {
            alert('✗ Failed to connect to Volumio');
        }
    } catch (e) {
        alert('✗ Connection error: ' + e.message);
    }
}

