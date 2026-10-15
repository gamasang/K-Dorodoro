// === KEIDRORORO ENGINE V2 (HEXAGONAL MAP WITH CLOCKWISE CORNERS A-F) ===
window.addEventListener('DOMContentLoaded', () => {
    const HEX_RADIUS = 15;
    const TILE_SIZE = 15.5;
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Hex coordinate conversion (Pointy-topped)
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

    // Game state
    let gameTurn = 1;
    let currentPhase = 'PLOT'; // 'PLOT' -> 'MOVING'
    let treasuresDelivered = 0;
    let thievesJailed = 0;

    // Power plant hacking state
    let powerPlantHacked = false;
    let powerPlantTimer = 0;

    // Random placement of Research Lab and Power Plant at corners C & E
    const isLabAtC = Math.random() < 0.5;
    const cornerC_Type = isLabAtC ? 'RESEARCH' : 'POWER';
    const cornerE_Type = isLabAtC ? 'POWER' : 'RESEARCH';

    // Active delivery team corner (B or F, determined when treasure is stolen)
    let activeDeliveryCorner = null;

    // Unit Setup according to user specification
    // Corner A (q=0, r=-15): Thief Base
    // Corner D (q=0, r=15): Police Base & Jail
    let units = [
        // Police (2 players) starting at top & bottom adjacent tiles of Police Base (0, 15)
        { id: 'P1', name: '警察 1', type: 'POLICE', q: -1, r: 15, baseSpeed: 6, items: [{ name: '電撃銃', weight: 1 }, { name: '台車', weight: 2 }], isJailed: false, color: '#3b82f6', plot: [] },
        { id: 'P2', name: '警察 2', type: 'POLICE', q: 1, r: 14, baseSpeed: 6, items: [{ name: '鍵', weight: 1 }], isJailed: false, color: '#60a5fa', plot: [] },

        // Police Dog (1 dog) starting at left adjacent tile of Police Base (0, 15)
        { id: 'D1', name: '警察犬 1', type: 'DOG', q: 0, r: 14, baseSpeed: 8, items: [], isJailed: false, color: '#a855f7', plot: [] },

        // Thief Slimes (3 players) starting at non-overlapping tiles adjacent to Thief Base (0, -15)
        { id: 'S1', name: '泥棒 1', type: 'SLIME', q: 0, r: -14, baseSpeed: 6, items: [], isJailed: false, color: '#ef4444', plot: [] },
        { id: 'S2', name: '泥棒 2', type: 'SLIME', q: -1, r: -14, baseSpeed: 6, items: [], isJailed: false, color: '#f87171', plot: [] },
        { id: 'S3', name: '泥棒 3', type: 'SLIME', q: 1, r: -15, baseSpeed: 6, items: [], isJailed: false, color: '#dc2626', plot: [] },

        // Thief Cats (2 NPCs) starting at Corners B (-15, 0) and F (15, -15)
        { id: 'C1', name: '泥棒猫 1', type: 'CAT', q: -15, r: 0, baseSpeed: 7, items: [], isJailed: false, color: '#f59e0b', plot: [] },
        { id: 'C2', name: '泥棒猫 2', type: 'CAT', q: 15, r: -15, baseSpeed: 7, items: [], isJailed: false, color: '#fbbf24', plot: [] }
    ];

    // Police HQ item stock (1 of each item)
    let policeHQStock = [
        { name: '防具', weight: 1 },
        { name: '台車', weight: 2 },
        { name: '電撃銃', weight: 1 },
        { name: '加速ギア', weight: 1 }
    ];

    // Field items (1 Treasure placed inside Research Lab)
    const labCoord = (cornerC_Type === 'RESEARCH') ? { q: -15, r: 15 } : { q: 15, r: 0 };
    let groundItems = [
        { id: 'T1', name: 'お宝', weight: 5, q: labCoord.q, r: labCoord.r, color: '#ffd700' },
        { id: 'S_SMOKE', name: 'スプレー缶(煙幕)', weight: 1, q: 0, r: -13, color: '#38bdf8' }
    ];

    // Security Cameras (10 cameras total: 3 near C, 3 near D, 3 near E, 1 adjacent to Jail)
    let cameras = [
        // Around C
        { q: -14, r: 14 }, { q: -15, r: 14 }, { q: -14, r: 15 },
        // Around D
        { q: -1, r: 15 }, { q: 0, r: 14 }, { q: 1, r: 14 },
        // Around E
        { q: 14, r: 0 }, { q: 15, r: -1 }, { q: 14, r: 1 },
        // Adjacent to Jail (0, 13)
        { q: 0, r: 12 }
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

    // Canvas Rendering
    function drawGrid() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw hexagon tiles
        for (let q = -HEX_RADIUS; q <= HEX_RADIUS; q++) {
            let r1 = Math.max(-HEX_RADIUS, -q - HEX_RADIUS);
            let r2 = Math.min(HEX_RADIUS, -q + HEX_RADIUS);
            for (let r = r1; r <= r2; r++) {
                const pix = hexToPixel(q, r);

                let fillColor = '#1d2432';
                let strokeColor = '#2f3b52';

                // Corner A (0, -15): Thief Base
                if (q === 0 && r === -15) fillColor = '#450a0a';

                // Corner B (-15, 0) & Corner F (15, -15): Delivery Team candidates / Cat start
                if ((q === -15 && r === 0) || (q === 15 && r === -15)) fillColor = '#064e3b';

                // Corner C (-15, 15) & Corner E (15, 0): Research Lab or Power Plant
                if (q === -15 && r === 15) fillColor = (cornerC_Type === 'RESEARCH') ? '#1e3a8a' : '#713f12';
                if (q === 15 && r === 0) fillColor = (cornerE_Type === 'RESEARCH') ? '#1e3a8a' : '#713f12';

                // Corner D (0, 15): Police Base & Jail (0, 13)
                if (q === 0 && r === 15) fillColor = '#1e3a8a';
                if (q === 0 && r === 13) fillColor = powerPlantHacked ? '#166534' : '#581c87'; // Jail (opens if power plant hacked)

                drawHexagon(pix.x, pix.y, TILE_SIZE - 1, fillColor, strokeColor);
            }
        }

        // Render Building Labels directly outside structure hexes
        renderBuildingLabels();

        // Render Security Cameras (10 cameras)
        cameras.forEach(cam => {
            const pix = hexToPixel(cam.q, cam.r);
            ctx.fillStyle = powerPlantHacked ? '#4b5563' : '#ef4444';
            ctx.beginPath();
            ctx.arc(pix.x, pix.y, 3, 0, Math.PI * 2);
            ctx.fill();

            // Lens pole
            ctx.strokeStyle = powerPlantHacked ? '#6b7280' : '#f87171';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(pix.x - 4, pix.y - 4);
            ctx.lineTo(pix.x + 4, pix.y + 4);
            ctx.stroke();
        });

        // Render Plotted Paths for ALL units (selected unit highlighted, others translucent)
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
            else if (u.type === 'DOG') ctx.strokeStyle = isSelected ? '#c084fc' : 'rgba(192, 132, 252, 0.4)';
            else ctx.strokeStyle = isSelected ? '#f87171' : 'rgba(248, 113, 113, 0.4)';

            ctx.lineWidth = isSelected ? 3.5 : 2;
            if (!isSelected) ctx.setLineDash([4, 4]);
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

        // Ground Items
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

        // Units
        units.forEach((u, idx) => {
            if (u.isJailed) return;
            const pix = hexToPixel(u.q, u.r);

            ctx.beginPath();
            if (u.type === 'POLICE') {
                ctx.moveTo(pix.x, pix.y - 8);
                ctx.lineTo(pix.x - 7, pix.y + 6);
                ctx.lineTo(pix.x + 7, pix.y + 6);
                ctx.closePath();
            } else {
                ctx.arc(pix.x, pix.y, 7, 0, Math.PI * 2);
            }

            ctx.fillStyle = u.color;
            ctx.fill();
            ctx.strokeStyle = (idx === selectedUnitIndex) ? '#ffffff' : '#000000';
            ctx.lineWidth = (idx === selectedUnitIndex) ? 3 : 1;
            ctx.stroke();
        });
    }

    function renderBuildingLabels() {
        const labels = [
            { q: 0, r: -15, text: "角A: 泥棒拠点", color: "#f87171", offset: { x: -75, y: 0 } },
            { q: -15, r: 0, text: "角B: 泥棒猫1 / 運送班候補", color: "#fbbf24", offset: { x: -100, y: -15 } },
            { q: -15, r: 15, text: `角C: ${cornerC_Type === 'RESEARCH' ? '研究所 (お宝)' : '発電所'}`, color: "#60a5fa", offset: { x: -30, y: -22 } },
            { q: 0, r: 15, text: "角D: 警察拠点", color: "#60a5fa", offset: { x: 20, y: 0 } },
            { q: 0, r: 13, text: "6角形牢屋", color: powerPlantHacked ? "#4ade80" : "#a855f7", offset: { x: 20, y: 15 } },
            { q: 15, r: 0, text: `角E: ${cornerE_Type === 'RESEARCH' ? '研究所 (お宝)' : '発電所'}`, color: "#60a5fa", offset: { x: -20, y: 22 } },
            { q: 15, r: -15, text: "角F: 泥棒猫2 / 運送班候補", color: "#fbbf24", offset: { x: -100, y: 18 } }
        ];

        labels.forEach(lbl => {
            const pix = hexToPixel(lbl.q, lbl.r);
            const lx = pix.x + lbl.offset.x;
            const ly = pix.y + lbl.offset.y;

            ctx.font = 'bold 11px sans-serif';
            const metrics = ctx.measureText(lbl.text);
            const w = metrics.width + 10;
            const h = 18;

            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.strokeStyle = lbl.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(lx - 5, ly - 13, w, h, 4);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.fillText(lbl.text, lx, ly);
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

    // Breadth-First Search for Shortest Path Auto-Completion
    function findShortestPath(startQ, startR, targetQ, targetR, maxSteps) {
        let queue = [[{ q: startQ, r: startR }]];
        let visited = new Set();
        visited.add(`${startQ},${startR}`);

        let directions = [
            { q: 1, r: 0 }, { q: -1, r: 0 },
            { q: 0, r: 1 }, { q: 0, r: -1 },
            { q: 1, r: -1 }, { q: -1, r: 1 }
        ];

        while (queue.length > 0) {
            let path = queue.shift();
            let curr = path[path.length - 1];

            if (curr.q === targetQ && curr.r === targetR) {
                return path.slice(1, maxSteps + 1);
            }

            if (path.length - 1 >= maxSteps + 5) continue;

            for (let d of directions) {
                let nq = curr.q + d.q;
                let nr = curr.r + d.r;
                let key = `${nq},${nr}`;

                if (Math.abs(nq) <= HEX_RADIUS && Math.abs(nr) <= HEX_RADIUS && Math.abs(-nq - nr) <= HEX_RADIUS) {
                    if (!visited.has(key)) {
                        visited.add(key);
                        queue.push([...path, { q: nq, r: nr }]);
                    }
                }
            }
        }

        // Return path clipped to max steps
        let directDist = hexDistance(startQ, startR, targetQ, targetR);
        let path = [];
        let curr = { q: startQ, r: startR };
        for (let i = 0; i < Math.min(directDist, maxSteps); i++) {
            let neighbors = directions.map(d => ({ q: curr.q + d.q, r: curr.r + d.r }));
            neighbors.sort((a, b) => hexDistance(a.q, a.r, targetQ, targetR) - hexDistance(b.q, b.r, targetQ, targetR));
            curr = neighbors[0];
            path.push(curr);
        }
        return path;
    }

    // Click Interactions
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

        if (clickedUnitIdx !== -1 && currentPhase === 'PLOT') {
            if (clickedUnitIdx === selectedUnitIndex) {
                // Clicking on currently selected unit resets its plot!
                units[selectedUnitIndex].plot = [];
            } else {
                selectedUnitIndex = clickedUnitIdx;
            }
            updateUI();
            drawGrid();
            return;
        }

        let selUnit = units[selectedUnitIndex];
        if (!selUnit || currentPhase !== 'PLOT') return;

        let maxMov = getMovableSpeed(selUnit);

        // Clicking start tile resets plot
        if (q === selUnit.q && r === selUnit.r) {
            selUnit.plot = [];
            updateUI();
            drawGrid();
            return;
        }

        // Clicking an existing plot step undoes up to that step
        let existingIndex = selUnit.plot.findIndex(p => p.q === q && p.r === r);
        if (existingIndex !== -1) {
            selUnit.plot = selUnit.plot.slice(0, existingIndex + 1);
            updateUI();
            drawGrid();
            return;
        }

        // Auto-complete path to target tile
        let currentLastPos = (selUnit.plot.length > 0) ? selUnit.plot[selUnit.plot.length - 1] : { q: selUnit.q, r: selUnit.r };
        let remainingSteps = maxMov - selUnit.plot.length;

        if (remainingSteps > 0) {
            let autoPath = findShortestPath(currentLastPos.q, currentLastPos.r, q, r, remainingSteps);
            selUnit.plot.push(...autoPath);
            updateUI();
            drawGrid();
        }
    }

    // Movement Execution Phase
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

                    // Power plant hacking trigger (Thieves entering Power Plant)
                    const pCoord = (cornerC_Type === 'POWER') ? { q: -15, r: 15 } : { q: 15, r: 0 };
                    if ((u.type === 'SLIME' || u.type === 'CAT') && u.q === pCoord.q && u.r === pCoord.r && !powerPlantHacked) {
                        powerPlantHacked = true;
                        powerPlantTimer = 5;
                        logEvent(`⚡ ${u.name} が発電所をハッキング！ 5ターンの間カメラ停止＆牢獄開放！`, 'SLIME');
                        // Free jailed slimes
                        units.filter(s => s.type === 'SLIME' && s.isJailed).forEach(s => {
                            s.isJailed = false;
                            s.q = 0; s.r = 13;
                            logEvent(`🔓 牢獄が緊急解放され、${s.name} が脱出！`, 'SLIME');
                        });
                    }

                    // Police entering Power Plant restores power immediately
                    if (u.type === 'POLICE' && u.q === pCoord.q && u.r === pCoord.r && powerPlantHacked) {
                        powerPlantHacked = false;
                        powerPlantTimer = 0;
                        logEvent(`🔧 ${u.name} が発電所を復旧！ カメラ作動再開。`, 'POLICE');
                    }

                    // Item Pick-up
                    for (let i = groundItems.length - 1; i >= 0; i--) {
                        let item = groundItems[i];
                        if (item.q === u.q && item.r === u.r) {
                            u.items.push(item);
                            logEvent(`${u.name} が ${item.name} を入手！`, u.type);
                            groundItems.splice(i, 1);

                            // Treasure pick-up triggers Delivery Goal activation at B or F
                            if (item.name === 'お宝' && !activeDeliveryCorner) {
                                activeDeliveryCorner = (Math.random() < 0.5) ? { q: -15, r: 0, name: '角B' } : { q: 15, r: -15, name: '角F' };
                                logEvent(`🚨 お宝が盗まれた！ 運送班待機ポイントが有効化（角Bまたは角F）。`, 'SLIME');
                            }
                        }
                    }

                    // Police Arrest Logic
                    units.filter(p => p.type === 'POLICE' || p.type === 'DOG').forEach(pol => {
                        units.filter(s => s.type === 'SLIME' && !s.isJailed).forEach(sli => {
                            if (pol.q === sli.q && pol.r === sli.r) {
                                sli.isJailed = true;
                                sli.q = 0; sli.r = 13; // Jailed at (0, 13)
                                thievesJailed++;
                                logEvent(`🚨 ${pol.name} が ${sli.name} を逮捕！ 6角形牢屋へ収監。`, 'POLICE');

                                sli.items.forEach(itm => {
                                    itm.q = pol.q; itm.r = pol.r;
                                    groundItems.push(itm);
                                });
                                sli.items = [];
                            }
                        });
                    });

                    // Thief Delivery Victory Logic
                    if (activeDeliveryCorner && u.q === activeDeliveryCorner.q && u.r === activeDeliveryCorner.r) {
                        let treasureIdx = u.items.findIndex(it => it.name === 'お宝');
                        if (treasureIdx !== -1) {
                            u.items.splice(treasureIdx, 1);
                            treasuresDelivered++;
                            logEvent(`🎉 ${u.name} がお宝を運送班へ受け渡した！ 泥棒陣営の勝利！`, 'SLIME');
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
        currentPhase = 'PLOT';

        // Power plant timer countdown
        if (powerPlantHacked) {
            powerPlantTimer--;
            if (powerPlantTimer <= 0) {
                powerPlantHacked = false;
                logEvent(`⚙️ 発電所が自動復旧しました。システム正常稼働。`, 'POLICE');
            }
        }

        document.getElementById('phase-display').innerText = '1. 計画フェイズ (Plot Phase)';
        document.getElementById('turn-counter').innerText = `TURN ${gameTurn}`;

        if (treasuresDelivered >= 1) {
            alert('🎉 泥棒陣営の完全勝利！ お宝の回収に成功しました！');
        } else if (thievesJailed >= 3) {
            alert('🚨 警察陣営の完全勝利！ 泥棒スライム全員を逮捕しました！');
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
                itemSelect.innerHTML += `<option value="${idx}">${item.name} を最終マスで置く/使用する</option>`;
            });

            itemCard.style.display = 'block';
        }

        document.getElementById('treasure-score').innerText = `${treasuresDelivered} / 1 個`;
        document.getElementById('jail-count').innerText = `${thievesJailed} / 3 名`;

        const powerStatus = document.getElementById('power-plant-status');
        if (powerPlantHacked) {
            powerStatus.innerText = `ハッキング中 (残り${powerPlantTimer}ターン) 🔓牢獄開放`;
            powerStatus.style.color = '#ef4444';
        } else {
            powerStatus.innerText = `正常稼働 (カメラ作動中)`;
            powerStatus.style.color = '#10b981';
        }

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
            logEvent(`${u.name} が足元に ${droppedItem.name} を置いた/使用した。`, u.type);
            updateUI();
            drawGrid();
        }
    });

    // Initial Render
    updateUI();
    drawGrid();
});
