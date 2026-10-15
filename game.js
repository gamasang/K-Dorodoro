// === KEIDRORORO ENGINE (RADIUS 10 MAP = 331 TILES) ===
function initGame() {
    const HEX_RADIUS = 10;   // 半径10マス (全331マス)
    const TILE_SIZE = 23;    // タイル描画サイズ

    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // 横向き6角形 (Pointy-topped) 座標変換
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
    let currentPhase = 'PLOT';
    let treasuresDelivered = 0;
    let thievesJailed = 0;

    // 発電所ハッキングタイマー (-1 = 通常稼働)
    let powerHackedTimer = -1;

    // 角C (上右: -10, 10) と 角E (下右: 10, 0) に研究所と発電所をランダム配置
    let isLabAtC = Math.random() < 0.5;
    const labPos = isLabAtC ? { q: -10, r: 10 } : { q: 10, r: 0 };
    const powerPos = isLabAtC ? { q: 10, r: 0 } : { q: -10, r: 10 };

    // ゴール(運送班)は角B(上左:-10,0)か角F(下左:10,-10)のどちらか。お宝入手時に確定！
    let activeGoalCorner = null; // 'B' or 'F'

    // 警察拠点: 角D (右: q=0, r=10)
    const policeHQPos = { q: 0, r: 10 };
    // 牢屋: 警察拠点から3マス左 (q=0, r=7)
    const jailPos = { q: 0, r: 7 };

    // 泥棒拠点: 角A (左: q=0, r=-10)

    // ユニット構成
    let units = [
        // 泥棒スライム 3名 (角A泥棒拠点の隣接マス)
        { id: 'S1', name: '泥棒 1', type: 'SLIME', q: 0, r: -9, baseSpeed: 6, items: [], isJailed: false, color: '#ef4444', plot: [], endAction: 'NONE' },
        { id: 'S2', name: '泥棒 2', type: 'SLIME', q: 1, r: -10, baseSpeed: 6, items: [], isJailed: false, color: '#f87171', plot: [], endAction: 'NONE' },
        { id: 'S3', name: '泥棒 3', type: 'SLIME', q: -1, r: -9, baseSpeed: 6, items: [], isJailed: false, color: '#dc2626', plot: [], endAction: 'NONE' },

        // 警察 2名 (角D警察拠点の上隣と下隣)
        { id: 'P1', name: '警察 1', type: 'POLICE', q: -1, r: 10, baseSpeed: 6, items: [{ name: '電撃銃', weight: 1 }], isJailed: false, color: '#3b82f6', plot: [], endAction: 'NONE' },
        { id: 'P2', name: '警察 2', type: 'POLICE', q: 1, r: 9, baseSpeed: 6, items: [{ name: '鍵', weight: 1 }], isJailed: false, color: '#60a5fa', plot: [], endAction: 'NONE' },

        // 泥棒猫 2匹 (角Bと角F)
        { id: 'C1', name: '泥棒猫 1', type: 'CAT', q: -10, r: 0, baseSpeed: 7, items: [], isJailed: false, color: '#f59e0b', plot: [], endAction: 'NONE' },
        { id: 'C2', name: '泥棒猫 2', type: 'CAT', q: 10, r: -10, baseSpeed: 7, items: [], isJailed: false, color: '#fbbf24', plot: [], endAction: 'NONE' },

        // 警察犬 1匹 (角D警察拠点の左隣 q=0, r=9 からスタート)
        { id: 'D1', name: '警察犬 1', type: 'DOG', q: 0, r: 9, baseSpeed: 8, items: [], isJailed: false, color: '#a855f7', plot: [], endAction: 'NONE', stunTurn: 0 }
    ];

    // フィールド上の落ちているアイテム (初期: 研究所にお宝1個)
    let groundItems = [
        { id: 'T1', name: 'お宝', weight: 5, q: labPos.q, r: labPos.r, color: '#ffd700' }
    ];

    // 監視カメラ 10個 (右側角C, D, Eの周囲各3個 + 牢屋の隣1個)
    let cameras = [
        // 角C周辺 (3個)
        { q: -9, r: 9 }, { q: -10, r: 9 }, { q: -9, r: 10 },
        // 角D周辺 (3個)
        { q: 0, r: 9 }, { q: -1, r: 9 }, { q: 1, r: 8 },
        // 角E周辺 (3個)
        { q: 9, r: 0 }, { q: 10, r: -1 }, { q: 9, r: 1 },
        // 牢屋(q=0, r=7)の隣 (1個)
        { q: 0, r: 6 }
    ];

    let selectedUnitIndex = 0;

    // 重力/重量ペナルティ計算
    function getMovableSpeed(unit) {
        let totalWeight = unit.items.reduce((sum, item) => sum + item.weight, 0);
        return Math.max(1, unit.baseSpeed - totalWeight);
    }

    // 5ターンごとのアイテム一括10個スポーン処理
    function spawnRandomItems() {
        if (groundItems.length >= 50) return;

        let availableTiles = [];
        for (let q = -HEX_RADIUS; q <= HEX_RADIUS; q++) {
            let r1 = Math.max(-HEX_RADIUS, -q - HEX_RADIUS);
            let r2 = Math.min(HEX_RADIUS, -q + HEX_RADIUS);
            for (let r = r1; r <= r2; r++) {
                let hasItem = groundItems.some(it => it.q === q && it.r === r);
                let hasUnit = units.some(u => u.q === q && u.r === r);
                if (!hasItem && !hasUnit) {
                    availableTiles.push({ q, r });
                }
            }
        }

        let spawnCount = Math.min(10, 50 - groundItems.length, availableTiles.length);
        for (let i = 0; i < spawnCount; i++) {
            let idx = Math.floor(Math.random() * availableTiles.length);
            let pos = availableTiles.splice(idx, 1)[0];
            let itemType = (Math.random() < 0.6) ? '骨' : 'スプレー缶';
            let itemWeight = (itemType === '骨') ? 2 : 1;
            let itemColor = (itemType === '骨') ? '#e5e7eb' : '#6366f1';

            groundItems.push({
                id: 'I_' + Math.random().toString(36).substr(2, 5),
                name: itemType,
                weight: itemWeight,
                q: pos.q,
                r: pos.r,
                color: itemColor
            });
        }
        logEvent(`📦 Turn ${gameTurn}: マップのランダムな空きマスに骨・スプレー缶が10個補充された！`, 'CAT');
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

    // キャンバス描画エンジン
    function drawGrid() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 六角形タイルの描画
        for (let q = -HEX_RADIUS; q <= HEX_RADIUS; q++) {
            let r1 = Math.max(-HEX_RADIUS, -q - HEX_RADIUS);
            let r2 = Math.min(HEX_RADIUS, -q + HEX_RADIUS);
            for (let r = r1; r <= r2; r++) {
                const pix = hexToPixel(q, r);

                let fillColor = '#171e2e';
                let strokeColor = '#2e3a52';

                // 各構造物の着色表示
                if (q === policeHQPos.q && r === policeHQPos.r) fillColor = '#1e3a8a'; // 角D: 警察拠点
                if (q === jailPos.q && r === jailPos.r) fillColor = '#4a1d24'; // 警察拠点から3マス左: 牢屋
                if (q === 0 && r === -10) fillColor = '#831843'; // 角A: 泥棒拠点

                if (q === labPos.q && r === labPos.r) fillColor = '#1e3a8a'; // 研究所
                if (q === powerPos.q && r === powerPos.r) fillColor = '#854d0e'; // 発電所

                if ((q === -10 && r === 0) || (q === 10 && r === -10)) {
                    fillColor = (activeGoalCorner !== null) ? '#064e3b' : '#1f2937'; // 運送班
                }

                drawHexagon(pix.x, pix.y, TILE_SIZE - 1, fillColor, strokeColor);

                // 建造物ネームタグの表示
                if (q === policeHQPos.q && r === policeHQPos.r) {
                    drawBuildingLabel(pix.x, pix.y, "警察拠点", "#3b82f6", "right");
                }
                if (q === jailPos.q && r === jailPos.r) {
                    drawBuildingLabel(pix.x, pix.y, "牢屋", "#ef4444", "top");
                }
                if (q === 0 && r === -10) {
                    drawBuildingLabel(pix.x, pix.y, "泥棒拠点", "#f43f5e", "left");
                }
                if (q === labPos.q && r === labPos.r) {
                    drawBuildingLabel(pix.x, pix.y, "研究所(お宝)", "#60a5fa", "top");
                }
                if (q === powerPos.q && r === powerPos.r) {
                    drawBuildingLabel(pix.x, pix.y, "発電所", "#f59e0b", "bottom");
                }
                if (q === -10 && r === 0) {
                    drawBuildingLabel(pix.x, pix.y, activeGoalCorner === 'B' ? "運送班(GOAL!)" : "運送班(B)", "#10b981", "left");
                }
                if (q === 10 && r === -10) {
                    drawBuildingLabel(pix.x, pix.y, activeGoalCorner === 'F' ? "運送班(GOAL!)" : "運送班(F)", "#10b981", "left");
                }
            }
        }

        // 監視カメラの描画 (黒いポールと赤目)
        cameras.forEach(cam => {
            const pix = hexToPixel(cam.q, cam.r);
            ctx.fillStyle = '#000000';
            ctx.fillRect(pix.x - 2, pix.y - 7, 4, 10);
            ctx.beginPath();
            ctx.arc(pix.x, pix.y - 7, 3, 0, Math.PI * 2);
            ctx.fillStyle = (powerHackedTimer > 0) ? '#6b7280' : '#ef4444';
            ctx.fill();
        });

        // 全ユニットのプロット済み移動ラインの描画
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

            ctx.strokeStyle = isSelected ? u.color : 'rgba(255,255,255,0.4)';
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

        // 地面のアイテム描画
        groundItems.forEach(item => {
            const pix = hexToPixel(item.q, item.r);
            ctx.beginPath();
            ctx.arc(pix.x, pix.y, item.name === 'お宝' ? 7 : 4, 0, Math.PI * 2);
            ctx.fillStyle = item.color;
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
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

    function drawBuildingLabel(x, y, text, color, align) {
        ctx.font = 'bold 10px sans-serif';
        const textWidth = ctx.measureText(text).width;

        let lx = x + 12;
        let ly = y + 4;
        if (align === 'left') lx = x - textWidth - 14;
        if (align === 'top') { lx = x - textWidth / 2; ly = y - 16; }
        if (align === 'bottom') { lx = x - textWidth / 2; ly = y + 20; }

        ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
        ctx.fillRect(lx - 3, ly - 10, textWidth + 6, 13);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(lx - 3, ly - 10, textWidth + 6, 13);

        ctx.fillStyle = '#ffffff';
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

    // BFS 最短経路探索アルゴリズム
    function findShortestPath(startQ, startR, targetQ, targetR, maxSteps) {
        let queue = [[{ q: startQ, r: startR }]];
        let visited = new Set();
        visited.add(`${startQ},${startR}`);

        while (queue.length > 0) {
            let path = queue.shift();
            let curr = path[path.length - 1];

            if (curr.q === targetQ && curr.r === targetR) {
                return path.slice(1, maxSteps + 1);
            }

            if (path.length - 1 >= maxSteps + 4) continue;

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
                        queue.push([...path, n]);
                    }
                }
            }
        }
        return [];
    }

    // マウスクリック処理
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

        // 選択中ユニットそのものをクリックした場合 -> プロット全リセット
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

        let currentLastPos = (selUnit.plot.length > 0) ? selUnit.plot[selUnit.plot.length - 1] : { q: selUnit.q, r: selUnit.r };
        let remainingSteps = maxMov - selUnit.plot.length;

        if (remainingSteps > 0) {
            let autoPath = findShortestPath(currentLastPos.q, currentLastPos.r, q, r, remainingSteps);
            if (autoPath.length > 0) {
                selUnit.plot = [...selUnit.plot, ...autoPath];
                updateUI();
                drawGrid();
            }
        }
    }

    // 毎ターンのコマ送り一斉移動実行ロジック
    function executeMovementPhase() {
        currentPhase = 'MOVING';
        document.getElementById('phase-display').innerText = '2. 一斉コマ送り移動中...';

        // 猫・犬の自動プロット補充
        runAIPlotting();

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

                    // 発電所侵入判定
                    if (u.q === powerPos.q && u.r === powerPos.r) {
                        if (u.type === 'SLIME' || u.type === 'CAT') {
                            powerHackedTimer = 5;
                            logEvent(`⚡ ${u.name} が発電所をハッキング！ 5ターンの間カメラ停止＆牢屋緊急解放！`, 'SLIME');
                            units.filter(s => s.isJailed).forEach(s => {
                                s.isJailed = false;
                                s.q = jailPos.q; s.r = jailPos.r - 1;
                            });
                        } else if (u.type === 'POLICE') {
                            powerHackedTimer = -1;
                            logEvent(`🔧 ${u.name} が発電所を復旧させた！ 監視カメラが再起動。`, 'POLICE');
                        }
                    }

                    // アイテム拾い判定
                    for (let i = groundItems.length - 1; i >= 0; i--) {
                        let item = groundItems[i];
                        if (item.q === u.q && item.r === u.r) {
                            u.items.push(item);
                            logEvent(`${u.name} が ${item.name} を入手！`, u.type);
                            groundItems.splice(i, 1);

                            if (item.name === 'お宝' && activeGoalCorner === null) {
                                activeGoalCorner = (Math.random() < 0.5) ? 'B' : 'F';
                                logEvent(`🚨 警報！お宝が持ち出された！ 泥棒陣営は角${activeGoalCorner}の運送班へ向かえ！`, 'SLIME');
                            }
                        }
                    }

                    // 警察による逮捕判定
                    units.filter(p => p.type === 'POLICE').forEach(pol => {
                        units.filter(s => (s.type === 'SLIME' || s.type === 'CAT') && !s.isJailed).forEach(sli => {
                            if (pol.q === sli.q && pol.r === sli.r) {
                                sli.isJailed = true;
                                sli.q = jailPos.q; sli.r = jailPos.r;
                                if (sli.type === 'SLIME') thievesJailed++;
                                logEvent(`🚨 ${pol.name} が ${sli.name} を逮捕！ 牢屋へ送られました。`, 'POLICE');

                                sli.items.forEach(itm => {
                                    itm.q = pol.q; itm.r = pol.r;
                                    groundItems.push(itm);
                                });
                                sli.items = [];
                            }
                        });
                    });

                    // 運送班ゴール判定
                    units.filter(s => (s.type === 'SLIME' || s.type === 'CAT')).forEach(s => {
                        let isAtGoal = (activeGoalCorner === 'B' && s.q === -10 && s.r === 0) ||
                                       (activeGoalCorner === 'F' && s.q === 10 && s.r === -10);
                        if (isAtGoal) {
                            let treasureIdx = s.items.findIndex(it => it.name === 'お宝');
                            if (treasureIdx !== -1) {
                                s.items.splice(treasureIdx, 1);
                                treasuresDelivered++;
                                logEvent(`🎉 ${s.name} がお宝を運送班へ届けた！`, 'SLIME');
                            }
                        }
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

    function runAIPlotting() {
        // 猫のAI: 最寄りのアイテムを収集して泥棒へ届ける
        units.filter(u => u.type === 'CAT' && !u.isJailed).forEach(cat => {
            if (!cat.plot || cat.plot.length === 0) {
                if (groundItems.length > 0) {
                    let nearest = groundItems[0];
                    let path = findShortestPath(cat.q, cat.r, nearest.q, nearest.r, cat.baseSpeed);
                    if (path.length > 0) cat.plot = path;
                }
            }
        });

        // 警察犬のAI: 最寄りの泥棒を追跡
        units.filter(u => u.type === 'DOG' && !u.isJailed).forEach(dog => {
            if (!dog.plot || dog.plot.length === 0) {
                let activeThieves = units.filter(s => s.type === 'SLIME' && !s.isJailed);
                if (activeThieves.length > 0) {
                    let target = activeThieves[0];
                    let path = findShortestPath(dog.q, dog.r, target.q, target.r, dog.baseSpeed);
                    if (path.length > 0) dog.plot = path;
                }
            }
        });
    }

    function finishTurn() {
        gameTurn++;
        if (powerHackedTimer > 0) {
            powerHackedTimer--;
            if (powerHackedTimer === 0) {
                powerHackedTimer = -1;
                logEvent(`🔧 発電所の自動ハッキングが解除され、監視カメラが復旧した。`, 'POLICE');
            }
        }

        // 5ターンごとのアイテム補充
        if (gameTurn % 5 === 0) {
            spawnRandomItems();
        }

        currentPhase = 'PLOT';
        document.getElementById('phase-display').innerText = '1. 計画フェイズ (Plot Phase)';
        document.getElementById('turn-counter').innerText = `TURN ${gameTurn}`;

        if (treasuresDelivered >= 1) {
            alert('🎉 泥棒陣営の完全勝利！ お宝を運送班へ届けました！');
        } else if (thievesJailed >= 3) {
            alert('🚨 警察陣営の完全勝利！ すべての泥棒を逮捕しました！');
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

        if (remaining > 0) {
            document.getElementById('unit-plot-count').innerText = `${u.plot.length} / ${maxMov} ステップ (あと ${remaining} マス選択必須)`;
            document.getElementById('btn-execute-phase').disabled = true;
            document.getElementById('btn-execute-phase').innerText = `▶ 計画完了・一斉移動実行 (あと${remaining}マス選択が必要)`;
            document.getElementById('item-action-card').style.display = 'none';
        } else {
            document.getElementById('unit-plot-count').innerText = `${u.plot.length} / ${maxMov} ステップ (準備完了！)`;
            document.getElementById('btn-execute-phase').disabled = false;
            document.getElementById('btn-execute-phase').innerText = `▶ 計画完了・一斉移動実行`;

            const itemCard = document.getElementById('item-action-card');
            const itemSelect = document.getElementById('item-action-select');
            itemSelect.innerHTML = '<option value="NONE">アイテムを使用しない/置かない</option>';

            u.items.forEach((item, idx) => {
                itemSelect.innerHTML += `<option value="${idx}">${item.name} を最終マスに置く/使用する</option>`;
            });

            itemCard.style.display = 'block';
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
            logEvent(`${u.name} が足元に ${droppedItem.name} を置いた/パスした。`, u.type);
            updateUI();
            drawGrid();
        }
    });

    updateUI();
    drawGrid();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}
