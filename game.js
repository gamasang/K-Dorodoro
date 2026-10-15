// === KIEDRORORO GAME ENGINE (RADIUS 10 MAP / IMMEDIATE RENDER) ===

function initGame() {
    const HEX_RADIUS = 10;   // マップ半径10マス (全331マス)
    const TILE_SIZE = 23.0;  // 画面全体に大きく見やすく配置
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    function hexToPixel(q, r) {
        const x = TILE_SIZE * (Math.sqrt(3) * (r + q / 2));
        const y = TILE_SIZE * (1.5 * q);
        return { x: centerX + x, y: centerY + y };
    }

    function hexDistance(q1, r1, q2, r2) {
        const s1 = -q1 - r1;
        const s2 = -q2 - r2;
        return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs(s1 - s2));
    }

    let gameTurn = 1;
    let currentPhase = 'PLOT'; 
    let treasuresDelivered = 0;
    let thievesJailed = 0;
    let powerHackedTurns = 0; // 発電所ハッキングターンカウント

    // 運送班(ゴール)の動的配置: 'B' または 'F'
    let activeGoalNode = (Math.random() < 0.5) ? 'B' : 'F';
    let isGoalRevealed = false;

    // 研究所と発電所のランダム配置
    let labNode = 'C';
    let powerNode = 'E';
    if (Math.random() < 0.5) {
        labNode = 'E';
        powerNode = 'C';
    }

    function getCornerCoord(corner) {
        switch(corner) {
            case 'A': return { q: 0, r: -10 };   // 泥棒拠点 (左)
            case 'B': return { q: -10, r: 0 };   // 上左
            case 'C': return { q: -10, r: 10 };  // 上右
            case 'D': return { q: 0, r: 9 };     // 警察拠点・牢屋 (右・r=9で1マス左へ)
            case 'E': return { q: 10, r: 0 };    // 下右
            case 'F': return { q: 10, r: -10 };  // 下左
            default: return { q: 0, r: 0 };
        }
    }

    // ユニット構成
    let units = [
        // 警察 (角D / r=9の隣接マスからスタート)
        { id: 'P1', name: '警察 1', type: 'POLICE', q: -1, r: 9, baseSpeed: 6, items: [{ name: '電撃銃', weight: 1 }, { name: '台車', weight: 2 }], isJailed: false, color: '#3b82f6', plot: [], endAction: 'NONE' },
        { id: 'P2', name: '警察 2', type: 'POLICE', q: 1, r: 8, baseSpeed: 6, items: [{ name: '鍵', weight: 1 }], isJailed: false, color: '#60a5fa', plot: [], endAction: 'NONE' },

        // 警察犬 (牢屋r=9の左隣 r=8 からスタート)
        { id: 'D1', name: '警察犬 1', type: 'DOG', q: 0, r: 8, baseSpeed: 8, items: [], isJailed: false, color: '#a855f7', plot: [], endAction: 'NONE' },

        // 泥棒スライム (角A 泥棒拠点隣接マスからスタート)
        { id: 'S1', name: '泥棒 1', type: 'SLIME', q: 0, r: -9, baseSpeed: 6, items: [], isJailed: false, color: '#ef4444', plot: [], endAction: 'NONE' },
        { id: 'S2', name: '泥棒 2', type: 'SLIME', q: -1, r: -9, baseSpeed: 6, items: [], isJailed: false, color: '#f87171', plot: [], endAction: 'NONE' },
        { id: 'S3', name: '泥棒 3', type: 'SLIME', q: 1, r: -10, baseSpeed: 6, items: [], isJailed: false, color: '#dc2626', plot: [], endAction: 'NONE' },

        // 泥棒猫 (角B, 角Fからスタート)
        { id: 'C1', name: '泥棒猫 1', type: 'CAT', q: -10, r: 0, baseSpeed: 7, items: [], isJailed: false, color: '#f59e0b', plot: [], endAction: 'NONE' },
        { id: 'C2', name: '泥棒猫 2', type: 'CAT', q: 10, r: -10, baseSpeed: 7, items: [], isJailed: false, color: '#fbbf24', plot: [], endAction: 'NONE' }
    ];

    let groundItems = [];

    // 初期お宝を研究所に配置
    let labCoord = getCornerCoord(labNode);
    groundItems.push({ id: 'T1', name: 'お宝', weight: 5, q: labCoord.q, r: labCoord.r, color: '#ffd700' });

    // 10個の監視カメラ配置
    let cameras = [];
    ['C', 'D', 'E'].forEach(corner => {
        let coord = getCornerCoord(corner);
        let neighbors = getNeighbors(coord.q, coord.r);
        for(let i = 0; i < 3 && i < neighbors.length; i++) {
            cameras.push({ q: neighbors[i].q, r: neighbors[i].r });
        }
    });
    let jailNeighbors = getNeighbors(0, 9);
    if(jailNeighbors.length > 3) cameras.push({ q: jailNeighbors[3].q, r: jailNeighbors[3].r });

    function getNeighbors(sq, sr) {
        return [
            { q: sq + 1, r: sr }, { q: sq - 1, r: sr },
            { q: sq, r: sr + 1 }, { q: sq, r: sr - 1 },
            { q: sq + 1, r: sr - 1 }, { q: sq - 1, r: sr + 1 }
        ].filter(p => hexDistance(0, 0, p.q, p.r) <= HEX_RADIUS);
    }

    let selectedUnitIndex = 0;

    function getMovableSpeed(unit) {
        let totalWeight = unit.items.reduce((sum, item) => sum + item.weight, 0);
        return Math.max(1, unit.baseSpeed - totalWeight);
    }

    function logEvent(msg, type = 'normal') {
        const logBox = document.getElementById('event-log');
        if (!logBox) return;
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        let colorClass = '';
        if (type === 'POLICE') colorClass = 'log-police';
        if (type === 'SLIME') colorClass = 'log-slime';
        if (type === 'CAT') colorClass = 'log-cat';
        if (type === 'DOG') colorClass = 'log-dog';

        entry.innerHTML = `<span class="log-time">[T${gameTurn}]</span> <span class="${colorClass}">${msg}</span>`;
        logBox.appendChild(entry);
        logBox.scrollTop = logBox.scrollHeight;
    }

    // 5ターンごとにランダム空きマスへアイテム10個生成 (上限50個)
    function spawnRandomItems() {
        if (groundItems.length >= 50) return;
        let spawnedCount = 0;
        let attempts = 0;
        while (spawnedCount < 10 && attempts < 100 && groundItems.length < 50) {
            attempts++;
            let randQ = Math.floor(Math.random() * (HEX_RADIUS * 2 + 1)) - HEX_RADIUS;
            let randR = Math.floor(Math.random() * (HEX_RADIUS * 2 + 1)) - HEX_RADIUS;
            if (hexDistance(0, 0, randQ, randR) <= HEX_RADIUS) {
                let occupied = groundItems.some(it => it.q === randQ && it.r === randR) ||
                               units.some(u => u.q === randQ && u.r === randR);
                if (!occupied) {
                    let itemName = (Math.random() < 0.5) ? '骨' : 'スプレー缶';
                    let itemWeight = (itemName === '骨') ? 2 : 1;
                    let itemColor = (itemName === '骨') ? '#e5e7eb' : '#38bdf8';
                    groundItems.push({
                        id: 'item_' + Date.now() + '_' + spawnedCount,
                        name: itemName,
                        weight: itemWeight,
                        q: randQ,
                        r: randR,
                        color: itemColor
                    });
                    spawnedCount++;
                }
            }
        }
        if (spawnedCount > 0) {
            logEvent(`🎁 マップ上に新しいアイテムが ${spawnedCount} 個追加発生しました！ (現在計 ${groundItems.length} 個)`, 'CAT');
        }
    }

    function drawGrid() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 六角形タイルの描画
        for (let q = -HEX_RADIUS; q <= HEX_RADIUS; q++) {
            let r1 = Math.max(-HEX_RADIUS, -q - HEX_RADIUS);
            let r2 = Math.min(HEX_RADIUS, -q + HEX_RADIUS);
            for (let r = r1; r <= r2; r++) {
                const pix = hexToPixel(q, r);

                let fillColor = '#1e293b';
                let strokeColor = '#334155';

                let posA = getCornerCoord('A');
                let posB = getCornerCoord('B');
                let posC = getCornerCoord('C');
                let posD = getCornerCoord('D'); // r=9
                let posE = getCornerCoord('E');
                let posF = getCornerCoord('F');

                if (q === posD.q && r === posD.r) fillColor = '#4a1d24'; // 牢屋・警察拠点
                if (q === posA.q && r === posA.r) fillColor = '#3f1d24'; // 泥棒拠点

                let labPos = getCornerCoord(labNode);
                if (q === labPos.q && r === labPos.r) fillColor = '#1e3a8a'; // 研究所

                let powPos = getCornerCoord(powerNode);
                if (q === powPos.q && r === powPos.r) fillColor = (powerHackedTurns > 0) ? '#451a03' : '#d97706'; // 発電所

                if (isGoalRevealed) {
                    let goalPos = getCornerCoord(activeGoalNode);
                    if (q === goalPos.q && r === goalPos.r) fillColor = '#064e3b';
                }

                drawHexagon(pix.x, pix.y, TILE_SIZE - 1, fillColor, strokeColor);

                // 建物ラベルを描画
                if (q === posD.q && r === posD.r) drawBuildingLabel(pix.x, pix.y, "牢屋 (警察拠点)", "#ef4444", "right");
                if (q === posA.q && r === posA.r) drawBuildingLabel(pix.x, pix.y, "泥棒拠点", "#f87171", "left");
                if (q === labPos.q && r === labPos.r) drawBuildingLabel(pix.x, pix.y, "研究所 (お宝)", "#60a5fa", "top");
                if (q === powPos.q && r === powPos.r) drawBuildingLabel(pix.x, pix.y, (powerHackedTurns > 0) ? "発電所(ハック中)" : "発電所", "#fbbf24", "bottom");

                if (isGoalRevealed) {
                    let goalPos = getCornerCoord(activeGoalNode);
                    if (q === goalPos.q && r === goalPos.r) drawBuildingLabel(pix.x, pix.y, "運送班 (ゴール)", "#34d399", "top");
                }
            }
        }

        // 監視カメラの描画 (黒ポール＋赤レンズ)
        cameras.forEach(cam => {
            const pix = hexToPixel(cam.q, cam.r);
            ctx.beginPath();
            ctx.arc(pix.x, pix.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = (powerHackedTurns > 0) ? '#6b7280' : '#ef4444';
            ctx.fill();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });

        // 移動ラインの描画
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

            if (u.type === 'POLICE') ctx.strokeStyle = isSelected ? '#60a5fa' : 'rgba(96, 165, 250, 0.5)';
            else if (u.type === 'CAT') ctx.strokeStyle = isSelected ? '#fbbf24' : 'rgba(251, 191, 36, 0.5)';
            else if (u.type === 'DOG') ctx.strokeStyle = isSelected ? '#c084fc' : 'rgba(192, 132, 252, 0.5)';
            else ctx.strokeStyle = isSelected ? '#f87171' : 'rgba(248, 113, 113, 0.5)';

            ctx.lineWidth = isSelected ? 3.5 : 2;
            ctx.setLineDash(isSelected ? [] : [4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            u.plot.forEach(p => {
                let pix = hexToPixel(p.q, p.r);
                ctx.beginPath();
                ctx.arc(pix.x, pix.y, isSelected ? 4 : 3, 0, Math.PI * 2);
                ctx.fillStyle = isSelected ? '#ffffff' : u.color;
                ctx.fill();
            });
        });

        // 落とし物アイテム
        groundItems.forEach(item => {
            const pix = hexToPixel(item.q, item.r);
            ctx.beginPath();
            ctx.arc(pix.x, pix.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = item.color;
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.stroke();
        });

        // ユニット
        units.forEach((u, idx) => {
            if (u.isJailed) return;
            const pix = hexToPixel(u.q, u.r);

            ctx.beginPath();
            if (u.type === 'POLICE') {
                ctx.moveTo(pix.x, pix.y - 10);
                ctx.lineTo(pix.x - 8, pix.y + 7);
                ctx.lineTo(pix.x + 8, pix.y + 7);
                ctx.closePath();
            } else {
                ctx.arc(pix.x, pix.y, 8, 0, Math.PI * 2);
            }

            ctx.fillStyle = u.color;
            ctx.fill();
            ctx.strokeStyle = (idx === selectedUnitIndex) ? '#ffffff' : '#000000';
            ctx.lineWidth = (idx === selectedUnitIndex) ? 3 : 1;
            ctx.stroke();
        });
    }

    function drawBuildingLabel(x, y, text, color, position) {
        ctx.font = 'bold 11px sans-serif';
        let metrics = ctx.measureText(text);
        let padding = 4;
        let lx = x, ly = y;

        if (position === 'right') { lx = x + 20; ly = y + 4; }
        else if (position === 'left') { lx = x - metrics.width - 20; ly = y + 4; }
        else if (position === 'top') { lx = x - metrics.width / 2; ly = y - 18; }
        else if (position === 'bottom') { lx = x - metrics.width / 2; ly = y + 24; }

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(lx - padding, ly - 11, metrics.width + padding * 2, 15);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(lx - padding, ly - 11, metrics.width + padding * 2, 15);

        ctx.fillStyle = color;
        ctx.fillText(text, lx, ly);
    }

    function drawHexagon(x, y, radius, fillColor, strokeColor) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            let angle = Math.PI / 180 * (60 * i + 30);
            let x_i = x + radius * Math.cos(angle);
            let y_i = y + radius * Math.sin(angle);
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

    // クリック処理（再押しでプロットリセット）
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        let minDistance = 99999;
        let targetTile = null;

        for (let q = -HEX_RADIUS; q <= HEX_RADIUS; q++) {
            let r1 = Math.max(-HEX_RADIUS, -q - HEX_RADIUS);
            let r2 = Math.min(HEX_RADIUS, -q + HEX_RADIUS);
            for (let r = r1; r <= r2; r++) {
                const pix = hexToPixel(q, r);
                const d = Math.hypot(pix.x - mouseX, pix.y - mouseY);
                if (d < minDistance && d < TILE_SIZE) {
                    minDistance = d;
                    targetTile = { q, r };
                }
            }
        }

        if (targetTile) {
            handleHexClick(targetTile.q, targetTile.r);
        }
    });

    function handleHexClick(q, r) {
        let selUnit = units[selectedUnitIndex];

        // 選択中ユニット自身をクリックした場合はプロットリセット
        if (selUnit && q === selUnit.q && r === selUnit.r) {
            selUnit.plot = [];
            updateUI();
            drawGrid();
            return;
        }

        let clickedUnitIdx = units.findIndex(u => u.q === q && u.r === r && !u.isJailed);
        if (clickedUnitIdx !== -1 && currentPhase === 'PLOT') {
            selectedUnitIndex = clickedUnitIdx;
            updateUI();
            drawGrid();
            return;
        }

        if (!selUnit || currentPhase !== 'PLOT') return;

        let maxMov = getMovableSpeed(selUnit);

        let existingIndex = selUnit.plot.findIndex(p => p.q === q && p.r === r);
        if (existingIndex !== -1) {
            selUnit.plot = selUnit.plot.slice(0, existingIndex + 1);
            updateUI();
            drawGrid();
            return;
        }

        let startPos = (selUnit.plot.length > 0) ? selUnit.plot[selUnit.plot.length - 1] : { q: selUnit.q, r: selUnit.r };
        let pathToTarget = findShortestPath(startPos.q, startPos.r, q, r);

        if (pathToTarget && pathToTarget.length > 0) {
            let spaceLeft = maxMov - selUnit.plot.length;
            let stepsToAdd = pathToTarget.slice(0, spaceLeft);
            selUnit.plot.push(...stepsToAdd);
            updateUI();
            drawGrid();
        }
    }

    function findShortestPath(sq, sr, tq, tr) {
        let queue = [[{ q: sq, r: sr }]];
        let visited = new Set();
        visited.add(`${sq},${sr}`);

        while (queue.length > 0) {
            let path = queue.shift();
            let curr = path[path.length - 1];

            if (curr.q === tq && curr.r === tr) {
                return path.slice(1);
            }

            let neighbors = getNeighbors(curr.q, curr.r);
            for (let n of neighbors) {
                let key = `${n.q},${n.r}`;
                if (!visited.has(key)) {
                    visited.add(key);
                    queue.push([...path, n]);
                }
            }
        }
        return [];
    }

    function executeMovementPhase() {
        currentPhase = 'MOVING';
        document.getElementById('phase-display').innerText = '2. 一斉コマ送り移動中...';

        let stepCount = 0;
        let maxSteps = 9;

        let interval = setInterval(() => {
            stepCount++;
            let anyMoved = false;

            units.forEach(u => {
                if (u.plot && u.plot.length > 0) {
                    let nextPos = u.plot.shift();
                    u.q = nextPos.q;
                    u.r = nextPos.r;
                    anyMoved = true;

                    // アイテム拾い
                    for (let i = groundItems.length - 1; i >= 0; i--) {
                        let item = groundItems[i];
                        if (item.q === u.q && item.r === u.r) {
                            u.items.push(item);
                            logEvent(`${u.name} が ${item.name} を入手！`, u.type);
                            groundItems.splice(i, 1);

                            if (item.name === 'お宝' && !isGoalRevealed) {
                                isGoalRevealed = true;
                                logEvent(`🚨 お宝が取得された！ 運送班(ゴール)が判明！`, 'SLIME');
                            }
                        }
                    }

                    // 発電所チェック
                    let powPos = getCornerCoord(powerNode);
                    if (u.q === powPos.q && u.r === powPos.r) {
                        if (u.type === 'SLIME' || u.type === 'CAT') {
                            powerHackedTurns = 5;
                            logEvent(`⚡ ${u.name} が発電所をハッキング！5ターン全カメラ停止＆牢屋解放！`, 'SLIME');
                            units.filter(s => s.isJailed).forEach(s => { s.isJailed = false; });
                        } else if (u.type === 'POLICE') {
                            powerHackedTurns = 0;
                            logEvent(`🔧 警察が発電所を修復・再起動しました！`, 'POLICE');
                        }
                    }

                    // 警察による捕獲
                    units.filter(p => p.type === 'POLICE').forEach(pol => {
                        units.filter(s => s.type === 'SLIME' && !s.isJailed).forEach(sli => {
                            if (pol.q === sli.q && pol.r === sli.r) {
                                sli.isJailed = true;
                                sli.q = 0; sli.r = 9; // r=9 牢屋
                                thievesJailed++;
                                logEvent(`🚨 ${pol.name} が ${sli.name} を逮捕！ 牢屋へ収監。`, 'POLICE');
                            }
                        });
                    });

                    // 運送班ゴール判定
                    if (isGoalRevealed) {
                        let goalPos = getCornerCoord(activeGoalNode);
                        if (u.q === goalPos.q && u.r === goalPos.r) {
                            let tIdx = u.items.findIndex(it => it.name === 'お宝');
                            if (tIdx !== -1) {
                                u.items.splice(tIdx, 1);
                                treasuresDelivered++;
                                logEvent(`🎉 ${u.name} がお宝を運送班へ届けた！ 泥棒陣営の勝利！`, 'SLIME');
                            }
                        }
                    }
                }
            });

            drawGrid();

            if (!anyMoved || stepCount >= maxSteps) {
                clearInterval(interval);
                finishTurn();
            }
        }, 300);
    }

    function finishTurn() {
        gameTurn++;
        if (powerHackedTurns > 0) powerHackedTurns--;

        if (gameTurn % 5 === 0) {
            spawnRandomItems();
        }

        currentPhase = 'PLOT';
        document.getElementById('phase-display').innerText = '1. 計画フェイズ (Plot Phase)';
        document.getElementById('turn-counter').innerText = `TURN ${gameTurn}`;

        if (treasuresDelivered >= 1) alert('🎉 泥棒陣営の勝利！ お宝の運搬に成功しました！');
        else if (thievesJailed >= 3) alert('🚨 警察陣営の勝利！ すべての泥棒を逮捕しました！');

        updateUI();
        drawGrid();
    }

    function updateUI() {
        const u = units[selectedUnitIndex];
        if (!u) return;

        document.getElementById('unit-type-badge').innerText = u.name;
        document.getElementById('unit-pos').innerText = `(${u.q}, ${u.r})`;

        let maxMov = getMovableSpeed(u);
        let remaining = maxMov - (u.plot ? u.plot.length : 0);

        if (remaining > 0) {
            document.getElementById('unit-plot-count').innerText = `${u.plot ? u.plot.length : 0} / ${maxMov} ステップ (あと ${remaining} マス選択必須)`;
            document.getElementById('btn-execute-phase').disabled = true;
            document.getElementById('btn-execute-phase').innerText = `▶ 計画完了・一斉移動実行 (あと${remaining}マス選択が必要)`;
        } else {
            document.getElementById('unit-plot-count').innerText = `${u.plot.length} / ${maxMov} ステップ (準備完了！)`;
            document.getElementById('btn-execute-phase').disabled = false;
            document.getElementById('btn-execute-phase').innerText = `▶ 計画完了・一斉移動実行`;
        }

        document.getElementById('treasure-score').innerText = `${treasuresDelivered} / 1 個`;
        document.getElementById('jail-count').innerText = `${thievesJailed} / 3 名`;

        const invContainer = document.getElementById('unit-inventory');
        invContainer.innerHTML = '';
        if (u.items.length === 0) {
            invContainer.innerHTML = '<div class="inv-item">空き</div>';
        } else {
            u.items.forEach(it => {
                invContainer.innerHTML += `<div class="inv-item">${it.name} (重さ${it.weight})</div>`;
            });
        }
    }

    document.getElementById('btn-execute-phase').addEventListener('click', () => {
        if (currentPhase === 'PLOT') executeMovementPhase();
    });

    document.getElementById('btn-reset-plot').addEventListener('click', () => {
        units[selectedUnitIndex].plot = [];
        updateUI();
        drawGrid();
    });

    document.getElementById('btn-action-throw').addEventListener('click', () => {
        let u = units[selectedUnitIndex];
        if (u.items.length > 0) {
            let droppedItem = u.items.pop();
            droppedItem.q = u.q; droppedItem.r = u.r;
            groundItems.push(droppedItem);
            logEvent(`${u.name} が足元に ${droppedItem.name} を置いた。`, u.type);
            updateUI();
            drawGrid();
        }
    });

    updateUI();
    drawGrid();
}

// DOM読み込み完了時に即座に実行（読み込み遅延防止）
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}
