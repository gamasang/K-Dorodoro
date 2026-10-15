// === HEXAGONAL GRID ENGINE (CORRECT 6-CORNER AXIAL POSITIONS, RADIUS=10) ===
function initGame() {
    const HEX_RADIUS = 10;   // マップ半径: 10マス (全331マス)
    const TILE_SIZE = 23;    // 描画サイズ

    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // 六角形座標変換 (Axial Coordinates)
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

    function isValidHex(q, r) {
        return hexDistance(0, 0, q, r) <= HEX_RADIUS;
    }

    function getNeighbors(q, r) {
        const dirs = [
            { q: 1, r: 0 }, { q: -1, r: 0 },
            { q: 0, r: 1 }, { q: 0, r: -1 },
            { q: 1, r: -1 }, { q: -1, r: 1 }
        ];
        let res = [];
        for (let d of dirs) {
            let nq = q + d.q, nr = r + d.r;
            if (isValidHex(nq, nr)) res.push({ q: nq, r: nr });
        }
        return res;
    }

    // ゲーム状態
    let gameTurn = 1;
    let currentPhase = 'PLOT';
    let treasuresDelivered = 0;
    let thievesJailed = 0;
    let powerPlantHackedTurns = 0; // 発電所ハッキングカウント

    // 角A〜Fの厳密な座標設定 (Radius=10)
    // A(左): (0, -10)
    // B(上左): (-10, 0)
    // C(上右): (-10, 10)
    // D(右): (0, 10)
    // E(下右): (10, 0)
    // F(下左): (10, -10)

    const cornerA = { q: 0, r: -10, name: '泥棒拠点' };
    const cornerB = { q: -10, r: 0, name: '角B' };
    const cornerC = { q: -10, r: 10, name: '角C' };
    const cornerD = { q: 0, r: 10, name: '警察拠点' };
    const cornerE = { q: 10, r: 0, name: '角E' };
    const cornerF = { q: 10, r: -10, name: '角F' };

    // 研究所と発電所のランダム配置 (角C と 角E)
    let isLabAtC = Math.random() < 0.5;
    const labPos = isLabAtC ? cornerC : cornerE;
    const powerPos = isLabAtC ? cornerE : cornerC;

    // 運送班 (お宝手中に後で有効化)
    let targetGoalCorner = (Math.random() < 0.5) ? cornerB : cornerF;
    let isGoalActive = false;

    // 監視カメラ 10個の設置 (右側3角: C, D, E 周辺に各3個 + 牢屋横に1個)
    let cameraPositions = [];
    [cornerC, cornerD, cornerE].forEach(corner => {
        let nbs = getNeighbors(corner.q, corner.r);
        for (let i = 0; i < Math.min(3, nbs.length); i++) {
            cameraPositions.push(nbs[i]);
        }
    });
    // 牢屋隣の追加カメラ
    let jailNbs = getNeighbors(cornerD.q, cornerD.r);
    if (jailNbs.length > 0) cameraPositions.push(jailNbs[jailNbs.length - 1]);

    // 初期ユニット構成と仕様に基づく初期配置
    // 泥棒拠点(角A: 0, -10) の隣接マスにスライム3名
    let thiefNeighbors = getNeighbors(cornerA.q, cornerA.r);

    let units = [
        // 警察 (角D: 0, 10 の上隣・下隣)
        { id: 'P1', name: '警察 1', type: 'POLICE', q: -1, r: 10, baseSpeed: 6, items: [{ name: '電撃銃', weight: 1 }, { name: '台車', weight: 2 }], isJailed: false, color: '#3b82f6', plot: [], endAction: 'NONE' },
        { id: 'P2', name: '警察 2', type: 'POLICE', q: 1, r: 9, baseSpeed: 6, items: [{ name: '鍵', weight: 1 }], isJailed: false, color: '#60a5fa', plot: [], endAction: 'NONE' },

        // 警察犬 (警察署の左隣: 0, 9 からスタート)
        { id: 'D1', name: '警察犬 1', type: 'DOG', q: 0, r: 9, baseSpeed: 8, items: [], isJailed: false, color: '#a855f7', plot: [], endAction: 'NONE' },

        // 泥棒スライム (角Aの隣接マスからスタート)
        { id: 'S1', name: '泥棒 1', type: 'SLIME', q: thiefNeighbors[0].q, r: thiefNeighbors[0].r, baseSpeed: 6, items: [], isJailed: false, color: '#ef4444', plot: [], endAction: 'NONE' },
        { id: 'S2', name: '泥棒 2', type: 'SLIME', q: thiefNeighbors[1].q, r: thiefNeighbors[1].r, baseSpeed: 6, items: [], isJailed: false, color: '#f87171', plot: [], endAction: 'NONE' },
        { id: 'S3', name: '泥棒 3', type: 'SLIME', q: thiefNeighbors[2].q, r: thiefNeighbors[2].r, baseSpeed: 6, items: [], isJailed: false, color: '#dc2626', plot: [], endAction: 'NONE' },

        // 泥棒猫 (角B, 角F からスタート)
        { id: 'C1', name: '泥棒猫 1', type: 'CAT', q: cornerB.q, r: cornerB.r, baseSpeed: 7, items: [], isJailed: false, color: '#f59e0b', plot: [], endAction: 'NONE' },
        { id: 'C2', name: '泥棒猫 2', type: 'CAT', q: cornerF.q, r: cornerF.r, baseSpeed: 7, items: [], isJailed: false, color: '#fbbf24', plot: [], endAction: 'NONE' }
    ];

    // ドロップアイテム (お宝は研究所に1個)
    let groundItems = [
        { id: 'T1', name: 'お宝', weight: 5, q: labPos.q, r: labPos.r, color: '#ffd700' }
    ];

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

    // メイン描画
    function drawGrid() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // マップタイルの描画 (全331マス)
        for (let q = -HEX_RADIUS; q <= HEX_RADIUS; q++) {
            let r1 = Math.max(-HEX_RADIUS, -q - HEX_RADIUS);
            let r2 = Math.min(HEX_RADIUS, -q + HEX_RADIUS);
            for (let r = r1; r <= r2; r++) {
                const pix = hexToPixel(q, r);

                let fillColor = '#1e293b';
                let strokeColor = '#334155';

                // 角・施設の塗り分け
                if (q === cornerA.q && r === cornerA.r) fillColor = '#450a0a'; // 泥棒拠点 (赤黒)
                if (q === cornerD.q && r === cornerD.r) fillColor = '#4c0519'; // 警察拠点 & 6角形牢屋
                if (q === labPos.q && r === labPos.r) fillColor = '#1e3a8a';   // 研究所 (青)
                if (q === powerPos.q && r === powerPos.r) fillColor = '#78350f'; // 発電所 (黄褐色)

                if (isGoalActive && q === targetGoalCorner.q && r === targetGoalCorner.r) {
                    fillColor = '#064e3b'; // 運送班ゴール (緑)
                }

                drawHexagon(pix.x, pix.y, TILE_SIZE - 1, fillColor, strokeColor);

                // 建造物ラベルの表示
                if (q === cornerA.q && r === cornerA.r) drawBuildingLabel(pix.x, pix.y, "泥棒拠点", "#f87171", "left");
                if (q === cornerD.q && r === cornerD.r) drawBuildingLabel(pix.x, pix.y, "警察拠点/牢屋", "#fb7185", "right");
                if (q === labPos.q && r === labPos.r) drawBuildingLabel(pix.x, pix.y, "研究所(お宝)", "#60a5fa", "top");
                if (q === powerPos.q && r === powerPos.r) drawBuildingLabel(pix.x, pix.y, "発電所", "#f59e0b", "bottom");
                if (isGoalActive && q === targetGoalCorner.q && r === targetGoalCorner.r) {
                    drawBuildingLabel(pix.x, pix.y, "運送班(ゴール)", "#34d399", "top");
                }
            }
        }

        // 監視カメラの描画 (ポール + カメラレンズ)
        cameraPositions.forEach(cam => {
            const pix = hexToPixel(cam.q, cam.r);
            ctx.fillStyle = '#475569';
            ctx.fillRect(pix.x - 2, pix.y - 8, 4, 10); // ポール
            ctx.beginPath();
            ctx.arc(pix.x, pix.y - 8, 4, 0, Math.PI * 2);
            ctx.fillStyle = (powerPlantHackedTurns > 0) ? '#64748b' : '#ef4444'; // ハッキング時は赤点滅オフ
            ctx.fill();
        });

        // 移動ラインの描画 (他ユニットのルートも可視化)
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

            ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(148, 163, 184, 0.4)';
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

        // フィールドアイテムの描画
        groundItems.forEach(item => {
            const pix = hexToPixel(item.q, item.r);
            ctx.beginPath();
            ctx.arc(pix.x, pix.y, item.name === 'お宝' ? 7 : 5, 0, Math.PI * 2);
            ctx.fillStyle = item.color;
            ctx.fill();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });

        // ユニットの描画
        units.forEach((u, idx) => {
            if (u.isJailed) return;
            const pix = hexToPixel(u.q, u.r);

            ctx.beginPath();
            if (u.type === 'POLICE') {
                ctx.moveTo(pix.x, pix.y - 9);
                ctx.lineTo(pix.x - 8, pix.y + 7);
                ctx.lineTo(pix.x + 8, pix.y + 7);
                ctx.closePath();
            } else if (u.type === 'DOG') {
                ctx.arc(pix.x, pix.y, 7, 0, Math.PI * 2);
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

    function drawBuildingLabel(x, y, text, color, align = 'top') {
        ctx.font = 'bold 10px sans-serif';
        const metrics = ctx.measureText(text);
        let lx = x, ly = y;

        if (align === 'left') lx -= (metrics.width + 18);
        if (align === 'right') lx += 18;
        if (align === 'top') ly -= 18;
        if (align === 'bottom') ly += 22;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(lx - 4, ly - 10, metrics.width + 8, 14);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(lx - 4, ly - 10, metrics.width + 8, 14);

        ctx.fillStyle = color;
        ctx.fillText(text, lx, ly);
    }

    // クリック＆プロット操作
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

        if (targetTile) handleHexClick(targetTile.q, targetTile.r);
    });

    function handleHexClick(q, r) {
        let clickedUnitIdx = units.findIndex(u => u.q === q && u.r === r && !u.isJailed);

        // 選択中ユニット自体のクリックでリセット
        if (clickedUnitIdx === selectedUnitIndex) {
            units[selectedUnitIndex].plot = [];
            updateUI();
            drawGrid();
            return;
        }

        if (clickedUnitIdx !== -1 && currentPhase === 'PLOT') {
            selectedUnitIndex = clickedUnitIdx;
            updateUI();
            drawGrid();
            return;
        }

        let selUnit = units[selectedUnitIndex];
        if (!selUnit || currentPhase !== 'PLOT') return;

        let maxMov = getMovableSpeed(selUnit);

        // 最短経路でプロット延長
        let startPos = (selUnit.plot.length > 0) ? selUnit.plot[selUnit.plot.length - 1] : { q: selUnit.q, r: selUnit.r };
        let path = findShortestPath(startPos.q, startPos.r, q, r);

        if (path && path.length > 0) {
            for (let step of path) {
                if (selUnit.plot.length < maxMov) {
                    selUnit.plot.push(step);
                }
            }
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

            let nbs = getNeighbors(curr.q, curr.r);
            for (let n of nbs) {
                let key = `${n.q},${n.r}`;
                if (!visited.has(key)) {
                    visited.add(key);
                    queue.push([...path, n]);
                }
            }
        }
        return null;
    }

    // 移動実行とターン進行
    function executeMovementPhase() {
        currentPhase = 'MOVING';
        document.getElementById('phase-display').innerText = '2. 一斉コマ送り移動中...';

        let stepCount = 0;
        let maxSteps = 9;

        let interval = setInterval(() => {
            stepCount++;
            let anyMoved = false;

            units.forEach(u => {
                if (u.plot.length > 0) {
                    let nextPos = u.plot.shift();
                    u.q = nextPos.q;
                    u.r = nextPos.r;
                    anyMoved = true;

                    // 発電所侵入によるハッキング
                    if (u.q === powerPos.q && u.r === powerPos.r) {
                        if (u.type === 'SLIME' || u.type === 'CAT') {
                            powerPlantHackedTurns = 5;
                            logEvent(`⚡ ${u.name} が発電所をハッキング！ 5ターン監視カメラ停止＆牢屋緊急解放！`, u.type);
                        } else if (u.type === 'POLICE') {
                            powerPlantHackedTurns = 0;
                            logEvent(`🛡️ ${u.name} が発電所を復旧・セキュリティを再起動！`, 'POLICE');
                        }
                    }

                    // アイテム拾い
                    for (let i = groundItems.length - 1; i >= 0; i--) {
                        let item = groundItems[i];
                        if (item.q === u.q && item.r === u.r) {
                            u.items.push(item);
                            logEvent(`${u.name} が ${item.name} を入手！`, u.type);
                            if (item.name === 'お宝') {
                                isGoalActive = true;
                                logEvent(`🚨 お宝が手にされた！ 運送班(ゴール)がアクティブ化！`, 'SLIME');
                            }
                            groundItems.splice(i, 1);
                        }
                    }

                    // 警察による捕獲
                    units.filter(p => p.type === 'POLICE').forEach(pol => {
                        units.filter(s => s.type === 'SLIME' && !s.isJailed).forEach(sli => {
                            if (pol.q === sli.q && pol.r === sli.r) {
                                sli.isJailed = true;
                                sli.q = cornerD.q; sli.r = cornerD.r; // 牢屋へ収監
                                thievesJailed++;
                                logEvent(`🚨 ${pol.name} が ${sli.name} を逮捕し牢屋へ収監！`, 'POLICE');
                            }
                        });
                    });
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
        currentPhase = 'PLOT';

        if (powerPlantHackedTurns > 0) powerPlantHackedTurns--;

        // 5ターンごとのアイテム一括10個スポーン (上限50個)
        if (gameTurn % 5 === 0 && groundItems.length < 50) {
            let spawned = 0;
            for (let i = 0; i < 30; i++) {
                let rq = Math.floor(Math.random() * (HEX_RADIUS * 2 + 1)) - HEX_RADIUS;
                let rr = Math.floor(Math.random() * (HEX_RADIUS * 2 + 1)) - HEX_RADIUS;
                if (isValidHex(rq, rr) && groundItems.length < 50) {
                    let itemName = (Math.random() < 0.5) ? '骨' : 'スプレー缶';
                    let itemColor = (itemName === '骨') ? '#e2e8f0' : '#38bdf8';
                    groundItems.push({ id: 'DROP_' + Date.now() + '_' + i, name: itemName, weight: 1, q: rq, r: rr, color: itemColor });
                    spawned++;
                    if (spawned >= 10) break;
                }
            }
            logEvent(`📦 5ターン経過！ マップ上に新たなアイテムが10個出現しました！`, 'normal');
        }

        document.getElementById('phase-display').innerText = '1. 計画フェイズ (Plot Phase)';
        document.getElementById('turn-counter').innerText = `TURN ${gameTurn}`;

        updateUI();
        drawGrid();
    }

    function updateUI() {
        const u = units[selectedUnitIndex];
        if (!u) return;

        document.getElementById('unit-type-badge').innerText = u.name;
        document.getElementById('unit-pos').innerText = `(${u.q}, ${u.r})`;

        let maxMov = getMovableSpeed(u);
        let remaining = maxMov - u.plot.length;

        if (remaining > 0) {
            document.getElementById('unit-plot-count').innerText = `${u.plot.length} / ${maxMov} ステップ (あと ${remaining} マス選択必須)`;
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

    updateUI();
    drawGrid();
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initGame();
} else {
    window.addEventListener('DOMContentLoaded', initGame);
}
