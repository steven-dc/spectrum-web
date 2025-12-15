// ===========================
// GRADIENTS & PRESETS
// ===========================
export const gradients = [
    'apple', 'aurora', 'borealis', 'candy', 'classic', 'cool',
    'dusk', 'miami', 'orient', 'outrun', 'pacific', 'prism',
    'rainbow', 'shahabi', 'summer', 'sunset', 'tiedye'
];

export const builtInPresets = {
    "outline": {
        name: "Outline Spectrum",
        options: {
            "mode": 4,
            "gradient": "prism",
            "gradientRight": "prism",
            "colorMode": "gradient",
            "sensitivity": 1,
            "alphaBars": false,
            "lumiBars": false,
            "ledBars": false,
            "outlineBars": true,
            "radial": false,
            "roundBars": false,
            "reflexRatio": "0",
            "showScaleX": "1",
            "showScaleY": "0",
            "channelLayout": "single",
            "mirror": "0",
            "freqScale": "log",
            "minFreq": 20,
            "maxFreq": 22000,
            "barSpace": 0,
            "fillAlpha": 0.05,
            "lineWidth": 2.5,
            "radius": 0.3,
            "spinSpeed": 0,
            "fftSize": 8192,
            "smoothing": 0.7,
            "ansiBands": "0",
            "linearAmplitude": "1",
            "weightingFilter": "",
            "gravity": 3.8,
            "peakFade": 750,
            "peakHold": 500,
            "linkGrads": false,
            "splitGrad": false,
            "loRes": false
        }
    },
    "ledbars": {
        name: "Classic LED bars",
        options: {
            alphaBars: false,
            barSpace: 0.2,
            channelLayout: "single",
            colorMode: "gradient",
            gradient: "classic",
            ledBars: true,
            lumiBars: false,
            outlineBars: false,
            mode: 10,
            radial: false,
            reflexRatio: 0,
            roundBars: false,
            showPeaks: true,
            splitGrad: false
        }
    },
    "dual": {
        name: "Dual-channel Graph",
        options: {
            channelLayout: "dual-combined",
            fillAlpha: 0.3,
            gradient: "cool",
            gradientRight: "dusk",
            lineWidth: 1,
            mode: 10,
            radial: false,
            reflexRatio: 0,
            showPeaks: false,
            splitGrad: false
        }
    },
    "bands": {
        name: "Octave Bands + Reflex",
        options: {
            alphaBars: false,
            channelLayout: "single",
            colorMode: "gradient",
            gradient: "rainbow",
            ledBars: false,
            lumiBars: false,
            mode: 6,
            outlineBars: false,
            radial: false,
            reflexRatio: 0.25,
            reflexAlpha: 0.2,
            roundBars: false,
            showPeaks: true,
            showScaleX: true,
            splitGrad: false
        }
    },
    "radial": {
        name: "Radial Color by Level",
        options: {
            alphaBars: true,
            channelLayout: "single",
            colorMode: "bar-level",
            gradient: "prism",
            ledBars: false,
            lumiBars: false,
            mirror: 0,
            mode: 8,
            outlineBars: false,
            radial: true,
            showPeaks: true,
            splitGrad: false
        }
    },
    "round": {
        name: "Round Bars by Index",
        options: {
            alphaBars: false,
            channelLayout: "single",
            colorMode: "bar-index",
            gradient: "apple",
            ledBars: false,
            lumiBars: false,
            mirror: 0,
            mode: 10,
            outlineBars: false,
            radial: false,
            reflexRatio: 0,
            roundBars: true,
            showPeaks: false,
            splitGrad: false
        }
    }
};
