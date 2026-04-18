const audio = new Audio();
audio.volume = 0.05;

let audioContext, source, bassFilter, trebleFilter;
let loopA = null, loopB = null;
let showRemainingTime = false;

// Sélections
const playBtn = document.getElementById('play-pause');
const playIcon = document.getElementById('play-icon');
const fileUpload = document.getElementById('file-upload');
const titleDisplay = document.getElementById('title');
const artistDisplay = document.getElementById('artist');
const seekSlider = document.getElementById('seek-slider');
const albumArt = document.getElementById('album-art');
const noCoverText = document.getElementById('no-cover-text');
const abBtn = document.getElementById('ab-loop-btn');
const timeToggleBtn = document.getElementById('time-toggle-btn');
const loudnessBtn = document.getElementById('loudness-btn');
const bypassBtn = document.getElementById('bypass-btn');

const sliders = {
    'bass-slider': { element: document.getElementById('bass-slider'), label: document.getElementById('bass-val'), default: 0, suffix: 'dB' },
    'treble-slider': { element: document.getElementById('treble-slider'), label: document.getElementById('treble-val'), default: 0, suffix: 'dB' },
    'pitch-slider': { element: document.getElementById('pitch-slider'), label: document.getElementById('pitch-val'), default: 1.0, suffix: 'x' }
};

function initAudioEngine() {
    if (audioContext) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    source = audioContext.createMediaElementSource(audio);
    bassFilter = audioContext.createBiquadFilter();
    bassFilter.type = "lowshelf";
    bassFilter.frequency.value = 200;
    trebleFilter = audioContext.createBiquadFilter();
    trebleFilter.type = "highshelf";
    trebleFilter.frequency.value = 3000;
    source.connect(bassFilter);
    bassFilter.connect(trebleFilter);
    trebleFilter.connect(audioContext.destination);
}

// MISE À JOUR FILTRES
function updateFilters() {
    if (!bassFilter || !trebleFilter) return;
    if (bypassBtn.classList.contains('active')) {
        bassFilter.gain.value = 0;
        trebleFilter.gain.value = 0;
    } else {
        let bGain = parseFloat(sliders['bass-slider'].element.value);
        let tGain = parseFloat(sliders['treble-slider'].element.value);
        if (loudnessBtn.classList.contains('active')) { bGain += 12; tGain += 8; }
        bassFilter.gain.value = bGain;
        trebleFilter.gain.value = tGain;
    }
}

// LOGIQUE BOUTONS RST
document.querySelectorAll('.btn-rst').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetId = e.target.getAttribute('data-target');
        const sliderData = sliders[targetId];
        sliderData.element.value = sliderData.default;
        
        // Mise à jour visuelle et sonore
        if (targetId === 'pitch-slider') {
            audio.playbackRate = sliderData.default;
            sliderData.label.innerText = "1.0x";
        } else {
            sliderData.label.innerText = "0dB";
            updateFilters();
        }
    });
});

// ÉVÉNEMENTS EQ/FX
loudnessBtn.addEventListener('click', () => { initAudioEngine(); loudnessBtn.classList.toggle('active'); updateFilters(); });
bypassBtn.addEventListener('click', () => { initAudioEngine(); bypassBtn.classList.toggle('active'); updateFilters(); });

sliders['bass-slider'].element.addEventListener('input', (e) => {
    sliders['bass-slider'].label.innerText = e.target.value + "dB";
    updateFilters();
});
sliders['treble-slider'].element.addEventListener('input', (e) => {
    sliders['treble-slider'].label.innerText = e.target.value + "dB";
    updateFilters();
});
sliders['pitch-slider'].element.addEventListener('input', (e) => {
    audio.playbackRate = e.target.value;
    sliders['pitch-slider'].label.innerText = parseFloat(e.target.value).toFixed(2) + "x";
});

// TEMPS & TRANSPORT
timeToggleBtn.addEventListener('click', () => {
    showRemainingTime = !showRemainingTime;
    timeToggleBtn.classList.toggle('active-time');
});

function formatTime(s) {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec < 10 ? '0' + sec : sec}`;
}

audio.addEventListener('timeupdate', () => {
    if (loopA !== null && loopB !== null && audio.currentTime >= loopB) audio.currentTime = loopA;
    seekSlider.value = (audio.currentTime / audio.duration) * 100 || 0;
    const timeDisplay = document.getElementById('current-time');
    if (showRemainingTime && audio.duration) timeDisplay.innerText = "-" + formatTime(audio.duration - audio.currentTime);
    else timeDisplay.innerText = formatTime(audio.currentTime);
    if(audio.duration) document.getElementById('duration').innerText = formatTime(audio.duration);
});

// CHARGEMENT ET PLAY
document.getElementById('eject-btn').addEventListener('click', () => fileUpload.click());
fileUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        audio.src = URL.createObjectURL(file);
        titleDisplay.innerText = file.name.replace(/\.[^/.]+$/, "");
        artistDisplay.innerText = "";
        if (window.jsmediatags) {
            window.jsmediatags.read(file, {
                onSuccess: (tag) => {
                    const data = tag.tags.picture;
                    if (data) {
                        let base = "";
                        for (let i = 0; i < data.data.length; i++) base += String.fromCharCode(data.data[i]);
                        albumArt.src = "data:" + data.format + ";base64," + window.btoa(base);
                        albumArt.style.display = "block";
                        noCoverText.style.display = "none";
                    } else resetArt();
                },
                onError: () => resetArt()
            });
        }
    }
});

function resetArt() { albumArt.style.display = "none"; noCoverText.style.display = "block"; }

playBtn.addEventListener('click', () => {
    initAudioEngine();
    if (!audio.src) return;
    if (audio.paused) { audio.play(); playIcon.className = "fa-solid fa-pause"; playBtn.classList.add('active-play'); }
    else { audio.pause(); playIcon.className = "fa-solid fa-play"; playBtn.classList.remove('active-play'); }
});

document.getElementById('rewind-btn').addEventListener('click', () => audio.currentTime -= 5);
document.getElementById('forward-btn').addEventListener('click', () => audio.currentTime += 5);
seekSlider.addEventListener('input', (e) => { if (audio.duration) audio.currentTime = audio.duration * (e.target.value / 100); });
document.getElementById('volume-slider').addEventListener('input', (e) => audio.volume = e.target.value);

abBtn.addEventListener('click', () => {
    if (loopA === null) { loopA = audio.currentTime; abBtn.innerText = "A-"; abBtn.classList.add('active-ab'); }
    else if (loopB === null) { loopB = audio.currentTime; abBtn.innerText = "A-B"; }
    else { loopA = null; loopB = null; abBtn.innerText = "A-B"; abBtn.classList.remove('active-ab'); }
});