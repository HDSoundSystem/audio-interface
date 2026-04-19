const audio = new Audio();
audio.volume = 0.05;
audio.crossOrigin = "anonymous";

let playlist = [], playlistCovers = [], currentTrackIndex = 0;
let audioContext, source, bassFilter, trebleFilter;
let loopA = null, loopB = null;
let isShuffle = false, repeatMode = 0, showRemaining = false;

const playIcon = document.getElementById('play-icon');
const metaDisplay = document.getElementById('display-meta');
const pausePill = document.getElementById('pause-pill');
const waveformContainer = document.getElementById('waveform-container');
const waveformCanvas    = document.getElementById('waveform-canvas');
const waveformPlayhead  = document.getElementById('waveform-playhead');
const waveformProgress  = document.getElementById('waveform-progress');
const wCtx = waveformCanvas.getContext('2d');
let waveformData = null; // Float32Array des peaks normalisés

// ============================================================
// PWA — Service Worker
// ============================================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('[SW] Enregistré :', reg.scope))
            .catch(err => console.warn('[SW] Échec :', err));
    });
}

// ============================================================
// TOAST
// ============================================================
let toastTimer;
function showToast(msg) {
    const toast = document.getElementById('kbd-toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function formatNowPlayingMeta(fileName, title, album, artist) {
    const fallbackTitle = fileName.replace(/\.[^.]+$/, '');
    return [
        title || fallbackTitle,
        album || "Unknown album",
        artist || "Unknown artist"
    ].join(" - ");
}

function formatBpmValue(rawBpm) {
    if (rawBpm === undefined || rawBpm === null || rawBpm === "") return "--- BPM";
    const bpm = parseFloat(String(rawBpm).replace(",", "."));
    if (!Number.isFinite(bpm) || bpm <= 0) return "--- BPM";
    return `${Math.round(bpm)} BPM`;
}

function updatePausePill() {
    pausePill.style.display = (audio.src && audio.paused) ? "inline-flex" : "none";
}

// ============================================================
// WEB AUDIO
// ============================================================
// Fréquences ISO standard 10 bandes
const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
let eqFilters = [];
const EQ_Q = 1.4;

let monoMerger, monoSplitter, isMono = false;

function initAudio() {
    if (audioContext) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    source = audioContext.createMediaElementSource(audio);
    bassFilter = audioContext.createBiquadFilter();
    bassFilter.type = "lowshelf"; bassFilter.frequency.value = 200;
    trebleFilter = audioContext.createBiquadFilter();
    trebleFilter.type = "highshelf"; trebleFilter.frequency.value = 3000;

    // Créer les 10 filtres peaking EQ
    eqFilters = EQ_FREQS.map(freq => {
        const f = audioContext.createBiquadFilter();
        f.type = "peaking";
        f.frequency.value = freq;
        f.Q.value = EQ_Q;
        f.gain.value = 0;
        return f;
    });

    // Nœuds mono : splitter → merger (L+R mixés sur les deux sorties)
    monoSplitter = audioContext.createChannelSplitter(2);
    monoMerger  = audioContext.createChannelMerger(2);
    // L→0 et L→1 (on utilise uniquement le canal gauche pour les deux)
    monoSplitter.connect(monoMerger, 0, 0);
    monoSplitter.connect(monoMerger, 0, 1);

    // Chaîne stéréo par défaut : source → bass → treble → eq[0..9] → destination
    source.connect(bassFilter);
    bassFilter.connect(trebleFilter);
    let prev = trebleFilter;
    eqFilters.forEach(f => { prev.connect(f); prev = f; });
    // `prev` = dernier filtre EQ
    prev.connect(audioContext.destination);

    // Référence au dernier nœud EQ pour pouvoir re-câbler en mono
    window._lastEqNode = prev;
}

// ============================================================
// TEMPS & SLIDER
// ============================================================
document.getElementById('time-toggle-btn').onclick = function () {
    showRemaining = !showRemaining;
    this.classList.toggle('active-blue', showRemaining);
};

audio.ontimeupdate = () => {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    waveformPlayhead.style.left = pct + '%';
    waveformProgress.style.width = pct + '%';

    const displayTime = showRemaining ? (audio.duration - audio.currentTime) : audio.currentTime;
    const sign = (showRemaining && displayTime > 0) ? "-" : "";
    document.getElementById('current-time').innerText = sign + formatTime(displayTime);
    document.getElementById('duration').innerText = formatTime(audio.duration);
    if (loopA !== null && loopB !== null && audio.currentTime >= loopB) {
        audio.currentTime = loopA;
    }
};

audio.addEventListener('play', updatePausePill);
audio.addEventListener('pause', updatePausePill);
audio.addEventListener('ended', updatePausePill);
audio.addEventListener('emptied', updatePausePill);

function formatTime(s) {
    if (isNaN(s) || s < 0) return "00:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return (m < 10 ? "0" + m : m) + ":" + (sec < 10 ? "0" + sec : sec);
}

// ============================================================
// WAVEFORM — dessin & navigation
// ============================================================
function drawWaveform() {
    const W = waveformCanvas.width;
    const H = waveformCanvas.height;
    wCtx.clearRect(0, 0, W, H);

    if (!waveformData || waveformData.length === 0) {
        // Placeholder vide
        wCtx.fillStyle = '#1a1c20';
        wCtx.fillRect(0, 0, W, H);
        return;
    }

    const mid = H / 2;
    const barW = Math.max(1, W / waveformData.length);

    wCtx.fillStyle = '#0a0a0a';
    wCtx.fillRect(0, 0, W, H);

    for (let i = 0; i < waveformData.length; i++) {
        const x = i * barW;
        const amp = waveformData[i] * (H * 0.46);
        const alpha = 0.55 + waveformData[i] * 0.45;
        wCtx.fillStyle = `rgba(45,158,167,${alpha})`;
        wCtx.fillRect(x, mid - amp, Math.max(1, barW - 0.5), amp * 2);
    }

    // Ligne centrale
    wCtx.fillStyle = 'rgba(45,158,167,0.25)';
    wCtx.fillRect(0, mid - 0.5, W, 1);
}

function resizeWaveformCanvas() {
    waveformCanvas.width  = waveformContainer.offsetWidth;
    waveformCanvas.height = waveformContainer.offsetHeight;
    drawWaveform();
}

async function loadWaveformFromFile(file) {
    waveformData = null;
    drawWaveform(); // vide pendant le chargement

    try {
        const arrayBuffer = await file.arrayBuffer();
        const offCtx = new OfflineAudioContext(1, 1, 44100);
        const decoded = await offCtx.decodeAudioData(arrayBuffer);
        const raw = decoded.getChannelData(0);

        // Réduire à N samples pour la largeur du canvas
        const N = waveformCanvas.width || 600;
        const blockSize = Math.floor(raw.length / N);
        const peaks = new Float32Array(N);
        let maxVal = 0;

        for (let i = 0; i < N; i++) {
            let sum = 0;
            const start = i * blockSize;
            for (let j = 0; j < blockSize; j++) {
                sum += Math.abs(raw[start + j] || 0);
            }
            peaks[i] = sum / blockSize;
            if (peaks[i] > maxVal) maxVal = peaks[i];
        }

        // Normaliser
        if (maxVal > 0) for (let i = 0; i < N; i++) peaks[i] /= maxVal;

        waveformData = peaks;
        drawWaveform();
    } catch (e) {
        console.warn('Waveform decode error:', e);
    }
}

// Navigation — clic & drag sur le waveform
function seekFromPointer(e) {
    const rect = waveformContainer.getBoundingClientRect();
    const x = (e.clientX ?? e.touches?.[0]?.clientX ?? 0) - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    if (audio.duration) audio.currentTime = pct * audio.duration;
}

let isDraggingWaveform = false;
waveformContainer.addEventListener('mousedown', (e) => {
    isDraggingWaveform = true;
    seekFromPointer(e);
});
document.addEventListener('mousemove', (e) => {
    if (isDraggingWaveform) seekFromPointer(e);
});
document.addEventListener('mouseup', () => { isDraggingWaveform = false; });

waveformContainer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    seekFromPointer(e);
}, { passive: false });
waveformContainer.addEventListener('touchmove', (e) => {
    e.preventDefault();
    seekFromPointer(e);
}, { passive: false });

// Redimensionner le canvas si la fenêtre change
window.addEventListener('resize', resizeWaveformCanvas);

// Init canvas size
setTimeout(resizeWaveformCanvas, 0);



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

    // Charger la waveform en parallèle
    resizeWaveformCanvas();
    loadWaveformFromFile(file);
    audio.onloadedmetadata = () => {
        const kbps = Math.round((file.size * 8) / audio.duration / 1000);
        document.getElementById('file-bitrate').innerText = kbps + " KBPS";
    };
    renderPlaylist();
    if (window.jsmediatags) {
        window.jsmediatags.read(file, {
            onSuccess: (tag) => {
                const { title, artist, album, picture, bpm, TBPM } = tag.tags;
                metaDisplay.innerText = formatNowPlayingMeta(file.name, title, album, artist);
                document.getElementById('file-bpm').innerText = formatBpmValue(bpm ?? TBPM);
                if (picture) {
                    let b64 = "";
                    for (let i = 0; i < picture.data.length; i++) b64 += String.fromCharCode(picture.data[i]);
                    const src = `data:${picture.format};base64,${window.btoa(b64)}`;
                    document.getElementById('album-art').src = src;
                    document.getElementById('album-art').style.display = "block";
                    document.getElementById('no-cover-text').style.display = "none";
                    document.getElementById('modal-title').innerText = title || "";
                    document.getElementById('modal-artist').innerText = artist || "";
                    document.getElementById('modal-album').innerText = album || "";
                    document.getElementById('modal-img').src = src;
                } else {
                    resetCoverUI();
                }
            },
            onError: () => {
                metaDisplay.innerText = formatNowPlayingMeta(file.name, "", "", "");
                document.getElementById('file-bpm').innerText = "--- BPM";
                resetCoverUI();
            }
        });
    } else {
        metaDisplay.innerText = formatNowPlayingMeta(file.name, "", "", "");
        document.getElementById('file-bpm').innerText = "--- BPM";
    }
    audio.play();
    playIcon.className = "fa-solid fa-pause";
    updatePausePill();
    castCurrentTrack();
}

function resetCoverUI() {
    document.getElementById('album-art').style.display = "none";
    document.getElementById('no-cover-text').style.display = "block";
    document.getElementById('modal-img').src = "";
}

// ============================================================
// BOUCLE A-B
// ============================================================
document.getElementById('ab-loop-btn').onclick = function () {
    const badge = document.getElementById('ab-status-badge');
    if (loopA === null) {
        loopA = audio.currentTime;
        this.classList.add('active-ab-a');
    } else if (loopB === null) {
        loopB = audio.currentTime;
        this.classList.remove('active-ab-a');
        this.classList.add('active-ab-b');
        badge.style.display = "block";
    } else {
        resetAB();
    }
};

function resetAB() {
    loopA = null; loopB = null;
    const btn = document.getElementById('ab-loop-btn');
    btn.classList.remove('active-ab-a', 'active-ab-b');
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
    // Bypass EQ 10 bandes
    eqFilters.forEach((f, i) => {
        f.gain.value = bypassed ? 0 : parseFloat(document.querySelector(`.eq-slider[data-band="${i}"]`).value);
    });
}

document.getElementById('loudness-btn').onclick = function () {
    initAudio();
    this.classList.toggle('active-blue');
    updateFilters();
    drawEqCurve();
};

document.getElementById('mono-btn').onclick = function () {
    isMono = !isMono;
    this.classList.toggle('active-blue', isMono);

    if (!window._lastEqNode) return;
    const last = window._lastEqNode;

    if (isMono) {
        // Déconnecter la sortie stéréo directe et passer par le merger mono
        last.disconnect(audioContext.destination);
        last.connect(monoSplitter);
        monoMerger.connect(audioContext.destination);
    } else {
        // Revenir en stéréo
        last.disconnect(monoSplitter);
        monoMerger.disconnect(audioContext.destination);
        last.connect(audioContext.destination);
    }
    showToast(isMono ? 'MONO' : 'STEREO');
};
document.getElementById('mute-btn').onclick = function () {
    audio.muted = !audio.muted;
    this.classList.toggle('active-danger', audio.muted);
};
document.getElementById('bypass-btn').onclick = function () { this.classList.toggle('active-danger'); updateFilters(); drawEqCurve(); };

document.getElementById('volume-slider').oninput = (e) => {
    audio.volume = e.target.value;
    document.getElementById('val-volume').innerText = Math.round(e.target.value * 100) + "%";
};
document.getElementById('bass-slider').oninput = (e) => {
    initAudio();
    updateFilters();
    document.getElementById('val-bass').innerText = e.target.value + "dB";
    drawEqCurve();
};
document.getElementById('treble-slider').oninput = (e) => {
    initAudio();
    updateFilters();
    document.getElementById('val-treble').innerText = e.target.value + "dB";
    drawEqCurve();
};
document.getElementById('pitch-slider').oninput = (e) => {
    audio.playbackRate = e.target.value;
    document.getElementById('val-pitch').innerText = Math.round(e.target.value * 100) + "%";
};

document.querySelectorAll('.btn-rst[data-target]').forEach(btn => {
    btn.onclick = () => {
        const t = document.getElementById(btn.dataset.target);
        t.value = btn.dataset.target === 'pitch-slider' ? 1 : 0;
        t.dispatchEvent(new Event('input'));
    };
});

// ============================================================
// EQ 10 BANDES
// ============================================================
document.querySelectorAll('.eq-slider').forEach(slider => {
    slider.oninput = () => {
        initAudio();
        const band = parseInt(slider.dataset.band);
        const val = parseFloat(slider.value);
        document.getElementById(`eq-val-${band}`).textContent = (val > 0 ? '+' : '') + val;
        if (eqFilters[band]) eqFilters[band].gain.value = val;
        drawEqCurve();
    };
});

document.getElementById('eq-reset-btn').onclick = () => {
    document.querySelectorAll('.eq-slider').forEach((slider, i) => {
        slider.value = 0;
        document.getElementById(`eq-val-${i}`).textContent = '0';
        if (eqFilters[i]) eqFilters[i].gain.value = 0;
    });
    drawEqCurve();
    showToast("EQ reset");
};

// ============================================================
// EQ CURVE — courbe de réponse fréquentielle
// ============================================================
const eqCurveCanvas = document.getElementById('eq-curve-canvas');
const eqCurveCtx = eqCurveCanvas.getContext('2d');

function buildEqFrequencies(count, minFreq, maxFreq) {
    const freqs = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        freqs[i] = minFreq * Math.pow(maxFreq / minFreq, i / Math.max(1, count - 1));
    }
    return freqs;
}

function getCombinedEqResponse(frequencies) {
    const magnitudes = new Float32Array(frequencies.length).fill(1);

    if (!audioContext || !bassFilter || !trebleFilter || eqFilters.length !== EQ_FREQS.length) {
        return magnitudes;
    }

    const response = new Float32Array(frequencies.length);
    const phase = new Float32Array(frequencies.length);

    [bassFilter, trebleFilter, ...eqFilters].forEach(filter => {
        filter.getFrequencyResponse(frequencies, response, phase);
        for (let i = 0; i < magnitudes.length; i++) {
            magnitudes[i] *= Math.max(response[i], 1e-6);
        }
    });

    return magnitudes;
}

function eqFreqToX(freq, width) {
    const minFreq = 20;
    const maxFreq = 20000;
    const ratio = Math.log(freq / minFreq) / Math.log(maxFreq / minFreq);
    return Math.max(0, Math.min(width - 1, ratio * (width - 1)));
}

function drawEqCurve() {
    const W = eqCurveCanvas.width  = eqCurveCanvas.offsetWidth;
    const H = eqCurveCanvas.height = eqCurveCanvas.offsetHeight;
    if (W === 0 || H === 0) return;

    eqCurveCtx.clearRect(0, 0, W, H);

    // Fond
    eqCurveCtx.fillStyle = '#0a0a0a';
    eqCurveCtx.fillRect(0, 0, W, H);

    // Ligne centrale (0 dB)
    const mid = H / 2;
    eqCurveCtx.strokeStyle = 'rgba(255,255,255,0.06)';
    eqCurveCtx.lineWidth = 1;
    eqCurveCtx.beginPath();
    eqCurveCtx.moveTo(0, mid);
    eqCurveCtx.lineTo(W, mid);
    eqCurveCtx.stroke();

    // Repères verticaux des bandes EQ
    eqCurveCtx.strokeStyle = 'rgba(255,255,255,0.08)';
    eqCurveCtx.lineWidth = 1;
    EQ_FREQS.forEach(freq => {
        const x = eqFreqToX(freq, W);
        eqCurveCtx.beginPath();
        eqCurveCtx.moveTo(x, 4);
        eqCurveCtx.lineTo(x, H - 4);
        eqCurveCtx.stroke();
    });

    // Calculer la reponse exacte des filtres Web Audio sur N points
    const N = W;
    const dbRange = 8;
    const frequencies = buildEqFrequencies(N, 20, 20000);
    const magnitudes = getCombinedEqResponse(frequencies);
    const points = new Float32Array(N);
    for (let x = 0; x < N; x++) {
        points[x] = 20 * Math.log10(Math.max(magnitudes[x], 1e-6));
    }

    // Dessiner la courbe
    eqCurveCtx.beginPath();
    for (let x = 0; x < N; x++) {
        const db = Math.max(-dbRange, Math.min(dbRange, points[x]));
        const y = mid - (db / dbRange) * (mid - 4);
        if (x === 0) eqCurveCtx.moveTo(x, y);
        else eqCurveCtx.lineTo(x, y);
    }

    // Remplissage sous la courbe
    eqCurveCtx.lineTo(N - 1, mid);
    eqCurveCtx.lineTo(0, mid);
    eqCurveCtx.closePath();
    const grad = eqCurveCtx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0,   'rgba(0, 200, 80, 0.18)');
    grad.addColorStop(0.5, 'rgba(0, 200, 80, 0.06)');
    grad.addColorStop(1,   'rgba(0, 200, 80, 0.02)');
    eqCurveCtx.fillStyle = grad;
    eqCurveCtx.fill();

    // Ligne verte
    eqCurveCtx.beginPath();
    for (let x = 0; x < N; x++) {
        const db = Math.max(-dbRange, Math.min(dbRange, points[x]));
        const y = mid - (db / dbRange) * (mid - 4);
        if (x === 0) eqCurveCtx.moveTo(x, y);
        else eqCurveCtx.lineTo(x, y);
    }
    eqCurveCtx.strokeStyle = '#00c850';
    eqCurveCtx.lineWidth = 2.25;
    eqCurveCtx.lineJoin = 'round';
    eqCurveCtx.stroke();

    // Points de contrôle visibles pour chaque bande
    eqCurveCtx.fillStyle = '#7dffad';
    EQ_FREQS.forEach(freq => {
        const x = Math.round(eqFreqToX(freq, W));
        const db = Math.max(-dbRange, Math.min(dbRange, points[x]));
        const y = mid - (db / dbRange) * (mid - 4);
        eqCurveCtx.beginPath();
        eqCurveCtx.arc(x, y, 3, 0, Math.PI * 2);
        eqCurveCtx.fill();
    });
}

// Dessiner au démarrage et quand la fenêtre change de taille
window.addEventListener('resize', drawEqCurve);
setTimeout(drawEqCurve, 50);


// ============================================================
// NAVIGATION
// ============================================================
document.getElementById('play-pause').onclick = () => {
    initAudio();
    if (audioContext.state === 'suspended') audioContext.resume();
    if (audio.paused) { audio.play(); playIcon.className = "fa-solid fa-pause"; }
    else { audio.pause(); playIcon.className = "fa-solid fa-play"; }
    updatePausePill();
};

document.getElementById('prev-btn').onclick = () => loadTrack(Math.max(0, currentTrackIndex - 1));
document.getElementById('next-btn').onclick = nextTrack;
document.getElementById('rewind-btn').onclick = () => { audio.currentTime -= 10; showToast("<< -10s"); };
document.getElementById('forward-btn').onclick = () => { audio.currentTime += 10; showToast(">> +10s"); };

document.getElementById('repeat-btn').onclick = function () {
    repeatMode = (repeatMode + 1) % 3;
    this.classList.toggle('active-blue', repeatMode > 0);
    showToast(["Repeat OFF", "Repeat playlist", "Repeat track"][repeatMode]);
};

document.getElementById('shuffle-btn').onclick = function () {
    isShuffle = !isShuffle;
    this.classList.toggle('active-blue', isShuffle);
    showToast(isShuffle ? "Shuffle ON" : "Shuffle OFF");
};

// ============================================================
// MODALES
// ============================================================
document.getElementById('art-trigger').onclick = () => {
    if (!document.getElementById('album-art').src) return;
    document.getElementById('modal-overlay').style.display = 'flex';
};
document.getElementById('close-modal').onclick = () => {
    document.getElementById('modal-overlay').style.display = 'none';
};
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
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    switch (e.code) {
        case 'Space':
            e.preventDefault();
            document.getElementById('play-pause').click();
            showToast(audio.paused ? "Pause" : "Play");
            break;
        case 'ArrowLeft':
            e.preventDefault();
            audio.currentTime = Math.max(0, audio.currentTime - 10);
            showToast("<< -10s");
            break;
        case 'ArrowRight':
            e.preventDefault();
            audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
            showToast(">> +10s");
            break;
        case 'ArrowUp':
            e.preventDefault();
            audio.volume = Math.min(1, audio.volume + 0.05);
            document.getElementById('volume-slider').value = audio.volume;
            document.getElementById('val-volume').innerText = Math.round(audio.volume * 100) + "%";
            showToast("Volume " + Math.round(audio.volume * 100) + "%");
            break;
        case 'ArrowDown':
            e.preventDefault();
            audio.volume = Math.max(0, audio.volume - 0.05);
            document.getElementById('volume-slider').value = audio.volume;
            document.getElementById('val-volume').innerText = Math.round(audio.volume * 100) + "%";
            showToast("Volume " + Math.round(audio.volume * 100) + "%");
            break;
        case 'KeyN': nextTrack(); showToast("Next track"); break;
        case 'KeyP': loadTrack(Math.max(0, currentTrackIndex - 1)); showToast("Previous track"); break;
        case 'KeyM': document.getElementById('mute-btn').click(); showToast(audio.muted ? "Mute ON" : "Mute OFF"); break;
        case 'KeyR': document.getElementById('repeat-btn').click(); break;
        case 'KeyS': document.getElementById('shuffle-btn').click(); break;
        case 'KeyT': document.getElementById('time-toggle-btn').click(); break;
        case 'KeyO': document.getElementById('file-upload').click(); break;
        case 'Slash': if (e.shiftKey) document.getElementById('kbd-modal').style.display = 'flex'; break;
    }
});

// ============================================================
// FICHIERS & PLAYLIST
// ============================================================
document.getElementById('file-upload').onchange = (e) => {
    addFiles(Array.from(e.target.files));
    e.target.value = "";
};

document.getElementById('eject-btn').onclick = () => document.getElementById('file-upload').click();

function addFiles(files) {
    const audioFiles = files.filter(f =>
        f.type.startsWith('audio/') || /\.(mp3|flac|ogg|wav|aac|m4a|opus|wma)$/i.test(f.name)
    );
    if (audioFiles.length === 0) return;
    const wasEmpty = playlist.length === 0;

    audioFiles.forEach((f, i) => {
        const idx = playlist.length + i;
        playlistCovers[idx] = null; // null = pas encore chargé
        if (window.jsmediatags) {
            window.jsmediatags.read(f, {
                onSuccess: (tag) => {
                    const pic = tag.tags.picture;
                    if (pic) {
                        let b64 = "";
                        for (let j = 0; j < pic.data.length; j++) b64 += String.fromCharCode(pic.data[j]);
                        playlistCovers[idx] = `data:${pic.format};base64,${window.btoa(b64)}`;
                    } else {
                        playlistCovers[idx] = '';
                    }
                    renderPlaylist();
                },
                onError: () => { playlistCovers[idx] = ''; renderPlaylist(); }
            });
        }
    });

    playlist.push(...audioFiles);
    renderPlaylist();
    if (wasEmpty) loadTrack(0);
    showToast(`+${audioFiles.length} track${audioFiles.length > 1 ? 's' : ''} added`);
}

function renderPlaylist() {
    const ul = document.getElementById('playlist-ul');
    ul.innerHTML = "";

    if (playlist.length === 0) {
        ul.innerHTML = '<li style="padding:12px 20px;color:#555;font-size:0.75rem;pointer-events:none;">No file loaded</li>';
        document.getElementById('track-count').textContent = '0 TRACK';
        return;
    }

    document.getElementById('track-count').textContent = playlist.length + ' TRACK' + (playlist.length > 1 ? 'S' : '');

    playlist.forEach((f, i) => {
        const li = document.createElement('li');
        li.dataset.index = i;
        li.draggable = true;
        if (i === currentTrackIndex) li.classList.add('active-track');

        li.innerHTML = `
            <span class="drag-handle" title="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></span>
            <span class="track-thumb">${playlistCovers[i] ? `<img src="${playlistCovers[i]}" alt="">` : '<i class="fa-solid fa-music"></i>'}</span>
            <span class="track-name" title="${f.name}">${f.name.replace(/\.[^.]+$/, '')}</span>
            <button class="btn-delete-track" title="Delete"><i class="fa-solid fa-xmark"></i></button>
        `;

        li.querySelector('.track-name').onclick = () => loadTrack(i);

        li.querySelector('.btn-delete-track').onclick = (ev) => {
            ev.stopPropagation();
            deleteTrack(i);
        };

        // Réordonnement par drag
        li.addEventListener('dragstart', (ev) => {
            ev.dataTransfer.effectAllowed = 'move';
            ev.dataTransfer.setData('text/plain', String(i));
            setTimeout(() => li.classList.add('dragging'), 0);
        });
        li.addEventListener('dragend', () => {
            li.classList.remove('dragging');
            ul.querySelectorAll('li').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
        });
        li.addEventListener('dragover', (ev) => {
            // Seulement si c'est un réordonnement interne
            if (!ev.dataTransfer.types.includes('text/plain')) return;
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'move';
            const mid = li.getBoundingClientRect().top + li.getBoundingClientRect().height / 2;
            ul.querySelectorAll('li').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
            li.classList.add(ev.clientY < mid ? 'drag-over-top' : 'drag-over-bottom');
        });
        li.addEventListener('dragleave', () => {
            li.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        li.addEventListener('drop', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const fromIndex = parseInt(ev.dataTransfer.getData('text/plain'));
            const toIndex = parseInt(li.dataset.index);
            if (isNaN(fromIndex) || fromIndex === toIndex) return;

            const mid = li.getBoundingClientRect().top + li.getBoundingClientRect().height / 2;
            const insertBefore = ev.clientY < mid;
            const moved = playlist.splice(fromIndex, 1)[0];
            const movedCover = playlistCovers.splice(fromIndex, 1)[0];
            let insertAt = insertBefore ? toIndex : toIndex + 1;
            if (fromIndex < toIndex) insertAt--;
            playlist.splice(insertAt, 0, moved);
            playlistCovers.splice(insertAt, 0, movedCover);

            if (currentTrackIndex === fromIndex) {
                currentTrackIndex = insertAt;
            } else if (fromIndex < currentTrackIndex && insertAt >= currentTrackIndex) {
                currentTrackIndex--;
            } else if (fromIndex > currentTrackIndex && insertAt <= currentTrackIndex) {
                currentTrackIndex++;
            }

            renderPlaylist();
            showToast("Playlist reordered");
        });

        ul.appendChild(li);
    });
}

function deleteTrack(index) {
    const isPlaying = index === currentTrackIndex;
    playlist.splice(index, 1);
    playlistCovers.splice(index, 1);

    if (playlist.length === 0) {
        audio.pause();
        audio.src = "";
        playIcon.className = "fa-solid fa-play";
        updatePausePill();
        metaDisplay.innerText = "LOAD YOUR FILES";
        document.getElementById('file-format').innerText = "---";
        document.getElementById('file-bitrate').innerText = "--- KBPS";
        document.getElementById('file-bpm').innerText = "--- BPM";
        resetCoverUI();
        currentTrackIndex = 0;
        renderPlaylist();
        return;
    }

    if (isPlaying) {
        currentTrackIndex = Math.min(index, playlist.length - 1);
        loadTrack(currentTrackIndex);
    } else {
        if (index < currentTrackIndex) currentTrackIndex--;
        renderPlaylist();
    }
    showToast("Track deleted");
}

// ============================================================
// DRAG & DROP FICHIERS DEPUIS L'OS
// ============================================================
const sidebar = document.getElementById('playlist-sidebar');
let osDropCounter = 0;

sidebar.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    osDropCounter++;
    sidebar.classList.add('drag-active');
});
sidebar.addEventListener('dragleave', () => {
    osDropCounter--;
    if (osDropCounter <= 0) {
        osDropCounter = 0;
        sidebar.classList.remove('drag-active');
    }
});
sidebar.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
});
sidebar.addEventListener('drop', (e) => {
    e.preventDefault();
    osDropCounter = 0;
    sidebar.classList.remove('drag-active');
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) addFiles(files);
});

// Empêcher le navigateur d'ouvrir les fichiers droppés hors de la sidebar
document.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault();
});
document.addEventListener('drop', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    if (!sidebar.contains(e.target)) {
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) addFiles(files);
    }
});

// ============================================================
// CHROMECAST
// ============================================================
let castSession = null;

window['__onGCastApiAvailable'] = function (isAvailable) {
    if (!isAvailable) return;
    cast.framework.CastContext.getInstance().setOptions({
        receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
    });
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
                showToast("Chromecast connected");
                castCurrentTrack();
            } else if (state === cast.framework.SessionState.SESSION_ENDED) {
                castSession = null;
                btn.classList.remove('casting');
                showToast("Chromecast disconnected");
            }
        }
    );
};

function castCurrentTrack() {
    if (!castSession || !playlist[currentTrackIndex]) return;
    showToast("Cast requires a stream URL");
}

