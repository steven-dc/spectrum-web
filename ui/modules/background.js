// ===========================
// BACKGROUND MANAGEMENT
// ===========================

import { state } from "./state.js";

// ===========================
export function updateBackgroundControls() {
    const bgType = document.getElementById("bgType");
    if (!bgType) return;

    const imageLabel = document.getElementById("bgImageLabel");
    const imageSelect = document.getElementById("bgImage");

    // hide everything first
    if (imageLabel) imageLabel.style.display = "none";
    if (imageSelect) imageSelect.style.display = "none";

    // New behavior: "Background Image" is used for both images and videos (Select Media)
    if (bgType.value === "image") {
        if (imageLabel) imageLabel.style.display = "block";
        if (imageSelect) imageSelect.style.display = "block";
    }
}

export async function refreshBackgroundFiles() {
    try {
        const response = await fetch('/api/backgrounds');
        if (!response.ok) {
            console.warn('[BG] Cannot load background files');
            state.backgroundFiles.images = [];
            state.backgroundFiles.videos = [];
        } else {
            const files = await response.json();
            state.backgroundFiles.images = files.images || [];
            state.backgroundFiles.videos = files.videos || [];
        }

        console.log('[BG] Found:', {
            images: state.backgroundFiles.images.length,
            videos: state.backgroundFiles.videos.length
        });

        populateBackgroundSelects();

    } catch (e) {
        console.error('[BG] Error loading background files:', e);
        state.backgroundFiles.images = [];
        state.backgroundFiles.videos = [];
        populateBackgroundSelects();
    }
}

export function populateBackgroundSelects() {
    const fileSelect = document.getElementById("bgFile");
    if (!fileSelect) return;

    fileSelect.innerHTML = '<option value="">-- Select File --</option>';

    const combined = [
        ...state.backgroundFiles.images.map(f => ({ file: f, type: 'image' })),
        ...state.backgroundFiles.videos.map(f => ({ file: f, type: 'video' }))
    ];

    if (combined.length > 0) {
        fileSelect.innerHTML += '<option value="random">🎲 Random</option>';
    }

    combined.forEach(item => {
        const option = document.createElement('option');
        option.value = item.file;
        option.dataset.type = item.type;
        option.textContent = `${item.type === 'video' ? '📹 ' : ''}${decodeURIComponent(item.file)}`;
        fileSelect.appendChild(option);
    });

    console.log("[BG] Populate:", combined);
}

export function applyBackground() {
    const bgType = document.getElementById("bgType");
    if (!bgType) return;

    const bgLayer = document.getElementById("backgroundLayer");
    if (!bgLayer) return;

    if (state.bgVideo && state.bgVideo.parentNode) {
        state.bgVideo.pause();
        state.bgVideo.src = '';
        state.bgVideo.parentNode.removeChild(state.bgVideo);
        state.bgVideo = null;
    }

    bgLayer.style.backgroundImage = '';
    bgLayer.style.backgroundColor = '#0a0e14';

    if (bgType.value === "none") {
        console.log('[BG] Applied: None');
    } else if (bgType.value === "cover") {
        updateCoverBackground();
    } else if (bgType.value === "file") {
        // Note: "image" now means "media" (images + videos)
        const mediaSelect = document.getElementById("bgFile");
        if (!mediaSelect) return;

        const selected = mediaSelect.value;
        if (!selected) return;

        // build combined list for random selection
        const combined = [...state.backgroundFiles.images.map(f => ({ file: f, type: 'image' })), ...state.backgroundFiles.videos.map(f => ({ file: f, type: 'video' }))];

        let chosen = null;
        if (selected === "random") {
            if (combined.length === 0) return;
            const idx = Math.floor(Math.random() * combined.length);
            chosen = combined[idx];
        } else {
            // find whether it's an image or video (option.dataset.type may be present)
            const opt = mediaSelect.selectedOptions[0];
            const type = opt?.dataset?.type || (state.backgroundFiles.videos.includes(selected) ? 'video' : 'image');
            chosen = { file: selected, type };
        }

        if (!chosen) return;

        if (chosen.type === 'video') {
            const videoFile = chosen.file;
            state.bgVideo = document.createElement('video');
            state.bgVideo.loop = true;
            state.bgVideo.muted = true;
            state.bgVideo.autoplay = true;
            state.bgVideo.playsInline = true;
            state.bgVideo.style.position = 'absolute';
            state.bgVideo.style.top = '0';
            state.bgVideo.style.left = '0';
            state.bgVideo.style.width = '100%';
            state.bgVideo.style.height = '100%';
            state.bgVideo.style.objectFit = document.getElementById("bgFit")?.value || 'cover';
            state.bgVideo.style.zIndex = '0';
            state.bgVideo.style.pointerEvents = 'none';

            bgLayer.appendChild(state.bgVideo);

            state.bgVideo.src = `backgrounds/${encodeURIComponent(videoFile)}`;
            state.bgVideo.play()
                .then(() => console.log('[BG] Video playing:', videoFile))
                .catch(e => console.error('[BG] Video play error:', e));

            state.currentBackground = state.bgVideo;
        } else {
            const imageFile = chosen.file;
            const imageUrl = `backgrounds/${encodeURIComponent(imageFile)}`;
            bgLayer.style.backgroundImage = `url('${imageUrl}')`;
            bgLayer.style.backgroundSize = document.getElementById("bgFit")?.value || 'cover';
            bgLayer.style.backgroundPosition = 'center';
            bgLayer.style.backgroundRepeat = 'no-repeat';
            state.currentBackground = imageFile;
            console.log('[BG] Applied image:', imageFile);
        }
    }

    const bgDim = document.getElementById("bgDim");
    if (bgDim) {
        updateBackgroundDim(parseFloat(bgDim.value));
    }
}


export function updateCoverBackground() {
    const bgType = document.getElementById("bgType");
    if (!bgType || bgType.value !== "cover") return;

    const artImg = document.getElementById('trackArt');
    const bgLayer = document.getElementById("backgroundLayer");

    if (bgLayer && artImg && artImg.src && artImg.src !== window.location.href) {
        bgLayer.style.backgroundImage = `url('${artImg.src}')`;
        bgLayer.style.backgroundSize = document.getElementById("bgFit")?.value || 'cover';
        bgLayer.style.backgroundPosition = 'center';
        bgLayer.style.backgroundRepeat = 'no-repeat';
        console.log('[BG] Applied album cover');
    }
}

export function updateBackgroundDim(value) {
    const bgLayer = document.getElementById("backgroundLayer");
    if (bgLayer) {
        bgLayer.style.filter = `brightness(${value})`;
    }
}

export function updateBackgroundFit(fit) {
    const bgLayer = document.getElementById("backgroundLayer");
    if (bgLayer) {
        bgLayer.style.backgroundSize = fit;
    }

    if (state.bgVideo) {
        state.bgVideo.style.objectFit = fit;
    }

    console.log('[BG] Fit changed to:', fit);
}

export async function uploadBackground(input) {
    const file = input.files[0];
    if (!file) return;

    const statusEl = document.getElementById('uploadStatus');
    if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.textContent = 'Uploading...';
        statusEl.style.color = '#8b9dc3';
    }

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/backgrounds', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }

        const result = await response.json();
        console.log('[BG] Upload successful:', result);

        if (statusEl) {
            statusEl.textContent = `✓ Uploaded: ${result.filename}`;
            statusEl.style.color = '#4ade80';
        }

        // Refresh the background files list
        await refreshBackgroundFiles();

        // Auto-select the uploaded file
        setTimeout(() => {
            const bgFileSelect = document.getElementById('bgFile');
            if (bgFileSelect) {
                bgFileSelect.value = result.filename;
                const bgType = document.getElementById('bgType');
                if (bgType && bgType.value !== 'file') {
                    bgType.value = 'file';
                    updateBackgroundControls();
                }
                applyBackground();
            }
        }, 100);

        // Clear status after 3 seconds
        setTimeout(() => {
            if (statusEl) statusEl.style.display = 'none';
        }, 3000);

    } catch (error) {
        console.error('[BG] Upload error:', error);
        if (statusEl) {
            statusEl.textContent = `✗ Error: ${error.message}`;
            statusEl.style.color = '#f87171';
        }
    }

    // Clear the input
    input.value = '';
}

