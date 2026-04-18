const audio = new Audio();
audio.volume = 0.05; // Volume initial 5%

let audioContext, source, bassFilter, trebleFilter;
let loopA = null;
let loopB = null;

// Éléments UI
const playBtn = document.getElementById('play-pause');
const playIcon = document.getElementById('play-icon');
const fileUpload = document.getElementById('file-upload');
const titleDisplay = document.getElementById('title');
const artistDisplay = document.getElementById('artist');
const seekSlider = document.getElementById('seek-slider');
const albumArt = document.getElementById('album-art');
const noCoverText = document.getElementById('no-cover-text');
const abBtn = document.getElementById('ab-loop-btn');

// Initialisation Audio Engine
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

// Chargement fichier
document.getElementById('eject-btn').addEventListener('click', () => fileUpload.click());

fileUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        audio.src = URL.createObjectURL(file);
        titleDisplay.innerText = file.name.replace(/\.[^/.]+$/, "");
        artistDisplay.innerText = ""; // Supprime le texte d'instruction

        // Extraction de la pochette
        if (window.jsmediatags) {
            window.jsmediatags.read(file, {
                onSuccess: function(tag) {
                    const data = tag.tags.picture;
                    if (data) {
                        let base64String = "";
                        for (let i = 0; i < data.data.length; i++) base64String += String.fromCharCode(data.data[i]);
                        albumArt.src = "data:" + data.format + ";base64," + window.btoa(base64String);
                        albumArt.style.display = "block";
                        noCoverText.style.display = "none";
                    } else { resetArt(); }
                },
                onError: function() { resetArt(); }
            });
        }
    }
});

function resetArt() {
    albumArt.style.display = "none";
    noCoverText.style.display = "block";
}

// Transport
playBtn.addEventListener('click', () => {
    initAudioEngine();
    if (!audio.src) return;
    if (audio.paused) {
        audio.play();
        playIcon.className = "fa-solid fa-pause";
        playBtn.classList.add('active-play');
    } else {
        audio.pause();
        playIcon.className = "fa-solid fa-play";
        playBtn.classList.remove('active-play');
    }
});

document.getElementById('rewind-btn').addEventListener('click', () => audio.currentTime -= 5);
document.getElementById('forward-btn').addEventListener('click', () => audio.currentTime += 5);

// Boucle A-B
abBtn.addEventListener('click', () => {
    if (loopA === null) {
        loopA = audio.currentTime;
        abBtn.innerText = "A-";
        abBtn.classList.add('active-ab');
    } else if (loopB === null) {
        loopB = audio.currentTime;
        abBtn.innerText = "A-B";
    } else {
        loopA = null; loopB = null;
        abBtn.innerText = "A-B";
        abBtn.classList.remove('active-ab');
    }
});

// Update
audio.addEventListener('timeupdate', () => {
    if (loopA !== null && loopB !== null && audio.currentTime >= loopB) {
        audio.currentTime = loopA;
    }
    const progress = (audio.currentTime / audio.duration) * 100 || 0;
    seekSlider.value = progress;
    
    const curMins = Math.floor(audio.currentTime / 60);
    const curSecs = Math.floor(audio.currentTime % 60);
    document.getElementById('current-time').innerText = `${curMins}:${curSecs < 10 ? '0'+curSecs : curSecs}`;
    
    if(audio.duration) {
        const durMins = Math.floor(audio.duration / 60);
        const durSecs = Math.floor(audio.duration % 60);
        document.getElementById('duration').innerText = `${durMins}:${durSecs < 10 ? '0'+durSecs : durSecs}`;
    }
});

seekSlider.addEventListener('input', (e) => {
    if (audio.duration) audio.currentTime = audio.duration * (e.target.value / 100);
});

// Mixer
document.getElementById('volume-slider').addEventListener('input', (e) => audio.volume = e.target.value);
document.getElementById('bass-slider').addEventListener('input', (e) => {
    if (bassFilter) bassFilter.gain.value = e.target.value;
    document.getElementById('bass-val').innerText = e.target.value + "dB";
});
document.getElementById('treble-slider').addEventListener('input', (e) => {
    if (trebleFilter) trebleFilter.gain.value = e.target.value;
    document.getElementById('treble-val').innerText = e.target.value + "dB";
});
document.getElementById('pitch-slider').addEventListener('input', (e) => {
    audio.playbackRate = e.target.value;
    document.getElementById('pitch-val').innerText = parseFloat(e.target.value).toFixed(2) + "x";
});