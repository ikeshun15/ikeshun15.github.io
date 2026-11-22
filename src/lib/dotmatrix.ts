/**
 * Dot-matrix field.
 * 画面全体を等間隔のドット（センサーの画素のイメージ）で埋め、
 * 5×7 のドットフォントで文字を浮かび上がらせる。
 *  - 背景ドットは光が流れるようにゆっくり明滅
 *  - マウスを近づけるとレンズのように膨らむ
 *  - クリック／タップで波紋が広がる
 * prefers-reduced-motion のときは静止画として一度だけ描画する。
 */

import { layoutText } from './dotfont';

const TAU = Math.PI * 2;
const BUCKETS = 10;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => v * v * (3 - 2 * v);
const easeOutBack = (v: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2);
};

interface Wave {
  x: number;
  y: number;
  t: number;
  strength: number;
}

export function mountDotMatrix(el: HTMLElement) {
  const canvas = el.querySelector('canvas');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;

  const scope = el.closest<HTMLElement>('[data-dm-scope]') ?? el;
  const hudX = scope.querySelector<HTMLElement>('[data-hud-x]');
  const hudY = scope.querySelector<HTMLElement>('[data-hud-y]');
  const text = el.dataset.text ?? '';
  const portrait: string[] | null = el.dataset.portrait ? JSON.parse(el.dataset.portrait) : null;
  const accentFrom = Number(el.dataset.accentFrom ?? -1);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  let W = 0;
  let H = 0;
  let dpr = 1;
  let S = 10;
  let n = 0;
  let maxDist = 1;
  let cx = 0;
  let cy = 0;

  // dot buffers
  let hx = new Float32Array(0);
  let hy = new Float32Array(0);
  let px = new Float32Array(0);
  let py = new Float32Array(0);
  let vx = new Float32Array(0);
  let vy = new Float32Array(0);
  let gc = new Float32Array(0);
  let gr = new Float32Array(0);
  let heat = new Float32Array(0);
  let delay = new Float32Array(0);
  let rad = new Float32Array(0);
  let kind = new Uint8Array(0); // 0 背景 / 1 文字 / 2 文字(アクセント)
  let bucket = new Uint8Array(0); // 背景ドットの濃さ。BUCKETS はアクセント色

  const colors = { ink: '#111', accent: '#e8402f' };
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, active: false, strength: 0 };
  const waves: Wave[] = [];

  const start = performance.now();
  let last = start;
  let raf = 0;
  let visible = true;
  let built = false;
  let introWave = false;

  function readColors() {
    const cs = getComputedStyle(el);
    colors.ink = cs.getPropertyValue('--ink').trim() || colors.ink;
    colors.accent = cs.getPropertyValue('--accent').trim() || colors.accent;
  }

  function build() {
    // transform（スクロール時の縮小）の影響を受けないレイアウト上のサイズを使う
    W = el.clientWidth;
    H = el.clientHeight;
    if (!W || !H) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas!.width = Math.round(W * dpr);
    canvas!.height = Math.round(H * dpr);

    const isPortrait = W / H < 0.9;
    const lines = isPortrait && portrait ? portrait : [text];
    const { cols, rows, cells: glyph } = layoutText(lines, accentFrom);
    const fitW = isPortrait ? 0.82 : 0.64;
    S = Math.min((W * fitW) / cols, (H * 0.44) / rows, 30);
    S = Math.max(S, 5);

    const x0 = (W - (cols - 1) * S) / 2;
    const y0 = (H - (rows - 1) * S) / 2 - H * 0.035;
    cx = W / 2;
    cy = y0 + ((rows - 1) * S) / 2;

    const c0 = Math.ceil(-x0 / S);
    const c1 = Math.floor((W - x0) / S);
    const r0 = Math.ceil(-y0 / S);
    const r1 = Math.floor((H - y0) / S);
    n = (c1 - c0 + 1) * (r1 - r0 + 1);

    hx = new Float32Array(n);
    hy = new Float32Array(n);
    px = new Float32Array(n);
    py = new Float32Array(n);
    vx = new Float32Array(n);
    vy = new Float32Array(n);
    gc = new Float32Array(n);
    gr = new Float32Array(n);
    heat = new Float32Array(n);
    delay = new Float32Array(n);
    rad = new Float32Array(n);
    kind = new Uint8Array(n);
    bucket = new Uint8Array(n);

    maxDist = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
    const replay = performance.now() - start < 1600;

    let i = 0;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const x = x0 + c * S;
        const y = y0 + r * S;
        hx[i] = px[i] = x;
        hy[i] = py[i] = y;
        gc[i] = c;
        gr[i] = r;
        const k = glyph.get(`${c},${r}`) ?? 0;
        kind[i] = k;
        if (!replay) delay[i] = -1e5;
        else if (k) delay[i] = 220 + (c / cols) * 520 + Math.random() * 380;
        else delay[i] = (Math.hypot(x - cx, y - cy) / maxDist) * 700;
        i++;
      }
    }
    built = true;
  }

  function step(dt: number, t: number) {
    const f = dt / 16.667;
    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, 0.22 * f);
    pointer.sy += (pointer.y - pointer.sy) * Math.min(1, 0.22 * f);
    pointer.strength += ((pointer.active ? 1 : 0) - pointer.strength) * Math.min(1, 0.08 * f);

    if (!introWave && t > 1150) {
      introWave = true;
      waves.push({ x: cx, y: cy, t, strength: 0.75 });
    }

    const R = S * 5.5;
    const R2 = R * R;
    const push = S * 0.75;
    const speed = S * 0.05; // px / ms
    const band = S * 2.4;
    const K = 0.085;
    const damp = Math.pow(0.8, f);
    const decay = Math.pow(0.9, f);

    for (let w = waves.length - 1; w >= 0; w--) {
      if ((t - waves[w].t) * speed - band > maxDist * 1.4) waves.splice(w, 1);
    }

    const ps = pointer.strength;
    for (let i = 0; i < n; i++) {
      let tx = hx[i];
      let ty = hy[i];
      let lens = 0;

      if (ps > 0.001) {
        const dx = hx[i] - pointer.sx;
        const dy = hy[i] - pointer.sy;
        const d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) || 1;
          lens = smooth(1 - d / R) * ps;
          const p = lens * push * (kind[i] ? 0.55 : 1);
          tx += (dx / d) * p;
          ty += (dy / d) * p;
        }
      }

      heat[i] *= decay;
      for (let w = 0; w < waves.length; w++) {
        const wv = waves[w];
        const r = (t - wv.t) * speed;
        const dx = hx[i] - wv.x;
        const dy = hy[i] - wv.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const b = Math.abs(d - r);
        if (b < band) {
          const k = (1 - b / band) * wv.strength * Math.max(0, 1 - r / (maxDist * 1.3));
          if (k > heat[i]) heat[i] = k;
          vx[i] += (dx / d) * k * S * 0.035 * f;
          vy[i] += (dy / d) * k * S * 0.035 * f;
        }
      }

      vx[i] = (vx[i] + (tx - px[i]) * K * f) * damp;
      vy[i] = (vy[i] + (ty - py[i]) * K * f) * damp;
      px[i] += vx[i] * f;
      py[i] += vy[i] * f;

      rad[i] = lens; // draw() で使う一時値
    }
  }

  function draw(t: number, animate: boolean) {
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, W, H);

    const baseR = Math.max(0.65, S * 0.055);
    const glyphR = S * 0.38;
    const ta = animate ? t : 0;

    for (let i = 0; i < n; i++) {
      const lens = rad[i];
      const local = t - delay[i];
      if (kind[i]) {
        const s = animate ? easeOutBack(clamp01(local / 460)) : 1;
        rad[i] = glyphR * s * (1 + lens * 0.14 + heat[i] * 0.22);
        continue;
      }
      const fade = animate ? clamp01(local / 600) : 1;
      const u = gc[i];
      const v = gr[i];
      const a =
        Math.sin(u * 0.19 + ta * 0.00055 + Math.sin(v * 0.16 + ta * 0.0004) * 1.7) *
        Math.sin(v * 0.12 - ta * 0.00042 + u * 0.045);
      const amb = a * a;
      const h = heat[i];
      rad[i] = baseR * (1 + amb * 1.3 + lens * 3.4 + h * 2.6) * (0.4 + 0.6 * fade);
      const alpha = (0.12 + amb * 0.3 + lens * 0.62 + h * 0.5) * fade;
      bucket[i] = h > 0.42 ? BUCKETS : Math.min(BUCKETS - 1, Math.floor(clamp01(alpha) * BUCKETS));
    }

    // 背景ドット（濃さごとにまとめて描画）
    ctx!.fillStyle = colors.ink;
    for (let b = 0; b < BUCKETS; b++) {
      ctx!.globalAlpha = (b + 0.5) / BUCKETS;
      ctx!.beginPath();
      for (let i = 0; i < n; i++) {
        if (kind[i] || bucket[i] !== b) continue;
        ctx!.moveTo(px[i] + rad[i], py[i]);
        ctx!.arc(px[i], py[i], rad[i], 0, TAU);
      }
      ctx!.fill();
    }
    ctx!.globalAlpha = 0.9;
    ctx!.fillStyle = colors.accent;
    ctx!.beginPath();
    for (let i = 0; i < n; i++) {
      if (kind[i] || bucket[i] !== BUCKETS) continue;
      ctx!.moveTo(px[i] + rad[i], py[i]);
      ctx!.arc(px[i], py[i], rad[i], 0, TAU);
    }
    ctx!.fill();

    // 文字ドット
    ctx!.globalAlpha = 1;
    for (const k of [1, 2]) {
      ctx!.fillStyle = k === 1 ? colors.ink : colors.accent;
      ctx!.beginPath();
      for (let i = 0; i < n; i++) {
        if (kind[i] !== k || rad[i] <= 0.01) continue;
        ctx!.moveTo(px[i] + rad[i], py[i]);
        ctx!.arc(px[i], py[i], rad[i], 0, TAU);
      }
      ctx!.fill();
    }
  }

  function frame(now: number) {
    raf = 0;
    const dt = Math.min(now - last, 50);
    last = now;
    const t = now - start;
    step(dt, t);
    draw(t, true);
    play();
  }

  function play() {
    if (raf || !built || !visible || document.hidden || reduced.matches) return;
    raf = requestAnimationFrame((now) => {
      if (last < now - 100) last = now - 16.667;
      frame(now);
    });
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function drawStatic() {
    if (!built) return;
    rad.fill(0);
    heat.fill(0);
    draw(0, false);
  }

  function refresh() {
    if (reduced.matches) {
      stop();
      drawStatic();
    } else {
      play();
    }
  }

  // --- events ---
  const toLocal = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const sx = r.width ? W / r.width : 1;
    const sy = r.height ? H / r.height : 1;
    return [(e.clientX - r.left) * sx, (e.clientY - r.top) * sy] as const;
  };

  const setHud = (x: number | null, y: number | null) => {
    if (hudX) hudX.textContent = x === null ? '—' : (x / W).toFixed(3);
    if (hudY) hudY.textContent = y === null ? '—' : (y / H).toFixed(3);
  };

  scope.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const [x, y] = toLocal(e);
    if (!pointer.active) {
      pointer.sx = x;
      pointer.sy = y;
    }
    pointer.x = x;
    pointer.y = y;
    pointer.active = true;
    setHud(x, y);
  });
  scope.addEventListener('pointerleave', () => {
    pointer.active = false;
    setHud(null, null);
  });
  scope.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('a, button')) return;
    const [x, y] = toLocal(e);
    waves.push({ x, y, t: performance.now() - start, strength: 1 });
    if (waves.length > 6) waves.shift();
  });

  let resizeQueued = false;
  new ResizeObserver(() => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      build();
      if (reduced.matches) drawStatic();
    });
  }).observe(el);

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) play();
    else stop();
  }).observe(el);

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : play()));
  window.addEventListener('pageshow', () => play());
  reduced.addEventListener('change', refresh);

  new MutationObserver(() => {
    readColors();
    if (reduced.matches) drawStatic();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  readColors();
  build();
  refresh();
}
