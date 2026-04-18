// Register Service Worker pour PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').catch(err => console.log(err));
    });
}

const audio = new Audio();
audio.volume = 0.05;
let playlist = [];
let currentTrackIndex = 0;
let audioContext, source, bassFilter, trebleFilter;
let loopA = null, loopB = null;
let showRemaining = false, isShuffle = false, repeatMode = 0; 

const playIcon = document.getElementById('play-icon');
const metaDisplay = document.getElementById('display-meta');
const seekSlider = document.getElementById('seek-slider');

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
    if (document.getElementById('bypass-btn').classList.contains('active-danger')) {
        bassFilter.gain.value = 0; trebleFilter.gain.value = 0;
    } else {
        let b = parseFloat(document.getElementById('bass-slider').value);
        let t = parseFloat(document.getElementById('treble-slider').value);
        if (document.getElementById('loudness-btn').classList.contains('active')) { b += 12; t += 8; }
        bassFilter.gain.value = b; trebleFilter.gain.value = t;
    }
}

function updateMediaSession(t, a, alb, art) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: t, artist: a, album: alb,
            artwork: art ? [{ src: art, sizes: '512x512', type: 'image/png' }] : []
        });
        navigator.mediaSession.setActionHandler('play', () => togglePlay());
        navigator.mediaSession.setActionHandler('pause', () => togglePlay());
        navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
        navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
    }
}

function loadTrack(index) {
    if (!playlist[index]) return;
    currentTrackIndex = index;
    const file = playlist[index];
    audio.src = URL.createObjectURL(file);
    
    // Update Sidebar visual
    document.querySelectorAll('#playlist-ul li').forEach((li, i) => {
        li.className = (i === index) ? 'active-track' : '';
    });

    if (window.jsmediatags) {
        window.jsmediatags.read(file, {
            onSuccess: (tag) => {
                const { title, artist, album, picture } = tag.tags;
                const t = title || file.name.split('.')[0];
                const art = artist || "Inconnu";
                const alb = album || "Mixer";
                metaDisplay.innerText = `${t} - ${alb} - ${art}`;
                
                let artworkUrl = "";
                if (picture) {
                    let b64 = "";
                    for (let i = 0; i < picture.data.length; i++) b64 += String.fromCharCode(picture.data[i]);
                    artworkUrl = "data:" + picture.format + ";base64," + window.btoa(b64);
                    document.getElementById('album-art').src = artworkUrl;
                    document.getElementById('album-art').style.display = "block";
                    document.getElementById('no-cover-text').style.display = "none";
                } else { resetCover(); }
                updateMediaSession(t, art, alb, artworkUrl);
            },
            onError: () => { metaDisplay.innerText = file.name; resetCover(); }
        });
    }
    audio.play();
    playIcon.className = "fa-solid fa-pause";
}

function resetCover() {
    document.getElementById('album-art').style.display = "none";
    document.getElementById('no-cover-text').style.display = "block";
}

function togglePlay() {
    initAudio();
    if (audio.paused) { audio.play(); playIcon.className = "fa-solid fa-pause"; }
    else { audio.pause(); playIcon.className = "fa-solid fa-play"; }
}

function nextTrack() {
    if (isShuffle) {
        loadTrack(Math.floor(Math.random() * playlist.length));
    } else if (currentTrackIndex < playlist.length - 1) {
        loadTrack(currentTrackIndex + 1);
    } else if (repeatMode === 1) {
        loadTrack(0);
    }
}

function prevTrack() {
    if (currentTrackIndex > 0) loadTrack(currentTrackIndex - 1);
}

// Events
document.getElementById('file-upload').addEventListener('change', (e) => {
    playlist = Array.from(e.target.files);
    const ul = document.getElementById('playlist-ul');
    ul.innerHTML = "";
    playlist.forEach((f, i) => {
        const li = document.createElement('li');
        li.innerText = f.name.split('.')[0];
        li.onclick = () => loadTrack(i);
        ul.appendChild(li);
    });
    if (playlist.length > 0) loadTrack(0);
});

document.getElementById('play-pause').onclick = togglePlay;
document.getElementById('next-btn').onclick = nextTrack;
document.getElementById('prev-btn').onclick = prevTrack;
document.getElementById('rewind-btn').onclick = () => audio.currentTime -= 10;
document.getElementById('forward-btn').onclick = () => audio.currentTime += 10;

document.getElementById('shuffle-btn').onclick = function() {
    isShuffle = !isShuffle;
    this.classList.toggle('active-blue', isShuffle);
};

document.getElementById('repeat-btn').onclick = function() {
    repeatMode = (repeatMode + 1) % 3;
    const icon = this.querySelector('i');
    this.classList.toggle('active-blue', repeatMode > 0);
    icon.className = repeatMode === 2 ? "fa-solid fa-arrows-rotate" : "fa-solid fa-repeat";
};

audio.ontimeupdate = () => {
    if (loopA !== null && loopB !== null && audio.currentTime >= loopB) audio.currentTime = loopA;
    seekSlider.value = (audio.currentTime / audio.duration) * 100 || 0;
    const time = showRemaining ? audio.currentTime - audio.duration : audio.currentTime;
    document.getElementById('current-time').innerText = formatTime(time);
    document.getElementById('duration').innerText = formatTime(audio.duration);
};

audio.onended = () => {
    if (repeatMode === 2) loadTrack(currentTrackIndex);
    else nextTrack();
};

function formatTime(s) {
    if (isNaN(s)) return "00:00";
    const m = Math.floor(Math.abs(s) / 60);
    const sec = Math.floor(Math.abs(s) % 60);
    return (s < 0 ? "-" : "") + (m < 10 ? "0" + m : m) + ":" + (sec < 10 ? "0" + sec : sec);
}

// Mixeur
document.getElementById('volume-slider').oninput = (e) => audio.volume = e.target.value;
document.getElementById('bass-slider').oninput = updateFilters;
document.getElementById('treble-slider').oninput = updateFilters;
document.getElementById('pitch-slider').oninput = (e) => audio.playbackRate = e.target.value;
seekSlider.oninput = (e) => audio.currentTime = (e.target.value / 100) * audio.duration;

document.getElementById('mute-btn').onclick = function() { this.classList.toggle('active-danger'); audio.muted = !audio.muted; };
document.getElementById('bypass-btn').onclick = function() { this.classList.toggle('active-danger'); updateFilters(); };
document.getElementById('loudness-btn').onclick = function() { this.classList.toggle('active'); updateFilters(); };
document.getElementById('time-toggle-btn').onclick = function() { showRemaining = !showRemaining; this.classList.toggle('active-danger-text'); };

document.getElementById('ab-loop-btn').onclick = function() {
    if (loopA === null) { loopA = audio.currentTime; this.classList.add('active-danger-text'); }
    else if (loopB === null) { loopB = audio.currentTime; }
    else { loopA = null; loopB = null; this.classList.remove('active-danger-text'); }
};

document.getElementById('eject-btn').onclick = () => document.getElementById('file-upload').click();

// RST
document.querySelectorAll('.btn-rst[data-target]').forEach(btn => {
    btn.onclick = () => {
        const t = document.getElementById(btn.dataset.target);
        t.value = btn.dataset.target === 'pitch-slider' ? 1 : 0;
        t.dispatchEvent(new Event('input'));
    };
});