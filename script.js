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

// ============================================================
// PWA — Enregistrement du Service Worker
// ============================================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('[SW] Enregistré :', reg.scope))
            .catch(err => console.warn('[SW] Échec :', err));
    });
}

// ============================================================
// TOAST HELPER
// ============================================================
let toastTimer;
function showToast(msg) {
    const toast = document.getElementById('kbd-toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

// ============================================================
// INIT WEB AUDIO
// ============================================================
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

// ============================================================
// GESTION DU TEMPS & SLIDER
// ============================================================
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

// ============================================================
// LECTURE & PLAYLIST
// ============================================================
audio.onended = () => {
    if (repeatMode === 2) { audio.currentTime = 0; audio.play(); }
    else { nextTrack(); }
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
    resetAB();
    currentTrackIndex = index;
    const file = playlist[index];
    document.getElementById('file-format').innerText = file.name.split('.').pop().toUpperCase();
    audio.src = URL.createObjectURL(file);
    audio.onloadedmetadata = () => {
        const kbps = Math.round((file.size * 8) / audio.duration / 1000);
        document.getElementById('file-bitrate').innerText = kbps + " KBPS";
    };
    document.querySelectorAll('#playlist-ul li').forEach((li, i) => {
        li.className = (i === index) ? 'active-track' : '';
    });
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
                    // Modal infos
                    document.getElementById('modal-title').innerText = title || "";
                    document.getElementById('modal-artist').innerText = artist || "";
                    document.getElementById('modal-album').innerText = album || "";
                    document.getElementById('modal-img').src = `data:${picture.format};base64,${window.btoa(b64)}`;
                } else {
                    resetCoverUI();
                }
            },
            onError: () => { metaDisplay.innerText = file.name; resetCoverUI(); }
        });
    }
    audio.play();
    playIcon.className = "fa-solid fa-pause";

    // Si Chromecast connecté, charger la piste dessus
    castCurrentTrack();
}

// ============================================================
// BOUCLE A-B
// ============================================================
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

// ============================================================
// MIXER & FILTRES
// ============================================================
function updateFilters() {
    if (!bassFilter) return;
    const bypassed = document.getElementById('bypass-btn').classList.contains('active-danger');
    let b = bypassed ? 0 : parseFloat(document.getElementById('bass-slider').value);
    let t = bypassed ? 0 : parseFloat(document.getElementById('treble-slider').value);
    if (!bypassed && document.getElementById('loudness-btn').classList.contains('active-blue')) {
        b += 12; t += 8;
    }
    bassFilter.gain.value = b;
    trebleFilter.gain.value = t;
}

document.getElementById('loudness-btn').onclick = function() {
    this.classList.toggle('active-blue'); updateFilters();
};
document.getElementById('mute-btn').onclick = function() {
    audio.muted = !audio.muted;
    this.classList.toggle('active-danger', audio.muted);
};
document.getElementById('bypass-btn').onclick = function() {
    this.classList.toggle('active-danger'); updateFilters();
};

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

// ============================================================
// NAVIGATION
// ============================================================
document.getElementById('play-pause').onclick = () => {
    initAudio();
    if (audioContext.state === 'suspended') audioContext.resume();
    if (audio.paused) { audio.play(); playIcon.className = "fa-solid fa-pause"; }
    else { audio.pause(); playIcon.className = "fa-solid fa-play"; }
};

document.getElementById('prev-btn').onclick = () => loadTrack(Math.max(0, currentTrackIndex - 1));
document.getElementById('next-btn').onclick = nextTrack;
document.getElementById('rewind-btn').onclick = () => { audio.currentTime -= 10; showToast("◀◀ -10s"); };
document.getElementById('forward-btn').onclick = () => { audio.currentTime += 10; showToast("▶▶ +10s"); };

document.getElementById('repeat-btn').onclick = function() {
    repeatMode = (repeatMode + 1) % 3;
    this.classList.toggle('active-blue', repeatMode > 0);
    const labels = ["Répétition OFF", "Répétition playlist", "Répétition piste"];
    showToast(labels[repeatMode]);
};

document.getElementById('shuffle-btn').onclick = function() {
    isShuffle = !isShuffle;
    this.classList.toggle('active-blue', isShuffle);
    showToast(isShuffle ? "Aléatoire ON" : "Aléatoire OFF");
};

// ============================================================
// UI & MODALE COVER
// ============================================================
document.getElementById('art-trigger').onclick = () => {
    if (!document.getElementById('album-art').src) return;
    document.getElementById('modal-overlay').style.display = 'flex';
};
document.getElementById('close-modal').onclick = () => {
    document.getElementById('modal-overlay').style.display = 'none';
};

// ============================================================
// MODALE RACCOURCIS CLAVIER
// ============================================================
document.getElementById('kbd-help-btn').onclick = () => {
    document.getElementById('kbd-modal').style.display = 'flex';
};
document.getElementById('close-kbd-modal').onclick = () => {
    document.getElementById('kbd-modal').style.display = 'none';
};

// ============================================================
// RACCOURCIS CLAVIER
// ============================================================
document.addEventListener('keydown', (e) => {
    // Ne pas intercepter si focus sur un input/slider
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    switch (e.code) {
        case 'Space':
            e.preventDefault();
            document.getElementById('play-pause').click();
            showToast(audio.paused ? "⏸ Pause" : "▶ Lecture");
            break;
        case 'ArrowLeft':
            e.preventDefault();
            audio.currentTime = Math.max(0, audio.currentTime - 10);
            showToast("◀◀ -10s");
            break;
        case 'ArrowRight':
            e.preventDefault();
            audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
            showToast("▶▶ +10s");
            break;
        case 'ArrowUp':
            e.preventDefault();
            audio.volume = Math.min(1, audio.volume + 0.05);
            document.getElementById('volume-slider').value = audio.volume;
            document.getElementById('val-volume').innerText = Math.round(audio.volume * 100) + "%";
            showToast("🔊 Vol " + Math.round(audio.volume * 100) + "%");
            break;
        case 'ArrowDown':
            e.preventDefault();
            audio.volume = Math.max(0, audio.volume - 0.05);
            document.getElementById('volume-slider').value = audio.volume;
            document.getElementById('val-volume').innerText = Math.round(audio.volume * 100) + "%";
            showToast("🔉 Vol " + Math.round(audio.volume * 100) + "%");
            break;
        case 'KeyN':
            nextTrack();
            showToast("⏭ Piste suivante");
            break;
        case 'KeyP':
            loadTrack(Math.max(0, currentTrackIndex - 1));
            showToast("⏮ Piste précédente");
            break;
        case 'KeyM':
            document.getElementById('mute-btn').click();
            showToast(audio.muted ? "🔇 Mute ON" : "🔊 Mute OFF");
            break;
        case 'KeyR':
            document.getElementById('repeat-btn').click();
            break;
        case 'KeyS':
            document.getElementById('shuffle-btn').click();
            break;
        case 'KeyT':
            document.getElementById('time-toggle-btn').click();
            showToast(showRemaining ? "Temps restant" : "Temps écoulé");
            break;
        case 'KeyO':
            document.getElementById('file-upload').click();
            break;
        case 'Slash':
        case 'IntlRo':
            if (e.shiftKey) {
                document.getElementById('kbd-modal').style.display = 'flex';
            }
            break;
    }
});

// ============================================================
// FICHIERS
// ============================================================
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
    document.getElementById('modal-img').src = "";
}

document.querySelectorAll('.btn-rst[data-target]').forEach(btn => {
    btn.onclick = () => {
        const t = document.getElementById(btn.dataset.target);
        t.value = btn.dataset.target === 'pitch-slider' ? 1 : 0;
        t.dispatchEvent(new Event('input'));
    };
});

// ============================================================
// CHROMECAST
// ============================================================
let castSession = null;

window['__onGCastApiAvailable'] = function(isAvailable) {
    if (!isAvailable) return;

    cast.framework.CastContext.getInstance().setOptions({
        receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
    });

    // Afficher le bouton Cast
    document.getElementById('cast-btn').style.display = 'flex';

    const castContext = cast.framework.CastContext.getInstance();
    castContext.addEventListener(
        cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
        (event) => {
            const state = event.sessionState;
            const btn = document.getElementById('cast-btn');
            if (state === cast.framework.SessionState.SESSION_STARTED ||
                state === cast.framework.SessionState.SESSION_RESUMED) {
                castSession = castContext.getCurrentSession();
                btn.classList.add('casting');
                showToast("📡 Chromecast connecté");
                castCurrentTrack();
            } else if (state === cast.framework.SessionState.SESSION_ENDED) {
                castSession = null;
                btn.classList.remove('casting');
                showToast("📡 Chromecast déconnecté");
            }
        }
    );
};

function castCurrentTrack() {
    if (!castSession || !playlist[currentTrackIndex]) return;

    // Les fichiers locaux ne peuvent pas être streamés directement via Cast
    // On affiche un message d'info
    showToast("⚠ Cast: nécessite une URL de stream");
}
