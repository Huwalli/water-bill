// ============================================================
//  霓虹星塵：一個會發光的小射擊遊戲
//  想改遊戲？先改下面 CONFIG 的數字，存檔、重新整理，看看會怎樣！
// ============================================================

const CONFIG = {
  lives: 3,            // 一開始有幾條命
  maxLives: 5,         // 最多幾條命
  playerSpeed: 700,    // 鍵盤移動速度（越大越快）
  fireInterval: 0.18,  // 幾秒射一發（越小射越快）
  comboSeconds: 2.5,   // 幾秒內沒打到敵人，連擊就歸零
  maxCombo: 8,         // 連擊最高幾倍
  powerChance: 0.12,   // 打倒敵人掉道具的機率（0 ~ 1）
  tripleSeconds: 8     // 三連發持續幾秒
};

const BEST_KEY = "neonStardustBest";   // 最高分存在 localStorage 的名字
const MUTE_KEY = "neonStardustMuted";  // 靜音設定存在 localStorage 的名字

// ---------- 找到畫面上的東西 ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const comboEl = document.getElementById("combo");
const bestEl = document.getElementById("best");
const livesEl = document.getElementById("lives");
const overlay = document.getElementById("overlay");
const titleEl = document.getElementById("title");
const msgEl = document.getElementById("msg");
const startBtn = document.getElementById("startBtn");
const muteBtn = document.getElementById("muteBtn");

// ---------- 小工具 ----------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 讀 / 存 localStorage（有些瀏覽器會擋，所以包 try）
function loadNumber(key) {
  try { return Number(localStorage.getItem(key)) || 0; } catch (e) { return 0; }
}
function saveValue(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (e) { /* 存不了就算了 */ }
}

// ---------- 畫布大小 ----------
let W = 0, H = 0;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// ============================================================
//  音效：用瀏覽器自己合成，不需要任何音檔
// ============================================================
let audioCtx = null;
let muted = loadNumber(MUTE_KEY) === 1;
muteBtn.textContent = muted ? "🔇" : "🔊";

function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}

// 發出一個聲音：頻率、長度、波形、音量、音高變化
function tone(freq, dur, type, vol, slide) {
  if (muted || !audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  gain.gain.setValueAtTime(vol || 0.08, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

// 爆炸聲：一小段會慢慢變小的雜訊
function noise(dur, vol) {
  if (muted || !audioCtx) return;
  const len = Math.floor(audioCtx.sampleRate * dur);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  src.buffer = buf;
  gain.gain.value = vol;
  src.connect(gain);
  gain.connect(audioCtx.destination);
  src.start();
}

const sfx = {
  shoot: () => tone(880, 0.06, "square", 0.015, -500),
  boom: () => { noise(0.25, 0.12); tone(160, 0.25, "sawtooth", 0.06, -110); },
  power: () => { tone(520, 0.12, "triangle", 0.09, 300); setTimeout(() => tone(780, 0.18, "triangle", 0.09, 300), 90); },
  hurt: () => { noise(0.35, 0.22); tone(120, 0.4, "sawtooth", 0.12, -80); },
  over: () => tone(330, 0.9, "sawtooth", 0.1, -270),
  level: () => { tone(440, 0.1, "square", 0.05, 0); setTimeout(() => tone(660, 0.16, "square", 0.05, 0), 100); }
};

muteBtn.addEventListener("click", () => {
  muted = !muted;
  muteBtn.textContent = muted ? "🔇" : "🔊";
  saveValue(MUTE_KEY, muted ? 1 : 0);
  muteBtn.blur();
});

// ============================================================
//  遊戲狀態
// ============================================================
let state = "menu";          // menu（選單）/ play（遊戲中）/ pause（暫停）/ over（結束）
let score = 0, combo = 1, comboTimer = 0, lives = CONFIG.lives;
let best = loadNumber(BEST_KEY);
let time = 0, level = 1;
let spawnTimer = 0, fireTimer = 0, tripleTimer = 0, invincible = 0;
let shake = 0, flash = 0;
let newRecord = false;

const player = { x: 0, y: 0, r: 14, targetX: 0 };
let bullets = [], enemies = [], particles = [], powerups = [], floaters = [], stars = [];
const keys = {};

// 星空背景：三層，遠的慢、近的快
function makeStars() {
  stars = [];
  for (let i = 0; i < 110; i++) {
    const layer = 1 + Math.floor(Math.random() * 3);
    stars.push({ x: rand(0, W), y: rand(0, H), layer, size: layer * 0.7 });
  }
}
makeStars();

function resetGame() {
  score = 0; combo = 1; comboTimer = 0; lives = CONFIG.lives;
  time = 0; level = 1; spawnTimer = 0; fireTimer = 0; tripleTimer = 0; invincible = 0;
  shake = 0; flash = 0; newRecord = false;
  bullets = []; enemies = []; powerups = []; floaters = [];
  player.x = W / 2; player.targetX = W / 2; player.y = H - 90;
}

// ============================================================
//  產生東西
// ============================================================
function spawnEnemy() {
  const r = Math.random();
  const lv = level;
  let e;
  if (r < 0.6) {
    e = { type: "normal", r: 16, hp: 1, speed: 90 + lv * 12, color: "#ff3d81" };
  } else if (r < 0.85) {
    e = { type: "fast", r: 12, hp: 1, speed: 170 + lv * 14, color: "#00e5ff" };
  } else {
    e = { type: "tank", r: 24, hp: 3, speed: 55 + lv * 8, color: "#b36bff" };
  }
  e.maxHp = e.hp;
  e.baseX = rand(40, W - 40);
  e.x = e.baseX;
  e.y = -40;
  e.t = rand(0, 6);
  enemies.push(e);
}

// 爆炸火花
function burst(x, y, color, count, power) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(40, power);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 0.9), max: 0.9, color, size: rand(1.5, 3.5) });
  }
}

// 飄起來的字
function floatText(x, y, text, color) {
  floaters.push({ x, y, text, color, life: 0.9 });
}

function shoot() {
  const spread = tripleTimer > 0 ? [-0.18, 0, 0.18] : [0];
  spread.forEach(a => {
    bullets.push({ x: player.x, y: player.y - 18, vx: Math.sin(a) * 700, vy: -Math.cos(a) * 700 });
  });
  sfx.shoot();
}

// ============================================================
//  事件：打倒敵人、受傷、結束
// ============================================================
function killEnemy(e) {
  const base = e.type === "tank" ? 30 : e.type === "fast" ? 15 : 10;
  const gained = base * combo;
  score += gained;
  floatText(e.x, e.y, "+" + gained, e.color);
  burst(e.x, e.y, e.color, 14 + Math.round(e.r), 260);
  shake = Math.min(shake + (e.type === "tank" ? 9 : 3), 14);
  combo = Math.min(combo + 1, CONFIG.maxCombo);
  comboTimer = CONFIG.comboSeconds;
  sfx.boom();

  // 有機會掉道具
  if (Math.random() < CONFIG.powerChance) {
    powerups.push({ x: e.x, y: e.y, type: Math.random() < 0.7 ? "triple" : "heart", t: 0 });
  }
  // 升級：每 800 分一關
  const newLevel = 1 + Math.floor(score / 800);
  if (newLevel > level) {
    level = newLevel;
    floatText(W / 2, H / 2 - 40, "LEVEL " + level, "#ffe600");
    sfx.level();
  }
}

function hurtPlayer() {
  if (invincible > 0) return;
  lives--;
  invincible = 1.6;
  combo = 1;
  shake = 16;
  flash = 0.6;
  burst(player.x, player.y, "#ffffff", 30, 320);
  sfx.hurt();
  if (lives <= 0) endGame();
}

function startGame() {
  ensureAudio();
  resetGame();
  state = "play";
  overlay.classList.add("hidden");
}

function endGame() {
  state = "over";
  sfx.over();
  burst(player.x, player.y, "#00ffd5", 80, 420);
  if (score > best) {
    best = score;
    newRecord = true;
    saveValue(BEST_KEY, best);      // 把最高分存進 localStorage 的抽屜
  }
  titleEl.textContent = newRecord ? "新紀錄！" : "遊戲結束";
  msgEl.innerHTML = "你的分數：<b>" + score + "</b><br>最高分：<b>" + best + "</b>";
  startBtn.textContent = "再玩一次";
  overlay.classList.remove("hidden");
}

function togglePause() {
  if (state === "play") {
    state = "pause";
    titleEl.textContent = "暫停";
    msgEl.textContent = "按 P 或按下按鈕繼續";
    startBtn.textContent = "繼續";
    overlay.classList.remove("hidden");
  } else if (state === "pause") {
    state = "play";
    overlay.classList.add("hidden");
  }
}

// ============================================================
//  操作
// ============================================================
startBtn.addEventListener("click", () => {
  if (state === "pause") togglePause();
  else startGame();
  startBtn.blur();
});

window.addEventListener("pointermove", e => { player.targetX = e.clientX; });
window.addEventListener("pointerdown", e => { player.targetX = e.clientX; });

window.addEventListener("keydown", e => {
  keys[e.key.toLowerCase()] = true;
  const k = e.key.toLowerCase();
  if (k === "p" || k === "escape") togglePause();
  if ((k === " " || k === "enter") && (state === "menu" || state === "over")) startGame();
  if (["arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
});
window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });

// 切到別的視窗就自動暫停
document.addEventListener("visibilitychange", () => { if (document.hidden && state === "play") togglePause(); });

// ============================================================
//  每一格畫面的更新
// ============================================================
function update(dt) {
  // 星空一直都在動
  stars.forEach(s => {
    s.y += s.layer * 22 * dt;
    if (s.y > H) { s.y = -2; s.x = rand(0, W); }
  });
  // 火花、飄字
  particles.forEach(p => {
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.96; p.vy *= 0.96;
    p.life -= dt;
  });
  particles = particles.filter(p => p.life > 0);
  floaters.forEach(f => { f.y -= 40 * dt; f.life -= dt; });
  floaters = floaters.filter(f => f.life > 0);
  shake = Math.max(0, shake - 40 * dt);
  flash = Math.max(0, flash - dt);

  if (state !== "play") return;

  time += dt;
  invincible = Math.max(0, invincible - dt);
  tripleTimer = Math.max(0, tripleTimer - dt);

  // 玩家移動：鍵盤改目標，再慢慢滑過去
  if (keys["arrowleft"] || keys["a"]) player.targetX -= CONFIG.playerSpeed * dt;
  if (keys["arrowright"] || keys["d"]) player.targetX += CONFIG.playerSpeed * dt;
  player.targetX = clamp(player.targetX, 24, W - 24);
  player.x += (player.targetX - player.x) * Math.min(1, dt * 14);
  player.y = H - 90;

  // 自動射擊
  fireTimer -= dt;
  if (fireTimer <= 0) { shoot(); fireTimer = CONFIG.fireInterval; }

  // 連擊倒數
  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) combo = 1;
  }

  // 產生敵人：時間越久越密
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnEnemy();
    spawnTimer = Math.max(0.28, 1.0 - time * 0.01 - level * 0.04);
  }

  // 子彈
  bullets.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; });
  bullets = bullets.filter(b => b.y > -20 && b.x > -20 && b.x < W + 20);

  // 敵人
  enemies.forEach(e => {
    e.t += dt;
    e.y += e.speed * dt;
    if (e.type === "fast") {
      e.x = clamp(e.baseX + Math.sin(e.t * 4) * 60, 20, W - 20);
      e.trail = e.trail || [];                       // 記下最近的位置，畫出拖尾
      e.trail.push({ x: e.x, y: e.y });
      if (e.trail.length > 8) e.trail.shift();
    }
    if (e.type === "tank") e.x = clamp(e.baseX + Math.sin(e.t * 1.2) * 30, 30, W - 30);
  });

  // 子彈打到敵人
  bullets.forEach(b => {
    enemies.forEach(e => {
      if (b.dead || e.hp <= 0) return;
      const dx = b.x - e.x, dy = b.y - e.y;
      if (dx * dx + dy * dy < (e.r + 5) * (e.r + 5)) {
        b.dead = true;
        e.hp--;
        e.hit = 0.08;
        burst(b.x, b.y, e.color, 4, 140);
        if (e.hp <= 0) killEnemy(e);
      }
    });
  });
  bullets = bullets.filter(b => !b.dead);

  // 敵人撞到玩家
  enemies.forEach(e => {
    if (e.hp <= 0) return;
    const dx = player.x - e.x, dy = player.y - e.y;
    if (dx * dx + dy * dy < (e.r + player.r) * (e.r + player.r)) {
      e.hp = 0;
      burst(e.x, e.y, e.color, 20, 240);
      hurtPlayer();
    }
  });

  // 敵人衝出畫面：連擊歸零
  enemies.forEach(e => {
    if (e.hp > 0 && e.y > H + 40) { e.hp = 0; combo = 1; }
  });
  enemies = enemies.filter(e => e.hp > 0);

  // 道具
  powerups.forEach(p => {
    p.t += dt;
    p.y += 90 * dt;
    const dx = player.x - p.x, dy = player.y - p.y;
    if (dx * dx + dy * dy < 34 * 34) {
      p.dead = true;
      sfx.power();
      burst(p.x, p.y, "#ffe600", 16, 220);
      if (p.type === "triple") {
        tripleTimer = CONFIG.tripleSeconds;
        floatText(p.x, p.y, "三連發！", "#ffe600");
      } else {
        lives = Math.min(lives + 1, CONFIG.maxLives);
        floatText(p.x, p.y, "+1 命", "#ff3d81");
      }
    }
    if (p.y > H + 30) p.dead = true;
  });
  powerups = powerups.filter(p => !p.dead);

  // 引擎火花
  if (Math.random() < 0.7) {
    particles.push({ x: player.x + rand(-4, 4), y: player.y + 14, vx: rand(-20, 20), vy: rand(80, 160), life: 0.3, max: 0.3, color: "#00b7ff", size: 2 });
  }
}

// ============================================================
//  畫出來
// ============================================================
function glow(color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }

function draw() {
  // 每一格都重畫背景：深藍紫色的漸層
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowBlur = 0;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#04040f");
  bg.addColorStop(1, "#150a2e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));

  // 星空
  stars.forEach(s => {
    ctx.fillStyle = "rgba(180, 220, 255," + (0.25 + s.layer * 0.2) + ")";
    ctx.fillRect(s.x, s.y, s.size, s.size);
  });

  // 子彈
  ctx.lineWidth = 3; ctx.lineCap = "round";
  glow("#00ffd5", 12);
  ctx.strokeStyle = "#aaffee";
  bullets.forEach(b => {
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.stroke();
  });

  // 敵人
  enemies.forEach(e => {
    if (e.trail) {                                   // 快速敵人的拖尾
      ctx.save();
      e.trail.forEach((pt, i) => {
        ctx.globalAlpha = (i / e.trail.length) * 0.35;
        ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, e.r * 0.7, 0, Math.PI * 2); ctx.fill();
      });
      ctx.restore();
    }
    const c = e.hit > 0 ? "#ffffff" : e.color;
    if (e.hit > 0) e.hit -= 0.016;
    glow(e.color, 18);
    ctx.strokeStyle = c; ctx.lineWidth = 3;
    ctx.fillStyle = "rgba(10, 10, 30, 0.85)";
    ctx.beginPath();
    if (e.type === "fast") {                      // 菱形
      ctx.moveTo(e.x, e.y - e.r * 1.3); ctx.lineTo(e.x + e.r, e.y);
      ctx.lineTo(e.x, e.y + e.r * 1.3); ctx.lineTo(e.x - e.r, e.y); ctx.closePath();
    } else if (e.type === "tank") {               // 六邊形
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 3 * i + e.t * 0.6;
        ctx.lineTo(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r);
      }
      ctx.closePath();
    } else {                                      // 圓形
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    }
    ctx.fill(); ctx.stroke();
    // 中間的小圓點，坦克的血量用小點表示
    ctx.fillStyle = c;
    for (let i = 0; i < e.hp; i++) {
      ctx.beginPath();
      ctx.arc(e.x + (i - (e.hp - 1) / 2) * 9, e.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // 道具
  powerups.forEach(p => {
    const color = p.type === "triple" ? "#ffe600" : "#ff3d81";
    glow(color, 20);
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.t * 2);
    ctx.strokeRect(-11, -11, 22, 22);
    ctx.restore();
    ctx.fillStyle = color;
    ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowBlur = 0;
    ctx.fillText(p.type === "triple" ? "3" : "♥", p.x, p.y + 1);
  });

  // 玩家（無敵時會閃爍）
  if (state === "play" && (invincible <= 0 || Math.floor(invincible * 14) % 2 === 0)) {
    glow("#00ffd5", 24);
    ctx.strokeStyle = "#7dfff0"; ctx.lineWidth = 3;
    ctx.fillStyle = "rgba(0, 255, 213, 0.18)";
    ctx.beginPath();
    ctx.moveTo(player.x, player.y - 20);
    ctx.lineTo(player.x + 15, player.y + 14);
    ctx.lineTo(player.x, player.y + 7);
    ctx.lineTo(player.x - 15, player.y + 14);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    if (tripleTimer > 0) {                        // 三連發時，外面多一圈光環
      ctx.strokeStyle = "#ffe600"; glow("#ffe600", 20);
      ctx.beginPath(); ctx.arc(player.x, player.y, 26 + Math.sin(time * 10) * 2, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // 火花：用「疊加」模式，亮亮的會更亮
  ctx.globalCompositeOperation = "lighter";
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    glow(p.color, 10);
    ctx.fillRect(p.x, p.y, p.size, p.size);
  });
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  // 飄字
  ctx.shadowBlur = 0;
  ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  floaters.forEach(f => {
    ctx.globalAlpha = clamp(f.life / 0.5, 0, 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  });
  ctx.globalAlpha = 1;

  ctx.restore();

  // 受傷時整個畫面閃紅
  if (flash > 0) {
    ctx.fillStyle = "rgba(255, 40, 80," + flash * 0.5 + ")";
    ctx.fillRect(0, 0, W, H);
  }
}

// 更新上方資訊列（只有改變時才寫，省效能）
let last = {};
function updateHud() {
  const hearts = "♥".repeat(Math.max(0, lives));
  if (last.score !== score) { scoreEl.textContent = score; last.score = score; }
  if (last.combo !== combo) { comboEl.textContent = "x" + combo; last.combo = combo; }
  if (last.best !== best) { bestEl.textContent = best; last.best = best; }
  if (last.lives !== hearts) { livesEl.textContent = hearts; last.lives = hearts; }
}

// ============================================================
//  主迴圈：每一格畫面都會跑一次
// ============================================================
let prev = performance.now();
function loop(now) {
  const dt = Math.min((now - prev) / 1000, 0.033);
  prev = now;
  update(dt);
  draw();
  updateHud();
  requestAnimationFrame(loop);
}
resetGame();
state = "menu";
requestAnimationFrame(loop);
