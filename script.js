const canvas = document.getElementById('puzzleCanvas');
const ctx = canvas.getContext('2d');

let currentMode = 'green'; 
let currentRadius = 2; // Default to size 3

// --- Camera & View State ---
let scale = 1;
let minScale = 0.5;
let maxScale = 2.5; // Prevent zooming in to a single pixel
let offsetX = 0;
let offsetY = 0;
let isPanning = false;
let lastPanX = 0;
let lastPanY = 0;
let lastPinchDist = null;

// --- Interaction State ---
let greenTreeEdges = []; 
let brownTreeEdges = []; 
let hoveredEdge = null;
let errorFlashEdge = null; 
let errorFlashTime = 0;
let hintFlashEdge = null;
let hintFlashTime = 0;
let puzzleModified = false; // Tracks if the user has made any moves

// --- Solution State ---
let solutionGreenEdges = [];
let solutionBrownEdges = [];

// --- Geometry Setup ---
const HEX_SIZE = 42; 

let centers = [];
let corners = [];
let allHexEdges = [];
let allTriEdges = [];

function getKey(x, y) { return Math.round(x * 100) + ',' + Math.round(y * 100); }
function getEdgeKey(p1, p2) { return [getKey(p1.x, p1.y), getKey(p2.x, p2.y)].sort().join('|'); }

function calculateScaleBounds() {
    // Determine the absolute width of the puzzle in pixels
    const puzzlePixelWidth = (currentRadius * 3 + 2) * HEX_SIZE;
    // Increased to 2.5 to account for the new 1.5x height trunk at the bottom
    const puzzlePixelHeight = (currentRadius * 2 + 2.5) * Math.sqrt(3) * HEX_SIZE;
    
    // Set the minimum scale so the puzzle exactly fills the shortest side of the screen 
    // minus a tiny bit of padding (20px).
    const scaleX = canvas.width / (puzzlePixelWidth + 20);
    const scaleY = canvas.height / (puzzlePixelHeight + 20);
    
    minScale = Math.min(scaleX, scaleY);

    // If resizing the screen pushed our current scale below the new minimum, snap back
    if (scale < minScale) {
        scale = minScale;
        offsetX = canvas.width / 2;
        // Shift visual center slightly down to account for the trunk
        offsetY = canvas.height / 2 - (0.75 * Math.sqrt(3) * HEX_SIZE * scale);
    }
}

function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    calculateScaleBounds();
    
    // Only auto-center if the puzzle is smaller than the screen
    if(scale <= minScale) {
        offsetX = canvas.width / 2;
        offsetY = canvas.height / 2 - (0.75 * Math.sqrt(3) * HEX_SIZE * scale);
    }
}
window.addEventListener('resize', resizeCanvas);

// --- Initialization & Generation ---
function generateAttempt(radius) {
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
    for (let q = -radius; q <= radius; q++) {
        for (let r = -radius; r <= radius; r++) {
            if (Math.abs(q + r) <= radius) {
                hexes.push({ q, r });
            }
        }
    }

    const uniqueCornersMap = new Map();
    const localHexEdgeMap = new Map();

    hexes.forEach((hex, i) => {
        const cx = HEX_SIZE * 1.5 * hex.q;
        const cy = HEX_SIZE * Math.sqrt(3) * (hex.r + hex.q / 2);
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

    // Always remove exactly 3 edges for the bottom hex trunk opening
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

    // Randomly select a generation style for this puzzle (0 through 6)
    const styleMode = Math.floor(Math.random() * 7);

    interiorHexEdges.forEach(edge => {
        const midX = (edge.p1.x + edge.p2.x) / 2;
        const midY = (edge.p1.y + edge.p2.y) / 2;
        const dist = Math.hypot(midX, midY);
        
        const noise = Math.random() * HEX_SIZE * 2; // Adds an organic, winding feel

        switch(styleMode) {
            case 0: // Green claims center, pushing Brown to form a ring
                edge.weight = dist + noise;
                break;
            case 1: // Brown claims center, acting as a dense, branching trunk
                edge.weight = -dist + noise;
                break;
            case 2: // Completely unbiased, natural winding paths
                edge.weight = Math.random();
                break;
            case 3: // Top Bias
                edge.weight = midY + noise; 
                break;
            case 4: // Bottom Bias
                edge.weight = -midY + noise;
                break;
            case 5: // Left Bias
                edge.weight = midX + noise;
                break;
            case 6: // Right Bias
                edge.weight = -midX + noise;
                break;
        }
    });
    
    interiorHexEdges.sort((a, b) => a.weight - b.weight);

    interiorHexEdges.forEach(edge => {
        if (union(edge.p1.id, edge.p2.id)) {
            solutionGreenEdges.push(edge);
        } else {
            solutionBrownEdges.push(edge.correspondingTriEdge);
        }
    });

    const doubleProbability = 0.4 + Math.random() * 0.2; 
    
    solutionGreenEdges.forEach(e => {
        e.solutionValue = Math.random() < doubleProbability ? 2 : 1;
        e.value = 0; 
    });
    
    solutionBrownEdges.forEach(e => {
        e.solutionValue = Math.random() < doubleProbability ? 2 : 1;
        e.value = 0; 
    });

    // Auto-fill the outer green perimeter with a single connection
    canopyEdges.forEach(e => {
        e.value = 1;
        greenTreeEdges.push(e);
    });
}

function initPuzzle(radius = 2) {
    currentRadius = radius;
    // Force a resize to properly set canvas dimensions before math
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    
    calculateScaleBounds();
    scale = minScale; // Start fully zoomed out
    offsetX = canvas.width / 2;
    offsetY = canvas.height / 2 - (0.75 * Math.sqrt(3) * HEX_SIZE * scale);

    generateAttempt(radius);

    solutionBrownEdges.forEach(e => {
        centers[e.u].clue += e.solutionValue;
        centers[e.v].clue += e.solutionValue;
    });

    solutionGreenEdges.forEach(e => {
        e.p1.clue += e.solutionValue;
        e.p2.clue += e.solutionValue;
    });

    puzzleModified = false; // Reset progress tracker on new puzzle
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

// Wrapper function to check for lost progress
function requestNewPuzzle(radius) {
    if (puzzleModified && !checkWinCondition()) {
        if (!window.confirm("Create new puzzle? Your progress on this puzzle will be lost.")) {
            return; // Exit if the user clicks Cancel
        }
    }
    initPuzzle(radius);
}

document.getElementById('btn-new-3').addEventListener('click', () => requestNewPuzzle(2));
document.getElementById('btn-new-4').addEventListener('click', () => requestNewPuzzle(3));

document.getElementById('btn-hint').addEventListener('click', () => {
    puzzleModified = true; // Count hint usage as making progress

    const missingGreen = solutionGreenEdges.filter(sol => sol.value < sol.solutionValue);
    const missingBrown = solutionBrownEdges.filter(sol => sol.value < sol.solutionValue);

    const allMissing = [
        ...missingGreen.map(e => ({ edge: e, type: 'green' })),
        ...missingBrown.map(e => ({ edge: e, type: 'brown' }))
    ];

    if (allMissing.length === 0) {
        alert("No more hints available! You may need to erase some incorrect lines.");
        return;
    }

    const hint = allMissing[Math.floor(Math.random() * allMissing.length)];
    const targetTree = hint.type === 'green' ? greenTreeEdges : brownTreeEdges;
    const drawnEdge = targetTree.find(d => d.id === hint.edge.id);

    if (drawnEdge) {
        drawnEdge.value = 2; 
    } else {
        hint.edge.value = 1; 
        targetTree.push(hint.edge);
    }

    hintFlashEdge = hint.edge;
    hintFlashTime = Date.now();

    // Auto-pan camera to the hint location
    offsetX = canvas.width / 2 - ((hint.edge.p1.x + hint.edge.p2.x) / 2) * scale;
    offsetY = canvas.height / 2 - ((hint.edge.p1.y + hint.edge.p2.y) / 2) * scale;

    if (checkWinCondition()) triggerWin();
});


// --- Camera & Interaction Logic ---
function getTransformedPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - offsetX) / scale;
    const y = (clientY - rect.top - offsetY) / scale;
    return { x, y };
}

function getPointerEdge(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const pt = getTransformedPoint(clientX, clientY);
    
    let closestDist = 20 / scale; 
    let foundEdge = null;
    let targetEdges = currentMode === 'green' ? allHexEdges : allTriEdges;

    for (let edge of targetEdges) {
        const d = pointToSegmentDist(pt.x, pt.y, edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y);
        if (d < closestDist) {
            closestDist = d;
            foundEdge = edge;
        }
    }
    return foundEdge;
}

function handleInteract(targetEdge) {
    puzzleModified = true; // Mark the puzzle as modified

    const targetTree = currentMode === 'green' ? greenTreeEdges : brownTreeEdges;
    const existingEdge = targetTree.find(ed => ed.id === targetEdge.id);

    if (existingEdge) {
        if (existingEdge.value === 1) {
            existingEdge.value = 2;
        } else {
            const index = targetTree.indexOf(existingEdge);
            targetTree.splice(index, 1);
            existingEdge.value = 0;
        }
    } else {
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

// Touch controls (Mobile)
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); 
    
    if (e.touches.length === 2) {
        isPanning = false;
        lastPinchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        return;
    }

    const targetEdge = getPointerEdge(e);
    if (!targetEdge) {
        isPanning = true;
        lastPanX = e.touches[0].clientX;
        lastPanY = e.touches[0].clientY;
    } else {
        handleInteract(targetEdge);
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    
    // Pinch to zoom
    if (e.touches.length === 2) {
        const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        if (lastPinchDist) {
            let zoom = dist / lastPinchDist;
            let newScale = scale * zoom;
            
            // Constrain Zoom
            if (newScale < minScale) { zoom = minScale / scale; newScale = minScale; }
            if (newScale > maxScale) { zoom = maxScale / scale; newScale = maxScale; }

            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const rect = canvas.getBoundingClientRect();
            const canvasX = midX - rect.left;
            const canvasY = midY - rect.top;

            offsetX = canvasX - (canvasX - offsetX) * zoom;
            offsetY = canvasY - (canvasY - offsetY) * zoom;
            scale = newScale;
        }
        lastPinchDist = dist;
        return;
    }

    // 1-finger panning
    if (isPanning) {
        const dx = e.touches[0].clientX - lastPanX;
        const dy = e.touches[0].clientY - lastPanY;
        offsetX += dx;
        offsetY += dy;
        lastPanX = e.touches[0].clientX;
        lastPanY = e.touches[0].clientY;
    } else {
        hoveredEdge = getPointerEdge(e);
    }
}, { passive: false });

canvas.addEventListener('touchend', () => {
    isPanning = false;
    lastPinchDist = null;
});

// Mouse Controls (Desktop fallback)
canvas.addEventListener('mousedown', (e) => {
    const targetEdge = getPointerEdge(e);
    if (!targetEdge) {
        isPanning = true;
        lastPanX = e.clientX;
        lastPanY = e.clientY;
    } else {
        handleInteract(targetEdge);
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (isPanning) {
        offsetX += e.clientX - lastPanX;
        offsetY += e.clientY - lastPanY;
        lastPanX = e.clientX;
        lastPanY = e.clientY;
    } else {
        hoveredEdge = getPointerEdge(e);
    }
});

window.addEventListener('mouseup', () => { isPanning = false; });

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    let zoom = e.deltaY > 0 ? 0.9 : 1.1;
    let newScale = scale * zoom;
    
    // Constrain zoom
    if (newScale < minScale) { zoom = minScale / scale; newScale = minScale; }
    if (newScale > maxScale) { zoom = maxScale / scale; newScale = maxScale; }

    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    
    offsetX = canvasX - (canvasX - offsetX) * zoom;
    offsetY = canvasY - (canvasY - offsetY) * zoom;
    scale = newScale;
}, { passive: false });


function triggerWin() {
    setTimeout(() => { 
        if (window.confirm("Congratulations! You've solved the puzzle! Play again?")) {
            initPuzzle(currentRadius);
        }
    }, 50);
}


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

function drawEdge(e, color, width, isDashed = false) {
    if (e.value === 2) {
        const dx = e.p2.x - e.p1.x;
        const dy = e.p2.y - e.p1.y;
        const len = Math.hypot(dx, dy);
        const nx = (-dy / len) * 3.5; 
        const ny = (dx / len) * 3.5;

        drawLine({x: e.p1.x + nx, y: e.p1.y + ny}, {x: e.p2.x + nx, y: e.p2.y + ny}, color, width * 0.6, isDashed);
        drawLine({x: e.p1.x - nx, y: e.p1.y - ny}, {x: e.p2.x - nx, y: e.p2.y - ny}, color, width * 0.6, isDashed);
    } else {
        drawLine(e.p1, e.p2, color, width, isDashed);
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Draw background grids
    allHexEdges.forEach(e => drawLine(e.p1, e.p2, '#dcdde1', 2));
    allTriEdges.forEach(e => drawLine(e.p1, e.p2, '#dcdde1', 2, true));

    // Draw hover state
    if (hoveredEdge) {
        drawLine(hoveredEdge.p1, hoveredEdge.p2, '#bdc3c7', 8 / scale);
    }

    // Draw player's networks
    greenTreeEdges.forEach(e => drawEdge(e, '#27ae60', 6));

    // Draw the slender brown trunk
    if (centers.length > 0) {
        // Find the lowest point on the brown grid
        let bottomCenter = centers.reduce((max, c) => c.y > max.y ? c : max, centers[0]);
        let hexHeight = Math.sqrt(3) * HEX_SIZE;
        let startX = bottomCenter.x;
        let startY = bottomCenter.y;
        let endY = startY + 1.5 * hexHeight; // 1.5x the height of a hex
        
        let wTop = 10; // Slightly wider than a 6px line
        let wMid = 5;  // Thins out in the middle
        let wBot = 14; // Gently flares at the base

        ctx.beginPath();
        ctx.moveTo(startX - wTop/2, startY);
        // Curve down left
        ctx.bezierCurveTo(
            startX - wMid/2, startY + (endY - startY) * 0.4,
            startX - wMid/2, startY + (endY - startY) * 0.6,
            startX - wBot/2, endY
        );
        // Bottom flat edge
        ctx.lineTo(startX + wBot/2, endY);
        // Curve up right
        ctx.bezierCurveTo(
            startX + wMid/2, startY + (endY - startY) * 0.6,
            startX + wMid/2, startY + (endY - startY) * 0.4,
            startX + wTop/2, startY
        );
        ctx.closePath();
        ctx.fillStyle = '#8B4513';
        ctx.fill();
    }

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

    // Draw Brown Clues 
    centers.forEach(c => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = '#ecf0f1'; 
        ctx.fill();
        ctx.fillStyle = '#8B4513';
        if(c.clue > 0) ctx.fillText(c.clue, c.x, c.y); 
    });

    // Draw Green Clues
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

    ctx.restore();
    requestAnimationFrame(draw);
}

// Initial boot - slight delay so the DOM has time to render its proper sizes before calculations
setTimeout(() => initPuzzle(2), 150); 
draw();