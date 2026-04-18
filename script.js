const audio = new Audio();
audio.volume = 0.05;
let prevVol = 0.05;
let audioContext, source, bassFilter, trebleFilter;
let loopA = null, loopB = null, showRemaining = false;

const playIcon = document.getElementById('play-icon');
const seekSlider = document.getElementById('seek-slider');
const curTimeDisplay = document.getElementById('current-time');
const durationDisplay = document.getElementById('duration');
const metaDisplay = document.getElementById('display-meta');

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

function formatTime(s) {
    if (isNaN(s)) return "00:00";
    const m = Math.floor(Math.abs(s) / 60);
    const sec = Math.floor(Math.abs(s) % 60);
    return (s < 0 ? "-" : "") + (m < 10 ? "0" + m : m) + ":" + (sec < 10 ? "0" + sec : sec);
}

document.getElementById('file-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        audio.src = URL.createObjectURL(file);
        let title = file.name.split('.')[0];
        let album = "";
        let artist = "";

        if (window.jsmediatags) {
            window.jsmediatags.read(file, {
                onSuccess: (tag) => {
                    const t = tag.tags;
                    title = t.title || title;
                    album = t.album || "";
                    artist = t.artist || "";
                    let info = title;
                    if(album) info += " - " + album;
                    if(artist) info += " - " + artist;
                    metaDisplay.innerText = info;
                    const data = t.picture;
                    if (data) {
                        let base64 = "";
                        for (let i = 0; i < data.data.length; i++) base64 += String.fromCharCode(data.data[i]);
                        document.getElementById('album-art').src = "data:" + data.format + ";base64," + window.btoa(base64);
                        document.getElementById('album-art').style.display = "block";
                        document.getElementById('no-cover-text').style.display = "none";
                    } else { resetCover(); }
                },
                onError: () => { metaDisplay.innerText = title; resetCover(); }
            });
        }
    }
});

function resetCover() {
    document.getElementById('album-art').style.display = "none";
    document.getElementById('no-cover-text').style.display = "block";
}

audio.addEventListener('timeupdate', () => {
    if (loopA !== null && loopB !== null && audio.currentTime >= loopB) audio.currentTime = loopA;
    if (audio.duration) seekSlider.value = (audio.currentTime / audio.duration) * 100;
    curTimeDisplay.innerText = showRemaining && audio.duration ? formatTime(audio.currentTime - audio.duration) : formatTime(audio.currentTime);
    if (audio.duration) durationDisplay.innerText = formatTime(audio.duration);
});

seekSlider.addEventListener('input', () => {
    if (audio.duration) audio.currentTime = (seekSlider.value / 100) * audio.duration;
});

document.getElementById('rewind-btn').addEventListener('click', () => audio.currentTime -= 5);
document.getElementById('forward-btn').addEventListener('click', () => audio.currentTime += 5);

document.getElementById('play-pause').addEventListener('click', function() {
    initAudio(); if (!audio.src) return;
    if (audio.paused) { audio.play(); playIcon.className = "fa-solid fa-pause"; }
    else { audio.pause(); playIcon.className = "fa-solid fa-play"; }
});

document.getElementById('mute-btn').addEventListener('click', function() {
    this.classList.toggle('active-mute');
    if (this.classList.contains('active-mute')) { prevVol = audio.volume; audio.volume = 0; }
    else { audio.volume = prevVol; }
    document.getElementById('volume-slider').value = audio.volume;
});

document.querySelectorAll('.btn-rst[data-target]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const target = e.target.dataset.target;
        const slider = document.getElementById(target);
        slider.value = (target === 'pitch-slider') ? 1 : 0;
        if (target === 'pitch-slider') {
            audio.playbackRate = 1; document.getElementById('pitch-val').innerText = "1.0x";
        } else {
            document.getElementById(target.replace('slider', 'val')).innerText = "0dB";
            updateFilters();
        }
    });
});

document.getElementById('volume-slider').addEventListener('input', (e) => audio.volume = e.target.value);
document.getElementById('bass-slider').addEventListener('input', (e) => { document.getElementById('bass-val').innerText = e.target.value + "dB"; updateFilters(); });
document.getElementById('treble-slider').addEventListener('input', (e) => { document.getElementById('treble-val').innerText = e.target.value + "dB"; updateFilters(); });
document.getElementById('pitch-slider').addEventListener('input', (e) => { audio.playbackRate = e.target.value; document.getElementById('pitch-val').innerText = parseFloat(e.target.value).toFixed(1) + "x"; });

document.getElementById('loudness-btn').addEventListener('click', function() { this.classList.toggle('active'); updateFilters(); });
document.getElementById('bypass-btn').addEventListener('click', function() { this.classList.toggle('active'); updateFilters(); });
document.getElementById('time-toggle-btn').addEventListener('click', function() { showRemaining = !showRemaining; this.classList.toggle('active-time'); });

document.getElementById('ab-loop-btn').addEventListener('click', function() {
    if (loopA === null) { 
        loopA = audio.currentTime; this.innerText = "A-"; this.classList.add('active-time');
    } else if (loopB === null) { 
        loopB = audio.currentTime; this.innerText = "A-B"; 
    } else { 
        loopA = null; loopB = null; this.innerText = "A-B"; this.classList.remove('active-time');
    }
});

document.getElementById('eject-btn').addEventListener('click', () => document.getElementById('file-upload').click());