const canvas = document.getElementById('puzzleCanvas');
const ctx = canvas.getContext('2d');

let currentMode = 'green'; 

// --- Interaction State ---
let greenTreeEdges = []; 
let brownTreeEdges = []; 
let hoveredEdge = null;
let errorFlashEdge = null; 
let errorFlashTime = 0;
let hintFlashEdge = null;
let hintFlashTime = 0;

// --- Solution State ---
let solutionGreenEdges = [];
let solutionBrownEdges = [];

// --- Geometry Setup ---
// Scaled down from 55 to fit the 380px canvas width
const HEX_SIZE = 42; 
const CENTER = { x: canvas.width / 2, y: canvas.height / 2 - 20 };

let centers = [];
let corners = [];
let allHexEdges = [];
let allTriEdges = [];

function getKey(x, y) { return Math.round(x * 100) + ',' + Math.round(y * 100); }
function getEdgeKey(p1, p2) { return [getKey(p1.x, p1.y), getKey(p2.x, p2.y)].sort().join('|'); }

// --- Initialization & Generation ---
function generateAttempt() {
    centers = [];
    corners = [];
    allHexEdges = [];
    allTriEdges = [];
    solutionGreenEdges = [];
    solutionBrownEdges = [];
    greenTreeEdges.length = 0;
    brownTreeEdges.length = 0;
    hoveredEdge = null;

    const hexes = [];
    for (let q = -2; q <= 2; q++) {
        for (let r = -2; r <= 2; r++) {
            if (Math.abs(q + r) <= 2) {
                hexes.push({ q, r });
            }
        }
    }

    const uniqueCornersMap = new Map();
    const localHexEdgeMap = new Map();

    hexes.forEach((hex, i) => {
        const cx = CENTER.x + HEX_SIZE * 1.5 * hex.q;
        const cy = CENTER.y + HEX_SIZE * Math.sqrt(3) * (hex.r + hex.q / 2);
        centers.push({ x: cx, y: cy, clue: 0, index: i });

        const hexCorners = [];
        for (let j = 0; j < 6; j++) {
            const angle = Math.PI / 180 * (60 * j);
            const px = cx + HEX_SIZE * Math.cos(angle);
            const py = cy + HEX_SIZE * Math.sin(angle);
            const key = getKey(px, py);
            
            if (!uniqueCornersMap.has(key)) {
                uniqueCornersMap.set(key, { x: px, y: py, clue: 0, id: key });
            }
            hexCorners.push(uniqueCornersMap.get(key));
        }

        for (let j = 0; j < 6; j++) {
            const p1 = hexCorners[j];
            const p2 = hexCorners[(j + 1) % 6];
            const edgeKey = getEdgeKey(p1, p2);
            
            if (!localHexEdgeMap.has(edgeKey)) {
                // solutionValue separates player drawing from the solution
                localHexEdgeMap.set(edgeKey, { id: edgeKey, p1, p2, hexIndices: [i], value: 0, solutionValue: 0 });
            } else {
                localHexEdgeMap.get(edgeKey).hexIndices.push(i);
            }
        }
    });

    corners = Array.from(uniqueCornersMap.values());
    const rawHexEdges = Array.from(localHexEdgeMap.values());

    const interiorHexEdges = [];
    const perimeterHexEdges = [];

    rawHexEdges.forEach(hexEdge => {
        if (hexEdge.hexIndices.length === 2) {
            interiorHexEdges.push(hexEdge);
            const u = hexEdge.hexIndices[0];
            const v = hexEdge.hexIndices[1];
            const triEdge = {
                id: getEdgeKey(centers[u], centers[v]),
                p1: centers[u],
                p2: centers[v],
                u: u,
                v: v,
                value: 0,
                solutionValue: 0
            };
            allTriEdges.push(triEdge);
            hexEdge.correspondingTriEdge = triEdge; 
        } else {
            perimeterHexEdges.push(hexEdge);
        }
    });

    perimeterHexEdges.sort((a, b) => {
        const midYa = (a.p1.y + a.p2.y) / 2;
        const midYb = (b.p1.y + b.p2.y) / 2;
        return midYb - midYa; 
    });

    perimeterHexEdges.splice(0, 3);
    const canopyEdges = perimeterHexEdges; 

    allHexEdges = [...interiorHexEdges, ...canopyEdges];

    const parent = {};
    function find(i) {
        if (parent[i] === undefined) parent[i] = i;
        if (parent[i] === i) return i;
        return parent[i] = find(parent[i]);
    }
    function union(i, j) {
        let rootI = find(i);
        let rootJ = find(j);
        if (rootI !== rootJ) {
            parent[rootI] = rootJ;
            return true;
        }
        return false;
    }

    canopyEdges.forEach(edge => {
        solutionGreenEdges.push(edge);
        union(edge.p1.id, edge.p2.id);
    });

    interiorHexEdges.forEach(edge => {
        const midX = (edge.p1.x + edge.p2.x) / 2;
        const midY = (edge.p1.y + edge.p2.y) / 2;
        const dist = Math.hypot(midX - CENTER.x, midY - CENTER.y);
        edge.weight = dist + Math.random() * HEX_SIZE * 2;
    });
    interiorHexEdges.sort((a, b) => a.weight - b.weight);

    interiorHexEdges.forEach(edge => {
        if (union(edge.p1.id, edge.p2.id)) {
            solutionGreenEdges.push(edge);
        } else {
            solutionBrownEdges.push(edge.correspondingTriEdge);
        }
    });

    // Assign Hashi Double Lines (40% to 60% dynamically per puzzle)
    const doubleProbability = 0.4 + Math.random() * 0.2; 
    
    solutionGreenEdges.forEach(e => {
        e.solutionValue = Math.random() < doubleProbability ? 2 : 1;
        e.value = 0; // Reset player state
    });
    
    solutionBrownEdges.forEach(e => {
        e.solutionValue = Math.random() < doubleProbability ? 2 : 1;
        e.value = 0; // Reset player state
    });
}

function initPuzzle() {
    generateAttempt();

    // Tally up the solutionValues of the connected edges for the clues
    solutionBrownEdges.forEach(e => {
        centers[e.u].clue += e.solutionValue;
        centers[e.v].clue += e.solutionValue;
    });

    solutionGreenEdges.forEach(e => {
        e.p1.clue += e.solutionValue;
        e.p2.clue += e.solutionValue;
    });
}

// --- Player Logic & Win Condition ---
function pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

function createsLoop(existingEdges, newEdge) {
    const parent = {};
    function find(i) {
        if (parent[i] === undefined) parent[i] = i;
        if (parent[i] === i) return i;
        return parent[i] = find(parent[i]);
    }
    function union(i, j) {
        let rootI = find(i);
        let rootJ = find(j);
        if (rootI !== rootJ) {
            parent[rootI] = rootJ;
            return true;
        }
        return false;
    }

    for (let e of existingEdges) {
        union(getKey(e.p1.x, e.p1.y), getKey(e.p2.x, e.p2.y));
    }
    return !union(getKey(newEdge.p1.x, newEdge.p1.y), getKey(newEdge.p2.x, newEdge.p2.y));
}

function checkWinCondition() {
    if (greenTreeEdges.length !== solutionGreenEdges.length) return false;
    if (brownTreeEdges.length !== solutionBrownEdges.length) return false;

    // Check if every edge the player drew perfectly matches its required solution weight
    const arraysMatch = (drawnTree) => {
        return drawnTree.every(edge => edge.value === edge.solutionValue);
    };

    if (!arraysMatch(greenTreeEdges)) return false;
    if (!arraysMatch(brownTreeEdges)) return false;

    return true;
}

// --- UI Updates & Buttons ---
function updateModeUI() {
    document.getElementById('btn-green').style.opacity = currentMode === 'green' ? '1' : '0.5';
    document.getElementById('btn-brown').style.opacity = currentMode === 'brown' ? '1' : '0.5';
}

document.getElementById('btn-green').addEventListener('click', () => { currentMode = 'green'; updateModeUI(); });
document.getElementById('btn-brown').addEventListener('click', () => { currentMode = 'brown'; updateModeUI(); });

updateModeUI();

document.getElementById('btn-new').addEventListener('click', initPuzzle);

document.getElementById('btn-hint').addEventListener('click', () => {
    // Find lines where the player's value is lower than the required solutionValue
    const missingGreen = solutionGreenEdges.filter(sol => sol.value < sol.solutionValue);
    const missingBrown = solutionBrownEdges.filter(sol => sol.value < sol.solutionValue);

    const allMissing = [
        ...missingGreen.map(e => ({ edge: e, type: 'green' })),
        ...missingBrown.map(e => ({ edge: e, type: 'brown' }))
    ];

    if (allMissing.length === 0) {
        alert("No more hints available! If the puzzle isn't solved, you may need to erase some incorrect lines.");
        return;
    }

    const hint = allMissing[Math.floor(Math.random() * allMissing.length)];
    const targetTree = hint.type === 'green' ? greenTreeEdges : brownTreeEdges;
    const drawnEdge = targetTree.find(d => d.id === hint.edge.id);

    if (drawnEdge) {
        drawnEdge.value = 2; // Upgrade to double
    } else {
        hint.edge.value = 1; // Draw single
        targetTree.push(hint.edge);
    }

    hintFlashEdge = hint.edge;
    hintFlashTime = Date.now();

    if (checkWinCondition()) triggerWin();
});


// --- Touch & Mouse Logic (Mobile Friendly) ---
function getPointerEdge(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    
    let closestDist = 20; // Increased radius to make finger-tapping easier
    let foundEdge = null;
    let targetEdges = currentMode === 'green' ? allHexEdges : allTriEdges;

    for (let edge of targetEdges) {
        const d = pointToSegmentDist(mx, my, edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y);
        if (d < closestDist) {
            closestDist = d;
            foundEdge = edge;
        }
    }
    return foundEdge;
}

function handleMove(e) {
    if (e.touches) e.preventDefault(); 
    hoveredEdge = getPointerEdge(e);
}

canvas.addEventListener('mousemove', handleMove);
canvas.addEventListener('touchmove', handleMove, { passive: false });

function triggerWin() {
    setTimeout(() => { 
        if (window.confirm("Congratulations! You've solved the puzzle! Play again?")) {
            initPuzzle();
        }
    }, 50);
}

function handleInteract(e) {
    if (e.touches) e.preventDefault(); // Stop mobile double-tap zoom
    
    const targetEdge = getPointerEdge(e);
    if (!targetEdge) return;

    const targetTree = currentMode === 'green' ? greenTreeEdges : brownTreeEdges;
    const existingEdge = targetTree.find(ed => ed.id === targetEdge.id);

    if (existingEdge) {
        if (existingEdge.value === 1) {
            // Upgrade to double line
            existingEdge.value = 2;
        } else {
            // Remove completely
            const index = targetTree.indexOf(existingEdge);
            targetTree.splice(index, 1);
            existingEdge.value = 0;
        }
    } else {
        // Draw new single line
        if (createsLoop(targetTree, targetEdge)) {
            errorFlashEdge = targetEdge;
            errorFlashTime = Date.now();
        } else {
            targetEdge.value = 1;
            targetTree.push(targetEdge);
        }
    }

    if (checkWinCondition()) triggerWin();
}

canvas.addEventListener('mousedown', handleInteract);
canvas.addEventListener('touchstart', handleInteract, { passive: false });


// --- Render Loop ---
function drawLine(p1, p2, color, width, isDashed = false) {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(isDashed ? [5, 5] : []);
    ctx.stroke();
    ctx.setLineDash([]);
}

// Advanced renderer for Hashi lines
function drawEdge(e, color, width, isDashed = false) {
    if (e.value === 2) {
        // Calculate normals to draw parallel offset lines
        const dx = e.p2.x - e.p1.x;
        const dy = e.p2.y - e.p1.y;
        const len = Math.hypot(dx, dy);
        const nx = (-dy / len) * 3.5; 
        const ny = (dx / len) * 3.5;

        drawLine({x: e.p1.x + nx, y: e.p1.y + ny}, {x: e.p2.x + nx, y: e.p2.y + ny}, color, width * 0.6, isDashed);
        drawLine({x: e.p1.x - nx, y: e.p1.y - ny}, {x: e.p2.x - nx, y: e.p2.y - ny}, color, width * 0.6, isDashed);
    } else {
        // Standard single line
        drawLine(e.p1, e.p2, color, width, isDashed);
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background grids
    allHexEdges.forEach(e => drawLine(e.p1, e.p2, '#dcdde1', 2));
    allTriEdges.forEach(e => drawLine(e.p1, e.p2, '#dcdde1', 2, true));

    // Draw hover state
    if (hoveredEdge) {
        drawLine(hoveredEdge.p1, hoveredEdge.p2, '#bdc3c7', 8);
    }

    // Draw player's hashi networks
    greenTreeEdges.forEach(e => drawEdge(e, '#27ae60', 6));
    brownTreeEdges.forEach(e => drawEdge(e, '#8B4513', 6)); 

    if (hintFlashEdge && Date.now() - hintFlashTime < 600) {
        drawLine(hintFlashEdge.p1, hintFlashEdge.p2, '#f1c40f', 12);
    }

    if (errorFlashEdge && Date.now() - errorFlashTime < 300) {
        drawLine(errorFlashEdge.p1, errorFlashEdge.p2, '#e74c3c', 8);
    }

    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Draw Brown Clues (Triangle centers)
    centers.forEach(c => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = '#ecf0f1'; 
        ctx.fill();
        ctx.fillStyle = '#8B4513';
        if(c.clue > 0) ctx.fillText(c.clue, c.x, c.y); 
    });

    // Draw Green Clues (Hexagon corners)
    corners.forEach(c => {
        if (c.clue > 0) { 
            ctx.beginPath();
            ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
            ctx.fillStyle = '#ecf0f1';
            ctx.fill();
            ctx.fillStyle = '#27ae60';
            ctx.fillText(c.clue, c.x, c.y);
        }
    });

    requestAnimationFrame(draw);
}

initPuzzle();
draw();