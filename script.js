const audio = new Audio();
audio.volume = 0.05;
let prevVol = 0.05;
let audioContext, source, bassFilter, trebleFilter;
let loopA = null, loopB = null, showRemaining = false;

// Initialisation Audio
function initAudio() {
    if (audioContext) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    source = audioContext.createMediaElementSource(audio);
    bassFilter = audioContext.createBiquadFilter();
    bassFilter.type = "lowshelf"; bassFilter.frequency.value = 200;
    trebleFilter = audioContext.createBiquadFilter();
    trebleFilter.type = "highshelf"; trebleFilter.frequency.value = 3000;
    source.connect(bassFilter); bassFilter.connect(trebleFilter);
    trebleFilter.connect(audioContext.destination);
}

function updateFilters() {
    if (!bassFilter) return;
    if (document.getElementById('bypass-btn').classList.contains('active')) {
        bassFilter.gain.value = 0; trebleFilter.gain.value = 0;
    } else {
        let b = parseFloat(document.getElementById('bass-slider').value);
        let t = parseFloat(document.getElementById('treble-slider').value);
        if (document.getElementById('loudness-btn').classList.contains('active')) { b += 12; t += 8; }
        bassFilter.gain.value = b; trebleFilter.gain.value = t;
    }
}

// MUTE
document.getElementById('mute-btn').addEventListener('click', function() {
    this.classList.toggle('active-mute');
    if (this.classList.contains('active-mute')) {
        prevVol = audio.volume; audio.volume = 0;
    } else { audio.volume = prevVol; }
    document.getElementById('volume-slider').value = audio.volume;
});

// RST
document.querySelectorAll('.btn-rst[data-target]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const target = e.target.dataset.target;
        const slider = document.getElementById(target);
        if (target === 'pitch-slider') {
            slider.value = 1; audio.playbackRate = 1;
            document.getElementById('pitch-val').innerText = "1.0x";
        } else {
            slider.value = 0;
            document.getElementById(target.replace('slider', 'val')).innerText = "0dB";
            updateFilters();
        }
    });
});

// TEMPS
document.getElementById('time-toggle-btn').addEventListener('click', function() {
    showRemaining = !showRemaining;
    this.classList.toggle('active-time');
});

function formatTime(s) {
    const m = Math.floor(Math.abs(s) / 60);
    const sec = Math.floor(Math.abs(s) % 60);
    return (s < 0 ? "-" : "") + m + ":" + (sec < 10 ? "0" + sec : sec);
}

audio.addEventListener('timeupdate', () => {
    if (loopA !== null && loopB !== null && audio.currentTime >= loopB) audio.currentTime = loopA;
    document.getElementById('seek-slider').value = (audio.currentTime / audio.duration) * 100 || 0;
    const curTime = document.getElementById('current-time');
    curTime.innerText = showRemaining && audio.duration ? formatTime(audio.currentTime - audio.duration) : formatTime(audio.currentTime);
    if (audio.duration) document.getElementById('duration').innerText = formatTime(audio.duration);
});

// LECTURE / FILE
document.getElementById('play-pause').addEventListener('click', function() {
    initAudio(); if (!audio.src) return;
    if (audio.paused) { audio.play(); document.getElementById('play-icon').className = "fa-solid fa-pause"; }
    else { audio.pause(); document.getElementById('play-icon').className = "fa-solid fa-play"; }
});

document.getElementById('eject-btn').addEventListener('click', () => document.getElementById('file-upload').click());
document.getElementById('file-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        audio.src = URL.createObjectURL(file);
        document.getElementById('title').innerText = file.name.split('.')[0];
        // Note: L'extraction de pochette (jsmediatags) peut être réajoutée ici si besoin
    }
});

// EVENTS SLIDERS
document.getElementById('volume-slider').addEventListener('input', (e) => audio.volume = e.target.value);
document.getElementById('bass-slider').addEventListener('input', (e) => {
    document.getElementById('bass-val').innerText = e.target.value + "dB"; updateFilters();
});
document.getElementById('treble-slider').addEventListener('input', (e) => {
    document.getElementById('treble-val').innerText = e.target.value + "dB"; updateFilters();
});
document.getElementById('pitch-slider').addEventListener('input', (e) => {
    audio.playbackRate = e.target.value;
    document.getElementById('pitch-val').innerText = parseFloat(e.target.value).toFixed(1) + "x";
});
document.getElementById('loudness-btn').addEventListener('click', function() { this.classList.toggle('active'); updateFilters(); });
document.getElementById('bypass-btn').addEventListener('click', function() { this.classList.toggle('active'); updateFilters(); });

document.getElementById('ab-loop-btn').addEventListener('click', function() {
    if (loopA === null) { loopA = audio.currentTime; this.innerText = "A-"; }
    else if (loopB === null) { loopB = audio.currentTime; this.innerText = "A-B"; }
    else { loopA = null; loopB = null; this.innerText = "A-B"; }
});