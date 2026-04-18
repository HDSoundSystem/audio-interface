const audio = new Audio();
audio.volume = 0.05;

let audioContext, source, bassFilter, trebleFilter;
let loopA = null, loopB = null;
let showRemainingTime = false;

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

const bassSlider = document.getElementById('bass-slider');
const trebleSlider = document.getElementById('treble-slider');

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

// MISE À JOUR FILTRES (Calcul centralisé pour Bypass/Loudness)
function updateFilters() {
    if (!bassFilter || !trebleFilter) return;

    if (bypassBtn.classList.contains('active')) {
        // Mode BYPASS : On remet tout à zéro sans toucher aux sliders
        bassFilter.gain.value = 0;
        trebleFilter.gain.value = 0;
    } else {
        let bGain = parseFloat(bassSlider.value);
        let tGain = parseFloat(trebleSlider.value);

        if (loudnessBtn.classList.contains('active')) {
            bGain += 12; // Boost Loudness
            tGain += 8;
        }

        bassFilter.gain.value = bGain;
        trebleFilter.gain.value = tGain;
    }
}

// ÉVÉNEMENTS BOUTONS
loudnessBtn.addEventListener('click', () => {
    initAudioEngine();
    loudnessBtn.classList.toggle('active');
    updateFilters();
});

bypassBtn.addEventListener('click', () => {
    initAudioEngine();
    bypassBtn.classList.toggle('active');
    updateFilters();
});

bassSlider.addEventListener('input', (e) => {
    document.getElementById('bass-val').innerText = e.target.value + "dB";
    updateFilters();
});

trebleSlider.addEventListener('input', (e) => {
    document.getElementById('treble-val').innerText = e.target.value + "dB";
    updateFilters();
});

// LOGIQUE TEMPS RESTANT
timeToggleBtn.addEventListener('click', () => {
    showRemainingTime = !showRemainingTime;
    timeToggleBtn.classList.toggle('active-time');
});

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' + s : s}`;
}

audio.addEventListener('timeupdate', () => {
    if (loopA !== null && loopB !== null && audio.currentTime >= loopB) audio.currentTime = loopA;
    seekSlider.value = (audio.currentTime / audio.duration) * 100 || 0;
    const timeDisplay = document.getElementById('current-time');
    if (showRemainingTime && audio.duration) timeDisplay.innerText = "-" + formatTime(audio.duration - audio.currentTime);
    else timeDisplay.innerText = formatTime(audio.currentTime);
    if(audio.duration) document.getElementById('duration').innerText = formatTime(audio.duration);
});

// CHARGEMENT ET TRANSPORT (Standard)
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

document.getElementById('pitch-slider').addEventListener('input', (e) => {
    audio.playbackRate = e.target.value;
    document.getElementById('pitch-val').innerText = parseFloat(e.target.value).toFixed(2) + "x";
});

abBtn.addEventListener('click', () => {
    if (loopA === null) { loopA = audio.currentTime; abBtn.innerText = "A-"; abBtn.classList.add('active-ab'); }
    else if (loopB === null) { loopB = audio.currentTime; abBtn.innerText = "A-B"; }
    else { loopA = null; loopB = null; abBtn.innerText = "A-B"; abBtn.classList.remove('active-ab'); }
});