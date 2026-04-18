const playBtn = document.getElementById('play-btn');
let isPlaying = false;

playBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    
    if (isPlaying) {
        playBtn.classList.add('active-play');
        console.log("Lecture en cours...");
    } else {
        playBtn.classList.remove('active-play');
        console.log("Pause.");
    }
});

// Simulation de rotation du Jog Wheel
let rotation = 0;
document.querySelector('.jog-wheel-outer').addEventListener('wheel', (e) => {
    rotation += e.deltaY * 0.1;
    document.querySelector('.jog-wheel-outer').style.transform = `rotate(${rotation}deg)`;
});