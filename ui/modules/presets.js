import { gradients, builtInPresets } from "./constants.js";
import { getSelectedRadio, setRadioValue, updateValueDisplay, updateFreqRange } from "./utils.js";

// ===========================
// PRESET FUNCTIONS
// ===========================

// ===========================
export function applySelectedPreset() {
    const presetSelect = document.getElementById('presetSelect');
    if (!presetSelect || !presetSelect.value) {
        alert('Please select a preset first');
        return;
    }

    const presetKey = presetSelect.value;
    let preset = null;

    if (builtInPresets[presetKey]) {
        preset = builtInPresets[presetKey].options;
    } else {
        const userPresets = JSON.parse(localStorage.getItem('spectrum_presets') || '{}');
        if (userPresets[presetKey]) {
            preset = userPresets[presetKey];
        }
    }

    if (preset) {
        applyPreset(preset);
        alert(`Preset "${builtInPresets[presetKey]?.name || presetKey}" applied!`);
    }
}

export function savePreset() {
    const name = prompt('Enter a name for this preset:');
    if (!name || !name.trim()) return;

    const trimmedName = name.trim();
    const preset = getCurrentSettings();

    const userPresets = JSON.parse(localStorage.getItem('spectrum_presets') || '{}');
    userPresets[trimmedName] = preset;
    localStorage.setItem('spectrum_presets', JSON.stringify(userPresets));

    const presetSelect = document.getElementById('presetSelect');
    if (presetSelect) {
        let optionExists = false;
        for (let i = 0; i < presetSelect.options.length; i++) {
            if (presetSelect.options[i].value === trimmedName) {
                optionExists = true;
                break;
            }
        }

        if (!optionExists) {
            const option = document.createElement('option');
            option.value = trimmedName;
            option.textContent = '📌 ' + trimmedName;
            presetSelect.appendChild(option);
        }
    }

    alert(`Preset "${trimmedName}" saved!`);
}

export function getCurrentSettings() {
    return {
        mode: parseInt(document.getElementById('mode')?.value || 10),
        gradient: document.getElementById('gradient')?.value || 'prism',
        gradientRight: document.getElementById('gradientRight')?.value || 'prism',
        colorMode: getSelectedRadio('colorModeSelect') || 'gradient',
        sensitivity: parseInt(getSelectedRadio('sensitivitySelect') || 1),
        alphaBars: document.getElementById('alphaBars')?.dataset.active === '1',
        lumiBars: document.getElementById('lumiBars')?.dataset.active === '1',
        ledBars: document.getElementById('ledBars')?.dataset.active === '1',
        outlineBars: document.getElementById('outlineBars')?.dataset.active === '1',
        radial: document.getElementById('radial')?.dataset.active === '1',
        roundBars: document.getElementById('roundBars')?.dataset.active === '1',
        reflexRatio: getSelectedRadio('reflexSelect') || '0',
        showScaleX: getSelectedRadio('scaleXSelect') || '1',
        showScaleY: getSelectedRadio('showScaleY') === 'true',
        channelLayout: document.getElementById('channelLayout')?.value || 'single',
        mirror: getSelectedRadio('mirrorSelect') || '0',
        freqScale: getSelectedRadio('freqScaleSelect') || 'log',
        minFreq: parseInt(document.getElementById('minFreq')?.value || 20),
        maxFreq: parseInt(document.getElementById('maxFreq')?.value || 22000),
        barSpace: parseFloat(document.getElementById('barSpace')?.value || 0.1),
        fillAlpha: parseFloat(document.getElementById('fillAlpha')?.value || 0.3),
        volume: parseFloat(document.getElementById('volume')?.value || 0),
        lineWidth: parseFloat(document.getElementById('lineWidth')?.value || 0),
        radius: parseFloat(document.getElementById('radius')?.value || 0.3),
        spinSpeed: parseFloat(document.getElementById('spinSpeed')?.value || 0),
        fftSize: parseInt(document.getElementById('fftSize')?.value || 8192),
        smoothing: parseFloat(document.getElementById('smoothing')?.value || 0.7),
        ansiBands: getSelectedRadio('ansiBandsSelect') || '0',
        linearAmplitude: getSelectedRadio('linearAmplitudeSelect') || '1',
        weightingFilter: document.getElementById('weightingFilter')?.value || '',
        gravity: parseFloat(document.getElementById('gravity')?.value || 3.8),
        peakFade: parseInt(document.getElementById('peakFade')?.value || 750),
        peakHold: parseInt(document.getElementById('peakHold')?.value || 500),
        linkGrads: document.getElementById('linkGrads')?.dataset.active === '1',
        splitGrad: document.getElementById('splitGrad')?.dataset.active === '1',
        // maxFPS: parseInt(document.getElementById('maxFPS')?.value || 60),
        // showFPS: document.getElementById('showFPS')?.dataset.active === '1',
        // loRes: document.getElementById('loRes')?.dataset.active === '1'
    };
}

export function applyPreset(preset) {
    const audioMotion = window.appState?.audioMotion;
    if (!preset || !audioMotion) return;

    console.log('[Preset] Applying:', preset);

    if (preset.mode !== undefined) {
        audioMotion.mode = parseInt(preset.mode);
        const modeSelect = document.getElementById('mode');
        if (modeSelect) modeSelect.value = preset.mode.toString();
    }

    if (preset.gradient) {
        audioMotion.gradient = preset.gradient;
        const gradSelect = document.getElementById('gradient');
        if (gradSelect) gradSelect.value = preset.gradient;
    }

    if (preset.gradientRight) {
        audioMotion.gradientRight = preset.gradientRight;
        const gradRight = document.getElementById('gradientRight');
        if (gradRight) gradRight.value = preset.gradientRight;
    }

    if (preset.colorMode) {
        audioMotion.colorMode = preset.colorMode;
        setRadioValue('colorModeSelect', preset.colorMode);
    }

    if (preset.sensitivity !== undefined) {
        const sensitivityPresets = [
            { min: -70, max: -20, boost: 1 },
            { min: -85, max: -25, boost: 1.6 },
            { min: -100, max: -30, boost: 2.4 }
        ];
        const sens = parseInt(preset.sensitivity);
        if (sensitivityPresets[sens]) {
            const { min, max, boost } = sensitivityPresets[sens];
            audioMotion.minDecibels = min;
            audioMotion.maxDecibels = max;
            audioMotion.linearBoost = boost;
            setRadioValue('sensitivitySelect', sens.toString());
        }
    }

    const effects = ['alphaBars', 'lumiBars', 'ledBars', 'outlineBars', 'radial', 'roundBars'];
    effects.forEach(effect => {
        if (preset[effect] !== undefined) {
            audioMotion[effect] = preset[effect];
            const el = document.getElementById(effect);
            if (el) el.dataset.active = preset[effect] ? '1' : '0';
        }
    });

    if (preset.reflexRatio !== undefined) {
        if (preset.reflexRatio === 0.25) {
            audioMotion.reflexRatio = 0.25;
            audioMotion.reflexAlpha = 0.2;
            setRadioValue('reflexSelect', '3');
        } else if (preset.reflexRatio === 0.4) {
            audioMotion.reflexRatio = 0.4;
            audioMotion.reflexAlpha = 0.2;
            setRadioValue('reflexSelect', '1');
        } else if (preset.reflexRatio === 0.5) {
            audioMotion.reflexRatio = 0.5;
            audioMotion.reflexAlpha = 1;
            setRadioValue('reflexSelect', '2');
        } else {
            audioMotion.reflexRatio = 0;
            setRadioValue('reflexSelect', '0');
        }
    }

    if (preset.showScaleX !== undefined) {
        const val = preset.showScaleX.toString();
        audioMotion.showScaleX = preset.showScaleX !== '0';
        audioMotion.noteLabels = preset.showScaleX === '2';
        setRadioValue('scaleXSelect', val);
    }

    if (preset.showScaleY !== undefined) {
        audioMotion.showScaleY = preset.showScaleY === true || preset.showScaleY === 'true';
        setRadioValue('showScaleY', preset.showScaleY ? 'true' : 'false');
    }

    if (preset.channelLayout) {
        audioMotion.channelLayout = preset.channelLayout;
        const channelSelect = document.getElementById('channelLayout');
        if (channelSelect) channelSelect.value = preset.channelLayout;
    }

    if (preset.mirror !== undefined) {
        audioMotion.mirror = parseInt(preset.mirror);
        setRadioValue('mirrorSelect', preset.mirror.toString());
    }

    if (preset.freqScale) {
        audioMotion.frequencyScale = preset.freqScale;
        setRadioValue('freqScaleSelect', preset.freqScale);
    }

    if (preset.minFreq) {
        audioMotion.minFreq = preset.minFreq;
        const minFreqInput = document.getElementById('minFreq');
        if (minFreqInput) minFreqInput.value = preset.minFreq;
    }

    if (preset.maxFreq) {
        audioMotion.maxFreq = preset.maxFreq;
        const maxFreqInput = document.getElementById('maxFreq');
        if (maxFreqInput) maxFreqInput.value = preset.maxFreq;
    }

    updateFreqRange();

    if (preset.barSpace !== undefined) {
        audioMotion.barSpace = preset.barSpace;
        const barSpaceInput = document.getElementById('barSpace');
        if (barSpaceInput) {
            barSpaceInput.value = preset.barSpace;
            updateValueDisplay('barSpace', 'barSpaceValue');
        }
    }

    if (preset.fillAlpha !== undefined) {
        audioMotion.fillAlpha = preset.fillAlpha;
        const fillAlphaInput = document.getElementById('fillAlpha');
        if (fillAlphaInput) {
            fillAlphaInput.value = preset.fillAlpha;
            updateValueDisplay('fillAlpha', 'fillAlphaValue');
        }
    }

    if (preset.lineWidth !== undefined) {
        audioMotion.lineWidth = preset.lineWidth;
        const lineWidthInput = document.getElementById('lineWidth');
        if (lineWidthInput) {
            lineWidthInput.value = preset.lineWidth;
            updateValueDisplay('lineWidth', 'lineWidthValue');
        }
    }

    if (preset.radius !== undefined) {
        audioMotion.radius = preset.radius;
        const radiusInput = document.getElementById('radius');
        if (radiusInput) {
            radiusInput.value = preset.radius;
            updateValueDisplay('radius', 'radiusValue');
        }
    }

    if (preset.spinSpeed !== undefined) {
        audioMotion.spinSpeed = preset.spinSpeed;
        const spinInput = document.getElementById('spinSpeed');
        if (spinInput) {
            spinInput.value = preset.spinSpeed;
            updateValueDisplay('spinSpeed', 'spinSpeedValue');
        }
    }

    if (preset.fftSize) {
        audioMotion.fftSize = preset.fftSize;
        const fftSelect = document.getElementById('fftSize');
        if (fftSelect) fftSelect.value = preset.fftSize;
    }

    if (preset.smoothing !== undefined) {
        audioMotion.smoothing = preset.smoothing;
        const smoothInput = document.getElementById('smoothing');
        if (smoothInput) {
            smoothInput.value = preset.smoothing;
            updateValueDisplay('smoothing', 'smoothingValue');
        }
    }

    if (preset.ansiBands !== undefined) {
        audioMotion.ansiBands = parseInt(preset.ansiBands);
        setRadioValue('ansiBandsSelect', preset.ansiBands.toString());
    }

    if (preset.linearAmplitude !== undefined) {
        audioMotion.linearAmplitude = parseInt(preset.linearAmplitude);
        setRadioValue('linearAmplitudeSelect', preset.linearAmplitude.toString());
    }

    if (preset.weightingFilter !== undefined) {
        audioMotion.weightingFilter = preset.weightingFilter;
        const weightSelect = document.getElementById('weightingFilter');
        if (weightSelect) weightSelect.value = preset.weightingFilter;
    }

    if (preset.gravity !== undefined) {
        audioMotion.gravity = preset.gravity;
        const gravityInput = document.getElementById('gravity');
        if (gravityInput) {
            gravityInput.value = preset.gravity;
            updateValueDisplay('gravity', 'gravityValue');
        }
    }

    if (preset.peakFade !== undefined) {
        audioMotion.peakFadeTime = preset.peakFade;
        const peakFadeInput = document.getElementById('peakFade');
        if (peakFadeInput) {
            peakFadeInput.value = preset.peakFade;
            updateValueDisplay('peakFade', 'peakFadeValue');
        }
    }

    if (preset.peakHold !== undefined) {
        audioMotion.peakHoldTime = preset.peakHold;
        const peakHoldInput = document.getElementById('peakHold');
        if (peakHoldInput) {
            peakHoldInput.value = preset.peakHold;
            updateValueDisplay('peakHold', 'peakHoldValue');
        }
    }

    // if (preset.maxFPS !== undefined) {
    //     audioMotion.maxFPS = preset.maxFPS;
    //     const maxFPSSelect = document.getElementById('maxFPS');
    //     if (maxFPSSelect) maxFPSSelect.value = preset.maxFPS;
    // }

    // if (preset.showFPS !== undefined) {
    //     audioMotion.showFPS = preset.showFPS;
    //     const showFPSEl = document.getElementById('showFPS');
    //     if (showFPSEl) showFPSEl.dataset.active = preset.showFPS ? '1' : '0';
    // }

    // if (preset.loRes !== undefined) {
    //     audioMotion.loRes = preset.loRes;
    //     const loResEl = document.getElementById('loRes');
    //     if (loResEl) loResEl.dataset.active = preset.loRes ? '1' : '0';
    // }

    if (preset.linkGrads !== undefined) {
        const linkEl = document.getElementById('linkGrads');
        if (linkEl) linkEl.dataset.active = preset.linkGrads ? '1' : '0';
    }

    if (preset.splitGrad !== undefined) {
        audioMotion.splitGradient = preset.splitGrad;
        const splitEl = document.getElementById('splitGrad');
        if (splitEl) splitEl.dataset.active = preset.splitGrad ? '1' : '0';
    }

    console.log('[Preset] Applied successfully');
}


export function loadUserPresets() {
    const userPresets = JSON.parse(localStorage.getItem('spectrum_presets') || '{}');
    const presetSelect = document.getElementById('presetSelect');

    if (presetSelect && Object.keys(userPresets).length > 0) {
        Object.keys(userPresets).forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = `📌 ${name}`;
            presetSelect.appendChild(option);
        });
    }
}
