// ===========================
// UTILITY FUNCTIONS
// ===========================

export function getBaseUrl() {
    return window.location.hostname || 'localhost';
}

export function getWebSocketUrl() {
    const wsUrlEl = document.getElementById("wsUrl");
    if (wsUrlEl && wsUrlEl.value) return wsUrlEl.value;
    return `ws://${getBaseUrl()}:9001`;
}

export function getVolumioApiUrl() {
    const el = document.getElementById("volumioUrl");
    if (el && el.value) return el.value;
    return `http://${getBaseUrl()}:3000`;
}

export function getSettingsApiUrl() {
    return `http://${getBaseUrl()}:8090`;
}

export function getVolumioUrl() {
    return getVolumioApiUrl();
}

export function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getSelectedRadio(formId) {
    const form = document.getElementById(formId);
    if (!form) return null;
    const selected = form.querySelector('input[type="radio"]:checked');
    return selected ? selected.value : null;
}

export function setRadioValue(formId, value) {
    const form = document.getElementById(formId);
    if (!form) return;
    const radio = form.querySelector(`input[value="${value}"]`);
    if (radio) radio.checked = true;
}

export function updateValueDisplay(inputId, displayId) {
    const input = document.getElementById(inputId);
    const display = document.getElementById(displayId);
    if (!input || !display) return;

    const value = parseFloat(input.value);

    if (inputId === 'spinSpeed') {
        if (value === 0) {
            display.textContent = 'OFF';
        } else {
            display.textContent = `${Math.abs(value)} RPM ${value < 0 ? '(CCW)' : ''}`;
        }
    } else if (inputId.includes('peak') || inputId === 'peakFade' || inputId === 'peakHold') {
        display.textContent = `${value}ms`;
    } else {
        display.textContent = value.toFixed(2);
    }
}

export function updateValueDisplays() {
    const displays = [
        'barSpace', 'fillAlpha', 'lineWidth', 'radius', 'spinSpeed',
        'smoothing', 'gravity', 'peakFade', 'peakHold', 'volume'
    ];

    displays.forEach(id => {
        const displayId = id + 'Value';
        updateValueDisplay(id, displayId);
    });
}

export function updateFreqRange() {
    const minFreq = parseInt(document.getElementById("minFreq")?.value) || 20;
    const maxFreq = parseInt(document.getElementById("maxFreq")?.value) || 22000;
    const display = document.getElementById("freqRangeValue");
    if (display) {
        display.textContent = `${minFreq}Hz - ${(maxFreq / 1000).toFixed(1)}kHz`;
    }

    const audioMotion = window.appState?.audioMotion;
    if (audioMotion) {
        audioMotion.minFreq = minFreq;
        audioMotion.maxFreq = maxFreq;
    }
}
