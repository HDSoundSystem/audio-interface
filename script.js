/**
 * CONFIGURATION ET VARIABLES
 */
const audio = new Audio();
audio.volume = 0.05; 
audio.crossOrigin = "anonymous";

let playlist = [];
let currentTrackIndex = 0;
let audioContext, source, bassFilter, trebleFilter;

// États des modes
let loopA = null, loopB = null;
let showRemaining = false; 
let isShuffle = false; 
let repeatMode = 0; // 0: Off, 1: Repeat All, 2: Repeat One

const playIcon = document.getElementById('play-icon');
const metaDisplay = document.getElementById('display-meta');
const seekSlider = document.getElementById('seek-slider');
const modal = document.getElementById('modal-overlay');

/**
 * INITIALISATION AUDIO (WEB AUDIO API)
 */
function initAudio() {
    if (audioContext) return;
    try {
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
    } catch (e) { console.error("Audio Context Error:", e); }
}

function updateFilters() {
    if (!bassFilter || !trebleFilter) return;
    const isBypassed = document.getElementById('bypass-btn').classList.contains('active-danger');
    if (isBypassed) {
        bassFilter.gain.value = 0; 
        trebleFilter.gain.value = 0;
    } else {
        let b = parseFloat(document.getElementById('bass-slider').value);
        let t = parseFloat(document.getElementById('treble-slider').value);
        if (document.getElementById('loudness-btn').classList.contains('active')) { b += 12; t += 8; }
        bassFilter.gain.value = b; 
        trebleFilter.gain.value = t;
    }
}

/**
 * LOGIQUE DE LECTURE
 */
function loadTrack(index) {
    if (playlist.length === 0) return;
    initAudio();
    
    // Reset de la boucle A-B lors d'un changement de morceau
    resetABLoop();

    currentTrackIndex = index;
    const file = playlist[index];
    audio.src = URL.createObjectURL(file);
    
    // UI Playlist
    document.querySelectorAll('#playlist-ul li').forEach((li, i) => {
        li.className = (i === index) ? 'active-track' : '';
    });
    
    // Tags ID3
    if (window.jsmediatags) {
        window.jsmediatags.read(file, {
            onSuccess: (tag) => {
                const { title, artist, album, picture } = tag.tags;
                metaDisplay.innerText = `${title || file.name.split('.')[0]} - ${album || "Unknown Album"} - ${artist || "Unknown Artist"}`;
                if (picture) {
                    let b64 = ""; for (let i = 0; i < picture.data.length; i++) b64 += String.fromCharCode(picture.data[i]);
                    document.getElementById('album-art').src = "data:" + picture.format + ";base64," + window.btoa(b64);
                    document.getElementById('album-art').style.display = "block";
                    document.getElementById('no-cover-text').style.display = "none";
                } else { resetCover(); }
            },
            onError: () => { metaDisplay.innerText = file.name; resetCover(); }
        });
    }
    
    audio.play().then(() => {
        if (audioContext.state === 'suspended') audioContext.resume();
        playIcon.className = "fa-solid fa-pause";
    });
}

function nextTrack() {
    if (isShuffle) {
        let nextIndex;
        do { nextIndex = Math.floor(Math.random() * playlist.length); } 
        while (nextIndex === currentTrackIndex && playlist.length > 1);
        loadTrack(nextIndex);
    } else {
        if (currentTrackIndex < playlist.length - 1) {
            loadTrack(currentTrackIndex + 1);
        } else if (repeatMode === 1) { // Repeat All
            loadTrack(0);
        }
    }
}

function prevTrack() {
    if (currentTrackIndex > 0) loadTrack(currentTrackIndex - 1);
    else if (repeatMode === 1) loadTrack(playlist.length - 1);
}

function togglePlay() {
    initAudio();
    if (audioContext && audioContext.state === 'suspended') audioContext.resume();
    if (audio.paused) { audio.play(); playIcon.className = "fa-solid fa-pause"; }
    else { audio.pause(); playIcon.className = "fa-solid fa-play"; }
}

/**
 * GESTION DES BOUTONS DE CONTRÔLE
 */

// SHUFFLE
document.getElementById('shuffle-btn').onclick = function() {
    isShuffle = !isShuffle;
    this.classList.toggle('active-blue', isShuffle);
};

// REPEAT (Cycle: Off -> All -> One)
document.getElementById('repeat-btn').onclick = function() {
    repeatMode = (repeatMode + 1) % 3;
    const icon = this.querySelector('i');
    this.classList.remove('active-blue');
    
    if (repeatMode === 0) {
        icon.className = "fa-solid fa-repeat";
    } else if (repeatMode === 1) {
        icon.className = "fa-solid fa-repeat";
        this.classList.add('active-blue');
    } else if (repeatMode === 2) {
        icon.className = "fa-solid fa-arrows-rotate"; // Icône différente pour "One"
        this.classList.add('active-blue');
    }
};

// TEMPS (Ecoule / Restant)
document.getElementById('time-toggle-btn').onclick = function() {
    showRemaining = !showRemaining;
    this.classList.toggle('active-blue', showRemaining);
};

// BOUCLE A-B
document.getElementById('ab-loop-btn').onclick = function() {
    if (loopA === null) {
        loopA = audio.currentTime;
        this.classList.add('active-blue');
        console.log("Point A set at: " + loopA);
    } else if (loopB === null) {
        loopB = audio.currentTime;
        if (loopB <= loopA) { resetABLoop(); return; } // Sécurité
        this.style.color = "var(--danger)"; // Indique que la boucle est active
        console.log("Point B set at: " + loopB);
    } else {
        resetABLoop();
    }
};

function resetABLoop() {
    loopA = null;
    loopB = null;
    const btn = document.getElementById('ab-loop-btn');
    btn.classList.remove('active-blue');
    btn.style.color = "";
}

/**
 * EVENTS INPUTS & MIXER
 */
document.getElementById('volume-slider').addEventListener('input', (e) => {
    audio.volume = e.target.value;
    document.getElementById('val-volume').innerText = Math.round(e.target.value * 100) + "%";
});

document.getElementById('bass-slider').addEventListener('input', (e) => {
    updateFilters();
    document.getElementById('val-bass').innerText = e.target.value + "dB";
});

document.getElementById('treble-slider').addEventListener('input', (e) => {
    updateFilters();
    document.getElementById('val-treble').innerText = e.target.value + "dB";
});

document.getElementById('pitch-slider').addEventListener('input', (e) => {
    audio.playbackRate = e.target.value;
    document.getElementById('val-pitch').innerText = Math.round(e.target.value * 100) + "%";
});

// RST BUTTONS
document.querySelectorAll('.btn-rst[data-target]').forEach(btn => {
    btn.onclick = () => {
        const target = document.getElementById(btn.dataset.target);
        target.value = (btn.dataset.target === 'pitch-slider') ? 1 : 0;
        target.dispatchEvent(new Event('input'));
    };
});

// LECTURE & TIME
audio.ontimeupdate = () => {
    if (audio.duration) {
        seekSlider.value = (audio.currentTime / audio.duration) * 100;
        
        // Affichage temps
        let current = audio.currentTime;
        let total = audio.duration;
        
        if (showRemaining) {
            document.getElementById('current-time').innerText = "-" + formatTime(total - current);
        } else {
            document.getElementById('current-time').innerText = formatTime(current);
        }
        document.getElementById('duration').innerText = formatTime(total);

        // Gestion boucle A-B
        if (loopA !== null && loopB !== null) {
            if (audio.currentTime >= loopB) {
                audio.currentTime = loopA;
            }
        }
    }
};

audio.onended = () => {
    if (repeatMode === 2) {
        audio.currentTime = 0;
        audio.play();
    } else {
        nextTrack();
    }
};

function formatTime(s) {
    if (isNaN(s)) return "00:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return (m < 10 ? "0" + m : m) + ":" + (sec < 10 ? "0" + sec : sec);
}

/**
 * AUTRES ÉVÉNEMENTS
 */
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

document.getElementById('play-pause').onclick = togglePlay;
document.getElementById('next-btn').onclick = nextTrack;
document.getElementById('prev-btn').onclick = prevTrack;
document.getElementById('rewind-btn').onclick = () => audio.currentTime -= 10;
document.getElementById('forward-btn').onclick = () => audio.currentTime += 10;
document.getElementById('loudness-btn').onclick = function() { this.classList.toggle('active'); updateFilters(); };
document.getElementById('bypass-btn').onclick = function() { this.classList.toggle('active-danger'); updateFilters(); };
document.getElementById('mute-btn').onclick = function() { this.classList.toggle('active-danger'); audio.muted = !audio.muted; };
document.getElementById('eject-btn').onclick = () => document.getElementById('file-upload').click();
seekSlider.oninput = (e) => { audio.currentTime = (e.target.value / 100) * audio.duration; };

// MODALE
document.getElementById('art-trigger').onclick = () => {
    const art = document.getElementById('album-art');
    if (art.style.display === "block") {
        document.getElementById('modal-img').src = art.src;
        const parts = metaDisplay.innerText.split(' - ');
        document.getElementById('modal-title').innerText = parts[0] || "";
        document.getElementById('modal-album').innerText = parts[1] || "";
        document.getElementById('modal-artist').innerText = parts[2] || "";
        modal.style.display = 'flex';
    }
};
document.getElementById('close-modal').onclick = () => modal.style.display = 'none';
function resetCover() {
    document.getElementById('album-art').style.display = "none";
    document.getElementById('no-cover-text').style.display = "block";
}