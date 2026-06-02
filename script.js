const canvas = document.getElementById('puzzleCanvas');
const ctx = canvas.getContext('2d');

let currentMode = 'green'; // 'green' or 'brown'

// Listen for drawing mode changes
document.getElementById('btn-green').addEventListener('click', () => currentMode = 'green');
document.getElementById('btn-brown').addEventListener('click', () => currentMode = 'brown');

// Main render loop
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // We will build the hexagon rendering logic here next
    
    requestAnimationFrame(draw);
}

// Start loop
draw();