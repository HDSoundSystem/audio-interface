const audio = new Audio();
audio.volume = 0.05;

let audioContext, source, bassFilter, trebleFilter;
let loopA = null, loopB = null;
let showRemainingTime = false; // Pour l'horloge

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

// LOGIQUE LOUDNESS (Boost Low et High simultanément)
loudnessBtn.addEventListener('click', () => {
    initAudioEngine();
    loudnessBtn.classList.toggle('active');
    if (loudnessBtn.classList.contains('active')) {
        loudnessBtn.innerText = "ON";
        bassFilter.gain.value += 12;
        trebleFilter.gain.value += 8;
    } else {
        loudnessBtn.innerText = "OFF";
        bassFilter.gain.value = document.getElementById('bass-slider').value;
        trebleFilter.gain.value = document.getElementById('treble-slider').value;
    }
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
    if (loopA !== null && loopB !== null && audio.currentTime >= loopB) {
        audio.currentTime = loopA;
    }
    
    seekSlider.value = (audio.currentTime / audio.duration) * 100 || 0;
    
    const timeDisplay = document.getElementById('current-time');
    if (showRemainingTime && audio.duration) {
        timeDisplay.innerText = "-" + formatTime(audio.duration - audio.currentTime);
    } else {
        timeDisplay.innerText = formatTime(audio.currentTime);
    }

    if(audio.duration) {
        document.getElementById('duration').innerText = formatTime(audio.duration);
    }
});

// CHARGEMENT FICHIER
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
                    } else { resetArt(); }
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

// CONTROLES STANDARDS
document.getElementById('rewind-btn').addEventListener('click', () => audio.currentTime -= 5);
document.getElementById('forward-btn').addEventListener('click', () => audio.currentTime += 5);
seekSlider.addEventListener('input', (e) => { if (audio.duration) audio.currentTime = audio.duration * (e.target.value / 100); });
document.getElementById('volume-slider').addEventListener('input', (e) => audio.volume = e.target.value);

document.getElementById('bass-slider').addEventListener('input', (e) => {
    if (bassFilter && !loudnessBtn.classList.contains('active')) bassFilter.gain.value = e.target.value;
    document.getElementById('bass-val').innerText = e.target.value + "dB";
});

document.getElementById('treble-slider').addEventListener('input', (e) => {
    if (trebleFilter && !loudnessBtn.classList.contains('active')) trebleFilter.gain.value = e.target.value;
    document.getElementById('treble-val').innerText = e.target.value + "dB";
});

document.getElementById('pitch-slider').addEventListener('input', (e) => {
    audio.playbackRate = e.target.value;
    document.getElementById('pitch-val').innerText = parseFloat(e.target.value).toFixed(2) + "x";
});

abBtn.addEventListener('click', () => {
    if (loopA === null) { loopA = audio.currentTime; abBtn.innerText = "A-"; abBtn.classList.add('active-ab'); }
    else if (loopB === null) { loopB = audio.currentTime; abBtn.innerText = "A-B"; }
    else { loopA = null; loopB = null; abBtn.innerText = "A-B"; abBtn.classList.remove('active-ab'); }
});