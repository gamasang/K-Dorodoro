// === HEXAGONAL GRID MATH & ENGINE (90° ROTATED / HORIZONTAL GRID) ===
window.addEventListener('DOMContentLoaded', () => {
    const HEX_RADIUS = 15;   // マップ半径：15マス
    const TILE_SIZE = 15.5;  // タイル描画ピクセル半径
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // 横向き6角形 (Pointy-topped / 90度回転座標変換)
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

    // ユニット構成: 警察(右・青) 2 vs 泥棒(左・赤) 4 + 猫(左・黄) 2
    let units = [
        // 警察 (右側配置・青・円錐▲)
        { id: 'P1', name: '警察 1', type: 'POLICE', q: 0, r: 12, baseSpeed: 6, items: [{ name: '電撃銃', weight: 1 }, { name: '台車', weight: 2 }], isJailed: false, color: '#3b82f6', plot: [], endAction: 'NONE' },
        { id: 'P2', name: '警察 2', type: 'POLICE', q: 1, r: 11, baseSpeed: 6, items: [{ name: '鍵', weight: 1 }], isJailed: false, color: '#60a5fa', plot: [], endAction: 'NONE' },

        // 泥棒スライム (左側配置・赤・球●)
        { id: 'S1', name: '泥棒 1', type: 'SLIME', q: 0, r: -15, baseSpeed: 6, items: [], isJailed: false, color: '#ef4444', plot: [], endAction: 'NONE' },
        { id: 'S2', name: '泥棒 2', type: 'SLIME', q: -15, r: 0, baseSpeed: 6, items: [], isJailed: false, color: '#f87171', plot: [], endAction: 'NONE' },
        { id: 'S3', name: '泥棒 3', type: 'SLIME', q: 15, r: -15, baseSpeed: 6, items: [], isJailed: false, color: '#dc2626', plot: [], endAction: 'NONE' },
        { id: 'S4', name: '泥棒 4', type: 'SLIME', q: -8, r: -4, baseSpeed: 6, items: [], isJailed: false, color: '#fca5a5', plot: [], endAction: 'NONE' },

        // 泥棒猫 (左側配置・黄・NPC●)
        { id: 'C1', name: '泥棒猫 1', type: 'CAT', q: -5, r: -8, baseSpeed: 7, items: [], isJailed: false, color: '#f59e0b', plot: [], endAction: 'NONE' },
        { id: 'C2', name: '泥棒猫 2', type: 'CAT', q: 5, r: -12, baseSpeed: 7, items: [], isJailed: false, color: '#fbbf24', plot: [], endAction: 'NONE' }
    ];

    let policeDogs = []; // 警報時に追加される警察犬 (右側牢屋から出動・紫/NPC)

    // フィールド上に配置されたアイテム
    let groundItems = [
        { id: 'T1', name: 'お宝', weight: 5, q: 0, r: -15, color: '#ffd700' },
        { id: 'T2', name: 'お宝', weight: 5, q: -15, r: 0, color: '#ffd700' },
        { id: 'B1', name: '骨', weight: 2, q: -5, r: -5, color: '#e5e7eb' },
        { id: 'K1', name: '鍵', weight: 1, q: 5, r: 5, color: '#a855f7' }
    ];

    let selectedUnitIndex = 0;

    // 重量ペナルティ計算：初期速度 6 - 所持重量 (お宝で1マスに制限)
    function getMovableSpeed(unit) {
        let totalWeight = unit.items.reduce((sum, item) => sum + item.weight, 0);
        return Math.max(1, unit.baseSpeed - totalWeight);
    }

    // ログ出力 helper
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

        // 六角形タイルの描画 (横向き/Pointy-topped)
        for (let q = -HEX_RADIUS; q <= HEX_RADIUS; q++) {
            let r1 = Math.max(-HEX_RADIUS, -q - HEX_RADIUS);
            let r2 = Math.min(HEX_RADIUS, -q + HEX_RADIUS);
            for (let r = r1; r <= r2; r++) {
                const pix = hexToPixel(q, r);

                let fillColor = '#222a3a'; // 見やすい濃紺
                let strokeColor = '#3a4760'; // ハッキリした枠線

                // 施設の色分け表示 (横向きレイアウト)
                if (q === 0 && r === 10) fillColor = '#6b1d2f'; // 5角形牢屋 (右側警察拠点)
                if ((q === 0 && r === -15) || (q === -15 && r === 0)) fillColor = '#1e40af'; // 研究所 (左側お宝)
                if ((q === 15 && r === -15) || (q === -10 && r === -3)) fillColor = '#047857'; // 運送班 (左側ゴール)
                if ((q === -15 && r === 15) || (q === 15 && r === 0)) fillColor = '#5b21b6'; // 抜け道 (上下ショートカット)

                drawHexagon(pix.x, pix.y, TILE_SIZE - 1, fillColor, strokeColor);
            }
        }

        // 全ユニットのプロット済み移動ラインの描画 (★他のユニット操作中も可視化★)
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

            // 選択中のユニットは強調、他ユニットは少し透過させて見やすく表示
            if (u.type === 'POLICE') {
                ctx.strokeStyle = isSelected ? '#60a5fa' : 'rgba(96, 165, 250, 0.5)';
            } else if (u.type === 'CAT') {
                ctx.strokeStyle = isSelected ? '#fbbf24' : 'rgba(251, 191, 36, 0.5)';
            } else {
                ctx.strokeStyle = isSelected ? '#f87171' : 'rgba(248, 113, 113, 0.5)';
            }

            ctx.lineWidth = isSelected ? 3.5 : 2;
            if (!isSelected) {
                ctx.setLineDash([4, 4]); // 選択中でないユニットのルートは点線
            } else {
                ctx.setLineDash([]);
            }
            ctx.stroke();
            ctx.setLineDash([]);

            // プロット地点にステップマーカーを描画
            u.plot.forEach(p => {
                let pix = hexToPixel(p.q, p.r);
                ctx.beginPath();
                ctx.arc(pix.x, pix.y, isSelected ? 4 : 3, 0, Math.PI * 2);
                ctx.fillStyle = isSelected ? '#ffffff' : u.color;
                ctx.fill();
            });
        });

        // 落ちているアイテムの描画
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

        // ユニットの描画
        units.forEach((u, idx) => {
            if (u.isJailed) return;
            const pix = hexToPixel(u.q, u.r);

            ctx.beginPath();
            if (u.type === 'POLICE') {
                // 警察：円錐（三角形）
                ctx.moveTo(pix.x, pix.y - 8);
                ctx.lineTo(pix.x - 7, pix.y + 6);
                ctx.lineTo(pix.x + 7, pix.y + 6);
                ctx.closePath();
            } else {
                // 泥棒・猫：球体（円）
                ctx.arc(pix.x, pix.y, 7, 0, Math.PI * 2);
            }

            ctx.fillStyle = u.color;
            ctx.fill();
            ctx.strokeStyle = (idx === selectedUnitIndex) ? '#ffffff' : '#000000';
            ctx.lineWidth = (idx === selectedUnitIndex) ? 3 : 1;
            ctx.stroke();
        });

        // 警察犬の描画
        policeDogs.forEach(dog => {
            const pix = hexToPixel(dog.q, dog.r);
            ctx.beginPath();
            ctx.arc(pix.x, pix.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#a855f7';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    }

    // 横向き6角形描画 (30度オフセット)
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

    // クリックインタラクション
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
            selectedUnitIndex = clickedUnitIdx;
            updateUI();
            drawGrid();
            return;
        }

        let selUnit = units[selectedUnitIndex];
        if (!selUnit || currentPhase !== 'PLOT') return;

        let maxMov = getMovableSpeed(selUnit);

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

        let currentLastPos = (selUnit.plot.length > 0) ? selUnit.plot[selUnit.plot.length - 1] : { q: selUnit.q, r: selUnit.r };
        let dist = hexDistance(currentLastPos.q, currentLastPos.r, q, r);

        if (dist === 1 && selUnit.plot.length < maxMov) {
            selUnit.plot.push({ q, r });
            updateUI();
            drawGrid();
        }
    }

    // コマ送り一斉移動の実行ロジック
    function executeMovementPhase() {
        currentPhase = 'MOVING';
        document.getElementById('phase-display').innerText = '2. 一斉コマ送り移動中...';

        units.filter(u => u.type === 'CAT').forEach(cat => {
            if (cat.plot.length === 0) {
                if (groundItems.length > 0) {
                    let nearestItem = groundItems;
                    let step = getNextStepTowards(cat.q, cat.r, nearestItem.q, nearestItem.r);
                    if (step && step.length > 0) cat.plot.push(step);
                }
            }
        });

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

                    for (let i = groundItems.length - 1; i >= 0; i--) {
                        let item = groundItems[i];
                        if (item.q === u.q && item.r === u.r) {
                            u.items.push(item);
                            logEvent(`${u.name} が ${item.name} (重さ${item.weight}) を取得！`, u.type);
                            groundItems.splice(i, 1);

                            if (item.name === 'お宝' && policeDogs.length === 0) {
                                policeDogs.push({ id: 'D1', q: 0, r: 10, speed: 8 });
                                logEvent(`🚨 警報発生！監視カメラがお宝持ち出しを検知。右側拠点から警察犬(紫)が出動！`, 'DOG');
                            }
                        }
                    }

                    units.filter(p => p.type === 'POLICE').forEach(pol => {
                        units.filter(s => s.type === 'SLIME' && !s.isJailed).forEach(sli => {
                            if (pol.q === sli.q && pol.r === sli.r) {
                                sli.isJailed = true;
                                sli.q = 0; sli.r = 10;
                                thievesJailed++;
                                logEvent(`🚨 ${pol.name} が ${sli.name} を逮捕！ 右側5角形牢屋へ収監しました。`, 'POLICE');

                                sli.items.forEach(itm => {
                                    itm.q = pol.q; itm.r = pol.r;
                                    groundItems.push(itm);
                                });
                                sli.items = [];
                            }
                        });
                    });

                    units.filter(s => (s.type === 'SLIME' || s.type === 'CAT')).forEach(s => {
                        if ((s.q === 15 && s.r === -15) || (s.q === -10 && s.r === -3)) {
                            let treasureIdx = s.items.findIndex(it => it.name === 'お宝');
                            if (treasureIdx !== -1) {
                                s.items.splice(treasureIdx, 1);
                                treasuresDelivered++;
                                logEvent(`🎉 ${s.name} がお宝を左側運送班へ届けた！ (計 ${treasuresDelivered} / 2 個)`, 'SLIME');
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

    function getNextStepTowards(sq, sr, tq, tr) {
        let neighbors = [
            { q: sq + 1, r: sr }, { q: sq - 1, r: sr },
            { q: sq, r: sr + 1 }, { q: sq, r: sr - 1 },
            { q: sq + 1, r: sr - 1 }, { q: sq - 1, r: sr + 1 }
        ];
        neighbors.sort((a, b) => hexDistance(a.q, a.r, tq, tr) - hexDistance(b.q, b.r, tq, tr));
        return neighbors;
    }

    function finishTurn() {
        gameTurn++;
        currentPhase = 'PLOT';
        document.getElementById('phase-display').innerText = '1. 計画フェイズ (Plot Phase)';
        document.getElementById('turn-counter').innerText = `TURN ${gameTurn}`;

        if (treasuresDelivered >= 2) {
            alert('🎉 泥棒陣営の完全勝利！ すべてのお宝を運送班へ届けました！');
        } else if (thievesJailed >= 4) {
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

        document.getElementById('treasure-score').innerText = `${treasuresDelivered} / 2 個`;
        document.getElementById('jail-count').innerText = `${thievesJailed} / 4 名`;

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

    // 初期化
    updateUI();
    drawGrid();
});
