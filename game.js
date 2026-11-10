(() => {
'use strict';
const TAU = Math.PI * 2;
const WIN_T = 600;
const MAXE = 380;
const HEART_DROP = 0.003;   // 적 하나가 회복 하트를 떨어뜨릴 확률 (0.3%)
const LURE_DROP = 0.00125;  // 적 하나가 구슬 자석을 떨어뜨릴 확률 (0.125%)
const XP_LATE_LV = 5;       // 이 레벨부터 경험치 통이 커짐
const XP_LATE_MUL = 1.5;    // 커지는 배율
const rnd = (a, b) => a + Math.random() * (b - a);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = id => document.getElementById(id);

const cvs = $('c'), ctx = cvs.getContext('2d');
let VW = 0, VH = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = cvs.clientWidth; VH = cvs.clientHeight;
  cvs.width = Math.round(VW * DPR); cvs.height = Math.round(VH * DPR);
}
addEventListener('resize', resize); resize();

/* ---------- 데이터 ---------- */
const WEAPONS = {
  ember: { name: '불씨 탄', icon: '🔥', desc: ['가장 가까운 적에게 불씨를 쏩니다.', '발사 수 +1, 피해 증가', '관통 +1, 피해 증가', '발사 수 +1, 피해 증가', '관통 +1, 피해 증가', '발사 수 +1, 연사 속도 증가'] },
  aura:  { name: '등불 결계', icon: '🏮', desc: ['주위의 적에게 계속 피해를 줍니다.', '범위와 피해 증가', '범위와 피해 증가', '범위와 피해 증가', '범위와 피해 증가', '범위와 피해 크게 증가'] },
  orbit: { name: '반딧불 무리', icon: '✨', desc: ['반딧불 두 마리가 주위를 맴돌며 적을 밀어냅니다.', '반딧불 +1, 피해 증가', '반딧불 +1, 피해 증가', '반딧불 +1, 피해 증가', '반딧불 +1, 피해 증가', '반딧불 +1, 회전 속도 증가'] },
  bolt:  { name: '늪 번개', icon: '⚡', desc: ['화면 안의 무작위 적에게 번개를 내리칩니다.', '번개 +1, 피해 증가', '피해 증가, 대기시간 감소', '번개 +1, 피해 증가', '번개 +1, 피해 증가', '번개 +1, 피해 증가'] },
  shard: { name: '서리 파편', icon: '❄️', desc: ['바라보는 방향으로 얼음 파편 세 갈래를 흩뿌립니다.', '파편 +1, 피해 증가', '파편 +1, 관통 +1', '파편 +1, 피해 증가', '파편 +1, 피해 증가', '파편 +1, 관통 +1'] },
};
const PASSIVES = {
  might:  { name: '굵은 심지', icon: '🕯️', desc: '모든 피해량 +12%' },
  haste:  { name: '가벼운 장화', icon: '👢', desc: '이동 속도 +10%' },
  heart:  { name: '두꺼운 망토', icon: '🧥', desc: '최대 체력 +20, 바로 20 회복' },
  magnet: { name: '끌림 나침반', icon: '🧭', desc: '구슬을 끌어오는 범위 +35%' },
  swift:  { name: '모래시계', icon: '⏳', desc: '공격 대기시간 -8%' },
  regen:  { name: '약초 주머니', icon: '🌿', desc: '1초마다 체력 0.5 회복' },
  area:   { name: '넓은 갓', icon: '🎩', desc: '공격 범위 +12%' },
};
const MAXW = 6, MAXP = 5;
const DIFF = {
  easy:   { label: '쉬움', ehp: 0.7, edmg: 0.5, spawn: 0.75, hp: 150 },
  normal: { label: '보통', ehp: 1,   edmg: 1,   spawn: 1,    hp: 100 },
};
const ETYPES = {
  moth:  { hp: 7,   speed: 92, r: 9,  dmg: 6,  xp: 1 },
  wisp:  { hp: 20,  speed: 62, r: 12, dmg: 9,  xp: 2 },
  golem: { hp: 75,  speed: 40, r: 17, dmg: 16, xp: 6 },
  lord:  { hp: 700, speed: 58, r: 30, dmg: 28, xp: 40, elite: true },
};

/* ---------- 상태 ---------- */
let S;
function makeState(diff = 'normal') {
  const D = DIFF[diff];
  return {
    diff, D, mode: 'start', t: 0, kills: 0, shake: 0, hurtT: 0, spawnAcc: 0,
    nextSwarm: 50, nextElite: 120, pending: 0,
    p: { x: 0, y: 0, r: 12, baseSpeed: 155, speedMul: 1, hp: D.hp, maxHp: D.hp, magnet: 70,
         level: 1, xp: 0, xpNext: 6, dmgMul: 1, cdMul: 1, areaMul: 1, regen: 0,
         inv: 0, fx: 1, fy: 0, walk: 0, moving: false },
    w: { ember: 1 }, pas: {},
    ws: { ember: { cd: 0.3 }, aura: { tick: 0 }, orbit: { ang: 0 }, bolt: { cd: 1 }, shard: { cd: 0.5 } },
    enemies: [], proj: [], gems: [], items: [], nums: [], parts: [], fx: [], opts: [],
  };
}
S = makeState();

/* ---------- 기록 ---------- */
const BEST_KEY = 'lanternkeeper-best';
function loadBest(diff) { try { const v = localStorage.getItem(BEST_KEY + '-' + diff); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function saveBest(diff, rec) { try { localStorage.setItem(BEST_KEY + '-' + diff, JSON.stringify(rec)); } catch (e) {} }
function fmt(t) { t = Math.floor(t); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
function bestText(diff) {
  const b = loadBest(diff);
  return b ? `${DIFF[diff].label} 최고 기록: ${fmt(b.time)} 버팀, 처치 ${b.kills}` : '';
}
function bestAll() { return ['easy', 'normal'].map(bestText).filter(Boolean).join(' / '); }
$('bestLine').textContent = bestAll();

/* ---------- 입력 ---------- */
const keys = {};
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if (S.mode === 'levelup') {
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
    if (n !== undefined && S.opts[n]) choose(S.opts[n]);
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (S.mode === 'play') togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && S.mode === 'play') togglePause(); });

const joy = { active: false, id: null, sx: 0, sy: 0, x: 0, y: 0 };
cvs.addEventListener('pointerdown', e => {
  if (S.mode !== 'play' || joy.active) return;
  joy.active = true; joy.id = e.pointerId; joy.sx = joy.x = e.clientX; joy.sy = joy.y = e.clientY;
  cvs.setPointerCapture(e.pointerId);
});
cvs.addEventListener('pointermove', e => { if (joy.active && e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; } });
const endJoy = e => { if (e.pointerId === joy.id) { joy.active = false; joy.id = null; } };
cvs.addEventListener('pointerup', endJoy);
cvs.addEventListener('pointercancel', endJoy);

/* ---------- 공간 격자 ---------- */
const CELL = 64;
const grid = new Map();
const tmp = [], tmp2 = [];
const gk = (cx, cy) => (cx + 50000) * 100000 + (cy + 50000);
function buildGrid() {
  grid.clear();
  for (const e of S.enemies) {
    if (e.dead) continue;
    const k = gk(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
    let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(e);
  }
}
function query(x, y, r, out) {
  out.length = 0;
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    const a = grid.get(gk(cx, cy)); if (a) for (const e of a) out.push(e);
  }
  return out;
}

/* ---------- 적 ---------- */
function spawn(type, x, y) {
  const d = ETYPES[type];
  const m = 1 + S.t / 60 * 0.3;
  const hp = d.hp * m * S.D.ehp;
  S.enemies.push({ type, x, y, r: d.r, hp, maxHp: hp, speed: d.speed * rnd(0.9, 1.1),
    dmg: d.dmg * (1 + S.t / WIN_T * 0.6) * S.D.edmg, xp: d.xp, flash: 0, kx: 0, ky: 0,
    ph: Math.random() * TAU, elite: !!d.elite, dead: false, oh: -9 });
}
function pickType() {
  const t = S.t, r = Math.random();
  const g = t > 150 ? Math.min(0.25, 0.08 + (t - 150) / 1200) : 0;
  const w = t > 45 ? Math.min(0.5, 0.15 + (t - 45) / 400) : 0;
  if (r < g) return 'golem';
  if (r < g + w) return 'wisp';
  return 'moth';
}
function ringPos(extra = 40) {
  const a = rnd(0, TAU), R = Math.hypot(VW, VH) / 2 + extra;
  return [S.p.x + Math.cos(a) * R, S.p.y + Math.sin(a) * R];
}

function damage(e, amt, kx, ky) {
  if (e.dead) return;
  amt *= S.p.dmgMul;
  e.hp -= amt; e.flash = 0.1;
  if (!e.elite) { e.kx += kx; e.ky += ky; } else { e.kx += kx * 0.15; e.ky += ky * 0.15; }
  if (S.nums.length < 90) S.nums.push({ x: e.x + rnd(-4, 4), y: e.y - e.r, t: 0.6, v: Math.max(1, Math.round(amt)) });
  if (e.hp <= 0) kill(e);
}
function kill(e) {
  e.dead = true; S.kills++;
  if (S.gems.length < 350) S.gems.push({ x: e.x, y: e.y, v: e.xp, pull: false, sp: 0 });
  else { const g = S.gems[(Math.random() * S.gems.length) | 0]; g.v += e.xp; }
  const col = { moth: '#b9a6e0', wisp: '#6f9e7c', golem: '#8a9096', lord: '#c9506a' }[e.type];
  const n = e.elite ? 24 : 4;
  if (S.parts.length < 400) for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU), s = rnd(40, 140);
    S.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: rnd(0.3, 0.6), c: col });
  }
  if (e.elite) {
    S.items.push({ k: 'chest', x: e.x, y: e.y });
    S.items.push({ k: 'heart', x: e.x + 26, y: e.y });
  } else if (Math.random() < HEART_DROP) S.items.push({ k: 'heart', x: e.x, y: e.y });
  else if (Math.random() < LURE_DROP) S.items.push({ k: 'lure', x: e.x, y: e.y });
}
function nearest(n, range) {
  const p = S.p, arr = [];
  for (const e of S.enemies) {
    if (e.dead) continue;
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d < range * range) arr.push([d, e]);
  }
  arr.sort((a, b) => a[0] - b[0]);
  return arr.slice(0, n).map(a => a[1]);
}

/* ---------- 무기 ---------- */
function updWeapons(dt) {
  const p = S.p, A = p.areaMul;
  for (const id in S.w) {
    const L = S.w[id], s = S.ws[id];
    if (id === 'ember') {
      s.cd -= dt;
      if (s.cd <= 0) {
        s.cd = Math.max(0.25, (1.1 - 0.06 * L - (L >= 6 ? 0.15 : 0)) * p.cdMul);
        const n = 1 + Math.floor(L / 2) + (L >= 6 ? 0 : 0);
        const ts = nearest(n, 650);
        for (let i = 0; i < n; i++) {
          let ang;
          if (ts.length) {
            const tg = ts[i % ts.length];
            ang = Math.atan2(tg.y - p.y, tg.x - p.x);
            if (i >= ts.length) ang += (i - ts.length + 1) * 0.18 * (i % 2 ? 1 : -1);
          } else ang = Math.atan2(p.fy, p.fx) + (i - (n - 1) / 2) * 0.2;
          S.proj.push({ k: 'ember', x: p.x, y: p.y, vx: Math.cos(ang) * 420, vy: Math.sin(ang) * 420,
            r: 6 * A, dmg: 10 + 4 * L, pierce: 1 + (L >= 3) + (L >= 5), life: 1.5, hits: new Set() });
        }
      }
    } else if (id === 'shard') {
      s.cd -= dt;
      if (s.cd <= 0) {
        s.cd = Math.max(0.4, (1.5 - 0.06 * L) * p.cdMul);
        const n = 2 + L, base = Math.atan2(p.fy, p.fx), spread = 0.5;
        for (let i = 0; i < n; i++) {
          const a = base + (i / (n - 1) - 0.5) * spread * 2;
          S.proj.push({ k: 'shard', x: p.x, y: p.y, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320,
            r: 5 * A, dmg: 7 + 3 * L, pierce: 2 + Math.floor(L / 3), life: 0.8, hits: new Set() });
        }
      }
    } else if (id === 'aura') {
      s.tick -= dt;
      if (s.tick <= 0) {
        s.tick = 0.4;
        const R = (50 + 10 * L + (L >= 6 ? 15 : 0)) * A;
        query(p.x, p.y, R + 30, tmp);
        for (const e of tmp) {
          const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
          if (d < R + e.r) damage(e, 3 + 2 * L + (L >= 6 ? 4 : 0), (e.x - p.x) / d * 25, (e.y - p.y) / d * 25);
        }
      }
    } else if (id === 'orbit') {
      s.ang += dt * (2.6 + 0.15 * L + (L >= 6 ? 1 : 0));
      const n = Math.min(L + 1, 7), R = 78 * A, hr = 10 * A;
      for (let i = 0; i < n; i++) {
        const a = s.ang + i * TAU / n, ox = p.x + Math.cos(a) * R, oy = p.y + Math.sin(a) * R;
        query(ox, oy, hr + 30, tmp);
        for (const e of tmp) {
          if (e.dead) continue;
          if (Math.hypot(e.x - ox, e.y - oy) < hr + e.r && S.t - e.oh > 0.45) {
            e.oh = S.t;
            damage(e, 6 + 4 * L, Math.cos(a) * 160, Math.sin(a) * 160);
          }
        }
      }
    } else if (id === 'bolt') {
      s.cd -= dt;
      if (s.cd <= 0) {
        s.cd = Math.max(0.6, (2.4 - 0.15 * L) * p.cdMul);
        const n = [1, 2, 2, 3, 4, 5][L - 1];
        const cand = S.enemies.filter(e => !e.dead && Math.abs(e.x - p.x) < VW / 2 + 20 && Math.abs(e.y - p.y) < VH / 2 + 20);
        let hit = 0;
        for (let i = 0; i < n && cand.length; i++) {
          const e = cand.splice((Math.random() * cand.length) | 0, 1)[0];
          const R = 40 * A;
          const pts = []; let x = e.x + rnd(-30, 30);
          for (let k = 0; k <= 7; k++) { pts.push([x, e.y - 320 + k * 320 / 7]); x += rnd(-16, 16); }
          pts[pts.length - 1] = [e.x, e.y];
          S.fx.push({ k: 'bolt', x: e.x, y: e.y, t: 0.3, pts, R });
          query(e.x, e.y, R + 30, tmp);
          for (const o of tmp) if (Math.hypot(o.x - e.x, o.y - e.y) < R + o.r) damage(o, 18 + 9 * L, 0, 0);
          hit++;
        }
        if (hit) S.shake = Math.max(S.shake, 3);
      }
    }
  }
}

/* ---------- 성장 ---------- */
function gainXp(v) {
  const p = S.p; p.xp += v;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext; p.level++;
    const l = p.level - 1;
    p.xpNext = Math.round((6 + l * 5 + Math.pow(l, 1.5)) * (p.level >= XP_LATE_LV ? XP_LATE_MUL : 1));
    S.pending++;
  }
}
function applyPassive(id) {
  const p = S.p;
  if (id === 'might') p.dmgMul += 0.12;
  else if (id === 'haste') p.speedMul += 0.1;
  else if (id === 'heart') { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); }
  else if (id === 'magnet') p.magnet *= 1.35;
  else if (id === 'swift') p.cdMul *= 0.92;
  else if (id === 'regen') p.regen += 0.5;
  else if (id === 'area') p.areaMul += 0.12;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
function openLevelUp() {
  S.mode = 'levelup';
  const pool = [];
  for (const id in WEAPONS) { const L = S.w[id] || 0; if (L < MAXW) pool.push({ kind: 'w', id, L }); }
  for (const id in PASSIVES) { const L = S.pas[id] || 0; if (L < MAXP) pool.push({ kind: 'p', id, L }); }
  let opts = shuffle(pool).slice(0, 3);
  if (!opts.length) opts = [{ kind: 'heal' }];
  S.opts = opts;
  $('luTitle').textContent = `레벨 ${S.p.level - S.pending + 1}`;
  const box = $('choices'); box.innerHTML = '';
  opts.forEach((o, i) => {
    const b = document.createElement('button'); b.className = 'choice';
    let icon, name, tag, desc;
    if (o.kind === 'w') { const d = WEAPONS[o.id]; icon = d.icon; name = d.name; desc = d.desc[o.L]; tag = o.L ? `Lv ${o.L} → ${o.L + 1}` : '새 무기'; }
    else if (o.kind === 'p') { const d = PASSIVES[o.id]; icon = d.icon; name = d.name; desc = d.desc; tag = o.L ? `Lv ${o.L} → ${o.L + 1}` : '새 장비'; }
    else { icon = '🍵'; name = '따뜻한 차'; desc = '체력을 40 회복합니다.'; tag = '회복'; }
    b.innerHTML = `<span class="ic" aria-hidden="true">${icon}</span><span><span class="nm">${name}<span class="tag">${tag}</span></span><span class="ds">${desc}</span></span>`;
    b.setAttribute('aria-label', `${i + 1}번: ${name}, ${tag}. ${desc}`);
    b.addEventListener('click', () => choose(o));
    box.appendChild(b);
  });
  show('levelup');
  setTimeout(() => { const f = box.querySelector('button'); if (f) f.focus({ preventScroll: true }); }, 30);
}
function choose(o) {
  if (S.mode !== 'levelup') return;
  if (o.kind === 'w') S.w[o.id] = (S.w[o.id] || 0) + 1;
  else if (o.kind === 'p') { S.pas[o.id] = (S.pas[o.id] || 0) + 1; applyPassive(o.id); }
  else S.p.hp = Math.min(S.p.maxHp, S.p.hp + 40);
  S.pending--;
  renderInv();
  hide('levelup');
  if (S.pending > 0) openLevelUp(); else S.mode = 'play';
}

/* ---------- 업데이트 ---------- */
function update(dt) {
  const p = S.p;
  S.t += dt;
  if (S.t >= WIN_T) { endGame(true); return; }

  let mx = 0, my = 0;
  if (keys.KeyW || keys.ArrowUp) my -= 1;
  if (keys.KeyS || keys.ArrowDown) my += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (joy.active) {
    const dx = joy.x - joy.sx, dy = joy.y - joy.sy, d = Math.hypot(dx, dy);
    if (d > 6) { const k = Math.min(d, 50) / 50; mx += dx / d * k; my += dy / d * k; }
  }
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  p.moving = ml > 0.05;
  if (p.moving) { p.fx = mx / Math.min(ml, 1) / (ml > 1 ? 1 : 1); const n = Math.hypot(mx, my); p.fx = mx / n; p.fy = my / n; p.walk += dt; }
  const spd = p.baseSpeed * p.speedMul;
  p.x += mx * spd * dt; p.y += my * spd * dt;
  p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
  p.inv -= dt;
  S.shake = Math.max(0, S.shake - dt * 30);
  S.hurtT -= dt;

  // 등장
  S.spawnAcc += dt * (1.0 + S.t * 0.045) * S.D.spawn;
  while (S.spawnAcc >= 1) {
    S.spawnAcc -= 1;
    if (S.enemies.length < MAXE) { const [x, y] = ringPos(); spawn(pickType(), x, y); }
  }
  if (S.t >= S.nextSwarm) {
    S.nextSwarm += 55;
    const n = Math.min(40, 16 + ((S.t / 12) | 0)), R = Math.hypot(VW, VH) / 2 + 20;
    for (let i = 0; i < n; i++) spawn('moth', p.x + Math.cos(i / n * TAU) * R, p.y + Math.sin(i / n * TAU) * R);
    banner('나방 떼가 몰려옵니다');
  }
  if (S.t >= S.nextElite) {
    S.nextElite += 120;
    const [x, y] = ringPos(60); spawn('lord', x, y);
    banner('늪의 군주가 나타났습니다');
  }

  // 적 이동
  const far = Math.hypot(VW, VH) * 0.75 + 200;
  const dec = Math.max(0, 1 - dt * 9);
  for (const e of S.enemies) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d > far && !e.elite) { const [x, y] = ringPos(); e.x = x; e.y = y; continue; }
    e.x += (dx / d * e.speed + e.kx) * dt;
    e.y += (dy / d * e.speed + e.ky) * dt;
    e.kx *= dec; e.ky *= dec;
    if (e.flash > 0) e.flash -= dt;
  }
  buildGrid();
  for (const e of S.enemies) {
    query(e.x, e.y, e.r + 22, tmp2);
    for (const o of tmp2) {
      if (o === e) continue;
      const dx = e.x - o.x, dy = e.y - o.y, d2 = dx * dx + dy * dy, rr = e.r + o.r;
      if (d2 < rr * rr && d2 > 0.01) {
        const d = Math.sqrt(d2), push = (rr - d) * (o.elite && !e.elite ? 0.5 : 0.25);
        e.x += dx / d * push; e.y += dy / d * push;
      }
    }
  }

  updWeapons(dt);

  // 투사체
  for (const b of S.proj) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    query(b.x, b.y, b.r + 34, tmp);
    const sp = Math.hypot(b.vx, b.vy) || 1;
    for (const e of tmp) {
      if (e.dead || b.hits.has(e)) continue;
      if (Math.hypot(e.x - b.x, e.y - b.y) < b.r + e.r) {
        b.hits.add(e);
        damage(e, b.dmg, b.vx / sp * 70, b.vy / sp * 70);
        if (--b.pierce <= 0) { b.dead = true; break; }
      }
    }
  }
  S.proj = S.proj.filter(b => !b.dead);

  // 닿으면 피해
  if (p.inv <= 0) {
    query(p.x, p.y, p.r + 40, tmp);
    let worst = 0;
    for (const e of tmp) if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < p.r + e.r * 0.85) worst = Math.max(worst, e.dmg);
    if (worst) {
      p.hp -= worst; p.inv = 0.45; S.shake = 6; S.hurtT = 0.2;
      if (p.hp <= 0) { p.hp = 0; endGame(false); return; }
    }
  }
  S.enemies = S.enemies.filter(e => !e.dead);

  // 구슬
  for (const g of S.gems) {
    const dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy) || 0.001;
    if (!g.pull && d < p.magnet) { g.pull = true; g.sp = -60; }
    if (g.pull) {
      g.sp += dt * 1100;
      const mv = Math.min(d, Math.max(g.sp, -60) * dt);
      g.x += dx / d * mv; g.y += dy / d * mv;
      if (d < p.r + 8) { g.dead = true; gainXp(g.v); }
    }
  }
  S.gems = S.gems.filter(g => !g.dead);

  // 아이템
  for (const it of S.items) {
    if (Math.hypot(it.x - p.x, it.y - p.y) < p.r + 16) {
      it.dead = true;
      if (it.k === 'heart') { p.hp = Math.min(p.maxHp, p.hp + 30); popText(p.x, p.y - 26, '+30'); }
      else if (it.k === 'lure') { for (const g of S.gems) { g.pull = true; g.sp = 200; } banner('모든 구슬이 끌려옵니다'); }
      else if (it.k === 'chest') { S.pending++; }
    }
  }
  S.items = S.items.filter(i => !i.dead);

  for (const q of S.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92; q.t -= dt; }
  S.parts = S.parts.filter(q => q.t > 0);
  for (const n of S.nums) { n.y -= 34 * dt; n.t -= dt; }
  S.nums = S.nums.filter(n => n.t > 0);
  for (const f of S.fx) f.t -= dt;
  S.fx = S.fx.filter(f => f.t > 0);

  if (S.pending > 0 && S.mode === 'play') openLevelUp();
}
function popText(x, y, txt) { S.nums.push({ x, y, t: 0.9, v: txt, heal: true }); }

/* ---------- 그리기 ---------- */
function hash(x, y) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function ell(x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); ctx.fill(); }
function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); ctx.fill(); }
function rrect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
}

function drawGround(cx, cy) {
  ctx.fillStyle = '#16292b'; ctx.fillRect(0, 0, VW, VH);
  const T2 = 300;
  ctx.fillStyle = 'rgba(32,58,50,.55)';
  for (let tx = Math.floor(cx / T2) - 1; tx <= Math.floor((cx + VW) / T2) + 1; tx++)
    for (let ty = Math.floor(cy / T2) - 1; ty <= Math.floor((cy + VH) / T2) + 1; ty++) {
      const h = hash(tx * 3.1, ty * 7.7);
      if (h < 0.45) ell(tx * T2 + hash(tx, ty + 3) * T2 - cx, ty * T2 + hash(tx + 5, ty) * T2 - cy, 90 + h * 120, 50 + h * 70, h * 3);
    }
  const T = 96;
  for (let tx = Math.floor(cx / T) - 1; tx <= Math.floor((cx + VW) / T) + 1; tx++)
    for (let ty = Math.floor(cy / T) - 1; ty <= Math.floor((cy + VH) / T) + 1; ty++) {
      const h = hash(tx, ty);
      if (h > 0.4) continue;
      const X = tx * T + hash(tx + 7, ty) * T * 0.8 - cx, Y = ty * T + hash(tx, ty + 9) * T * 0.8 - cy;
      if (h < 0.22) {
        ctx.strokeStyle = '#2f5040'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath();
        ctx.moveTo(X, Y); ctx.lineTo(X - 4, Y - 9); ctx.moveTo(X + 3, Y); ctx.lineTo(X + 4, Y - 11); ctx.moveTo(X + 6, Y); ctx.lineTo(X + 10, Y - 7); ctx.stroke();
      } else if (h < 0.28) {
        ctx.fillStyle = '#25363b'; ell(X, Y, 9, 6); ctx.fillStyle = '#34494e'; ell(X - 2, Y - 2, 5, 3);
      } else if (h < 0.33) {
        ctx.fillStyle = '#132833'; ell(X, Y, 26, 11); ctx.fillStyle = 'rgba(159,227,208,.07)'; ell(X - 5, Y - 2, 14, 4);
      } else if (h < 0.37) {
        ctx.fillStyle = '#8a7bb0'; circ(X, Y, 2); circ(X + 6, Y + 3, 1.6); circ(X - 4, Y + 4, 1.6);
      } else {
        ctx.strokeStyle = '#3c5a3f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + 1, Y - 22); ctx.stroke();
        ctx.fillStyle = '#6b5236'; rrect(X - 2, Y - 26, 6, 11, 3);
      }
    }
}

function drawPlayer() {
  const p = S.p, bob = p.moving ? Math.sin(p.walk * 12) * 1.5 : 0, face = p.fx < 0 ? -1 : 1;
  const lx = p.x + face * 14, ly = p.y + 1 + bob;
  const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 70);
  g.addColorStop(0, 'rgba(242,181,68,.38)'); g.addColorStop(1, 'rgba(242,181,68,0)');
  ctx.fillStyle = g; circ(lx, ly, 70);
  ctx.fillStyle = 'rgba(0,0,0,.32)'; ell(p.x, p.y + 13, 11, 4);
  ctx.save();
  if (p.inv > 0 && Math.floor(S.t * 20) % 2) ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#5b3f63'; ctx.beginPath();
  ctx.moveTo(p.x, p.y - 17 + bob);
  ctx.quadraticCurveTo(p.x + 14, p.y - 6 + bob, p.x + 11, p.y + 12);
  ctx.lineTo(p.x - 11, p.y + 12);
  ctx.quadraticCurveTo(p.x - 14, p.y - 6 + bob, p.x, p.y - 17 + bob);
  ctx.fill();
  ctx.fillStyle = '#463050'; ell(p.x - face * 4, p.y + 6, 4, 6);
  ctx.fillStyle = '#f3ead6'; ell(p.x + face * 2.5, p.y - 5 + bob, 5, 5.5);
  ctx.fillStyle = '#1d2a2f'; circ(p.x + face * 1 , p.y - 5.5 + bob, 1.1); circ(p.x + face * 4.5, p.y - 5.5 + bob, 1.1);
  ctx.strokeStyle = '#2b2026'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x + face * 8, p.y + 2); ctx.lineTo(lx, ly - 7); ctx.stroke();
  ctx.fillStyle = '#3a2a22'; ctx.fillRect(lx - 4.5, ly - 7, 9, 2);
  ctx.fillStyle = '#f2b544'; rrect(lx - 4, ly - 5, 8, 10, 2);
  ctx.fillStyle = '#fff1c9'; circ(lx, ly, 2);
  ctx.restore();
  const w = 30;
  ctx.fillStyle = 'rgba(6,12,18,.7)'; ctx.fillRect(p.x - w / 2, p.y + 19, w, 4);
  ctx.fillStyle = '#d0485e'; ctx.fillRect(p.x - w / 2, p.y + 19, w * Math.max(0, p.hp / p.maxHp), 4);
}

function drawEnemy(e) {
  const fl = e.flash > 0, dir = S.p.x < e.x ? -1 : 1, r = e.r;
  if (e.type === 'moth') {
    const f = Math.abs(Math.sin(S.t * 20 + e.ph)), wy = e.y + Math.sin(S.t * 6 + e.ph) * 2, ww = r * (0.45 + 0.55 * f);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ell(e.x, e.y + 13, 6, 2);
    ctx.fillStyle = fl ? '#fff' : '#b9a6e0'; ell(e.x - ww * 0.8, wy - 1, ww, r * 0.75, -0.5); ell(e.x + ww * 0.8, wy - 1, ww, r * 0.75, 0.5);
    ctx.fillStyle = fl ? '#fff' : '#8b77b8'; ell(e.x - ww * 0.6, wy + 4, ww * 0.6, r * 0.45, 0.6); ell(e.x + ww * 0.6, wy + 4, ww * 0.6, r * 0.45, -0.6);
    ctx.fillStyle = '#2e2440'; ell(e.x, wy, 3, r * 0.7);
    ctx.fillStyle = '#f2b544'; circ(e.x - 1.5, wy - 4, 1.2); circ(e.x + 1.5, wy - 4, 1.2);
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ell(e.x, e.y + r * 0.95, r * 0.9, r * 0.28);
  if (e.type === 'golem') {
    const st = Math.sin(S.t * 5 + e.ph) * 1.2;
    ctx.fillStyle = fl ? '#fff' : '#767d84'; rrect(e.x - r, e.y - r + st, r * 2, r * 1.9, r * 0.5);
    ctx.fillStyle = fl ? '#fff' : '#5a6067'; rrect(e.x - r, e.y + r * 0.25 + st, r * 2, r * 0.65, r * 0.3);
    ctx.fillStyle = '#4f7a5a'; ell(e.x - r * 0.25, e.y - r * 0.82 + st, r * 0.65, r * 0.25);
    ctx.fillStyle = '#f2b544';
    ctx.fillRect(e.x - r * 0.5 + dir * 2, e.y - r * 0.25 + st, r * 0.32, r * 0.17);
    ctx.fillRect(e.x + r * 0.18 + dir * 2, e.y - r * 0.25 + st, r * 0.32, r * 0.17);
    ctx.strokeStyle = '#4a4f55'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(e.x + r * 0.5, e.y - r * 0.7 + st); ctx.lineTo(e.x + r * 0.3, e.y - r * 0.45 + st); ctx.lineTo(e.x + r * 0.55, e.y - r * 0.35 + st); ctx.stroke();
    return;
  }
  const lord = e.type === 'lord';
  const by = e.y + Math.sin(S.t * 4 + e.ph) * 1.5;
  if (lord) {
    ctx.fillStyle = '#f3ead6'; ctx.beginPath();
    ctx.moveTo(e.x - r * 0.75, by - r * 0.6); ctx.lineTo(e.x - r * 1.05, by - r * 1.45); ctx.lineTo(e.x - r * 0.35, by - r * 0.95);
    ctx.moveTo(e.x + r * 0.75, by - r * 0.6); ctx.lineTo(e.x + r * 1.05, by - r * 1.45); ctx.lineTo(e.x + r * 0.35, by - r * 0.95);
    ctx.fill();
    const g = ctx.createRadialGradient(e.x, by, r * 0.5, e.x, by, r * 2);
    g.addColorStop(0, 'rgba(208,72,94,.25)'); g.addColorStop(1, 'rgba(208,72,94,0)');
    ctx.fillStyle = g; circ(e.x, by, r * 2);
  }
  ctx.fillStyle = fl ? '#fff' : (lord ? '#c9506a' : '#6f9e7c');
  ctx.beginPath(); ctx.arc(e.x, by - r * 0.15, r, Math.PI, 0); ctx.lineTo(e.x + r, by + r * 0.7);
  const waves = 4;
  for (let k = 0; k < waves; k++) {
    const x0 = e.x + r - (k + 0.5) * (2 * r / waves), x1 = e.x + r - (k + 1) * (2 * r / waves);
    const wob = Math.sin(S.t * 8 + e.ph + k) * r * 0.15;
    ctx.quadraticCurveTo(x0, by + r * 1.05 + wob, x1, by + r * 0.7);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = fl ? '#fff' : (lord ? '#a43a55' : '#5a8a68'); ell(e.x - r * 0.35, by - r * 0.7, r * 0.35, r * 0.14, -0.3);
  ctx.fillStyle = '#f3ead6';
  ell(e.x - r * 0.32 + dir * r * 0.12, by - r * 0.2, r * 0.2, r * 0.26);
  ell(e.x + r * 0.32 + dir * r * 0.12, by - r * 0.2, r * 0.2, r * 0.26);
  ctx.fillStyle = lord ? '#f2b544' : '#1d2a2f';
  circ(e.x - r * 0.32 + dir * r * 0.2, by - r * 0.17, r * 0.1);
  circ(e.x + r * 0.32 + dir * r * 0.2, by - r * 0.17, r * 0.1);
  if (lord) {
    const w = 56;
    ctx.fillStyle = 'rgba(6,12,18,.75)'; ctx.fillRect(e.x - w / 2, by - r * 1.7, w, 5);
    ctx.fillStyle = '#d0485e'; ctx.fillRect(e.x - w / 2, by - r * 1.7, w * Math.max(0, e.hp / e.maxHp), 5);
  }
}

function render() {
  const p = S.p;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  let sx = 0, sy = 0;
  if (S.shake > 0 && !reduceMotion) { sx = rnd(-1, 1) * S.shake; sy = rnd(-1, 1) * S.shake; }
  const cx = p.x - VW / 2 + sx, cy = p.y - VH / 2 + sy;
  drawGround(cx, cy);
  ctx.save(); ctx.translate(-cx, -cy);

  const vx0 = cx - 60, vx1 = cx + VW + 60, vy0 = cy - 60, vy1 = cy + VH + 60;
  const vis = o => o.x > vx0 && o.x < vx1 && o.y > vy0 && o.y < vy1;

  if (S.w.aura) {
    const L = S.w.aura, R = (50 + 10 * L + (L >= 6 ? 15 : 0)) * p.areaMul;
    const g = ctx.createRadialGradient(p.x, p.y, R * 0.2, p.x, p.y, R);
    g.addColorStop(0, 'rgba(242,181,68,0)'); g.addColorStop(1, 'rgba(242,181,68,.16)');
    ctx.fillStyle = g; circ(p.x, p.y, R);
    ctx.strokeStyle = 'rgba(242,181,68,.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -S.t * 20; ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }

  for (const g of S.gems) {
    if (!vis(g)) continue;
    const s = g.v < 3 ? 5 : g.v < 10 ? 6.5 : 8.5;
    ctx.fillStyle = g.v < 3 ? '#9fe3d0' : g.v < 10 ? '#f2b544' : '#e86a8a';
    ctx.beginPath(); ctx.moveTo(g.x, g.y - s); ctx.lineTo(g.x + s * 0.7, g.y); ctx.lineTo(g.x, g.y + s); ctx.lineTo(g.x - s * 0.7, g.y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; circ(g.x - s * 0.15, g.y - s * 0.35, s * 0.2);
  }
  for (const it of S.items) {
    const b = Math.sin(S.t * 4) * 2;
    if (it.k === 'heart') {
      ctx.fillStyle = '#d0485e'; ctx.beginPath();
      const x = it.x, y = it.y + b;
      ctx.moveTo(x, y + 7); ctx.bezierCurveTo(x - 12, y - 1, x - 6, y - 11, x, y - 4); ctx.bezierCurveTo(x + 6, y - 11, x + 12, y - 1, x, y + 7); ctx.fill();
    } else if (it.k === 'lure') {
      ctx.strokeStyle = 'rgba(159,227,208,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(it.x, it.y + b, 10 + Math.sin(S.t * 6) * 3, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#9fe3d0'; circ(it.x, it.y + b, 6);
    } else if (it.k === 'chest') {
      const g = ctx.createRadialGradient(it.x, it.y, 2, it.x, it.y, 30);
      g.addColorStop(0, 'rgba(242,181,68,.5)'); g.addColorStop(1, 'rgba(242,181,68,0)'); ctx.fillStyle = g; circ(it.x, it.y, 30);
      ctx.fillStyle = '#6b4a2b'; rrect(it.x - 11, it.y - 8 + b, 22, 16, 3);
      ctx.fillStyle = '#f2b544'; ctx.fillRect(it.x - 11, it.y - 2 + b, 22, 3); ctx.fillRect(it.x - 2, it.y - 4 + b, 4, 6);
    }
  }

  const list = S.enemies.filter(vis).sort((a, b) => a.y - b.y);
  for (const e of list) drawEnemy(e);

  for (const b of S.proj) {
    if (!vis(b)) continue;
    if (b.k === 'ember') {
      ctx.fillStyle = 'rgba(242,181,68,.3)'; circ(b.x, b.y, b.r * 2);
      ctx.fillStyle = '#ffcf6e'; circ(b.x, b.y, b.r);
      ctx.fillStyle = '#fff3d6'; circ(b.x, b.y, b.r * 0.45);
    } else {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
      ctx.fillStyle = '#d5ecf8'; ctx.strokeStyle = '#7fb7d6'; ctx.lineWidth = 1;
      const L = b.r * 2.6, W = b.r * 0.9;
      ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(0, W); ctx.lineTo(-L * 0.6, 0); ctx.lineTo(0, -W); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  if (S.w.orbit) {
    const L = S.w.orbit, n = Math.min(L + 1, 7), R = 78 * p.areaMul, s = S.ws.orbit;
    for (let i = 0; i < n; i++) {
      const a = s.ang + i * TAU / n, ox = p.x + Math.cos(a) * R, oy = p.y + Math.sin(a) * R;
      const pulse = 0.8 + 0.2 * Math.sin(S.t * 10 + i);
      ctx.fillStyle = 'rgba(232,245,154,.22)'; circ(ox, oy, 16 * p.areaMul * pulse);
      ctx.fillStyle = '#e8f59a'; circ(ox, oy, 6 * p.areaMul);
      ctx.fillStyle = '#ffffff'; circ(ox, oy, 2.5 * p.areaMul);
    }
  }

  drawPlayer();

  for (const f of S.fx) {
    const a = Math.max(0, f.t / 0.3);
    ctx.strokeStyle = `rgba(233,226,255,${a})`; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.beginPath(); f.pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke();
    ctx.strokeStyle = `rgba(185,166,224,${a * 0.5})`; ctx.lineWidth = 8; ctx.stroke();
    ctx.fillStyle = `rgba(233,226,255,${a * 0.35})`; circ(f.x, f.y, f.R * (1.2 - a * 0.4));
  }
  for (const q of S.parts) { ctx.globalAlpha = Math.min(1, q.t * 2.5); ctx.fillStyle = q.c; ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3); }
  ctx.globalAlpha = 1;

  ctx.font = '15px Jua, "Apple SD Gothic Neo", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(6,12,18,.8)';
  for (const n of S.nums) {
    ctx.globalAlpha = Math.min(1, n.t * 3);
    ctx.strokeText(n.v, n.x, n.y); ctx.fillStyle = n.heal ? '#9fe3d0' : '#f3ead6'; ctx.fillText(n.v, n.x, n.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  const vg = ctx.createRadialGradient(VW / 2 - sx, VH / 2 - sy, 130, VW / 2, VH / 2, Math.hypot(VW, VH) * 0.6);
  vg.addColorStop(0, 'rgba(6,12,18,0)'); vg.addColorStop(1, 'rgba(6,12,18,.68)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
  if (S.hurtT > 0) { ctx.fillStyle = `rgba(208,72,94,${0.22 * S.hurtT / 0.2})`; ctx.fillRect(0, 0, VW, VH); }

  if (joy.active && S.mode === 'play') {
    ctx.strokeStyle = 'rgba(243,234,214,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(joy.sx, joy.sy, 50, 0, TAU); ctx.stroke();
    const dx = joy.x - joy.sx, dy = joy.y - joy.sy, d = Math.hypot(dx, dy), k = d > 50 ? 50 / d : 1;
    ctx.fillStyle = 'rgba(243,234,214,.4)'; circ(joy.sx + dx * k, joy.sy + dy * k, 20);
  }
}

/* ---------- HUD ---------- */
const hud = $('hud'), xpfill = $('xpfill'), lvl = $('lvl'), timeEl = $('time'), killsEl = $('kills');
let lastHud = '';
function updHud() {
  const p = S.p;
  const key = `${p.level}|${Math.floor(S.t)}|${S.kills}|${Math.round(p.xp / p.xpNext * 100)}`;
  if (key === lastHud) return; lastHud = key;
  xpfill.style.width = Math.min(100, p.xp / p.xpNext * 100) + '%';
  lvl.textContent = 'Lv ' + p.level;
  timeEl.textContent = fmt(S.t);
  killsEl.textContent = '처치 ' + S.kills;
}
function renderInv() {
  const inv = $('inv'); inv.innerHTML = '';
  for (const id in S.w) inv.insertAdjacentHTML('beforeend', `<span class="chip" title="${WEAPONS[id].name}"><span>${WEAPONS[id].icon}</span>${S.w[id]}</span>`);
  for (const id in S.pas) inv.insertAdjacentHTML('beforeend', `<span class="chip pas" title="${PASSIVES[id].name}"><span>${PASSIVES[id].icon}</span>${S.pas[id]}</span>`);
}
let bannerTimer = 0;
function banner(txt) {
  const b = $('banner'); b.textContent = txt; b.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('show'), 2400);
}
function show(id) { $(id).classList.add('show'); }
function hide(id) { $(id).classList.remove('show'); }

/* ---------- 흐름 ---------- */
function newGame(diff) {
  S = makeState(diff); S.mode = 'play';
  joy.active = false; lastHud = '';
  ['start', 'pause', 'over', 'levelup'].forEach(hide);
  hud.hidden = false;
  renderInv();
  cvs.focus && cvs.focus();
}
function togglePause() {
  if (S.mode === 'play') { S.mode = 'pause'; joy.active = false; show('pause'); setTimeout(() => $('resumeBtn').focus({ preventScroll: true }), 30); }
  else if (S.mode === 'pause') { S.mode = 'play'; hide('pause'); }
}
function endGame(win) {
  S.mode = 'over'; joy.active = false;
  const best = loadBest(S.diff);
  const rec = { time: Math.min(WIN_T, S.t), kills: S.kills };
  let isBest = false;
  if (!best || rec.time > best.time || (rec.time === best.time && rec.kills > best.kills)) { saveBest(S.diff, rec); isBest = true; }
  $('overTitle').textContent = win ? '새벽이 밝았습니다' : '등불이 꺼졌습니다';
  $('overLead').textContent = win ? '긴 밤을 끝까지 지켜 냈어요. 늪에 다시 아침이 옵니다.' : '어둠이 등불을 덮쳤습니다. 다른 능력 조합으로 다시 도전해 보세요.';
  $('stTime').textContent = fmt(rec.time);
  $('stLv').textContent = S.p.level;
  $('stKills').textContent = S.kills;
  $('overBest').textContent = isBest ? `${S.D.label} 난이도 새 최고 기록입니다.` : bestText(S.diff);
  $('bestLine').textContent = bestAll();
  show('over');
  setTimeout(() => $('againBtn').focus({ preventScroll: true }), 30);
}
$('easyBtn').addEventListener('click', () => newGame('easy'));
$('normalBtn').addEventListener('click', () => newGame('normal'));
$('againBtn').addEventListener('click', () => newGame(S.diff));
$('resumeBtn').addEventListener('click', togglePause);
$('restartBtn').addEventListener('click', () => newGame(S.diff));
$('pauseBtn').addEventListener('click', togglePause);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (S.mode === 'play') update(dt);
  render();
  if (S.mode !== 'start') updHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
