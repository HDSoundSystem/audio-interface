/**
 * 1. ENREGISTREMENT DU SERVICE WORKER
 */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker enregistré !', reg.scope))
            .catch(err => console.log('Échec Service Worker :', err));
    });
}

/**
 * 2. LOGIQUE AUDIO & LECTEUR
 */
const audio = new Audio();
audio.volume = 0.05;
audio.crossOrigin = "anonymous";

let playlist = [];
let currentTrackIndex = 0;
let audioContext, source, bassFilter, trebleFilter;
let loopA = null, loopB = null, showRemaining = false, isShuffle = false, repeatMode = 0;

const playIcon = document.getElementById('play-icon');
const metaDisplay = document.getElementById('display-meta');
const seekSlider = document.getElementById('seek-slider');

function initAudio() {
    if (audioContext) return;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        source = audioContext.createMediaElementSource(audio);
        bassFilter = audioContext.createBiquadFilter();
        bassFilter.type = "lowshelf"; bassFilter.frequency.value = 200;
        trebleFilter = audioContext.createBiquadFilter();
        trebleFilter.type = "highshelf"; trebleFilter.frequency.value = 3000;
        source.connect(bassFilter); bassFilter.connect(trebleFilter);
        trebleFilter.connect(audioContext.destination);
    } catch (e) { console.error(e); }
}

function updateFilters() {
    if (!bassFilter || !trebleFilter) return;
    const isBypassed = document.getElementById('bypass-btn').classList.contains('active-danger');
    if (isBypassed) {
        bassFilter.gain.value = 0; trebleFilter.gain.value = 0;
    } else {
        let b = parseFloat(document.getElementById('bass-slider').value);
        let t = parseFloat(document.getElementById('treble-slider').value);
        if (document.getElementById('loudness-btn').classList.contains('active')) { b += 12; t += 8; }
        bassFilter.gain.value = b; trebleFilter.gain.value = t;
    }
}

function loadTrack(index) {
    if (!playlist[index]) return;
    initAudio();

    // Reset des boucles et styles
    loopA = null;
    loopB = null;
    document.getElementById('ab-loop-btn').classList.remove('active-blue');

    currentTrackIndex = index;
    const file = playlist[index];

    // 1. Affichage du Format
    const ext = file.name.split('.').pop().toUpperCase();
    document.getElementById('file-format').innerText = ext;

    // 2. Préparation de l'Audio
    audio.src = URL.createObjectURL(file);

    // Estimation du bitrate (se met à jour dès que les métadonnées chargent)
    audio.onloadedmetadata = () => {
        const kbps = Math.round((file.size * 8) / audio.duration / 1000);
        document.getElementById('file-bitrate').innerText = kbps + " KBPS";
    };

    // Mise à jour visuelle de la playlist
    document.querySelectorAll('#playlist-ul li').forEach((li, i) => {
        li.className = (i === index) ? 'active-track' : '';
    });

    // 3. Lecture des Tags (Métadonnées + Cover)
    if (window.jsmediatags) {
        window.jsmediatags.read(file, {
            onSuccess: (tag) => {
                const { title, artist, album, picture } = tag.tags;

                // Texte meta
                metaDisplay.innerText = `${title || file.name.split('.')[0]} - ${album || "Album"} - ${artist || "Artiste"}`;

                // Gestion de la Cover (CRITIQUE)
                if (picture) {
                    let base64String = "";
                    for (let i = 0; i < picture.data.length; i++) {
                        base64String += String.fromCharCode(picture.data[i]);
                    }
                    const b64 = window.btoa(base64String);
                    const imgUrl = `data:${picture.format};base64,${b64}`;

                    const artImg = document.getElementById('album-art');
                    artImg.src = imgUrl;
                    artImg.style.display = "block";
                    document.getElementById('no-cover-text').style.display = "none";
                } else {
                    resetCover();
                }
            },
            onError: (error) => {
                console.log('Erreur tags:', error);
                metaDisplay.innerText = file.name;
                resetCover();
            }
        });
    }

    audio.play().then(() => {
        if (audioContext.state === 'suspended') audioContext.resume();
        playIcon.className = "fa-solid fa-pause";
    });
}

// Fonction de reset indispensable
function resetCover() {
    const artImg = document.getElementById('album-art');
    artImg.src = "";
    artImg.style.display = "none";
    document.getElementById('no-cover-text').style.display = "block";
    document.getElementById('file-bitrate').innerText = "--- KBPS";
}

// NAVIGATION & TEMPS
audio.ontimeupdate = () => {
    if (!audio.duration) return;
    seekSlider.value = (audio.currentTime / audio.duration) * 100;
    const time = showRemaining ? audio.currentTime - audio.duration : audio.currentTime;
    document.getElementById('current-time').innerText = (showRemaining && time !== 0 ? "-" : "") + formatTime(Math.abs(time));
    document.getElementById('duration').innerText = formatTime(audio.duration);
    if (loopA !== null && loopB !== null && audio.currentTime >= loopB) audio.currentTime = loopA;
};

function formatTime(s) { const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return (m < 10 ? "0" + m : m) + ":" + (sec < 10 ? "0" + sec : sec); }

// EVENT LISTENERS CONTROLES
document.getElementById('rewind-btn').onclick = () => audio.currentTime = Math.max(0, audio.currentTime - 10);
document.getElementById('forward-btn').onclick = () => audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);

document.getElementById('play-pause').onclick = () => {
    initAudio(); if (audioContext.state === 'suspended') audioContext.resume();
    if (audio.paused) { audio.play(); playIcon.className = "fa-solid fa-pause"; }
    else { audio.pause(); playIcon.className = "fa-solid fa-play"; }
};

document.getElementById('next-btn').onclick = () => {
    if (isShuffle) loadTrack(Math.floor(Math.random() * playlist.length));
    else if (currentTrackIndex < playlist.length - 1) loadTrack(currentTrackIndex + 1);
};
document.getElementById('prev-btn').onclick = () => { if (currentTrackIndex > 0) loadTrack(currentTrackIndex - 1); };

// REPEAT / SHUFFLE / TIME / AB
document.getElementById('repeat-btn').onclick = function () {
    repeatMode = (repeatMode + 1) % 3;
    this.classList.toggle('active-blue', repeatMode > 0);
    this.querySelector('i').className = repeatMode === 2 ? "fa-solid fa-arrows-rotate" : "fa-solid fa-repeat";
};
document.getElementById('shuffle-btn').onclick = function () { isShuffle = !isShuffle; this.classList.toggle('active-blue', isShuffle); };
document.getElementById('time-toggle-btn').onclick = function () { showRemaining = !showRemaining; this.classList.toggle('active-blue', showRemaining); };
document.getElementById('ab-loop-btn').onclick = function () {
    const badge = document.getElementById('ab-status-badge');

    if (loopA === null) {
        // Premier clic : on fixe A
        loopA = audio.currentTime;
        this.classList.add('active-ab-a');
        this.innerText = "A-";
    }
    else if (loopB === null) {
        // Deuxième clic : on fixe B
        loopB = audio.currentTime;
        this.classList.remove('active-ab-a');
        this.classList.add('active-ab-b');
        this.innerText = "A-B";
        badge.style.display = "block"; // Affiche le badge sur la cover
    }
    else {
        // Troisième clic : on reset tout
        loopA = null;
        loopB = null;
        this.classList.remove('active-ab-a', 'active-ab-b');
        this.innerText = "A-B";
        badge.style.display = "none"; // Cache le badge
    }
};

// N'oublie pas de cacher le badge dans ta fonction resetCover ou loadTrack
function resetABLoop() {
    loopA = null;
    loopB = null;
    const btn = document.getElementById('ab-loop-btn');
    btn.classList.remove('active-ab-a', 'active-ab-b');
    btn.innerText = "A-B";
    document.getElementById('ab-status-badge').style.display = "none";
}

// Appelle resetABLoop() au début de loadTrack(index)

// MIXER & FILE
document.getElementById('volume-slider').oninput = (e) => { audio.volume = e.target.value; document.getElementById('val-volume').innerText = Math.round(e.target.value * 100) + "%"; };
document.getElementById('bass-slider').oninput = (e) => { updateFilters(); document.getElementById('val-bass').innerText = e.target.value + "dB"; };
document.getElementById('treble-slider').oninput = (e) => { updateFilters(); document.getElementById('val-treble').innerText = e.target.value + "dB"; };
document.getElementById('pitch-slider').oninput = (e) => { audio.playbackRate = e.target.value; document.getElementById('val-pitch').innerText = Math.round(e.target.value * 100) + "%"; };

document.getElementById('file-upload').onchange = (e) => {
    playlist = Array.from(e.target.files);
    const ul = document.getElementById('playlist-ul'); ul.innerHTML = "";
    playlist.forEach((f, i) => { const li = document.createElement('li'); li.innerText = f.name.split('.')[0]; li.onclick = () => loadTrack(i); ul.appendChild(li); });
    if (playlist.length > 0) loadTrack(0);
};

document.getElementById('art-trigger').onclick = function () {
    const modal = document.getElementById('modal-overlay');
    const artImg = document.getElementById('album-art');
    document.getElementById('modal-img').src = artImg.src || "";
    document.getElementById('modal-img').style.display = artImg.src ? "block" : "none";
    const parts = metaDisplay.innerText.split(' - ');
    document.getElementById('modal-title').innerText = parts[0] || "";
    document.getElementById('modal-album').innerText = parts[1] || "";
    document.getElementById('modal-artist').innerText = parts[2] || "";
    modal.style.display = 'flex';
};
document.getElementById('close-modal').onclick = () => document.getElementById('modal-overlay').style.display = 'none';

document.getElementById('loudness-btn').onclick = function () { this.classList.toggle('active'); updateFilters(); };
document.getElementById('bypass-btn').onclick = function () { this.classList.toggle('active-danger'); updateFilters(); };
document.getElementById('mute-btn').onclick = function () { this.classList.toggle('active-danger'); audio.muted = !audio.muted; };
document.getElementById('eject-btn').onclick = () => document.getElementById('file-upload').click();
document.querySelectorAll('.btn-rst[data-target]').forEach(btn => {
    btn.onclick = () => { const t = document.getElementById(btn.dataset.target); t.value = btn.dataset.target === 'pitch-slider' ? 1 : 0; t.dispatchEvent(new Event('input')); };
});
seekSlider.oninput = (e) => { audio.currentTime = (e.target.value / 100) * audio.duration; };
function resetCover() { document.getElementById('album-art').style.display = "none"; document.getElementById('no-cover-text').style.display = "block"; }