/**
 * 写真とドットが行き来する演出（WebGL）。どのページでも Base.astro から動かす。
 *
 * 1. 読み込み中（直接開いたとき・リロードしたとき）
 *    写真の色をしたカラフルなドットが、画面のあちこちにばらばらの時間でふわっと現れて漂う。
 *    読み込みが終わると、ドットが画面に見えている写真のほうへ集まり、写真そのものになる。
 *    （下の 2. の「写真がドットに化ける」動きを、逆再生しているのと同じ）
 *
 * 2. 写真の下までスクロールしたとき（横並び・一覧）
 *    最後に見えていた写真がその色のドットに置き換わり、散らばって、プロフィールの背景になる。
 *    スクロール量に連動するので、上に戻ればドットは集まって写真に戻る。
 *
 * 散らばったドットは、
 *  - 数は控えめで、大きさがばらばら（大きめの粒が多く、ときどきとても大きな光の玉）
 *  - 大きな粒ほど手前にあるとみなし、縁がぼけて透ける（レンズのボケのように）
 *  - 写真の中でも色の鮮やかな粒を優先して残し、彩度を少し上げる
 *  - スクロールすると、手前の粒ほど速く流れる（奥行き）。速くスクロールすると手前の粒がぶれる
 *  - 止まっていても、粒ごとに周期の違う揺れを重ねて、ゆっくり不規則に漂い、ときどききらっと瞬く
 *  - どの粒も「明るい芯＋光のにじみ」で描き、暗い色は明るさを持ち上げる（イルミネーションの電球のように）
 *  - 夜は加算合成で、光が重なるほど明るくなる。文字の後ろだけは控えめに
 *
 * 散らばったときに見える粒（最大 240 粒）は、読み込み中の粒からずっと同じ動き方を引き継ぐ。
 * 写真を測り直しても（画面サイズの変更など）、漂っている粒の位置は飛ばない。
 * メニューを開いている間は、後ろの背景を止めておく（すりガラス越しに描き直してカクつかないように）。
 *
 * WebGL が使えない・動きを減らす設定のときは何もしない（写真はそのまま表示される）。
 */

const VERT = `
precision highp float;
attribute vec2 a_uv;
attribute vec3 a_color;
attribute vec3 a_color0; // 読み込み中に仮に付けていた色（写真の色がわかったら、少しずつ本来の色へ）
attribute vec2 a_scatter;
attribute vec4 a_seed;  // x: 動き出す時間差 / y: 位相 / z: 奥行き（大きさ） / w: ぼけ
attribute vec4 a_drift; // xyz: 揺れの周波数 / w: 明るさのゆらぎ
attribute float a_score; // 鮮やかさの順位。小さいほど最後まで残る
uniform vec2 u_view;
uniform vec4 u_rect;
uniform float u_s;
uniform float u_keep;
uniform float u_size;
uniform float u_far;
uniform float u_dpr;
uniform float u_time;
uniform float u_scroll;
uniform float u_vel;
uniform float u_maxSize;
uniform float u_dark;   // 夜なら 1
uniform vec4 u_calm;    // 文字のある範囲（px）。ここだけドットを控えめに
uniform float u_appear; // 読み込み中：現れ始めてからの秒数（ふだんは大きな値）
uniform float u_free;   // 1 なら写真に関係なく、散らばった位置に描く（読み込み中の仮の粒）
uniform float u_gain;   // 全体の濃さ
uniform float u_tint;   // 0: 仮の色 〜 1: 写真の色
varying vec3 v_color;
varying float v_alpha;
varying float v_soft;
varying float v_glow;
varying float v_dark; // 色塗り側へ昼夜を渡す（uniform を両方で宣言すると精度の違いでリンクに失敗する）

const float TAU = 6.2831853;

void main() {
  vec2 origin = u_rect.xy + a_uv * u_rect.zw;
  float t = clamp((u_s - 0.08 - a_seed.x * 0.32) / 0.5, 0.0, 1.0);
  float e = max(t * t * (3.0 - 2.0 * t), u_free);
  vec3 base = mix(a_color0, a_color, u_tint);

  float depth = a_seed.z;              // 0: 奥 〜 1: 手前
  float big = pow(depth, 1.3);         // 大きさ。小さな粒ばかりにならないよう、大きめの粒を多めに
  // さらにごく一部は、とても大きく淡いボケ玉。灰色の大きな玉は汚れに見えるので、色の鮮やかな粒だけ
  float giant = smoothstep(0.965, 1.0, depth) * step(a_score, u_keep * 0.35);

  // 漂い：周波数の違う 3 つの揺れを重ねて、規則的に見えないように
  vec3 f = (0.025 + a_drift.xyz * 0.07) * TAU;
  float tt = u_time;
  vec2 wander = vec2(
    sin(tt * f.x + a_seed.y * 40.0) + 0.6 * sin(tt * f.y * 1.7 + a_seed.x * 31.0) + 0.3 * sin(tt * f.z * 2.9 + a_seed.w * 19.0),
    cos(tt * f.y + a_seed.w * 37.0) + 0.6 * cos(tt * f.z * 1.3 + a_seed.y * 23.0) + 0.3 * cos(tt * f.x * 2.3 + a_seed.x * 11.0)
  ) * (10.0 + depth * 34.0);

  // スクロールの奥行き：手前の粒ほど速く上へ流れ、画面の外に出たら下から戻る
  float margin = 160.0;
  float span = u_view.y + margin * 2.0;
  float y = a_scatter.y * span - u_scroll * (0.1 + depth * 0.75);
  y = mod(y, span) - margin;
  vec2 scattered = vec2(a_scatter.x * u_view.x, y) + wander;
  scattered.y += u_vel * depth * 26.0; // 速いスクロールでは、手前の粒が少し遅れてついてくる

  vec2 pos = mix(origin, scattered, e);

  // 色：散らばるにつれて鮮やかに、暗い色は明るさを持ち上げて光らせる（イルミネーションのように）
  float l = dot(base, vec3(0.299, 0.587, 0.114));
  vec3 vivid = clamp(mix(vec3(l), base, 1.8), 0.0, 1.0);
  float peak = max(vivid.r, max(vivid.g, vivid.b));
  vec3 lit = vivid / max(0.35, peak);
  lit = mix(lit, vec3(1.0), 0.12 * u_dark);
  v_color = mix(base, mix(vivid, lit, 0.55 + 0.45 * u_dark), e);
  v_dark = u_dark;

  // 瞬き：小さな粒ほど「ふだんは控えめで、ときどききらっと」光る
  float tw = 0.5 + 0.5 * sin(tt * (0.35 + a_drift.w * 0.9) + a_seed.y * 50.0);
  float twinkle = mix(0.75 + 0.25 * tw, 0.45 + 0.55 * tw * tw * tw, 1.0 - big);

  // 残す粒だけが最後まで見える。大きな粒ほど透ける
  float keep = a_score < u_keep ? mix(mix(0.95, 0.62, big), 0.36, giant) * twinkle : 0.0;
  // 昼は、色の薄い粒（灰色）と大きな粒を控えめに（白地では濁って見えるため）。夜はそのまま電球のように
  float chroma = max(base.r, max(base.g, base.b)) - min(base.r, min(base.g, base.b));
  keep *= mix(mix(0.4, 1.0, smoothstep(0.06, 0.25, chroma)) * mix(1.0, 0.7, big), 1.0, u_dark);
  v_alpha = smoothstep(0.0, 0.1, u_s) * mix(1.0, keep, smoothstep(0.0, 0.45, e)) * u_gain;

  // 読み込み中：粒ごとにばらばらの時間に、ふわっと膨らみながら現れる
  float ap = clamp((u_appear - a_drift.w * 1.15 - a_seed.y * 0.2) / 0.6, 0.0, 1.0);
  ap = ap * ap * (3.0 - 2.0 * ap);
  v_alpha *= ap;

  // 縁のぼけ：写真の状態ではくっきり、散らばると粒ごとにばらばら。速いスクロールで手前がぶれる
  float speed = min(1.0, abs(u_vel));
  // ぼけ具合は程々に（大きな粒も芯の形がわかるくらい）
  float soft = clamp(0.1 + big * 0.35 + a_seed.w * 0.15 + speed * depth * 0.4 + giant * 0.2, 0.06, 0.8);
  v_soft = mix(0.15, soft, e);

  // どの粒も「明るい芯＋光のにじみ」（電球のように）で描くので、にじみの分だけ大きく描く
  v_glow = e * 0.92;

  // 文字の後ろは控えめに
  float inX = smoothstep(u_calm.x - 80.0, u_calm.x + 20.0, pos.x) * (1.0 - smoothstep(u_calm.z - 20.0, u_calm.z + 80.0, pos.x));
  float inY = smoothstep(u_calm.y - 80.0, u_calm.y + 20.0, pos.y) * (1.0 - smoothstep(u_calm.w - 20.0, u_calm.w + 80.0, pos.y));
  v_alpha *= 1.0 - 0.5 * inX * inY * e;

  float far = u_far * (1.2 + 9.0 * big + giant * (10.0 + 10.0 * a_drift.w)) * (1.0 + speed * depth * 0.3) * (1.0 + v_glow * 1.4);
  // 現れるときは小さな点から、少し膨らみすぎてから落ち着く
  float pop = mix(0.15, 1.0, ap) + 0.22 * sin(ap * 3.14159);
  float size = min(mix(u_size, far, e) * pop, u_maxSize);
  vec2 clip = pos / u_view * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = v_alpha > 0.003 ? size * u_dpr : 0.0;
}
`;

const FRAG = `
precision mediump float;
varying vec3 v_color;
varying float v_alpha;
varying float v_soft;
varying float v_glow;
varying float v_dark;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  // ボケ：縁がぼけた円
  float disc = 1.0 - smoothstep(1.0 - v_soft, 1.0, d);
  // 光：明るい芯と、外へ向かって弱まるにじみ（昼は芯を大きく、にじみを控えめに）
  float r0 = mix(0.36, 0.26, v_dark);
  float core = 1.0 - smoothstep(r0, r0 + 0.1 + v_soft * 0.3, d);
  float halo = pow(1.0 - d, 2.4) * mix(0.28, 0.6, v_dark);
  float a = v_alpha * mix(disc, max(core, halo), v_glow);
  gl_FragColor = vec4(v_color * a, a);
}
`;

/** 1 粒のデータ：uv(2) + 色(3) + 仮の色(3) + 散らばる位置(2) + seed(4) + drift(4) + 順位(1) */
const STRIDE = 19;
/** 散らばったときに見える粒の数 */
const KEEP = { desktop: 240, mobile: 120 };
/** 読み込み中の演出の時間（ms） */
const INTRO = {
  /** ページを開いてから、ドットが集まり始めるまでの最短の時間（速く読み込めても世界観の入口として見せる） */
  hold: 1800,
  /** ドットが現れ始めてから、集まり始めるまでの最短の時間 */
  minShow: 1500,
  /** 写真の読み込みがこれより遅いときは、待たずに進める */
  giveUp: 6000,
  /** ドットが集まって写真になるまで */
  converge: 2600,
  /** 仮の色から写真の色へ */
  tint: 700,
};

type Mode = 'strip' | 'grid' | 'still';

interface Layer {
  img: HTMLImageElement;
  buffer: WebGLBuffer;
  count: number;
  cols: number;
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
  return sh;
}

async function loadImage(img: HTMLImageElement) {
  img.loading = 'eager';
  if (!(img.complete && img.naturalWidth)) {
    await new Promise<void>((resolve, reject) => {
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => reject(new Error('image')), { once: true });
    });
  }
  await img.decode().catch(() => {});
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** "rrggbbrrggbb…" を 0〜1 の RGB の並びに。足りなければイチゴの赤と墨色で埋める */
function parseColors(hex: string, count: number) {
  const out = new Float32Array(count * 3);
  const n = Math.floor(hex.length / 6);
  for (let i = 0; i < count; i++) {
    const c = n ? hex.slice((i % n) * 6, (i % n) * 6 + 6) : i % 3 ? '8e8e8b' : 'e5392b';
    out[i * 3] = parseInt(c.slice(0, 2), 16) / 255;
    out[i * 3 + 1] = parseInt(c.slice(2, 4), 16) / 255;
    out[i * 3 + 2] = parseInt(c.slice(4, 6), 16) / 255;
  }
  return out;
}

export function mountField() {
  const root = document.documentElement;
  const endLoading = () => root.classList.remove('is-loading', 'is-loaded');
  if (!root.classList.contains('fx')) return endLoading();

  const source = document.querySelector<HTMLElement>('[data-field-source]');
  const target = document.querySelector<HTMLElement>('[data-field-target]');
  const mode = (source?.dataset.fieldSource || 'still') as Mode;

  // 読み込み中の演出（head のスクリプトが is-loading を付けたときだけ）
  let intro: null | { t0: number; ready: boolean; at: number; handoff: number } = root.classList.contains('is-loading')
    ? { t0: performance.now(), ready: false, at: 0, handoff: 0 }
    : null;
  // 読み込み中でもなく、プロフィールも無いページ（写真 1 枚のページなど）では何もしない
  if (!intro && !target) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'fx-field';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
  if (!gl) {
    canvas.remove();
    return endLoading();
  }

  let program: WebGLProgram;
  try {
    program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
  } catch (err) {
    console.warn('[field] WebGL の準備に失敗したため、ドットの演出を使いません', err);
    canvas.remove();
    return endLoading();
  }
  gl.useProgram(program);
  // 端末ごとに描けるドットの最大サイズが違う（スマホでは小さいことがある）
  const maxPointSize = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)[1] || 64;
  gl.enable(gl.BLEND);

  const attr = {
    uv: gl.getAttribLocation(program, 'a_uv'),
    color: gl.getAttribLocation(program, 'a_color'),
    color0: gl.getAttribLocation(program, 'a_color0'),
    scatter: gl.getAttribLocation(program, 'a_scatter'),
    seed: gl.getAttribLocation(program, 'a_seed'),
    drift: gl.getAttribLocation(program, 'a_drift'),
    score: gl.getAttribLocation(program, 'a_score'),
  };
  Object.values(attr).forEach((a) => gl.enableVertexAttribArray(a));
  const uni = Object.fromEntries(
    [
      'u_view', 'u_rect', 'u_s', 'u_keep', 'u_size', 'u_far', 'u_dpr', 'u_time', 'u_scroll', 'u_vel', 'u_maxSize', 'u_dark',
      'u_calm', 'u_appear', 'u_free', 'u_gain', 'u_tint',
    ].map((n) => [n, gl.getUniformLocation(program, n)]),
  ) as Record<string, WebGLUniformLocation | null>;

  // ---- 散らばったときに見える粒（順位 0〜239）の動き方。読み込み中から最後まで同じものを使う ----
  const CROWD = KEEP.desktop;
  const crowd = new Float32Array(CROWD * 10); // 散らばる位置(2) + seed(4) + drift(4)
  for (let i = 0; i < crowd.length; i++) crowd[i] = Math.random();
  // 読み込み中の仮の色（ビルド時に写真から選んだ、鮮やかな順の色）
  const crowdColor = parseColors(document.body.dataset.dots ?? '', CROWD);

  // 読み込み中の仮の粒（写真の位置には関係なく、散らばった位置に描く）
  const ambient = gl.createBuffer()!;
  {
    const data = new Float32Array(CROWD * STRIDE);
    for (let k = 0; k < CROWD; k++) {
      const o = k * STRIDE;
      data[o] = 0.5;
      data[o + 1] = 0.5;
      data.set(crowdColor.subarray(k * 3, k * 3 + 3), o + 2);
      data.set(crowdColor.subarray(k * 3, k * 3 + 3), o + 5);
      data.set(crowd.subarray(k * 10, k * 10 + 10), o + 8);
      data[o + 18] = k;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, ambient);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  }

  /** 文字のある範囲（ここだけドットを控えめにする）。画面の中央にあるものを使う */
  const calmAreas = target ? [...target.querySelectorAll<HTMLElement>('[data-field-calm]')] : [];
  const currentCalm = () => {
    const mid = window.innerHeight / 2;
    let best: DOMRect | null = null;
    let bestD = Infinity;
    for (const el of calmAreas) {
      const r = el.getBoundingClientRect();
      const d = r.top > mid ? r.top - mid : r.bottom < mid ? mid - r.bottom : 0;
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  };

  let layers: Layer[] = [];
  let state: 'idle' | 'preparing' | 'ready' = 'idle';
  let token = 0;
  let scrollS = 0;
  let introS = 0;
  let s = 0;
  let checked = false;
  let raf = 0;
  let dpr = 1;
  let lastY = window.scrollY;
  let lastT = performance.now();
  let lastFrame = lastT;
  let vel = 0;
  /** 漂う動きの時計（メニューを開いている間は止まる） */
  let clock = 0;
  let dissolve = -1;

  // ---- どの写真をドットにするか ----
  function wanted(): HTMLImageElement[] {
    if (!source) return [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const imgs = [...source.querySelectorAll<HTMLImageElement>('img')];
    const rect = (img: HTMLImageElement) => img.getBoundingClientRect();
    const inX = (r: DOMRect) => r.width > 0 && r.right > 0 && r.left < vw;
    // 読み込み中・写真 1 枚のページ：いま画面に見えている写真
    if ((intro && scrollS === 0) || mode === 'still' || !target) {
      return imgs.filter((img) => {
        const r = rect(img);
        return inX(r) && r.bottom > 0 && r.top < vh;
      });
    }
    // 横並び：列の中で、横方向に画面に入っている写真
    if (mode === 'strip') return imgs.filter((img) => inX(rect(img)));
    // 一覧：プロフィールが下から入ってくるときに、画面に残っている写真（いちばん下の帯）
    const top = target.getBoundingClientRect().top;
    return imgs.filter((img) => {
      const r = rect(img);
      return inX(r) && r.bottom > top - vh && r.top < top;
    });
  }
  const sameSet = (imgs: HTMLImageElement[]) => imgs.length === layers.length && imgs.every((img, i) => img === layers[i].img);

  // ---- 写真を、ドットのデータにする ----
  async function prepare(imgs: HTMLImageElement[]) {
    state = 'preparing';
    const mine = ++token;
    const sampled: { img: HTMLImageElement; cols: number; rows: number; px: Uint8ClampedArray }[] = [];
    try {
      for (const img of imgs) {
        await loadImage(img);
        const w = img.clientWidth;
        const h = img.clientHeight;
        if (!w || !h) continue;
        const spacing = Math.max(9, w / 90);
        const cols = Math.max(6, Math.round(w / spacing));
        const rows = Math.max(6, Math.round(h / spacing));
        const off = document.createElement('canvas');
        off.width = cols;
        off.height = rows;
        const ctx = off.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, cols, rows);
        sampled.push({ img, cols, rows, px: ctx.getImageData(0, 0, cols, rows).data });
      }
    } catch {
      if (mine === token) state = 'idle';
      return;
    }
    if (mine !== token) return;

    // 写真をまたいで、色の鮮やかな粒ほど上の順位に（少しだけ偶然も混ぜる）
    const total = sampled.reduce((n, l) => n + l.cols * l.rows, 0);
    const scores = new Float32Array(total);
    let n = 0;
    for (const l of sampled) {
      for (let i = 0; i < l.cols * l.rows; i++) {
        const r = l.px[i * 4];
        const g = l.px[i * 4 + 1];
        const b = l.px[i * 4 + 2];
        const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
        const gray = (1 - Math.min(1, chroma * 2.2)) ** 2;
        scores[n++] = Math.random() * (0.04 + 0.96 * gray);
      }
    }
    const rank = new Float32Array(total);
    Array.from({ length: total }, (_, i) => i)
      .sort((a, b) => scores[a] - scores[b])
      .forEach((idx, r) => (rank[idx] = r));

    n = 0;
    const next = sampled.map((l) => {
      const count = l.cols * l.rows;
      const data = new Float32Array(count * STRIDE);
      for (let i = 0; i < count; i++, n++) {
        const o = i * STRIDE;
        const k = rank[n];
        data[o] = ((i % l.cols) + 0.5) / l.cols;
        data[o + 1] = (Math.floor(i / l.cols) + 0.5) / l.rows;
        data[o + 2] = l.px[i * 4] / 255;
        data[o + 3] = l.px[i * 4 + 1] / 255;
        data[o + 4] = l.px[i * 4 + 2] / 255;
        if (k < CROWD) {
          // 散らばったときに見える粒は、読み込み中の粒の動き方と仮の色を引き継ぐ
          data.set(crowdColor.subarray(k * 3, k * 3 + 3), o + 5);
          data.set(crowd.subarray(k * 10, k * 10 + 10), o + 8);
        } else {
          data[o + 5] = data[o + 2];
          data[o + 6] = data[o + 3];
          data[o + 7] = data[o + 4];
          for (let j = 8; j < 18; j++) data[o + j] = Math.random();
        }
        data[o + 18] = k;
      }
      const buffer = gl!.createBuffer()!;
      gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
      gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
      return { img: l.img, buffer, count, cols: l.cols };
    });
    layers.forEach((l) => gl!.deleteBuffer(l.buffer));
    layers = next;
    state = 'ready';
    update();
  }

  // ---- スクロール：プロフィールの頭が画面の下端に来たら 0、そこから画面の 3/4 だけ進んだら 1 ----
  // 写真が少なくて、ページのいちばん上からプロフィールが見えている場合は、スクロールし始めたところを 0 にする
  // （そうしないと、いちばん上に戻っても写真がドットのままになる）
  function update() {
    if (target) {
      const vh = window.innerHeight;
      const y = Math.max(0, window.scrollY);
      const top = target.getBoundingClientRect().top;
      const start = Math.max(0, top + y - vh);
      scrollS = clamp01((y - start) / (vh * 0.75));
      s = Math.max(scrollS, introS);

      // 化け始める瞬間に、用意したドットが今見えている写真と同じか確かめる
      // （列が横に動いている途中で準備した場合などは作り直す）
      if (state === 'ready' && s > 0 && !checked && !intro) {
        checked = true;
        if (!sameSet(wanted())) state = 'idle';
      }
      if (s === 0) checked = false;
      if (state === 'idle' && !intro && top < vh * 2.5) prepare(wanted());
    }
    kick();
  }

  function setDissolve(v: number) {
    if (!source || v === dissolve) return;
    dissolve = v;
    if (v < 0) source.style.removeProperty('--dissolve');
    else source.style.setProperty('--dissolve', v.toFixed(3));
  }

  // ---- 読み込み中の進行 ----
  function stepIntro(now: number) {
    if (!intro) return;
    // head の安全装置などで、外から読み込み中が終わった
    if (!root.classList.contains('is-loading')) return finishIntro();
    if (!intro.at) {
      const settled = intro.ready && now >= Math.max(INTRO.hold, intro.t0 + INTRO.minShow);
      if (settled || now - intro.t0 > INTRO.giveUp) {
        intro.at = now;
        root.classList.add('is-loaded'); // ヘッダーや文字がふわっと現れ始める（global.css）
      }
      introS = 1;
      return;
    }
    // 最初は大きく動き出し、最後はゆっくり着地して写真に変わる
    const p = clamp01((now - intro.at) / INTRO.converge);
    introS = (1 - p) ** 2;
    if (p >= 1) finishIntro();
  }

  function finishIntro() {
    intro = null;
    introS = 0;
    endLoading();
    // 一覧では、読み込み中に使った写真（いちばん上）と、プロフィールの背景になる写真（いちばん下）が違う
    if (state === 'ready' && target && scrollS === 0 && !sameSet(wanted())) state = 'idle';
    update();
  }

  function kick() {
    if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
  }

  function bind(buffer: WebGLBuffer) {
    gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
    const b = STRIDE * 4;
    gl!.vertexAttribPointer(attr.uv, 2, gl!.FLOAT, false, b, 0);
    gl!.vertexAttribPointer(attr.color, 3, gl!.FLOAT, false, b, 8);
    gl!.vertexAttribPointer(attr.color0, 3, gl!.FLOAT, false, b, 20);
    gl!.vertexAttribPointer(attr.scatter, 2, gl!.FLOAT, false, b, 32);
    gl!.vertexAttribPointer(attr.seed, 4, gl!.FLOAT, false, b, 40);
    gl!.vertexAttribPointer(attr.drift, 4, gl!.FLOAT, false, b, 56);
    gl!.vertexAttribPointer(attr.score, 1, gl!.FLOAT, false, b, 72);
  }

  function frame(now: number) {
    raf = 0;
    const dt = now - lastFrame;
    lastFrame = now;
    // メニューの後ろでは描き直さない（最後の絵のまま止めておき、閉じたら続きから動く）
    if (root.classList.contains('menu-open')) {
      if (s > 0 || intro) kick();
      return;
    }
    clock += Math.min(dt, 50) / 1000;
    stepIntro(now);
    s = Math.max(scrollS, introS);

    const useLayers = state === 'ready' && layers.length > 0;
    if (intro && useLayers && !intro.handoff) intro.handoff = now;
    setDissolve(useLayers ? Math.min(1, s / 0.12) : -1);

    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    const drawAmbient = !useLayers && !!intro;
    if (s <= 0 || (!useLayers && !drawAmbient)) return;

    const vw = canvas.clientWidth;
    const vh = canvas.clientHeight;
    const mobile = vw < 640;
    gl!.uniform2f(uni.u_view, vw, vh);
    gl!.uniform1f(uni.u_keep, mobile ? KEEP.mobile : KEEP.desktop);
    gl!.uniform1f(uni.u_far, mobile ? 2.6 : 3.4);
    gl!.uniform1f(uni.u_dpr, dpr);
    gl!.uniform1f(uni.u_maxSize, maxPointSize / dpr);
    gl!.uniform1f(uni.u_appear, intro ? (now - intro.t0) / 1000 : 1e3);
    gl!.uniform1f(uni.u_tint, intro?.handoff ? clamp01((now - intro.handoff) / INTRO.tint) : intro ? 0 : 1);

    // 夜は光が重なるほど明るくなる（加算）。昼はふつうに重ねる
    const dark = root.dataset.theme === 'dark';
    gl!.uniform1f(uni.u_dark, dark ? 1 : 0);
    gl!.blendFunc(gl!.ONE, dark ? gl!.ONE : gl!.ONE_MINUS_SRC_ALPHA);
    const calm = currentCalm();
    gl!.uniform4f(uni.u_calm, calm?.left ?? -1e4, calm?.top ?? -1e4, calm?.right ?? -1e4, calm?.bottom ?? -1e4);
    gl!.uniform1f(uni.u_time, clock);

    // スクロールの速さ（px/ms をなめらかにして -1.5〜1.5 程度に）
    const y = window.scrollY;
    vel += ((y - lastY) / Math.max(1, now - lastT) - vel) * 0.08;
    lastY = y;
    lastT = now;
    gl!.uniform1f(uni.u_scroll, y);
    gl!.uniform1f(uni.u_vel, Math.max(-1.5, Math.min(1.5, vel / 2)));

    if (useLayers) {
      gl!.uniform1f(uni.u_s, s);
      gl!.uniform1f(uni.u_free, 0);
      gl!.uniform1f(uni.u_gain, 1);
      for (const l of layers) {
        const r = l.img.getBoundingClientRect();
        bind(l.buffer);
        gl!.uniform4f(uni.u_rect, r.left, r.top, r.width, r.height);
        gl!.uniform1f(uni.u_size, (r.width / l.cols) * 0.9);
        gl!.drawArrays(gl!.POINTS, 0, l.count);
      }
    } else {
      // 写真が無いページ（404 など）では、集まる代わりに静かに消えていく
      bind(ambient);
      gl!.uniform1f(uni.u_s, 1);
      gl!.uniform1f(uni.u_free, 1);
      gl!.uniform1f(uni.u_gain, introS);
      gl!.uniform4f(uni.u_rect, 0, 0, vw, vh);
      gl!.uniform1f(uni.u_size, 4);
      gl!.drawArrays(gl!.POINTS, 0, CROWD);
    }
    // 散らばったドットはゆっくり漂い続ける
    kick();
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    // ドットの位置は写真の位置から毎回計算するので、作り直さない（見えている写真が変わったかは、化け始めるときに確かめる）
    update();
  }

  window.addEventListener('scroll', update, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return kick();
    cancelAnimationFrame(raf);
    raf = 0;
  });
  new ResizeObserver(resize).observe(canvas);
  resize();

  if (intro) {
    const imgs = wanted();
    const done = () => intro && (intro.ready = true);
    if (imgs.length) prepare(imgs).then(done, done);
    else done();
    kick();
  }
}
