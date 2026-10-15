// === HEXAGONAL ENGINE (RADIUS 10 = 331 TILES) ===
window.addEventListener('DOMContentLoaded', () => {
    const HEX_RADIUS = 10;   // マップ半径 10 (全331マス)
    const TILE_SIZE = 22.0;  // キャンバスに合わせた見やすいタイルサイズ
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // 90度回転 横向きヘックス座標変換
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

    // ゲーム状態
    let gameTurn = 1;
    let currentPhase = 'PLOT'; // 'PLOT' -> 'MOVING'
    let treasuresDelivered = 0;
    let thievesJailed = 0;

    let powerPlantHacked = false;
    let powerHackTurnsLeft = 0;

    let isLabAtC = Math.random() < 0.5;
    let labPos = isLabAtC ? { q: -5, r: 10, name: 'C' } : { q: 5, r: -10, name: 'E' };
    let powerPos = isLabAtC ? { q: 5, r: -10, name: 'E' } : { q: -5, r: 10, name: 'C' };

    let activeGoalCorner = null; // お宝取得後に 'B' または 'F' に決定

    // ユニット構成
    let units = [
        // 警察 2人 (角D: q=0, r=10 の上下隣接マス)
        { id: 'P1', name: '警察 1', type: 'POLICE', q: 0, r: 9, baseSpeed: 6, items: [{ name: '電撃銃', weight: 1 }, { name: '台車', weight: 2 }], isJailed: false, color: '#3b82f6', plot: [], endAction: 'NONE', stunTurns: 0 },
        { id: 'P2', name: '警察 2', type: 'POLICE', q: 1, r: 9, baseSpeed: 6, items: [{ name: '鍵', weight: 1 }], isJailed: false, color: '#60a5fa', plot: [], endAction: 'NONE', stunTurns: 0 },

        // 泥棒スライム 3人 (角A: q=0, r=-10 の隣接マス)
        { id: 'S1', name: '泥棒 1', type: 'SLIME', q: 0, r: -9, baseSpeed: 6, items: [], isJailed: false, color: '#ef4444', plot: [], endAction: 'NONE', boundTurns: 0 },
        { id: 'S2', name: '泥棒 2', type: 'SLIME', q: -1, r: -9, baseSpeed: 6, items: [], isJailed: false, color: '#f87171', plot: [], endAction: 'NONE', boundTurns: 0 },
        { id: 'S3', name: '泥棒 3', type: 'SLIME', q: 1, r: -10, baseSpeed: 6, items: [], isJailed: false, color: '#dc2626', plot: [], endAction: 'NONE', boundTurns: 0 },

        // 泥棒猫 2匹 (角B: q=-10, r=0, 角F: q=10, r=-10)
        { id: 'C1', name: '泥棒猫 1', type: 'CAT', q: -10, r: 0, baseSpeed: 7, items: [], isJailed: false, color: '#f59e0b', plot: [], endAction: 'NONE' },
        { id: 'C2', name: '泥棒猫 2', type: 'CAT', q: 10, r: -10, baseSpeed: 7, items: [], isJailed: false, color: '#fbbf24', plot: [], endAction: 'NONE' }
    ];

    // 初期警察犬 1匹 (角D 警察署の左隣: q=-1, r=10)
    let policeDogs = [
        { id: 'D1', name: '警察犬 1', q: -1, r: 10, speed: 8, target: null, eatingBoneTurns: 0, restingTurns: 0, plot: [] }
    ];

    // ドロップアイテム
    let groundItems = [
        { id: 'T1', name: 'お宝', weight: 5, q: labPos.q, r: labPos.r, color: '#ffd700' }
    ];

    // 監視カメラ 10個 (角C, D, E 周辺各3個 + 牢屋隣1個)
    let cameras = [
        { q: -5, r: 9 }, { q: -4, r: 9 }, { q: -6, r: 10 },
        { q: 0, r: 9 }, { q: 1, r: 10 }, { q: -1, r: 11 },
        { q: 5, r: -9 }, { q: 4, r: -9 }, { q: 6, r: -10 },
        { q: 0, r: 11 }
    ];

    let selectedUnitIndex = 0;

    // 初期アイテムスポーン (骨/スプレー)
    spawnRandomItems(10);

    function getMovableSpeed(unit) {
        if (unit.stunTurns > 0 || unit.boundTurns > 0) return 0;
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

    // 5ターンごとの10個アイテムスポーン (最大50個)
    function spawnRandomItems(count) {
        if (groundItems.length >= 50) return;
        let spawned = 0;
        let attempts = 0;
        while (spawned < count && groundItems.length < 50 && attempts < 500) {
            attempts++;
            let q = Math.floor(Math.random() * (HEX_RADIUS * 2 + 1)) - HEX_RADIUS;
            let r1 = Math.max(-HEX_RADIUS, -q - HEX_RADIUS);
            let r2 = Math.min(HEX_RADIUS, -q + HEX_RADIUS);
            let r = Math.floor(Math.random() * (r2 - r1 + 1)) + r1;

            let occupied = groundItems.some(it => it.q === q && it.r === r) ||
                           units.some(u => u.q === q && u.r === r);

            if (!occupied) {
                let isBone = Math.random() < 0.5;
                groundItems.push({
                    id: 'ITEM_' + Date.now() + '_' + spawned,
                    name: isBone ? '骨' : 'スプレー缶',
                    weight: isBone ? 2 : 1,
                    q: q, r: r,
                    color: isBone ? '#e2e8f0' : '#38bdf8'
                });
                spawned++;
            }
        }
        if (spawned > 0 && gameTurn > 1) {
            logEvent(`📦 マップ上に新たなアイテム (${spawned}個) が落ちてきた！`, 'normal');
        }
    }

    // 最短経路探索 (BFS)
    function findPath(startQ, startR, targetQ, targetR) {
        let queue = [{ q: startQ, r: startR, path: [] }];
        let visited = new Set();
        visited.add(`${startQ},${startR}`);

        while (queue.length > 0) {
            let curr = queue.shift();
            if (curr.q === targetQ && curr.r === targetR) {
                return curr.path;
            }

            let neighbors = [
                { q: curr.q + 1, r: curr.r }, { q: curr.q - 1, r: curr.r },
                { q: curr.q, r: curr.r + 1 }, { q: curr.q, r: curr.r - 1 },
                { q: curr.q + 1, r: curr.r - 1 }, { q: curr.q - 1, r: curr.r + 1 }
            ];

            for (let n of neighbors) {
                if (Math.abs(n.q) <= HEX_RADIUS && Math.abs(n.r) <= HEX_RADIUS && Math.abs(-n.q - n.r) <= HEX_RADIUS) {
                    let key = `${n.q},${n.r}`;
                    if (!visited.has(key)) {
                        visited.add(key);
                        queue.push({ q: n.q, r: n.r, path: [...curr.path, { q: n.q, r: n.r }] });
                    }
                }
            }
        }
        return [];
    }

    // キャンバス描画
    function drawGrid() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // マス描画 (全331マス)
        for (let q = -HEX_RADIUS; q <= HEX_RADIUS; q++) {
            let r1 = Math.max(-HEX_RADIUS, -q - HEX_RADIUS);
            let r2 = Math.min(HEX_RADIUS, -q + HEX_RADIUS);
            for (let r = r1; r <= r2; r++) {
                const pix = hexToPixel(q, r);

                let fillColor = '#1e2638';
                let strokeColor = '#323d54';

                // 角・重要拠点の色付け
                if (q === 0 && r === -10) fillColor = '#3b0764'; // 角A: 泥棒拠点
                if (q === -10 && r === 0) fillColor = (activeGoalCorner === 'B') ? '#047857' : '#1e2638'; // 角B: 運送班候補
                if (q === 10 && r === -10) fillColor = (activeGoalCorner === 'F') ? '#047857' : '#1e2638'; // 角F: 運送班候補
                if (q === 0 && r === 10) fillColor = '#4c0519'; // 角D: 警察拠点 & 牢屋

                if (q === labPos.q && r === labPos.r) fillColor = '#1e3a8a'; // 研究所
                if (q === powerPos.q && r === powerPos.r) fillColor = powerPlantHacked ? '#78350f' : '#065f46'; // 発電所

                drawHexagon(pix.x, pix.y, TILE_SIZE - 1, fillColor, strokeColor);
            }
        }

        // 建造物名ラベルの描画 (外側に表示)
        drawBuildingLabel(0, -10, '泥棒拠点 (角A)', '#a855f7', 'top');
        drawBuildingLabel(-10, 0, activeGoalCorner === 'B' ? '★ 運送班(ゴール)' : '角B 運送班候補', '#10b981', 'left');
        drawBuildingLabel(10, -10, activeGoalCorner === 'F' ? '★ 運送班(ゴール)' : '角F 運送班候補', '#10b981', 'right');
        drawBuildingLabel(0, 10, '警察拠点・牢屋 (角D)', '#ef4444', 'bottom');

        drawBuildingLabel(labPos.q, labPos.r, `研究所 (${labPos.name})`, '#60a5fa', 'top');
        drawBuildingLabel(powerPos.q, powerPos.r, `発電所 (${powerPos.name})`, powerPlantHacked ? '#f59e0b' : '#34d399', 'bottom');

        // 監視カメラの描画
        cameras.forEach(cam => {
            const pix = hexToPixel(cam.q, cam.r);
            ctx.beginPath();
            ctx.arc(pix.x, pix.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = powerPlantHacked ? '#6b7280' : '#ef4444';
            ctx.fill();
        });

        // 移動ライン描画 (他ユニット常時表示)
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

            if (u.type === 'POLICE') ctx.strokeStyle = isSelected ? '#60a5fa' : 'rgba(96, 165, 250, 0.4)';
            else if (u.type === 'CAT') ctx.strokeStyle = isSelected ? '#fbbf24' : 'rgba(251, 191, 36, 0.4)';
            else ctx.strokeStyle = isSelected ? '#f87171' : 'rgba(248, 113, 113, 0.4)';

            ctx.lineWidth = isSelected ? 3.5 : 2;
            if (!isSelected) ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
        });

        // 落ちているアイテムの描画
        groundItems.forEach(item => {
            const pix = hexToPixel(item.q, item.r);
            ctx.beginPath();
            ctx.arc(pix.x, pix.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = item.color;
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.stroke();
        });

        // ユニット描画
        units.forEach((u, idx) => {
            if (u.isJailed) return;
            const pix = hexToPixel(u.q, u.r);

            ctx.beginPath();
            if (u.type === 'POLICE') {
                ctx.moveTo(pix.x, pix.y - 9);
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

        // 警察犬描画
        policeDogs.forEach(dog => {
            const pix = hexToPixel(dog.q, dog.r);
            ctx.beginPath();
            ctx.arc(pix.x, pix.y, 7, 0, Math.PI * 2);
            ctx.fillStyle = '#a855f7';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
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

    function drawBuildingLabel(q, r, text, color, position) {
        const pix = hexToPixel(q, r);
        let lx = pix.x;
        let ly = pix.y;

        if (position === 'top') ly -= 22;
        if (position === 'bottom') ly += 24;
        if (position === 'left') lx -= 48;
        if (position === 'right') lx += 48;

        ctx.font = 'bold 11px sans-serif';
        const textWidth = ctx.measureText(text).width;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(lx - textWidth / 2 - 4, ly - 9, textWidth + 8, 16);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(lx - textWidth / 2 - 4, ly - 9, textWidth + 8, 16);

        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, lx, ly);
    }

    // クリック処理
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
        let clickedUnitIdx = units.findIndex(u => u.q === q && u.r === r && !u.isJailed);

        if (clickedUnitIdx !== -1) {
            if (clickedUnitIdx === selectedUnitIndex) {
                units[selectedUnitIndex].plot = [];
                updateUI();
                drawGrid();
                return;
            } else if (currentPhase === 'PLOT') {
                selectedUnitIndex = clickedUnitIdx;
                updateUI();
                drawGrid();
                return;
            }
        }

        let selUnit = units[selectedUnitIndex];
        if (!selUnit || currentPhase !== 'PLOT') return;

        let maxMov = getMovableSpeed(selUnit);
        if (maxMov === 0) return;

        if (q === selUnit.q && r === selUnit.r) {
            selUnit.plot = [];
            updateUI();
            drawGrid();
            return;
        }

        let existingIndex = selUnit.plot.findIndex(p => p.q === q && p.r === r);
        if (existingIndex !== -1) {
            selUnit.plot = selUnit.plot.slice(0, existingIndex + 1);
            updateUI();
            drawGrid();
            return;
        }

        let startPos = (selUnit.plot.length > 0) ? selUnit.plot[selUnit.plot.length - 1] : { q: selUnit.q, r: selUnit.r };
        let path = findPath(startPos.q, startPos.r, q, r);

        if (path.length > 0) {
            let availableSlots = maxMov - selUnit.plot.length;
            let stepsToAdd = path.slice(0, availableSlots);
            selUnit.plot.push(...stepsToAdd);
            updateUI();
            drawGrid();
        }
    }

    // コマ送り一斉移動実行
    function executeMovementPhase() {
        currentPhase = 'MOVING';
        document.getElementById('phase-display').innerText = '2. 一斉コマ送り移動中...';

        // 泥棒猫 (NPC) の自動思考プロット
        units.filter(u => u.type === 'CAT' && !u.isJailed).forEach(cat => {
            if (cat.plot.length === 0) {
                if (groundItems.length > 0) {
                    let closestItem = groundItems[0];
                    let minDist = hexDistance(cat.q, cat.r, closestItem.q, closestItem.r);
                    groundItems.forEach(it => {
                        let d = hexDistance(cat.q, cat.r, it.q, it.r);
                        if (d < minDist) { minDist = d; closestItem = it; }
                    });
                    let path = findPath(cat.q, cat.r, closestItem.q, closestItem.r);
                    cat.plot = path.slice(0, cat.baseSpeed);
                }
            }
        });

        // 警察犬 (NPC) の自動思考プロット
        policeDogs.forEach(dog => {
            if (dog.plot.length === 0) {
                let targets = units.filter(u => (u.type === 'SLIME' || u.type === 'CAT') && !u.isJailed);
                if (targets.length > 0) {
                    let closest = targets[0];
                    let minDist = hexDistance(dog.q, dog.r, closest.q, closest.r);
                    targets.forEach(t => {
                        let d = hexDistance(dog.q, dog.r, t.q, t.r);
                        if (d < minDist) { minDist = d; closest = t; }
                    });
                    let path = findPath(dog.q, dog.r, closest.q, closest.r);
                    dog.plot = path.slice(0, dog.speed);
                }
            }
        });

        let stepCount = 0;
        let maxSteps = 9;

        let interval = setInterval(() => {
            stepCount++;
            let anyMoved = false;

            // 各ユニットコマ送り
            units.forEach(u => {
                if (u.plot.length > 0) {
                    let nextPos = u.plot.shift();
                    u.q = nextPos.q; u.r = nextPos.r;
                    anyMoved = true;

                    // アイテム拾い処理
                    for (let i = groundItems.length - 1; i >= 0; i--) {
                        let item = groundItems[i];
                        if (item.q === u.q && item.r === u.r) {
                            u.items.push(item);
                            logEvent(`${u.name} が ${item.name} を取得！`, u.type);
                            groundItems.splice(i, 1);

                            if (item.name === 'お宝' && !activeGoalCorner) {
                                activeGoalCorner = Math.random() < 0.5 ? 'B' : 'F';
                                logEvent(`🚨 お宝が取得された！ 運送班が 角${activeGoalCorner} で待機中！`, 'SLIME');
                            }
                        }
                    }

                    // 発電所判定
                    if (u.q === powerPos.q && u.r === powerPos.r) {
                        if (u.type === 'SLIME' || u.type === 'CAT') {
                            if (!powerPlantHacked) {
                                powerPlantHacked = true;
                                powerHackTurnsLeft = 5;
                                logEvent(`⚡ ${u.name} が発電所をハッキング！ 5ターン監視カメラ停止＆牢屋緊急解放！`, 'SLIME');
                                units.filter(s => s.isJailed).forEach(s => { s.isJailed = false; s.q = 0; s.r = -10; });
                            }
                        } else if (u.type === 'POLICE' && powerPlantHacked) {
                            powerPlantHacked = false;
                            logEvent(`🔧 ${u.name} が発電所を復旧させた！`, 'POLICE');
                        }
                    }

                    // 警察による逮捕判定
                    units.filter(p => p.type === 'POLICE').forEach(pol => {
                        units.filter(s => s.type === 'SLIME' && !s.isJailed).forEach(sli => {
                            if (pol.q === sli.q && pol.r === sli.r) {
                                sli.isJailed = true;
                                sli.q = 0; sli.r = 10;
                                thievesJailed++;
                                logEvent(`🚨 ${pol.name} が ${sli.name} を逮捕・収監！`, 'POLICE');
                            }
                        });
                    });

                    // 運送班ゴール判定
                    if (activeGoalCorner) {
                        let goalQ = (activeGoalCorner === 'B') ? -10 : 10;
                        let goalR = (activeGoalCorner === 'B') ? 0 : -10;
                        if (u.q === goalQ && u.r === goalR) {
                            let treasureIdx = u.items.findIndex(it => it.name === 'お宝');
                            if (treasureIdx !== -1) {
                                u.items.splice(treasureIdx, 1);
                                treasuresDelivered++;
                                logEvent(`🎉 ${u.name} がお宝を運送班へ届けた！`, 'SLIME');
                            }
                        }
                    }
                }
            });

            // 警察犬コマ送り
            policeDogs.forEach(dog => {
                if (dog.plot.length > 0) {
                    let nextPos = dog.plot.shift();
                    dog.q = nextPos.q; dog.r = nextPos.r;
                    anyMoved = true;
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

        if (powerPlantHacked) {
            powerHackTurnsLeft--;
            if (powerHackTurnsLeft <= 0) {
                powerPlantHacked = false;
                logEvent(`⚡ 発電所の緊急ハッキングが解除されました。`, 'normal');
            }
        }

        // 5ターンごとにアイテム10個自動スポーン (最大50個)
        if (gameTurn % 5 === 0) {
            spawnRandomItems(10);
        }

        document.getElementById('phase-display').innerText = '1. 計画フェイズ (Plot Phase)';
        document.getElementById('turn-counter').innerText = `TURN ${gameTurn}`;
        document.getElementById('power-status').innerText = powerPlantHacked ? `ハッキング中 (残り${powerHackTurnsLeft}T)` : '正常稼働中';
        document.getElementById('power-status').style.color = powerPlantHacked ? '#f59e0b' : '#10b981';

        if (treasuresDelivered >= 1) {
            alert('🎉 泥棒陣営の完全勝利！ お宝を無事運送班へ届けました！');
        } else if (thievesJailed >= 3) {
            alert('🚨 警察陣営の完全勝利！ すべての泥棒を逮捕・収監しました！');
        }

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

        if (maxMov === 0) {
            document.getElementById('unit-plot-count').innerText = `行動不能状態です`;
            document.getElementById('btn-execute-phase').disabled = false;
            document.getElementById('btn-execute-phase').innerText = `▶ 計画完了・一斉移動実行`;
        } else if (remaining > 0) {
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
        if (currentPhase === 'PLOT') {
            executeMovementPhase();
        }
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
});
