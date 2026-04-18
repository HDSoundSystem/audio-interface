const audio = new Audio();
audio.volume = 0.05; // Initialisation 5%

let audioContext, source, bassFilter, trebleFilter;

const playBtn = document.getElementById('play-pause');
const playIcon = document.getElementById('play-icon');
const fileUpload = document.getElementById('file-upload');
const titleDisplay = document.getElementById('title');
const artistDisplay = document.getElementById('artist');
const seekSlider = document.getElementById('seek-slider');
const albumArt = document.getElementById('album-art');
const noCoverText = document.getElementById('no-cover-text');

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

document.getElementById('eject-btn').addEventListener('click', () => fileUpload.click());

fileUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        audio.src = URL.createObjectURL(file);
        titleDisplay.innerText = file.name.replace(/\.[^/.]+$/, "");
        artistDisplay.innerText = ""; 

        // Tenter d'extraire la pochette avec jsmediatags
        if (window.jsmediatags) {
            window.jsmediatags.read(file, {
                onSuccess: function(tag) {
                    const data = tag.tags.picture;
                    if (data) {
                        let base64String = "";
                        for (let i = 0; i < data.data.length; i++) {
                            base64String += String.fromCharCode(data.data[i]);
                        }
                        const base64 = "data:" + data.format + ";base64," + window.btoa(base64String);
                        albumArt.src = base64;
                        albumArt.style.display = "block";
                        noCoverText.style.display = "none";
                    } else {
                        resetArt();
                    }
                },
                onError: function(error) {
                    resetArt();
                }
            });
        } else {
            resetArt();
        }

        playIcon.className = "fa-solid fa-play";
        playBtn.classList.remove('active-play');
    }
});

function resetArt() {
    albumArt.style.display = "none";
    albumArt.src = "";
    noCoverText.style.display = "block";
}

playBtn.addEventListener('click', () => {
    initAudioEngine();
    if (!audio.src) return alert("Chargez un morceau via Eject");
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

// Barre de temps
audio.addEventListener('timeupdate', () => {
    seekSlider.value = (audio.currentTime / audio.duration) * 100 || 0;
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