const canvas = document.getElementById('puzzleCanvas');
const ctx = canvas.getContext('2d');

let currentMode = 'green'; // 'green' (Hex edges) or 'brown' (Tri edges)

// --- Interaction State ---
let greenTreeEdges = []; // Array of drawn Hex edges
let brownTreeEdges = []; // Array of drawn Tri edges
let hoveredEdge = null;
let errorFlashEdge = null; // Used to flash red if a loop is attempted
let errorFlashTime = 0;

// --- Geometry Setup ---
const HEX_SIZE = 75;
const CENTER = { x: canvas.width / 2, y: canvas.height / 2 };

// The 7 Hexagons (Axial Coordinates) and our prototype clues
const hexData = [
    { q: 0, r: 0,   clue: "W:3 B:3" }, // Center
    { q: 0, r: -1,  clue: "W:2 B:2" }, // North
    { q: 1, r: -1,  clue: "W:4 B:1" }, // Northeast
    { q: 1, r: 0,   clue: "W:2 B:2" }, // Southeast
    { q: 0, r: 1,   clue: "W:4 B:1" }, // South
    { q: -1, r: 1,  clue: "W:2 B:2" }, // Southwest
    { q: -1, r: 0,  clue: "W:4 B:1" }  // Northwest
];

const centers = [];
const hexEdgeMap = new Map();
const triEdgeMap = new Map();

// Helper to create unique IDs for points and edges to avoid duplicates
function getKey(x, y) { return Math.round(x) + ',' + Math.round(y); }
function getEdgeKey(p1, p2) { return [getKey(p1.x, p1.y), getKey(p2.x, p2.y)].sort().join('|'); }

// 1. Generate Hex Centers and Edges (Green Tree)
hexData.forEach(hex => {
    // Convert Axial to Pixel Coordinates
    const cx = CENTER.x + HEX_SIZE * Math.sqrt(3) * (hex.q + hex.r / 2);
    const cy = CENTER.y + HEX_SIZE * 3/2 * hex.r;
    centers.push({ x: cx, y: cy, clue: hex.clue });

    const corners = [];
    for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 180 * (60 * i - 30);
        corners.push({ x: cx + HEX_SIZE * Math.cos(angle), y: cy + HEX_SIZE * Math.sin(angle) });
    }

    for (let i = 0; i < 6; i++) {
        const p1 = corners[i];
        const p2 = corners[(i + 1) % 6];
        const edgeKey = getEdgeKey(p1, p2);
        if (!hexEdgeMap.has(edgeKey)) {
            hexEdgeMap.set(edgeKey, { id: edgeKey, p1: p1, p2: p2 });
        }
    }
});

// 2. Generate Tri Edges connecting adjacent centers (Brown Tree)
for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
        // Two hexes are adjacent if the distance between them is ~ sqrt(3) * size
        const dist = Math.hypot(centers[i].x - centers[j].x, centers[i].y - centers[j].y);
        if (Math.abs(dist - HEX_SIZE * Math.sqrt(3)) < 5) { // 5px tolerance
            const edgeKey = getEdgeKey(centers[i], centers[j]);
            if (!triEdgeMap.has(edgeKey)) {
                triEdgeMap.set(edgeKey, { id: edgeKey, p1: centers[i], p2: centers[j] });
            }
        }
    }
}

const allHexEdges = Array.from(hexEdgeMap.values());
const allTriEdges = Array.from(triEdgeMap.values());

// --- Math & Loop Detection ---

// Point to Line Segment distance (for hovering)
function pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

// Union-Find algorithm to detect if adding an edge creates a closed loop
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

    // Build sets from existing edges
    for (let e of existingEdges) {
        union(getKey(e.p1.x, e.p1.y), getKey(e.p2.x, e.p2.y));
    }

    // Check if new edge connects two nodes already in the same set
    let root1 = find(getKey(newEdge.p1.x, newEdge.p1.y));
    let root2 = find(getKey(newEdge.p2.x, newEdge.p2.y));
    
    return root1 === root2;
}


// --- Event Listeners ---

// UI Buttons
document.getElementById('btn-green').addEventListener('click', (e) => {
    currentMode = 'green';
    document.getElementById('btn-green').style.opacity = '1';
    document.getElementById('btn-brown').style.opacity = '0.5';
});

document.getElementById('btn-brown').addEventListener('click', (e) => {
    currentMode = 'brown';
    document.getElementById('btn-brown').style.opacity = '1';
    document.getElementById('btn-green').style.opacity = '0.5';
});

// Initialize button styles
document.getElementById('btn-brown').style.opacity = '0.5';

// Mouse Hover Tracking
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    let closestDist = 15; // Hover snap radius
    hoveredEdge = null;

    const targetEdges = currentMode === 'green' ? allHexEdges : allTriEdges;
    
    for (let edge of targetEdges) {
        const d = pointToSegmentDist(mx, my, edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y);
        if (d < closestDist) {
            closestDist = d;
            hoveredEdge = edge;
        }
    }
});

// Mouse Click Toggle
canvas.addEventListener('mousedown', () => {
    if (!hoveredEdge) return;

    const targetTree = currentMode === 'green' ? greenTreeEdges : brownTreeEdges;
    const index = targetTree.findIndex(e => e.id === hoveredEdge.id);

    if (index > -1) {
        // If it already exists, remove it (erase)
        targetTree.splice(index, 1);
    } else {
        // If it doesn't exist, verify it doesn't create a loop
        if (createsLoop(targetTree, hoveredEdge)) {
            errorFlashEdge = hoveredEdge;
            errorFlashTime = Date.now();
        } else {
            targetTree.push(hoveredEdge);
        }
    }
});


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

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Base Grid (Faint)
    allHexEdges.forEach(e => drawLine(e.p1, e.p2, '#dcdde1', 2));
    allTriEdges.forEach(e => drawLine(e.p1, e.p2, '#dcdde1', 2, true));

    // 2. Draw Hover State
    if (hoveredEdge) {
        drawLine(hoveredEdge.p1, hoveredEdge.p2, '#bdc3c7', 8);
    }

    // 3. Draw Confirmed Trees
    greenTreeEdges.forEach(e => drawLine(e.p1, e.p2, '#27ae60', 6));
    brownTreeEdges.forEach(e => drawLine(e.p1, e.p2, '#8e44ad', 6)); // Using purple/brown

    // 4. Draw Error Flash (If loop attempted)
    if (errorFlashEdge && Date.now() - errorFlashTime < 300) {
        drawLine(errorFlashEdge.p1, errorFlashEdge.p2, '#e74c3c', 8);
    }

    // 5. Draw Hex Centers & Text Clues
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    centers.forEach(c => {
        // Draw little node circle
        ctx.beginPath();
        ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#7f8c8d';
        ctx.fill();

        // Draw Clue Text
        ctx.fillStyle = '#2c3e50';
        ctx.fillText(c.clue, c.x, c.y - 15);
    });

    requestAnimationFrame(draw);
}

// Start Engine
draw();