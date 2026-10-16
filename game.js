// ==========================================
// ケイドロドロ (Keidrororo) - Core Strategy Engine
// ==========================================

const MAP_RADIUS = 10; // 半径10マス (合計 331 マス)
const TILE_SIZE = 23;  // タイル表示サイズ (px)

// --- Game State ---
let turn = 1;
let phase = 'PLOT'; // 'PLOT' or 'EXECUTE'
let selectedUnitId = 'S1';
let powerOutageTurns = 0; // 発電所ハッキングカウント (最大5)
let treasureStolen = false;
let goalCorner = null; // お宝強奪後に 'B' or 'F'

// --- Items on Floor ---
// { q, r, type: 'BONE' | 'SPRAY' | 'TREASURE' | 'KEY' }
let groundItems = [];

// --- Police HQ Stock ---
let policeHQStock = {
    TAZER: 1,
    CART: 1,
    VEST: 1,
    HELMET: 1,
    GEAR: 1
};

// --- Corners (A~F Clockwise) - Pointy-Topped Axial Coordinates ---
// A: Left (-10, 0), B: Top-Left (0, -10), C: Top-Right (10, -10)
// D: Right (10, 0), E: Bottom-Right (0, 10), F: Bottom-Left (-10, 10)
const CORNERS = {
    A: { q: -10, r: 0, name: '泥棒拠点' },
    B: { q: 0, r: -10, name: '泥棒猫1 (角B)' },
    C: { q: 10, r: -10, name: '施設C' },
    D: { q: 10, r: 0, name: '警察拠点' },
    E: { q: 0, r: 10, name: '施設E' },
    F: { q: -10, r: 10, name: '泥棒猫2 (角F)' }
};

// Randomize C & E for Lab (Treasure) and Power Plant
let labCornerKey = Math.random() < 0.5 ? 'C' : 'E';
let powerCornerKey = (labCornerKey === 'C') ? 'E' : 'C';

// Jail is 3 tiles Left of Police HQ (D: 10, 0) -> q=7, r=0
const JAIL_POS = { q: 7, r: 0 };

// Cameras (3 around Corner C, 3 around Corner D, 3 around Corner E + 1 near Jail = 10 total)
// Carefully placed so they don't overlap unit spawn locations or HQ structures
let cameraPositions = [
    // Around Corner C (10, -10)
    { q: 9, r: -10 }, { q: 10, r: -9 }, { q: 9, r: -9 },
    // Around Corner D / Police HQ (10, 0) - excluding Dog spawn (9, 0) and Police spawns (10, -1), (9, 1)
    { q: 8, r: 1 }, { q: 9, r: -1 }, { q: 8, r: 0 },
    // Around Corner E (0, 10)
    { q: 0, r: 9 }, { q: 1, r: 9 }, { q: -1, r: 10 },
    // 1 Camera near Jail (7, 0) - placed at (7, -1)
    { q: 7, r: -1 }
];

// --- Units Definition ---
let units = [
    // Slimes (Thieves) starting adjacent to Corner A (-10, 0)
    { id: 'S1', name: 'スライム 1', team: 'THIEF', type: 'SLIME', q: -9, r: 0, speed: 4, inv: [], plot: [], jailed: false },
    { id: 'S2', name: 'スライム 2', team: 'THIEF', type: 'SLIME', q: -10, r: 1, speed: 4, inv: [], plot: [], jailed: false },
    { id: 'S3', name: 'スライム 3', team: 'THIEF', type: 'SLIME', q: -9, r: -1, speed: 4, inv: [], plot: [], jailed: false },

    // Cats (Thief NPC) starting at Corner B and F
    { id: 'C1', name: '泥棒猫 1', team: 'THIEF', type: 'CAT', q: 0, r: -10, speed: 7, inv: [], plot: [], isNPC: true },
    { id: 'C2', name: '泥棒猫 2', team: 'THIEF', type: 'CAT', q: -10, r: 10, speed: 7, inv: [], plot: [], isNPC: true },

    // Police (Players) starting adjacent to Police HQ (10, 0)
    { id: 'P1', name: '警察 1', team: 'POLICE', type: 'POLICE', q: 10, r: -1, speed: 5, inv: [], plot: [] },
    { id: 'P2', name: '警察 2', team: 'POLICE', type: 'POLICE', q: 9, r: 1, speed: 5, inv: [], plot: [] },

    // Police Dog (NPC) starting left of Police HQ (9, 0)
    { id: 'D1', name: '警察犬 1', team: 'POLICE', type: 'DOG', q: 9, r: 0, speed: 8, inv: [], plot: [], isNPC: true, stunned: 0 }
];

// --- Axial Coordinates Utilities ---
function isValidTile(q, r) {
    return Math.abs(q) <= MAP_RADIUS &&
           Math.abs(r) <= MAP_RADIUS &&
           Math.abs(-q - r) <= MAP_RADIUS;
}

function hexDistance(a, b) {
    return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs((-a.q - a.r) - (-b.q - b.r))) / 2;
}

function getNeighbors(hex) {
    const directions = [
        { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
        { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
    ];
    let results = [];
    for (let d of directions) {
        let nq = hex.q + d.q;
        let nr = hex.r + d.r;
        if (isValidTile(nq, nr)) {
            results.push({ q: nq, r: nr });
        }
    }
    return results;
}

// Pointy-Topped Axial to Pixel
function hexToPixel(q, r) {
    const x = TILE_SIZE * (Math.sqrt(3) * q + Math.sqrt(3)/2 * r);
    const y = TILE_SIZE * (3/2 * r);
    const canvas = document.getElementById('gameCanvas');
    return {
        x: x + canvas.width / 2,
        y: y + canvas.height / 2
    };
}

// --- Item Spawning Logic ---
function spawnItemsIfNeeded() {
    if ((turn === 1 || (turn - 1) % 3 === 0) && groundItems.length < 30) {
        let spawned = 0;
        let attempts = 0;
        while (spawned < 10 && groundItems.length < 30 && attempts < 200) {
            attempts++;
            let randQ = Math.floor(Math.random() * (MAP_RADIUS * 2 + 1)) - MAP_RADIUS;
            let randR = Math.floor(Math.random() * (MAP_RADIUS * 2 + 1)) - MAP_RADIUS;
            if (!isValidTile(randQ, randR)) continue;

            if (randQ === 10 && randR === 0) continue; // Police HQ
            if (randQ === JAIL_POS.q && randR === JAIL_POS.r) continue; // Jail
            if (randQ === CORNERS.A.q && randR === CORNERS.A.r) continue; // Thief HQ

            let occupiedByItem = groundItems.some(i => i.q === randQ && i.r === randR);
            let occupiedByUnit = units.some(u => u.q === randQ && u.r === randR);
            if (occupiedByItem || occupiedByUnit) continue;

            let itemType = Math.random() < 0.5 ? 'BONE' : 'SPRAY';
            groundItems.push({ q: randQ, r: randR, type: itemType });
            spawned++;
        }
        if (spawned > 0) {
            addLog(`【アイテム出現】 マップ上に新たにアイテムが ${spawned} 個ドロップしました。`);
        }
    }
}

// --- Initialization ---
function initGame() {
    spawnItemsIfNeeded();
    setupCanvasInput();
    updateUI();
    drawGrid();
}

// --- Canvas Input & Direct Destination Plotting ---
function setupCanvasInput() {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - canvas.width / 2;
        const mouseY = e.clientY - rect.top - canvas.height / 2;

        const qFloat = (Math.sqrt(3)/3 * mouseX - 1/3 * mouseY) / TILE_SIZE;
        const rFloat = (2/3 * mouseY) / TILE_SIZE;

        let x = qFloat;
        let z = rFloat;
        let y = -x - z;

        let rx = Math.round(x);
        let ry = Math.round(y);
        let rz = Math.round(z);

        let x_diff = Math.abs(rx - x);
        let y_diff = Math.abs(ry - y);
        let z_diff = Math.abs(rz - z);

        if (x_diff > y_diff && x_diff > z_diff) {
            rx = -ry - rz;
        } else if (y_diff > z_diff) {
            ry = -rx - rz;
        } else {
            rz = -rx - ry;
        }

        let clickedQ = rx;
        let clickedR = rz;

        if (!isValidTile(clickedQ, clickedR)) return;

        handleTileClick(clickedQ, clickedR);
    });
}

function handleTileClick(q, r) {
    let clickedUnit = units.find(u => u.q === q && u.r === r);
    if (clickedUnit) {
        if (clickedUnit.id === selectedUnitId) {
            clickedUnit.plot = [];
            addLog(`[${clickedUnit.name}] の移動計画をリセットしました。`);
        } else {
            selectedUnitId = clickedUnit.id;
        }
        updateUI();
        drawGrid();
        return;
    }

    let selUnit = units.find(u => u.id === selectedUnitId);
    if (!selUnit || selUnit.isNPC || selUnit.jailed) return;

    if (q === 10 && r === 0) {
        addLog(`【警告】 警察拠点 (10, 0) は侵入不可エリアです。`);
        return;
    }

    // Check effective speed
    let effectiveSpeed = selUnit.speed;
    if (selUnit.inv.includes('TREASURE')) effectiveSpeed = 1;

    let startPos = { q: selUnit.q, r: selUnit.r };

    // If user clicked current unit location or reset requested
    if (q === startPos.q && r === startPos.r) {
        selUnit.plot = [];
        updateUI();
        drawGrid();
        return;
    }

    // Check destination collision with teammates
    let willLandHere = units.some(u => u.team === selUnit.team && u.id !== selUnit.id && (
        (u.plot.length > 0 && u.plot[u.plot.length - 1].q === q && u.plot[u.plot.length - 1].r === r) ||
        (u.plot.length === 0 && u.q === q && u.r === r)
    ));

    if (willLandHere) {
        addLog(`【警告】 味方ユニットと同じマスを最終目的地にすることはできません。`);
        return;
    }

    // Direct Destination Plotting: Find shortest path from current position to clicked target
    let path = findPath(startPos, { q, r }, effectiveSpeed);

    if (path.length > 0) {
        selUnit.plot = path;
        addLog(`[${selUnit.name}] 目的地 (${q}, ${r}) への移動ルート（${path.length}マス）を設定しました。`);
        updateUI();
        drawGrid();
    } else {
        let dist = hexDistance(startPos, { q, r });
        if (dist > effectiveSpeed) {
            addLog(`【提示】 目的地が遠すぎます（移動可能距離: ${effectiveSpeed}マス / 距離: ${dist}マス）。`);
        } else {
            addLog(`【提示】 そこへ到達可能なルートが見つかりませんでした。`);
        }
    }
}

// --- Pathfinding Helper (BFS) ---
function findPath(start, target, maxSteps) {
    let queue = [[{ q: start.q, r: start.r }]];
    let visited = new Set([`${start.q},${start.r}`]);

    while (queue.length > 0) {
        let path = queue.shift();
        let current = path[path.length - 1];

        if (current.q === target.q && current.r === target.r) {
            return path.slice(1);
        }

        if (path.length - 1 >= maxSteps) continue;

        for (let n of getNeighbors(current)) {
            if (n.q === 10 && n.r === 0) continue; // Police HQ is impassable

            let key = `${n.q},${n.r}`;
            if (!visited.has(key)) {
                visited.add(key);
                queue.push([...path, n]);
            }
        }
    }
    return [];
}

// --- NPC AI Logic ---
function planNPCTurns() {
    units.forEach(u => {
        if (!u.isNPC) return;
        u.plot = [];

        if (u.type === 'CAT') {
            if (groundItems.length > 0) {
                let nearestItem = groundItems.reduce((closest, item) => {
                    let d = hexDistance(u, item);
                    return d < closest.d ? { item, d } : closest;
                }, { item: null, d: Infinity }).item;

                if (nearestItem) {
                    let path = findPath(u, nearestItem, u.speed);
                    u.plot = path;
                }
            }
        } else if (u.type === 'DOG') {
            let slimes = units.filter(un => un.team === 'THIEF' && !un.jailed);
            if (slimes.length > 0) {
                let nearestSlime = slimes.reduce((closest, s) => {
                    let d = hexDistance(u, s);
                    return d < closest.d ? { s, d } : closest;
                }, { s: null, d: Infinity }).s;

                if (nearestSlime) {
                    let path = findPath(u, nearestSlime, u.speed);
                    u.plot = path;
                }
            }
        }
    });
}

// --- Phase Execution ---
function executePhase() {
    planNPCTurns();

    addLog(`=== ターン ${turn} 行動実行 ===`);

    units.forEach(u => {
        if (u.plot.length > 0) {
            let dest = u.plot[u.plot.length - 1];
            u.q = dest.q;
            u.r = dest.r;
            u.plot = [];
        }

        let itemIndex = groundItems.findIndex(i => i.q === u.q && i.r === u.r);
        if (itemIndex !== -1) {
            let item = groundItems[itemIndex];
            u.inv.push(item.type);
            groundItems.splice(itemIndex, 1);
            addLog(`[${u.name}] がアイテム【${item.type}】を拾いました！`);
        }

        let labPos = CORNERS[labCornerKey];
        if (u.q === labPos.q && u.r === labPos.r && u.team === 'THIEF' && !treasureStolen) {
            treasureStolen = true;
            u.inv.push('TREASURE');
            goalCorner = Math.random() < 0.5 ? 'B' : 'F';
            addLog(`🚨【緊急警報】 ${u.name} が研究所でお宝を強奪しました！ゴールが角【${goalCorner}】に現れました！`);
        }

        let powerPos = CORNERS[powerCornerKey];
        if (u.q === powerPos.q && u.r === powerPos.r && u.team === 'THIEF') {
            powerOutageTurns = 5;
            addLog(`⚡【ハッキング成功】 発電所が停止！5ターンの間カメラ停止＆牢屋が開放されます！`);
            units.forEach(s => {
                if (s.jailed) {
                    s.jailed = false;
                    s.q = CORNERS.A.q;
                    s.r = CORNERS.A.r;
                    addLog(`🔓 ${s.name} が牢屋から自動開放されました！`);
                }
            });
        }
    });

    let policeList = units.filter(u => u.team === 'POLICE');
    let slimeList = units.filter(u => u.team === 'THIEF' && !u.jailed && u.type === 'SLIME');

    policeList.forEach(p => {
        slimeList.forEach(s => {
            if (p.q === s.q && p.r === s.r) {
                s.jailed = true;
                s.q = JAIL_POS.q;
                s.r = JAIL_POS.r;
                s.inv = [];
                addLog(`🚓【逮捕】 ${p.name} が ${s.name} を捕まえ、牢屋へ収監しました！`);
            }
        });
    });

    if (powerOutageTurns > 0) {
        powerOutageTurns--;
        if (powerOutageTurns === 0) {
            addLog(`💡 発電所が普及し、街のセキュリティが回復しました。`);
        }
    }

    turn++;
    spawnItemsIfNeeded();
    updateUI();
    drawGrid();
}

// --- UI Updates ---
function updateUI() {
    let turnBadge = document.getElementById('turn-badge');
    if (turnBadge) turnBadge.innerText = `ターン ${turn}`;

    let selUnit = units.find(u => u.id === selectedUnitId) || units[0];

    let uName = document.getElementById('unit-name');
    if (uName) uName.innerText = selUnit.name;

    let uType = document.getElementById('unit-type-badge');
    if (uType) uType.innerText = selUnit.team === 'POLICE' ? '警察陣営' : '泥棒陣営';

    let uPos = document.getElementById('unit-pos');
    if (uPos) uPos.innerText = `(${selUnit.q}, ${selUnit.r})`;

    let uSpeed = document.getElementById('unit-speed');
    if (uSpeed) uSpeed.innerText = `${selUnit.speed} マス`;

    let uPlot = document.getElementById('unit-plot-count');
    if (uPlot) uPlot.innerText = `${selUnit.plot.length} マス`;

    let invContainer = document.getElementById('unit-inv');
    if (invContainer) {
        invContainer.innerHTML = '';
        if (selUnit.inv.length === 0) {
            invContainer.innerHTML = '<span class="inv-item">なし</span>';
        } else {
            selUnit.inv.forEach(item => {
                let badge = document.createElement('span');
                badge.className = 'inv-item';
                badge.innerText = item;
                invContainer.appendChild(badge);
            });
        }
    }

    let specialCard = document.getElementById('special-action-card');
    let specialBody = document.getElementById('special-card-body');

    let isPoliceNearHQ = selUnit.team === 'POLICE' && hexDistance(selUnit, { q: 10, r: 0 }) === 1;

    if (specialCard && specialBody) {
        if (isPoliceNearHQ) {
            specialCard.style.display = 'block';
            let titleEl = document.getElementById('special-card-title');
            if (titleEl) titleEl.innerText = '警察拠点 装備保管所 (補給可)';
            specialBody.innerHTML = `
                <div style="font-size: 0.75em; color: #8b949e; margin-bottom: 6px;">拠点在庫からアイテムを持ち出せます:</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                    <button class="btn-success" style="padding: 4px; font-size: 0.7em;" onclick="takePoliceSupply('TAZER')">電撃銃 (${policeHQStock.TAZER})</button>
                    <button class="btn-success" style="padding: 4px; font-size: 0.7em;" onclick="takePoliceSupply('CART')">台車 (${policeHQStock.CART})</button>
                    <button class="btn-success" style="padding: 4px; font-size: 0.7em;" onclick="takePoliceSupply('VEST')">チョッキ (${policeHQStock.VEST})</button>
                    <button class="btn-success" style="padding: 4px; font-size: 0.7em;" onclick="takePoliceSupply('GEAR')">加速ギア (${policeHQStock.GEAR})</button>
                </div>
            `;
        } else {
            specialCard.style.display = 'none';
        }
    }
}

window.takePoliceSupply = function(itemType) {
    let selUnit = units.find(u => u.id === selectedUnitId);
    if (!selUnit || selUnit.team !== 'POLICE') return;

    if (policeHQStock[itemType] > 0) {
        policeHQStock[itemType]--;
        selUnit.inv.push(itemType);
        addLog(`[${selUnit.name}] が警察拠点から【${itemType}】を持ち出しました。`);
        updateUI();
    } else {
        addLog(`【警告】 警察拠点に【${itemType}】の在庫がありません。`);
    }
};

function addLog(msg) {
    const logBox = document.getElementById('event-log');
    if (!logBox) return;
    let entry = document.createElement('div');
    entry.className = 'log-entry';
    let timeStr = `[Turn ${turn}]`;
    entry.innerHTML = `<span class="log-time">${timeStr}</span> ${msg}`;
    logBox.appendChild(entry);
    logBox.scrollTop = logBox.scrollHeight;
}

// --- Canvas Drawing ---
function drawGrid() {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let selUnit = units.find(u => u.id === selectedUnitId);
    let effectiveSpeed = selUnit ? selUnit.speed : 0;
    if (selUnit && selUnit.inv.includes('TREASURE')) effectiveSpeed = 1;

    for (let q = -MAP_RADIUS; q <= MAP_RADIUS; q++) {
        let r1 = Math.max(-MAP_RADIUS, -q - MAP_RADIUS);
        let r2 = Math.min(MAP_RADIUS, -q + MAP_RADIUS);
        for (let r = r1; r <= r2; r++) {
            let pix = hexToPixel(q, r);
            let fillColor = '#161b22';

            // Special Structure Colors
            if (q === 10 && r === 0) fillColor = '#1e3a8a'; // Police HQ
            else if (q === JAIL_POS.q && r === JAIL_POS.r) fillColor = '#4c1d95'; // Jail
            else if (q === CORNERS.A.q && r === CORNERS.A.r) fillColor = '#831843'; // Thief HQ
            else if (q === CORNERS[labCornerKey].q && r === CORNERS[labCornerKey].r) fillColor = '#065f46'; // Lab
            else if (q === CORNERS[powerCornerKey].q && r === CORNERS[powerCornerKey].r) fillColor = '#854d0e'; // Power Plant
            else if (selUnit && !selUnit.isNPC && !selUnit.jailed) {
                // Highlight reachable tiles for selected player unit
                let dist = hexDistance({ q: selUnit.q, r: selUnit.r }, { q, r });
                if (dist > 0 && dist <= effectiveSpeed) {
                    fillColor = selUnit.team === 'POLICE' ? '#1e293b' : '#311b2b';
                }
            }

            drawHexagon(ctx, pix.x, pix.y, TILE_SIZE, fillColor, '#30363d');

            if (q === 10 && r === 0) drawBuildingTag(ctx, pix.x, pix.y, "警察拠点 (不可侵)", "#3b82f6");
            if (q === JAIL_POS.q && r === JAIL_POS.r) drawBuildingTag(ctx, pix.x, pix.y, "牢屋", "#a855f7");
            if (q === CORNERS.A.q && r === CORNERS.A.r) drawBuildingTag(ctx, pix.x, pix.y, "泥棒拠点", "#ef4444");
            if (q === CORNERS[labCornerKey].q && r === CORNERS[labCornerKey].r) drawBuildingTag(ctx, pix.x, pix.y, "研究所 (お宝)", "#10b981");
            if (q === CORNERS[powerCornerKey].q && r === CORNERS[powerCornerKey].r) drawBuildingTag(ctx, pix.x, pix.y, "発電所", "#eab308");
        }
    }

    // Draw Cameras
    cameraPositions.forEach(cam => {
        let pix = hexToPixel(cam.q, cam.r);
        ctx.fillStyle = powerOutageTurns > 0 ? '#6b7280' : '#ef4444';
        ctx.beginPath();
        ctx.arc(pix.x, pix.y - 10, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(pix.x - 1, pix.y - 6, 2, 8);
    });

    // Draw Floor Items
    groundItems.forEach(item => {
        let pix = hexToPixel(item.q, item.r);
        ctx.fillStyle = item.type === 'BONE' ? '#fde047' : '#c084fc';
        ctx.beginPath();
        ctx.arc(pix.x, pix.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.type === 'BONE' ? '骨' : '煙', pix.x, pix.y + 3);
    });

    // Draw Unit Plot Lines
    units.forEach(u => {
        if (u.plot.length > 0) {
            ctx.beginPath();
            let startPix = hexToPixel(u.q, u.r);
            ctx.moveTo(startPix.x, startPix.y);
            u.plot.forEach(p => {
                let pPix = hexToPixel(p.q, p.r);
                ctx.lineTo(pPix.x, pPix.y);
            });
            ctx.strokeStyle = u.team === 'POLICE' ? '#60a5fa' : '#f87171';
            ctx.lineWidth = 3;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    });

    // Draw Units
    units.forEach(u => {
        let pix = hexToPixel(u.q, u.r);
        let color = '#3b82f6';
        if (u.team === 'THIEF') color = u.type === 'CAT' ? '#eab308' : '#ef4444';
        if (u.type === 'DOG') color = '#a855f7';

        if (u.id === selectedUnitId) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(pix.x, pix.y, 14, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pix.x, pix.y, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(u.id, pix.x, pix.y + 3.5);
    });
}

function drawHexagon(ctx, x, y, radius, fillColor, strokeColor) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 180 * (60 * i + 30); // Pointy-Topped
        const x_i = x + radius * Math.cos(angle);
        const y_i = y + radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(x_i, y_i);
        else ctx.lineTo(x_i, y_i);
    }
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.stroke();
}

function drawBuildingTag(ctx, x, y, text, color) {
    ctx.font = 'bold 10px sans-serif';
    let textWidth = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(x - textWidth/2 - 4, y - 22, textWidth + 8, 14);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - textWidth/2 - 4, y - 22, textWidth + 8, 14);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y - 11);
}

document.addEventListener('DOMContentLoaded', () => {
    let btnReset = document.getElementById('btn-reset-unit-plot');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            let selUnit = units.find(u => u.id === selectedUnitId);
            if (selUnit) {
                selUnit.plot = [];
                addLog(`[${selUnit.name}] のプロットをリセットしました。`);
                updateUI();
                drawGrid();
            }
        });
    }

    let btnExec = document.getElementById('btn-execute-phase');
    if (btnExec) {
        btnExec.addEventListener('click', () => {
            executePhase();
        });
    }

    initGame();
});

if (typeof document !== 'undefined' && (document.readyState === 'complete' || document.readyState === 'interactive')) {
    initGame();
}
