import { getCurrentSettings } from "./presets.js";
import { applyPreset } from "./presets.js";

// ===========================
// IMPORT/EXPORT
// ===========================

// ===========================
export function exportSettings() {
    const settings = getCurrentSettings();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settings, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "spectrum-settings.json");
    downloadAnchor.click();
    console.log('[Export] Settings exported');
}

export function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const settings = JSON.parse(e.target.result);
            applyPreset(settings);
            alert('Settings imported successfully!');
            console.log('[Import] Settings imported');
        } catch (error) {
            alert('Error importing settings: ' + error.message);
            console.error('[Import] Error:', error);
        }
    };
    reader.readAsText(file);
}

