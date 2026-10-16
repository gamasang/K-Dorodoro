// --- Keidrororo Game Engine ---

// Map & Grid Config
const MAP_RADIUS = 10;
const TILE_SIZE = 23; 

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let originX = canvas.width / 2;
let originY = canvas.height / 2;

// Map Coordinates Definition
// Corners A..F
// A (West / Left): q=0, r=-10 (Thief HQ)
// B (NW): q=-10, r=0 (Cat 1 / Goal B)
// C (NE): q=-10, r=10 (Lab or PowerPlant)
// D (East / Right): q=0, r=10 (Police HQ)
// E (SE): q=10, r=0 (Lab or PowerPlant)
// F (SW): q=10, r=-10 (Cat 2 / Goal F)

const CORNER_A = { q: 0, r: -10 };
const CORNER_B = { q: -10, r: 0 };
const CORNER_C = { q: -10, r: 10 };
const CORNER_D = { q: 0, r: 10 }; // Police HQ
const CORNER_E = { q: 10, r: 0 };
const CORNER_F = { q: 10, r: -10 };

// Jail position: 3 tiles left of Police HQ (q=0, r=7)
const JAIL_POS = { q: 0, r: 7 };

// Game State Variables
let turnNumber = 1;
let currentPhase = 'PLOT'; // 'PLOT' or 'EXECUTE'
let selectedUnitIndex = 0;
let isPowerPlantHacked = false;
let hackTurnsRemaining = 0;
let isTreasureStolen = false;
let activeDeliveryGoalCorner = null; // 'B' or 'F'

// Randomize C & E for Lab and PowerPlant
let labCorner = Math.random() < 0.5 ? CORNER_C : CORNER_E;
let powerPlantCorner = (labCorner === CORNER_C) ? CORNER_E : CORNER_C;

// Police HQ Stock
let policeHqStock = {
    TAZER: 1,
    CART: 1,
    VEST: 1,
    HELMET: 1,
    BOOSTER: 1
};

// Ground Items Map: key "q,r" -> Array of items [{id, name, type, weight}]
let groundItems = {};

// Security Cameras (10 total)
let securityCameras = [];

function initCameras() {
    securityCameras = [];
    // 3 near Corner C
    let cNeighbors = getNeighbors(labCorner.q, labCorner.r);
    for(let i=0; i<Math.min(3, cNeighbors.length); i++) securityCameras.push(cNeighbors[i]);
    
    // 3 near Corner D (Police HQ)
    let dNeighbors = getNeighbors(CORNER_D.q, CORNER_D.r);
    for(let i=0; i<Math.min(3, dNeighbors.length); i++) securityCameras.push(dNeighbors[i]);

    // 3 near Corner E
    let eNeighbors = getNeighbors(powerPlantCorner.q, powerPlantCorner.r);
    for(let i=0; i<Math.min(3, eNeighbors.length); i++) securityCameras.push(eNeighbors[i]);

    // 1 adjacent to Jail
    let jailNeighbors = getNeighbors(JAIL_POS.q, JAIL_POS.r);
    if(jailNeighbors.length > 0) securityCameras.push(jailNeighbors[0]);
}

// Units Array
// Note: Dog (D1) and Cats (C1, C2) are NPC AI units.
let units = [
    {
        id: 'S1', name: '泥棒スライム 1', type: 'SLIME', team: 'THIEF', isNpc: false,
        q: 0, r: -9, color: '#ef4444', moveLimit: 6,
        isJailed: false, inventory: [], plot: [], hasTreasure: false
    },
    {
        id: 'S2', name: '泥棒スライム 2', type: 'SLIME', team: 'THIEF', isNpc: false,
        q: 1, r: -10, color: '#f87171', moveLimit: 6,
        isJailed: false, inventory: [], plot: [], hasTreasure: false
    },
    {
        id: 'S3', name: '泥棒スライム 3', type: 'SLIME', team: 'THIEF', isNpc: false,
        q: -1, r: -9, color: '#fca5a5', moveLimit: 6,
        isJailed: false, inventory: [], plot: [], hasTreasure: false
    },
    {
        id: 'P1', name: '警察官 1', type: 'POLICE', team: 'POLICE', isNpc: false,
        q: -1, r: 10, color: '#3b82f6', moveLimit: 6,
        isJailed: false, inventory: [], plot: []
    },
    {
        id: 'P2', name: '警察官 2', type: 'POLICE', team: 'POLICE', isNpc: false,
        q: 1, r: 9, color: '#60a5fa', moveLimit: 6,
        isJailed: false, inventory: [], plot: []
    },
    {
        id: 'D1', name: '警察犬 1', type: 'DOG', team: 'POLICE', isNpc: true,
        q: 0, r: 9, color: '#93c5fd', moveLimit: 8,
        isJailed: false, inventory: [], plot: [], stunTurns: 0, target: null
    },
    {
        id: 'C1', name: '泥棒猫 1', type: 'CAT', team: 'THIEF', isNpc: true,
        q: CORNER_B.q, r: CORNER_B.r, color: '#fbbf24', moveLimit: 7,
        isJailed: false, inventory: [], plot: []
    },
    {
        id: 'C2', name: '泥棒猫 2', type: 'CAT', team: 'THIEF', isNpc: true,
        q: CORNER_F.q, r: CORNER_F.r, color: '#f59e0b', moveLimit: 7,
        isJailed: false, inventory: [], plot: []
    }
];

// Helper Functions for Hex Grids
function hexToPixel(q, r) {
    let x = originX + TILE_SIZE * (Math.sqrt(3) * q + Math.sqrt(3)/2 * r);
    let y = originY + TILE_SIZE * (3/2 * r);
    return { x, y };
}

function pixelToHex(x, y) {
    let px = (x - originX) / TILE_SIZE;
    let py = (y - originY) / TILE_SIZE;
    let q = (Math.sqrt(3)/3 * px - 1/3 * py);
    let r = (2/3 * py);
    return hexRound(q, r);
}

function hexRound(q, r) {
    let s = -q - r;
    let rq = Math.round(q);
    let rr = Math.round(r);
    let rs = Math.round(s);

    let qDiff = Math.abs(rq - q);
    let rDiff = Math.abs(rr - r);
    let sDiff = Math.abs(rs - s);

    if (qDiff > rDiff && qDiff > sDiff) {
        rq = -rr - rs;
    } else if (rDiff > sDiff) {
        rr = -rq - rs;
    }
    return { q: rq, r: rr };
}

function hexDistance(a, b) {
    return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(-a.q - a.r - (-b.q - b.r))) / 2;
}

function isValidHex(q, r) {
    let s = -q - r;
    return Math.abs(q) <= MAP_RADIUS && Math.abs(r) <= MAP_RADIUS && Math.abs(s) <= MAP_RADIUS;
}

function getNeighbors(q, r) {
    let dirs = [
        {q:1, r:0}, {q:1, r:-1}, {q:0, r:-1},
        {q:-1, r:0}, {q:-1, r:1}, {q:0, r:1}
    ];
    let res = [];
    dirs.forEach(d => {
        let nq = q + d.q;
        let nr = r + d.r;
        if (isValidHex(nq, nr)) res.push({ q: nq, r: nr });
    });
    return res;
}

// Impassable Check
function isImpassableTile(q, r) {
    // Police HQ (CORNER_D) is impassable for both teams
    if (q === CORNER_D.q && r === CORNER_D.r) return true;
    return false;
}

// Item Drop Management
function getGroundItemCount() {
    let count = 0;
    Object.keys(groundItems).forEach(key => {
        count += groundItems[key].length;
    });
    return count;
}

function spawnRandomItems(amount) {
    let currentTotal = getGroundItemCount();
    let toSpawn = Math.min(amount, 30 - currentTotal);
    if (toSpawn <= 0) return;

    let possibleTiles = [];
    for (let q = -MAP_RADIUS; q <= MAP_RADIUS; q++) {
        for (let r = -MAP_RADIUS; r <= MAP_RADIUS; r++) {
            if (isValidHex(q, r) && !isImpassableTile(q, r)) {
                // Not a building tile
                if (!(q === CORNER_A.q && r === CORNER_A.r) &&
                    !(q === labCorner.q && r === labCorner.r) &&
                    !(q === powerPlantCorner.q && r === powerPlantCorner.r) &&
                    !(q === JAIL_POS.q && r === JAIL_POS.r)) {
                    possibleTiles.push({ q, r });
                }
            }
        }
    }

    // Shuffle and pick
    possibleTiles.sort(() => Math.random() - 0.5);

    for (let i = 0; i < Math.min(toSpawn, possibleTiles.length); i++) {
        let tile = possibleTiles[i];
        let key = `${tile.q},${tile.r}`;
        if (!groundItems[key]) groundItems[key] = [];

        let isBone = Math.random() < 0.5;
        let item = isBone ? 
            { id: 'BONE_' + Date.now() + '_' + i, name: '骨', type: 'BONE', weight: 2 } :
            { id: 'SMOKE_' + Date.now() + '_' + i, name: 'スプレー缶', type: 'SMOKE', weight: 1 };

        groundItems[key].push(item);
    }
}

// Initial Game Setup
function initGame() {
    initCameras();
    // Drop initial items (Turn 1)
    spawnRandomItems(10);
    updateUI();
    drawGrid();
}

// BFS Pathfinding (respecting impassable tiles)
function findPathBFS(start, target, maxSteps) {
    if (start.q === target.q && start.r === target.r) return [];
    if (isImpassableTile(target.q, target.r)) return [];

    let queue = [[start]];
    let visited = new Set();
    visited.add(`${start.q},${start.r}`);

    let bestPath = [];

    while (queue.length > 0) {
        let path = queue.shift();
        let curr = path[path.length - 1];

        if (curr.q === target.q && curr.r === target.r) {
            let res = path.slice(1);
            if (maxSteps && res.length > maxSteps) return res.slice(0, maxSteps);
            return res;
        }

        if (path.length - 1 > (maxSteps || 30)) continue;

        let neighbors = getNeighbors(curr.q, curr.r);
        for (let n of neighbors) {
            if (isImpassableTile(n.q, n.r)) continue;
            let key = `${n.q},${n.r}`;
            if (!visited.has(key)) {
                visited.add(key);
                let newPath = [...path, n];
                queue.push(newPath);
                if (newPath.length - 1 <= maxSteps) {
                    bestPath = newPath.slice(1);
                }
            }
        }
    }

    return bestPath;
}

// Calculate Destination for a Unit
function getUnitDestination(unit) {
    if (unit.plot && unit.plot.length > 0) {
        let last = unit.plot[unit.plot.length - 1];
        return { q: last.q, r: last.r };
    }
    return { q: unit.q, r: unit.r };
}

// Drawing Logic
function drawGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Hex Tiles
    for (let q = -MAP_RADIUS; q <= MAP_RADIUS; q++) {
        for (let r = -MAP_RADIUS; r <= MAP_RADIUS; r++) {
            if (!isValidHex(q, r)) continue;

            let pix = hexToPixel(q, r);
            let fillColor = '#1e293b'; // Default dark tile
            let strokeColor = '#334155';

            // Special Structures Color
            if (q === CORNER_A.q && r === CORNER_A.r) fillColor = '#450a0a'; // Thief HQ
            else if (q === CORNER_D.q && r === CORNER_D.r) fillColor = '#1e3a8a'; // Police HQ
            else if (q === JAIL_POS.q && r === JAIL_POS.r) fillColor = '#581c87'; // Jail
            else if (q === labCorner.q && r === labCorner.r) fillColor = '#1e1b4b'; // Lab
            else if (q === powerPlantCorner.q && r === powerPlantCorner.r) fillColor = '#064e3b'; // PowerPlant
            else if (q === CORNER_B.q && r === CORNER_B.r) fillColor = (activeDeliveryGoalCorner === 'B') ? '#047857' : '#312e81';
            else if (q === CORNER_F.q && r === CORNER_F.r) fillColor = (activeDeliveryGoalCorner === 'F') ? '#047857' : '#312e81';

            drawHexagon(pix.x, pix.y, TILE_SIZE - 1, fillColor, strokeColor);

            // Draw Ground Items
            let itemKey = `${q},${r}`;
            if (groundItems[itemKey] && groundItems[itemKey].length > 0) {
                let count = groundItems[itemKey].length;
                let firstItem = groundItems[itemKey][0];
                ctx.beginPath();
                ctx.arc(pix.x, pix.y, 6, 0, Math.PI * 2);
                ctx.fillStyle = (firstItem.type === 'BONE') ? '#fde047' : '#a855f7';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.stroke();

                if (count > 1) {
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 9px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(count.toString(), pix.x, pix.y + 3);
                }
            }

            // Draw Security Cameras
            let isCam = securityCameras.some(c => c.q === q && c.r === r);
            if (isCam) {
                ctx.fillStyle = isPowerPlantHacked ? '#64748b' : '#ef4444';
                ctx.beginPath();
                ctx.arc(pix.x, pix.y - 8, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillRect(pix.x - 1.5, pix.y - 4, 3, 7);
            }
        }
    }

    // Building Text Labels
    drawBuildingLabel(hexToPixel(CORNER_A.q, CORNER_A.r), "泥棒拠点", "#f87171", "left");
    drawBuildingLabel(hexToPixel(CORNER_D.q, CORNER_D.r), "警察拠点", "#60a5fa", "right");
    drawBuildingLabel(hexToPixel(JAIL_POS.q, JAIL_POS.r), "牢屋", "#c084fc", "top");
    drawBuildingLabel(hexToPixel(labCorner.q, labCorner.r), "研究所 (お宝)", "#818cf8", "top");
    drawBuildingLabel(hexToPixel(powerPlantCorner.q, powerPlantCorner.r), isPowerPlantHacked ? "発電所 (停止中)" : "発電所", "#34d399", "bottom");

    let bLabel = (activeDeliveryGoalCorner === 'B') ? "運送班 (★ゴール)" : "運送班 (候補B)";
    let fLabel = (activeDeliveryGoalCorner === 'F') ? "運送班 (★ゴール)" : "運送班 (候補F)";
    drawBuildingLabel(hexToPixel(CORNER_B.q, CORNER_B.r), bLabel, "#fbbf24", "left");
    drawBuildingLabel(hexToPixel(CORNER_F.q, CORNER_F.r), fLabel, "#fbbf24", "left");

    // Draw Unit Plots (Lines)
    units.forEach((u, idx) => {
        if (u.isJailed || !u.plot || u.plot.length === 0) return;
        let isSelected = (idx === selectedUnitIndex);

        ctx.beginPath();
        let startPix = hexToPixel(u.q, u.r);
        ctx.moveTo(startPix.x, startPix.y);
        u.plot.forEach(p => {
            let pix = hexToPixel(p.q, p.r);
            ctx.lineTo(pix.x, pix.y);
        });

        ctx.strokeStyle = isSelected ? u.color : u.color + '80'; // 50% opacity for inactive
        ctx.lineWidth = isSelected ? 3.5 : 2;
        ctx.setLineDash(isSelected ? [] : [4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Waypoints
        u.plot.forEach(p => {
            let pix = hexToPixel(p.q, p.r);
            ctx.beginPath();
            ctx.arc(pix.x, pix.y, isSelected ? 4 : 3, 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? '#ffffff' : u.color;
            ctx.fill();
        });
    });

    // Draw Units (Icons)
    units.forEach((u, idx) => {
        if (u.isJailed) return;
        let pix = hexToPixel(u.q, u.r);
        let isSelected = (idx === selectedUnitIndex);

        // Highlight ring if selected
        if (isSelected) {
            ctx.beginPath();
            ctx.arc(pix.x, pix.y, 14, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Body Circle
        ctx.beginPath();
        ctx.arc(pix.x, pix.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = u.color;
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label / Symbol inside
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let symbol = u.id;
        if (u.type === 'SLIME') symbol = 'S' + u.id.replace('S','');
        else if (u.type === 'POLICE') symbol = 'P' + u.id.replace('P','');
        else if (u.type === 'DOG') symbol = '犬';
        else if (u.type === 'CAT') symbol = '猫';

        ctx.fillText(symbol, pix.x, pix.y);
    });
}

function drawHexagon(x, y, radius, fillColor, strokeColor) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        let angle = Math.PI / 180 * (60 * i);
        let hx = x + radius * Math.cos(angle);
        let hy = y + radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.stroke();
}

function drawBuildingLabel(pix, text, color, pos) {
    ctx.font = 'bold 11px sans-serif';
    let textWidth = ctx.measureText(text).width;
    let lx = pix.x;
    let ly = pix.y;

    if (pos === 'right') lx += 18;
    else if (pos === 'left') lx -= (textWidth + 18);
    else if (pos === 'top') ly -= 18;
    else if (pos === 'bottom') ly += 22;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(lx - 4, ly - 9, textWidth + 8, 14);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(lx - 4, ly - 9, textWidth + 8, 14);

    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, lx, ly);
}

// User Interaction (Click Map)
canvas.addEventListener('click', (e) => {
    if (currentPhase !== 'PLOT') return;

    let rect = canvas.getBoundingClientRect();
    let mouseX = e.clientX - rect.left;
    let mouseY = e.clientY - rect.top;

    let hex = pixelToHex(mouseX, mouseY);
    if (!isValidHex(hex.q, hex.r)) return;

    let selUnit = units[selectedUnitIndex];

    // If unit is NPC (Dog/Cat), player CANNOT plot for it
    if (selUnit.isNpc) return;

    // Check if clicked on an existing unit on map -> Select that unit
    let clickedUnitIdx = units.findIndex(u => !u.isJailed && u.q === hex.q && u.r === hex.r);
    if (clickedUnitIdx !== -1) {
        if (clickedUnitIdx === selectedUnitIndex) {
            // Re-clicked currently selected unit -> RESET its plot!
            selUnit.plot = [];
            updateUI();
            drawGrid();
            return;
        } else {
            // Switch selection
            selectedUnitIndex = clickedUnitIdx;
            updateUI();
            drawGrid();
            return;
        }
    }

    // Can't plot into impassable tiles
    if (isImpassableTile(hex.q, hex.r)) return;

    // Plotting Path Logic
    let currentPos = (selUnit.plot.length > 0) ? selUnit.plot[selUnit.plot.length - 1] : { q: selUnit.q, r: selUnit.r };
    
    // Check if destination collides with another unit of the SAME team
    let finalDest = hex;
    let sameTeamUnits = units.filter((u, i) => i !== selectedUnitIndex && u.team === selUnit.team && !u.isJailed);
    let isCollision = sameTeamUnits.some(other => {
        let otherDest = getUnitDestination(other);
        return otherDest.q === finalDest.q && otherDest.r === finalDest.r;
    });

    if (isCollision) {
        alert("同陣営のユニットと同じマスを最終目的地にすることはできません。");
        return;
    }

    let path = findPathBFS(currentPos, hex, selUnit.moveLimit - selUnit.plot.length);
    if (path.length > 0) {
        selUnit.plot = [...selUnit.plot, ...path];
        updateUI();
        drawGrid();
    }
});

// UI Updates & Controls
function updateUI() {
    let selUnit = units[selectedUnitIndex];

    // Phase Indicator
    document.getElementById('turn-display').innerText = `ターン ${turnNumber} (${currentPhase === 'PLOT' ? '計画フェイズ' : '実行フェイズ'})`;

    // Unit Selector Badges
    let unitListEl = document.getElementById('unit-badges');
    unitListEl.innerHTML = '';
    units.forEach((u, i) => {
        let badge = document.createElement('button');
        badge.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            i === selectedUnitIndex ? 'ring-2 ring-white scale-105 shadow-md' : 'opacity-70 hover:opacity-100'
        }`;
        badge.style.backgroundColor = u.color;
        badge.style.color = '#ffffff';

        let statusText = u.isJailed ? ' [収監]' : (u.isNpc ? ' [AI]' : '');
        badge.innerText = `${u.name}${statusText}`;
        badge.onclick = () => {
            selectedUnitIndex = i;
            updateUI();
            drawGrid();
        };
        unitListEl.appendChild(badge);
    });

    // Selected Unit Info
    document.getElementById('unit-name').innerText = selUnit.name + (selUnit.isNpc ? " (自動NPC)" : "");
    document.getElementById('unit-move-limit').innerText = `${selUnit.plot.length} / ${selUnit.moveLimit} マス`;

    // Inventory List
    let invEl = document.getElementById('unit-inventory');
    if (selUnit.inventory.length === 0) {
        invEl.innerHTML = '<span class="text-slate-400 text-xs">なし</span>';
    } else {
        invEl.innerHTML = selUnit.inventory.map(item => `
            <span class="px-2 py-0.5 rounded bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-600">
                ${item.name}
            </span>
        `).join(' ');
    }

    // NPC Notice or Police HQ Swap Action
    let actionBox = document.getElementById('unit-action-box');
    actionBox.innerHTML = '';

    if (selUnit.isNpc) {
        actionBox.innerHTML = `
            <div class="p-2.5 rounded-lg bg-amber-950/60 border border-amber-600/40 text-amber-200 text-xs">
                🤖 <strong>自動思考ユニット:</strong> 警察犬・泥棒猫はフローに従って自動で行動します。プレイヤーによる直接操作はできません。
            </div>
        `;
    } else if (selUnit.type === 'POLICE') {
        // Check if adjacent to Police HQ (CORNER_D)
        let isAdjHQ = getNeighbors(selUnit.q, selUnit.r).some(n => n.q === CORNER_D.q && n.r === CORNER_D.r);
        if (isAdjHQ) {
            actionBox.innerHTML = `
                <div class="p-2.5 rounded-lg bg-blue-950/70 border border-blue-500/50 text-blue-200 text-xs flex flex-col gap-2">
                    <div class="font-bold">🏢 警察拠点に隣接中 (装備の補給・交換)</div>
                    <div class="text-[11px] text-slate-300">拠点在庫: 電撃銃:${policeHqStock.TAZER} 台車:${policeHqStock.CART} チョッキ:${policeHqStock.VEST} メット:${policeHqStock.HELMET} ギア:${policeHqStock.BOOSTER}</div>
                    <div class="flex gap-2">
                        <button onclick="takeItemFromHQ('TAZER')" class="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white text-xs font-semibold">電撃銃を取る</button>
                        <button onclick="takeItemFromHQ('CART')" class="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white text-xs font-semibold">台車を取る</button>
                    </div>
                </div>
            `;
        }
    }
}

function takeItemFromHQ(type) {
    let selUnit = units[selectedUnitIndex];
    if (policeHqStock[type] > 0) {
        policeHqStock[type]--;
        let name = type === 'TAZER' ? '電撃銃' : '台車';
        selUnit.inventory.push({ id: type + '_' + Date.now(), name: name, type: type, weight: 1 });
        updateUI();
    } else {
        alert("警察拠点にそのアイテムの在庫がありません。");
    }
}

// Reset Current Unit Plot
document.getElementById('reset-plot-btn').onclick = () => {
    let selUnit = units[selectedUnitIndex];
    if (!selUnit.isNpc) {
        selUnit.plot = [];
        updateUI();
        drawGrid();
    }
};

// Execute Turn Phase (Execute plots & Run AI)
document.getElementById('execute-turn-btn').onclick = () => {
    if (currentPhase !== 'PLOT') return;

    currentPhase = 'EXECUTE';
    document.getElementById('execute-turn-btn').disabled = true;

    // Run NPC AI Plots before execution
    runNpcAI();

    // Execute movements step-by-step
    let maxSteps = 8; // Max movement speed
    let stepIndex = 0;

    let stepInterval = setInterval(() => {
        let anyMoved = false;

        units.forEach(u => {
            if (!u.isJailed && u.plot && u.plot.length > stepIndex) {
                let nextStep = u.plot[stepIndex];
                u.q = nextStep.q;
                u.r = nextStep.r;
                anyMoved = true;

                // Pick up ground items
                let key = `${u.q},${u.r}`;
                if (groundItems[key] && groundItems[key].length > 0) {
                    if (u.type === 'CAT' || u.type === 'SLIME') {
                        let item = groundItems[key].shift();
                        u.inventory.push(item);
                        if (groundItems[key].length === 0) delete groundItems[key];
                    }
                }

                // Lab Treasure Steal
                if (u.q === labCorner.q && u.r === labCorner.r && (u.type === 'SLIME' || u.type === 'CAT')) {
                    if (!isTreasureStolen) {
                        isTreasureStolen = true;
                        u.hasTreasure = true;
                        activeDeliveryGoalCorner = Math.random() < 0.5 ? 'B' : 'F';
                        alert(`🚨 【お宝被盗警報】 ${u.name} がお宝を奪いました！運送班ゴールが起動しました！`);
                    }
                }

                // Delivery Goal Victory Check
                let goalPos = (activeDeliveryGoalCorner === 'B') ? CORNER_B : CORNER_F;
                if (activeDeliveryGoalCorner && u.q === goalPos.q && u.r === goalPos.r && u.hasTreasure) {
                    alert(`🎉 【泥棒陣営 勝利！】 ${u.name} がお宝を運送班へ届けることに成功しました！`);
                }

                // PowerPlant Hack Check
                if (u.q === powerPlantCorner.q && u.r === powerPlantCorner.r && (u.type === 'SLIME' || u.type === 'CAT')) {
                    if (!isPowerPlantHacked) {
                        isPowerPlantHacked = true;
                        hackTurnsRemaining = 5;
                        alert("⚡ 【発電所ハッキング発動】 監視カメラ機能停止！牢屋緊急オープン！");
                    }
                }
            }
        });

        stepIndex++;
        drawGrid();

        if (stepIndex >= maxSteps || !anyMoved) {
            clearInterval(stepInterval);
            finishExecutePhase();
        }
    }, 250);
};

function finishExecutePhase() {
    // Reset plots
    units.forEach(u => u.plot = []);

    // Turn Increment
    turnNumber++;
    currentPhase = 'PLOT';
    document.getElementById('execute-turn-btn').disabled = false;

    // Item Spawn (Every 3 turns starting from Turn 4, 7, 10...)
    if ((turnNumber - 1) % 3 === 0) {
        spawnRandomItems(10);
    }

    // PowerPlant Hack Countdown
    if (isPowerPlantHacked) {
        hackTurnsRemaining--;
        if (hackTurnsRemaining <= 0) {
            isPowerPlantHacked = false;
            alert("⚡ 発電所が普及し、監視カメラシステムが復旧しました。");
        }
    }

    updateUI();
    drawGrid();
}

// NPC AI Logic (Dog & Cat)
function runNpcAI() {
    units.forEach(u => {
        if (!u.isNpc || u.isJailed) return;

        if (u.type === 'CAT') {
            // Thief Cat AI:
            // 1. Find nearest ground item
            let nearestItemKey = null;
            let minDist = 999;
            Object.keys(groundItems).forEach(key => {
                let [gq, gr] = key.split(',').map(Number);
                let dist = hexDistance({ q: u.q, r: u.r }, { q: gq, r: gr });
                if (dist < minDist) {
                    minDist = dist;
                    nearestItemKey = { q: gq, r: gr };
                }
            });

            if (nearestItemKey && u.inventory.length < 2) {
                u.plot = findPathBFS({ q: u.q, r: u.r }, nearestItemKey, u.moveLimit);
            } else {
                // If holding items, deliver to nearest Slime
                let slimes = units.filter(s => s.type === 'SLIME' && !s.isJailed);
                if (slimes.length > 0) {
                    let targetSlime = slimes[0];
                    u.plot = findPathBFS({ q: u.q, r: u.r }, { q: targetSlime.q, r: targetSlime.r }, u.moveLimit);
                }
            }
        } else if (u.type === 'DOG') {
            // Police Dog AI:
            // Find nearest Thief or Cat
            let thieves = units.filter(t => (t.team === 'THIEF') && !t.isJailed);
            if (thieves.length > 0) {
                let target = thieves[0];
                u.plot = findPathBFS({ q: u.q, r: u.r }, { q: target.q, r: target.r }, u.moveLimit);
            }
        }
    });
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}
