/**
 * 1. CONFIGURATION INITIALE
 */
const audio = new Audio();
audio.volume = 0.05; 
audio.crossOrigin = "anonymous"; // Évite les blocages de sécurité sur certains fichiers

let playlist = [];
let currentTrackIndex = 0;
let audioContext, source, bassFilter, trebleFilter;
let loopA = null, loopB = null;
let showRemaining = false, isShuffle = false, repeatMode = 0; 

const playIcon = document.getElementById('play-icon');
const metaDisplay = document.getElementById('display-meta');
const seekSlider = document.getElementById('seek-slider');
const modal = document.getElementById('modal-overlay');

/**
 * 2. MOTEUR AUDIO (WEB AUDIO API)
 * Cette fonction crée les "câbles" entre la musique et les filtres.
 */
function initAudio() {
    if (audioContext) return; // Ne pas ré-initialiser si déjà fait
    
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // On crée la source à partir de l'élément audio
        source = audioContext.createMediaElementSource(audio);

        // Filtre pour les Basses (LOW)
        bassFilter = audioContext.createBiquadFilter();
        bassFilter.type = "lowshelf";
        bassFilter.frequency.value = 200;

        // Filtre pour les Aigus (HI)
        trebleFilter = audioContext.createBiquadFilter();
        trebleFilter.type = "highshelf";
        trebleFilter.frequency.value = 3000;

        // --- LE CÂBLAGE (Flux du son) ---
        // Audio -> Basses -> Aigus -> Destination (Haut-parleurs)
        source.connect(bassFilter);
        bassFilter.connect(trebleFilter);
        trebleFilter.connect(audioContext.destination);
        
        console.log("Moteur Audio : Connecté et filtré.");
    } catch (e) {
        console.error("Erreur lors de l'initialisation audio :", e);
    }
}

/**
 * 3. APPLICATION DES FILTRES
 */
function updateFilters() {
    // Si l'utilisateur n'a pas encore cliqué sur Play, les filtres n'existent pas encore
    if (!bassFilter || !trebleFilter) return;

    const isBypassed = document.getElementById('bypass-btn').classList.contains('active-danger');

    if (isBypassed) {
        // Mode Neutre
        bassFilter.gain.value = 0;
        trebleFilter.gain.value = 0;
    } else {
        let bValue = parseFloat(document.getElementById('bass-slider').value);
        let tValue = parseFloat(document.getElementById('treble-slider').value);

        // Si Loudness est actif, on ajoute un boost fixe
        if (document.getElementById('loudness-btn').classList.contains('active')) {
            bValue += 12;
            tValue += 8;
        }

        bassFilter.gain.value = bValue;
        trebleFilter.gain.value = tValue;
    }
}

/**
 * 4. LECTURE ET MÉTAMODÈLE
 */
function loadTrack(index) {
    if (!playlist[index]) return;
    
    // Initialisation du moteur audio dès le premier chargement
    initAudio();

    currentTrackIndex = index;
    const file = playlist[index];
    audio.src = URL.createObjectURL(file);
    
    document.querySelectorAll('#playlist-ul li').forEach((li, i) => {
        li.className = (i === index) ? 'active-track' : '';
    });

    if (window.jsmediatags) {
        window.jsmediatags.read(file, {
            onSuccess: (tag) => {
                const { title, artist, album, picture } = tag.tags;
                const t = title || file.name.split('.')[0];
                const art = artist || "Artiste Inconnu";
                const alb = album || "Album Inconnu";
                metaDisplay.innerText = `${t} - ${alb} - ${art}`;
                
                if (picture) {
                    let b64 = "";
                    for (let i = 0; i < picture.data.length; i++) b64 += String.fromCharCode(picture.data[i]);
                    const artworkUrl = "data:" + picture.format + ";base64," + window.btoa(b64);
                    document.getElementById('album-art').src = artworkUrl;
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

function resetCover() {
    document.getElementById('album-art').style.display = "none";
    document.getElementById('no-cover-text').style.display = "block";
    document.getElementById('album-art').src = "";
}

function togglePlay() {
    initAudio();
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }

    if (audio.paused) { 
        audio.play(); 
        playIcon.className = "fa-solid fa-pause"; 
    } else { 
        audio.pause(); 
        playIcon.className = "fa-solid fa-play"; 
    }
}

/**
 * 5. ÉVÉNEMENTS INTERFACE
 */

// Importation
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

// Transport
document.getElementById('play-pause').onclick = togglePlay;
document.getElementById('next-btn').onclick = () => {
    if (isShuffle) loadTrack(Math.floor(Math.random() * playlist.length));
    else if (currentTrackIndex < playlist.length - 1) loadTrack(currentTrackIndex + 1);
};
document.getElementById('prev-btn').onclick = () => {
    if (currentTrackIndex > 0) loadTrack(currentTrackIndex - 1);
};

// Mixeur Sliders
document.getElementById('volume-slider').oninput = (e) => { audio.volume = e.target.value; };
document.getElementById('bass-slider').oninput = updateFilters;
document.getElementById('treble-slider').oninput = updateFilters;
document.getElementById('pitch-slider').oninput = (e) => { audio.playbackRate = e.target.value; };

// Boutons d'effets
document.getElementById('loudness-btn').onclick = function() { 
    this.classList.toggle('active'); 
    updateFilters(); 
};
document.getElementById('bypass-btn').onclick = function() { 
    this.classList.toggle('active-danger'); 
    updateFilters(); 
};
document.getElementById('mute-btn').onclick = function() { 
    this.classList.toggle('active-danger'); 
    audio.muted = !audio.muted; 
};

// Resets (RST)
document.querySelectorAll('.btn-rst[data-target]').forEach(btn => {
    btn.onclick = () => {
        const targetId = btn.getAttribute('data-target');
        const targetInput = document.getElementById(targetId);
        targetInput.value = (targetId === 'pitch-slider') ? 1 : 0;
        targetInput.dispatchEvent(new Event('input')); 
    };
});

// Temps et Seek
seekSlider.oninput = (e) => { audio.currentTime = (e.target.value / 100) * audio.duration; };

audio.ontimeupdate = () => {
    seekSlider.value = (audio.currentTime / audio.duration) * 100 || 0;
    document.getElementById('current-time').innerText = formatTime(audio.currentTime);
    document.getElementById('duration').innerText = formatTime(audio.duration);
};

function formatTime(s) {
    if (isNaN(s)) return "00:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return (m < 10 ? "0" + m : m) + ":" + (sec < 10 ? "0" + sec : sec);
}

// Modale Cover
document.getElementById('art-trigger').onclick = () => {
    const currentImg = document.getElementById('album-art').src;
    if (!currentImg || playlist.length === 0 || currentImg.includes(window.location.host) === false) return;
    document.getElementById('modal-img').src = currentImg;
    modal.style.display = 'flex';
};
document.getElementById('close-modal').onclick = () => modal.style.display = 'none';
document.getElementById('eject-btn').onclick = () => document.getElementById('file-upload').click();