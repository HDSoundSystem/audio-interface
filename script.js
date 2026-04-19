const audio = new Audio();
audio.volume = 0.05;
audio.crossOrigin = "anonymous";

let playlist = [], currentTrackIndex = 0;
let audioContext, source, bassFilter, trebleFilter;
let loopA = null, loopB = null;
let isShuffle = false, repeatMode = 0, showRemaining = false;

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

// --- GESTION DU TEMPS & SLIDER ---
document.getElementById('time-toggle-btn').onclick = function() {
    showRemaining = !showRemaining;
    this.classList.toggle('active-blue', showRemaining);
};

audio.ontimeupdate = () => {
    if (!audio.duration) return;
    seekSlider.value = (audio.currentTime / audio.duration) * 100;

    const displayTime = showRemaining ? (audio.duration - audio.currentTime) : audio.currentTime;
    const sign = (showRemaining && displayTime > 0) ? "-" : "";
    
    document.getElementById('current-time').innerText = sign + formatTime(displayTime);
    document.getElementById('duration').innerText = formatTime(audio.duration);

    // Boucle A-B
    if (loopA !== null && loopB !== null && audio.currentTime >= loopB) {
        audio.currentTime = loopA;
    }
};

function formatTime(s) {
    if (isNaN(s) || s < 0) return "00:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return (m < 10 ? "0"+m : m) + ":" + (sec < 10 ? "0"+sec : sec);
}

seekSlider.oninput = (e) => {
    audio.currentTime = (e.target.value / 100) * audio.duration;
};

// --- LECTURE & PLAYLIST ---
audio.onended = () => {
    if (repeatMode === 2) { 
        audio.currentTime = 0; 
        audio.play(); 
    } else {
        nextTrack();
    }
};

function nextTrack() {
    if (playlist.length === 0) return;
    let index = isShuffle ? Math.floor(Math.random() * playlist.length) : currentTrackIndex + 1;
    if (index < playlist.length || repeatMode === 1) {
        loadTrack(index % playlist.length);
    } else {
        playIcon.className = "fa-solid fa-play";
    }
}

function loadTrack(index) {
    if (!playlist[index]) return;
    initAudio();
    resetAB(); // Reset A-B à chaque nouvelle piste
    
    currentTrackIndex = index;
    const file = playlist[index];
    
    document.getElementById('file-format').innerText = file.name.split('.').pop().toUpperCase();
    audio.src = URL.createObjectURL(file);
    
    audio.onloadedmetadata = () => {
        const kbps = Math.round((file.size * 8) / audio.duration / 1000);
        document.getElementById('file-bitrate').innerText = kbps + " KBPS";
    };

    // Mise à jour visuelle playlist
    document.querySelectorAll('#playlist-ul li').forEach((li, i) => {
        li.className = (i === index) ? 'active-track' : '';
    });

    // Tags & Cover
    if (window.jsmediatags) {
        window.jsmediatags.read(file, {
            onSuccess: (tag) => {
                const { title, artist, album, picture } = tag.tags;
                metaDisplay.innerText = `${title || file.name.split('.')[0]} - ${artist || "Artiste"}`;
                if (picture) {
                    let b64 = ""; 
                    for (let i = 0; i < picture.data.length; i++) b64 += String.fromCharCode(picture.data[i]);
                    document.getElementById('album-art').src = `data:${picture.format};base64,${window.btoa(b64)}`;
                    document.getElementById('album-art').style.display = "block";
                    document.getElementById('no-cover-text').style.display = "none";
                } else {
                    resetCoverUI();
                }
            },
            onError: () => { 
                metaDisplay.innerText = file.name; 
                resetCoverUI(); 
            }
        });
    }
    audio.play();
    playIcon.className = "fa-solid fa-pause";
}

// --- FONCTION A-B ---
document.getElementById('ab-loop-btn').onclick = function() {
    const badge = document.getElementById('ab-status-badge');
    if (loopA === null) {
        loopA = audio.currentTime;
        this.classList.add('active-ab-a');
        this.innerText = "A-";
    } else if (loopB === null) {
        loopB = audio.currentTime;
        this.classList.remove('active-ab-a');
        this.classList.add('active-ab-b');
        this.innerText = "A-B";
        badge.style.display = "block";
    } else {
        resetAB();
    }
};

function resetAB() {
    loopA = null; loopB = null;
    const btn = document.getElementById('ab-loop-btn');
    btn.classList.remove('active-ab-a', 'active-ab-b');
    btn.innerText = "A-B";
    document.getElementById('ab-status-badge').style.display = "none";
}

// --- MIXER & FILTRES ---
function updateFilters() {
    if (!bassFilter) return;
    const bypassed = document.getElementById('bypass-btn').classList.contains('active-danger');
    let b = bypassed ? 0 : parseFloat(document.getElementById('bass-slider').value);
    let t = bypassed ? 0 : parseFloat(document.getElementById('treble-slider').value);
    
    // Si Loudness est bleu, on booste
    if (!bypassed && document.getElementById('loudness-btn').classList.contains('active-blue')) {
        b += 12; t += 8;
    }
    bassFilter.gain.value = b;
    trebleFilter.gain.value = t;
}

document.getElementById('loudness-btn').onclick = function() {
    this.classList.toggle('active-blue');
    updateFilters();
};

document.getElementById('mute-btn').onclick = function() {
    audio.muted = !audio.muted;
    this.classList.toggle('active-danger', audio.muted);
};

document.getElementById('bypass-btn').onclick = function() {
    this.classList.toggle('active-danger');
    updateFilters();
};

// --- RÉGLAGES STANDARDS ---
document.getElementById('volume-slider').oninput = (e) => {
    audio.volume = e.target.value;
    document.getElementById('val-volume').innerText = Math.round(e.target.value * 100) + "%";
};
document.getElementById('bass-slider').oninput = (e) => {
    updateFilters();
    document.getElementById('val-bass').innerText = e.target.value + "dB";
};
document.getElementById('treble-slider').oninput = (e) => {
    updateFilters();
    document.getElementById('val-treble').innerText = e.target.value + "dB";
};
document.getElementById('pitch-slider').oninput = (e) => {
    audio.playbackRate = e.target.value;
    document.getElementById('val-pitch').innerText = Math.round(e.target.value * 100) + "%";
};

// --- NAVIGATION BASIQUE ---
document.getElementById('play-pause').onclick = () => {
    initAudio();
    if (audioContext.state === 'suspended') audioContext.resume();
    if (audio.paused) { audio.play(); playIcon.className = "fa-solid fa-pause"; }
    else { audio.pause(); playIcon.className = "fa-solid fa-play"; }
};

document.getElementById('prev-btn').onclick = () => loadTrack(Math.max(0, currentTrackIndex - 1));
document.getElementById('next-btn').onclick = nextTrack;
document.getElementById('rewind-btn').onclick = () => audio.currentTime -= 10;
document.getElementById('forward-btn').onclick = () => audio.currentTime += 10;

document.getElementById('repeat-btn').onclick = function() {
    repeatMode = (repeatMode + 1) % 3;
    this.classList.toggle('active-blue', repeatMode > 0);
};

document.getElementById('shuffle-btn').onclick = function() {
    isShuffle = !isShuffle;
    this.classList.toggle('active-blue', isShuffle);
};

// --- UI & MODALE ---
document.getElementById('art-trigger').onclick = () => {
    const modal = document.getElementById('modal-overlay');
    document.getElementById('modal-img').src = document.getElementById('album-art').src;
    modal.style.display = 'flex';
};
document.getElementById('close-modal').onclick = () => {
    document.getElementById('modal-overlay').style.display = 'none';
};

document.getElementById('file-upload').onchange = (e) => {
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
};

document.getElementById('eject-btn').onclick = () => document.getElementById('file-upload').click();

function resetCoverUI() {
    document.getElementById('album-art').style.display = "none";
    document.getElementById('no-cover-text').style.display = "block";
}

document.querySelectorAll('.btn-rst[data-target]').forEach(btn => {
    btn.onclick = () => {
        const t = document.getElementById(btn.dataset.target);
        t.value = btn.dataset.target === 'pitch-slider' ? 1 : 0;
        t.dispatchEvent(new Event('input'));
    };
});