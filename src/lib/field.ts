/**
 * 写真とドットが行き来する演出（WebGL）。どのページでも Base.astro から動かす。
 *
 * 1. 読み込み中（直接開いたとき・リロードしたとき）
 *    写真の色をした光が、画面のあちこちでばらばらに点灯する。最初は遠くにピントが合っていて小さな光の点、
 *    そこからピントが手前（45 cm）へ送られて、大きなボケになる。読み込みが終わると、光は画面に見えている
 *    写真のほうへ集まり、写真そのものになる（下の 2. の「写真がドットに化ける」動きを、逆再生しているのと同じ）。
 *
 * 2. 写真の下までスクロールしたとき（横並び・一覧）
 *    最後に見えていた写真がその色のドットに置き換わり、散らばって、プロフィールの背景になる。
 *    スクロール量に連動するので、上に戻ればドットは集まって写真に戻る。
 *
 * ---- 散らばったドット ＝「ピントを手前に合わせて撮った、イルミネーションのボケ」 ----
 * 画面を一枚の写真に見立て、カメラとレンズを決めて、ボケを光学の式で計算している。
 *   レンズ   … 50 mm F1.8（SEL50F18F）を開放、最短撮影距離 45 cm にピント
 *   センサー … フルサイズ（長辺 36 mm）が画面の長辺に写る
 *   光源     … ピント面の奥 0.6〜20 m に散らばった電球（距離は対数で一様＝遠くの光ほど多い）。
 *              色の鮮やかな光のごく一部は、レンズのすぐ前 12〜20 cm にある（前ボケ）
 *
 *  - 大きさ：薄肉レンズの錯乱円   c = f² / (N (s_f − f)) · |s − s_f| / s
 *    遠くの光ほど c は一定の大きさ（無限遠のボケ）に近づくので、大きなボケがそろい、小さなボケは少ない。
 *    手前の光（前ボケ）は、とても大きく淡い円になる
 *  - 明るさ：光の量は同じでも、ボケの面積に広がるので、像の明るさは 1 / c² で暗くなる。
 *    それを露出 1 − exp(−k·E) で写す（明るい光は頭打ちになり、白飛びに近づく）
 *  - 輪郭：絞りの形（円）を、収差と回折によるにじみ（一定の幅）でぼかしたもの。
 *    にじみの幅は大きさによらず一定なので、小さなボケほどふんわり、大きなボケほどくっきり見える
 *  - 球面収差：奥のボケは縁が少し明るく、手前のボケは中心が明るく縁がやわらかい
 *  - 口径食：画面の端ほど、ボケがレモン形に欠ける（キャッツアイ）
 *  - 視差：スクロールやカメラのわずかな揺れで、ピント面より奥の光はゆっくり、手前の光は速く動く。
 *    光そのものも、風に揺れるように少しだけ揺れ、ときどききらっと瞬く
 *  - 色：登録してあるすべての写真からとった色。夜は加算合成で、光が重なるほど明るくなる。文字の後ろだけは控えめに
 *
 * 散らばったときに見える粒（PC 45 粒・スマホ 24 粒）は、読み込み中の粒からずっと同じ動き方と色を引き継ぐ。
 * 写真を測り直しても（画面サイズの変更など）、漂っている粒の位置は飛ばない。
 * メニューを開いている間も、すりガラスの向こうで動き続ける。
 *
 * WebGL が使えない・動きを減らす設定のときは何もしない（写真はそのまま表示される）。
 */

const VERT = `
precision highp float;
attribute vec2 a_uv;
attribute vec3 a_color;
attribute vec3 a_far;   // 散らばったときの色（すべての写真からとった色）
attribute vec2 a_scatter;
attribute vec4 a_seed;  // x: 動き出す時間差 / y: 位相 / z: 光源までの距離 / w: 光の強さ
attribute vec4 a_drift; // xyz: 揺れの周波数 / w: 瞬きの速さ・点灯の時間差
attribute float a_score; // 鮮やかさの順位。小さいほど最後まで残る
uniform vec2 u_view;
uniform vec4 u_rect;
uniform float u_s;
uniform float u_keep;
uniform float u_size;
uniform float u_dpr;
uniform float u_time;
uniform float u_scroll;
uniform float u_vel;
uniform float u_maxSize;
uniform float u_dark;   // 夜なら 1
uniform vec4 u_calm;    // 文字のある範囲（px）。ここだけドットを控えめに
uniform float u_appear; // 読み込み中：点灯し始めてからの秒数（ふだんは大きな値）
uniform float u_free;   // 1 なら写真に関係なく、散らばった位置に描く（読み込み中の仮の粒）
uniform float u_gain;   // 全体の濃さ
uniform vec4 u_lens;    // x: 焦点距離 f（mm） / y: F 値 N / z: いまのピント位置 s_f（mm） / w: センサー 1 mm あたりの px
uniform float u_page;   // ページ（文字）のある距離（mm）。視差の基準
uniform float u_cref;   // 明るさの基準にするボケの直径（px）：無限遠の光のボケ
uniform vec2 u_sway;    // カメラのわずかな揺れ（ピント面での px）
varying vec3 v_color;
varying float v_alpha;
varying float v_R;      // ボケの円の半径（描く四角の半分を 1 とする）
varying float v_sig;    // にじみの幅（同じ単位）
varying vec2 v_cat;     // 口径食：重ねるもう一つの円の中心のずれ（同じ単位）
varying float v_rim;    // 球面収差：+ なら縁が明るい / − なら中心が明るい
varying float v_bloom;  // 明るい光のまわりの、淡い光のにじみ（夜だけ）

const float TAU = 6.2831853;

void main() {
  vec2 origin = u_rect.xy + a_uv * u_rect.zw;
  float t = clamp((u_s - 0.08 - a_seed.x * 0.32) / 0.5, 0.0, 1.0);
  float e = max(t * t * (3.0 - 2.0 * t), u_free);
  // 写真の位置ではその画素の色、散らばるにつれて、すべての写真からとった色へ
  vec3 base = mix(a_color, a_far, smoothstep(0.15, 0.85, e));

  // ---- 光源までの距離 s（mm） ----
  // 奥の光：0.6〜20 m に対数で一様。前ボケ：色の鮮やかな光のうち 1 割が、レンズのすぐ前 12〜20 cm
  float fore = step(0.9, a_seed.z) * step(a_score, u_keep * 0.5);
  float sBack = 600.0 * pow(20000.0 / 600.0, min(1.0, a_seed.z / 0.9));
  float sFore = mix(120.0, 200.0, fract(a_seed.z * 37.0));
  float s = mix(sBack, sFore, fore);

  // ---- 錯乱円の直径（px）：c = f² / (N (s_f − f)) · |s − s_f| / s ----
  float f = u_lens.x;
  float N = u_lens.y;
  float sf = u_lens.z;
  float pxmm = u_lens.w;
  float coc = f * f / (N * (sf - f)) * abs(s - sf) / s * pxmm;

  // ---- 位置：視差（ピント面＝ページより奥の光はゆっくり、手前の光は速く動く） ----
  float par = u_page / s;
  float tt = u_time;
  float margin = 260.0; // 大きなボケが画面の端でいきなり消えたり現れたりしないだけの余白
  float span = u_view.y + margin * 2.0;
  // スクロール＝カメラを少し傾けながら下へ動かす：傾きの分はどの光も同じだけ、平行移動の分は近い光ほど大きく動く
  float yRaw = a_scatter.y * span - u_scroll * (0.25 + 0.6 * par);
  // 画面の上に出た光は下から戻ってくるが、同じ光がくり返し現れないように、
  // 1 周ごとに横の位置と明るさを変え、ときどき休ませる（最初の 1 周だけは元のまま）
  float cycle = floor(yRaw / span);
  float y = yRaw - cycle * span - margin;
  float fresh = step(0.5, abs(cycle));
  float h1 = fract(sin(a_seed.y * 91.7 + cycle * 13.13) * 43758.5453);
  float h2 = fract(sin(a_seed.x * 47.3 + cycle * 7.77) * 24634.6345);
  float h3 = fract(sin(a_seed.w * 19.1 + cycle * 3.33) * 35791.2468);
  float sx = mix(a_scatter.x, h1, fresh);
  float rest = fresh * step(h2, mix(0.3, 0.55, fore));
  // カメラのわずかな揺れ：ピント面は動かず、奥の光は逆向きに、手前の光は同じ向きに大きく動く
  vec2 sway = u_sway * (par - 1.0);
  // 光そのものの揺れ（木に掛けた電球が風に揺れるように）。揺れ幅も周期も光ごとにばらばら
  vec3 fr = (0.025 + a_drift.xyz * 0.07) * TAU;
  vec2 jitter = vec2(
    sin(tt * fr.x + a_seed.y * 40.0) + 0.6 * sin(tt * fr.y * 1.7 + a_seed.x * 31.0) + 0.3 * sin(tt * fr.z * 2.9 + a_seed.w * 19.0),
    cos(tt * fr.y + a_seed.w * 37.0) + 0.6 * cos(tt * fr.z * 1.3 + a_seed.y * 23.0) + 0.3 * cos(tt * fr.x * 2.3 + a_seed.x * 11.0)
  ) * mix(8.0, 26.0, fract(a_seed.y * 3.71));
  vec2 scattered = vec2(sx * u_view.x, y) + sway + jitter;
  vec2 pos = mix(origin, scattered, e);

  // ---- 明るさ：光の強さ L が、ボケの面積に広がる（像の明るさ E ∝ L / c²） ----
  float L = exp((mix(a_seed.w, h3, fresh) - 0.5) * 1.1);
  // 瞬き：多くの光はわずかに、2 割の光はときどききらっと
  float tw = 0.5 + 0.5 * sin(tt * (0.35 + a_drift.w * 0.9) + a_seed.y * 50.0);
  L *= step(0.8, fract(a_seed.y * 7.31)) > 0.5 ? 0.55 + 0.45 * tw * tw * tw : 0.88 + 0.12 * tw;
  float cpx = max(coc, 2.0);
  float E = L * pow(u_cref / max(cpx, 0.12 * u_cref), 2.0);
  // 露出：明るい光は頭打ちになる
  float expo = 0.9 * (1.0 - exp(-mix(0.6, 0.7, u_dark) * E));

  // ---- 色：散らばるにつれて鮮やかに。暗い色は明るさを持ち上げて光らせ、とても明るい光は白飛びに近づく ----
  float l = dot(base, vec3(0.299, 0.587, 0.114));
  vec3 vivid = clamp(mix(vec3(l), base, 1.8), 0.0, 1.0);
  float peak = max(vivid.r, max(vivid.g, vivid.b));
  vec3 lit = vivid / max(0.35, peak);
  lit = mix(lit, vec3(1.0), 0.12 * u_dark);
  v_color = mix(base, mix(vivid, lit, 0.55 + 0.45 * u_dark), e);
  v_color = mix(v_color, vec3(1.0), u_dark * smoothstep(3.0, 12.0, E) * 0.2 * e);

  // ---- 濃さ ----
  // 残す粒だけが最後まで見える。色の薄い粒（灰色）は控えめに（昼は白地で濁って、夜は白い玉ばかり目立つため）
  float chroma = max(base.r, max(base.g, base.b)) - min(base.r, min(base.g, base.b));
  float shown = a_score < u_keep ? expo * mix(mix(0.4, 0.65, u_dark), 1.0, smoothstep(0.06, 0.25, chroma)) : 0.0;
  // 写真からボケへ：ピントがずれても光の量は増えない。画素の光は、広がった面積のぶん薄くなる（エネルギー保存）。
  // そのうち光源になる粒だけが、だんだん電球の明るさになる（そうしないと、何千もの画素が重なって白飛びする）
  float grow = mix(u_size, max(coc, 2.0), e);
  float conserve = min(1.0, pow(u_size / grow, 2.0) * 1.15);
  // 広がるほど粒どうしが重なるので、描く粒を間引き、その分だけ濃くする（見え方は同じまま、描く量を一定に抑える）
  float q = clamp(pow(2.2 * u_size / grow, 2.0), 0.05, 1.0);
  float pick = fract(a_seed.x * 71.3 + a_seed.z * 13.7);
  float thin = a_score < u_keep ? 1.0 : clamp((q - pick) / (0.2 * q), 0.0, 1.0) / q;
  v_alpha = smoothstep(0.0, 0.1, u_s) * mix(min(1.0, conserve * thin), shown, smoothstep(0.25, 0.9, e)) * u_gain;
  v_alpha *= 1.0 - rest * e;
  // 読み込み中：光がばらばらの時間に点灯する
  float ap = clamp((u_appear - a_drift.w * 1.15 - a_seed.y * 0.2) / 0.6, 0.0, 1.0);
  v_alpha *= ap * ap * (3.0 - 2.0 * ap);
  // 文字の後ろは控えめに
  float inX = smoothstep(u_calm.x - 80.0, u_calm.x + 20.0, pos.x) * (1.0 - smoothstep(u_calm.z - 20.0, u_calm.z + 80.0, pos.x));
  float inY = smoothstep(u_calm.y - 80.0, u_calm.y + 20.0, pos.y) * (1.0 - smoothstep(u_calm.w - 20.0, u_calm.w + 80.0, pos.y));
  v_alpha *= 1.0 - 0.7 * inX * inY * e;

  // ---- 形 ----
  // にじみ：収差と回折による一定の幅（＋前ボケは縁がやわらかい）。速いスクロールでは、手前の光ほどぶれる
  float speed = min(1.0, abs(u_vel));
  float sig = 0.12 * pxmm + fore * 0.05 * cpx + speed * abs(par - 1.0) * 6.0;
  // 写真の状態（e = 0）では、区画の大きさのくっきりした点
  float diam = mix(u_size, cpx, e);
  float sg = mix(0.5, sig, e);
  // 描く四角：ボケの円＋にじみ＋（夜の）光のにじみの分。端末の上限を超えるときは、形を保ったまま縮める
  float total = diam * (1.0 + 0.3 * e) + 6.0 * sg;
  float k = min(1.0, u_maxSize / total);
  float size = total * k;
  v_R = diam * k / size;
  v_sig = sg * k / (size * 0.5);
  // 口径食：画面の中心から離れるほど、中心側へずらしたもう一つの円と重なる部分だけが写る
  vec2 fromC = (pos - u_view * 0.5) / (0.5 * length(u_view));
  v_cat = -fromC * 0.42 * v_R * e;
  // 球面収差
  v_rim = mix(0.16, -0.3, fore) * e;
  // 明るい光のまわりの淡いにじみ（夜だけ）
  v_bloom = u_dark * smoothstep(1.5, 8.0, E) * 0.22 * e;

  vec2 clip = pos / u_view * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = v_alpha > 0.003 ? size * u_dpr : 0.0;
}
`;

const FRAG = `
precision mediump float;
varying vec3 v_color;
varying float v_alpha;
varying float v_R;
varying float v_sig;
varying vec2 v_cat;
varying float v_rim;
varying float v_bloom;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = length(q);
  if (d > 1.0) discard;
  // 絞りの像（円）を、収差と回折のにじみでぼかしたもの
  float w = 1.7 * v_sig;
  float disc = 1.0 - smoothstep(v_R - w, v_R + w, d);
  // 口径食：もう一つの円と重なる部分だけ（画面の端でレモン形に）
  disc *= 1.0 - smoothstep(v_R - w, v_R + w, length(q - v_cat));
  // 球面収差：奥のボケは縁が明るく、手前のボケは中心が明るい
  float a = disc * (1.0 + v_rim * (smoothstep(0.0, v_R, d) * 2.0 - 1.0));
  // 明るい光のまわりの淡いにじみ
  a = max(a, v_bloom * pow(1.0 - d, 2.0));
  a *= v_alpha;
  gl_FragColor = vec4(v_color * a, a);
}
`;

/** 1 粒のデータ：uv(2) + 写真の色(3) + 散らばったときの色(3) + 散らばる位置(2) + seed(4) + drift(4) + 順位(1) */
const STRIDE = 19;
/** 散らばったときに見える粒の数 */
const KEEP = { desktop: 45, mobile: 24 };
/**
 * カメラとレンズ。SEL50F18F（50 mm F1.8）を開放で、最短撮影距離 45 cm にピントを合わせたとき。
 * センサーはフルサイズ（長辺 36 mm）で、画面の長辺に写る。
 * 値を変えるとボケ全体が変わる（F 値を大きくすると小さく、ピントを遠くにすると小さくなる）
 */
const LENS = { focal: 50, fNumber: 1.8, focus: 450, sensor: 36 };
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
  /** 点灯してから、ピントが遠く（30 m）から手前（45 cm）へ送られる時間 */
  focusFrom: 150,
  focusTo: 1550,
  focusStart: 30000,
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
  let intro: null | { t0: number; ready: boolean; at: number } = root.classList.contains('is-loading')
    ? { t0: performance.now(), ready: false, at: 0 }
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
    far: gl.getAttribLocation(program, 'a_far'),
    scatter: gl.getAttribLocation(program, 'a_scatter'),
    seed: gl.getAttribLocation(program, 'a_seed'),
    drift: gl.getAttribLocation(program, 'a_drift'),
    score: gl.getAttribLocation(program, 'a_score'),
  };
  Object.values(attr).forEach((a) => gl.enableVertexAttribArray(a));
  const uni = Object.fromEntries(
    [
      'u_view', 'u_rect', 'u_s', 'u_keep', 'u_size', 'u_dpr', 'u_time', 'u_scroll', 'u_vel', 'u_maxSize', 'u_dark',
      'u_calm', 'u_appear', 'u_free', 'u_gain', 'u_lens', 'u_page', 'u_cref', 'u_sway',
    ].map((n) => [n, gl.getUniformLocation(program, n)]),
  ) as Record<string, WebGLUniformLocation | null>;

  // ---- 散らばったときに見える粒（順位 0〜44）の動き方と色。読み込み中から最後まで同じものを使う ----
  const CROWD = KEEP.desktop;
  const crowd = new Float32Array(CROWD * 10); // 散らばる位置(2) + seed(4) + drift(4)
  for (let i = 0; i < crowd.length; i++) crowd[i] = Math.random();
  // 色：登録してあるすべての写真から、写真ごとに順番に選んだ色（src/lib/photos.ts の getDotColors）
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
  let frames = 0;
  let raf = 0;
  let dpr = 1;
  let lastY = window.scrollY;
  /** なめらかにしたスクロール量（ホイールの 1 段ごとの飛びを、ばねのように追いかける） */
  let smoothY = Math.max(0, window.scrollY);
  let startY = 0;
  let spanS = 1;
  let measured = false;
  let lastT = performance.now();
  let lastFrame = lastT;
  let vel = 0;
  /** 漂う動きの時計（タブが裏にある間などの長い空白は飛ばす） */
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
          // 散らばったときに見える粒は、読み込み中の粒の動き方と色を引き継ぐ
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
      startY = Math.max(0, top + y - vh);
      spanS = vh * 0.75;
      // 描くときは、なめらかにしたスクロール量で進める（frame）。ここでは準備の判断だけ、実際のスクロール量で行う
      const now = Math.max(clamp01((y - startY) / spanS), introS);
      if (!measured) {
        measured = true;
        smoothY = y;
        scrollS = clamp01((y - startY) / spanS);
      }

      // 化け始める瞬間に、用意したドットが今見えている写真と同じか確かめる
      // （列が横に動いている途中で準備した場合などは作り直す）
      if (state === 'ready' && now > 0 && !checked && !intro) {
        checked = true;
        if (!sameSet(wanted())) state = 'idle';
      }
      if (now === 0) checked = false;
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
    gl!.vertexAttribPointer(attr.far, 3, gl!.FLOAT, false, b, 20);
    gl!.vertexAttribPointer(attr.scatter, 2, gl!.FLOAT, false, b, 32);
    gl!.vertexAttribPointer(attr.seed, 4, gl!.FLOAT, false, b, 40);
    gl!.vertexAttribPointer(attr.drift, 4, gl!.FLOAT, false, b, 56);
    gl!.vertexAttribPointer(attr.score, 1, gl!.FLOAT, false, b, 72);
  }

  function frame(now: number) {
    raf = 0;
    const dt = now - lastFrame;
    lastFrame = now;
    clock += Math.min(dt, 50) / 1000;
    stepIntro(now);
    // ホイールの 1 段ごとの飛びをなめらかに。大きく飛んだとき（ページ内リンクなど）は追いかけずに合わせる
    const sy = Math.max(0, window.scrollY);
    if (Math.abs(sy - smoothY) > window.innerHeight * 1.5) smoothY = sy;
    smoothY += (sy - smoothY) * (1 - Math.exp(-Math.min(dt, 100) / 110));
    if (Math.abs(sy - smoothY) < 0.3) smoothY = sy;
    const settling = smoothY !== sy;
    if (target) scrollS = clamp01((smoothY - startY) / spanS);
    s = Math.max(scrollS, introS);

    // 化け始める直前（写真がまだほとんど見えている間）は、用意したドットが今見えている写真と同じかを確かめ続ける。
    // 横並びの列はスクロールに少し遅れて動くので、速くスクロールすると、画面の外の写真を用意してしまうことがある
    if (state === 'ready' && !intro && target && s > 0 && s < 0.12 && ++frames % 6 === 0 && !sameSet(wanted())) {
      state = 'idle';
      update();
    }
    const useLayers = state === 'ready' && layers.length > 0;
    setDissolve(useLayers ? Math.min(1, s / 0.12) : -1);

    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    const drawAmbient = !useLayers && !!intro;
    if (s <= 0 || (!useLayers && !drawAmbient)) {
      if (settling) kick();
      return;
    }

    const vw = canvas.clientWidth;
    const vh = canvas.clientHeight;
    const mobile = vw < 640;
    gl!.uniform2f(uni.u_view, vw, vh);
    gl!.uniform1f(uni.u_keep, mobile ? KEEP.mobile : KEEP.desktop);
    gl!.uniform1f(uni.u_dpr, dpr);
    gl!.uniform1f(uni.u_maxSize, maxPointSize / dpr);
    gl!.uniform1f(uni.u_appear, intro ? (now - intro.t0) / 1000 : 1e3);

    // レンズ：画面の長辺にフルサイズのセンサーの長辺（36 mm）が写る
    const pxmm = Math.max(vw, vh) / LENS.sensor;
    // 読み込み中は、ピントを遠く（30 m）から手前（45 cm）へ送る。ピントリングの動きに合わせて、距離の逆数で補間する
    let sf = LENS.focus;
    if (intro) {
      const x = clamp01((now - intro.t0 - INTRO.focusFrom) / (INTRO.focusTo - INTRO.focusFrom));
      const p = x * x * (3 - 2 * x);
      sf = 1 / (1 / INTRO.focusStart + (1 / LENS.focus - 1 / INTRO.focusStart) * p);
    }
    gl!.uniform4f(uni.u_lens, LENS.focal, LENS.fNumber, sf, pxmm);
    gl!.uniform1f(uni.u_page, LENS.focus);
    gl!.uniform1f(uni.u_cref, ((LENS.focal * LENS.focal) / (LENS.fNumber * (LENS.focus - LENS.focal))) * pxmm);
    // カメラのわずかな揺れ（周期の違う揺れを重ねて、規則的に見えないように）
    gl!.uniform2f(
      uni.u_sway,
      36 * (Math.sin(clock * 0.11) + 0.6 * Math.sin(clock * 0.067 + 1.3) + 0.35 * Math.sin(clock * 0.23 + 4.1)),
      26 * (Math.cos(clock * 0.09 + 0.7) + 0.6 * Math.cos(clock * 0.053 + 2.2) + 0.35 * Math.cos(clock * 0.19 + 5.3)),
    );

    // 夜は光が重なるほど明るくなる（加算）。昼はふつうに重ねる
    const dark = root.dataset.theme === 'dark';
    gl!.uniform1f(uni.u_dark, dark ? 1 : 0);
    gl!.blendFunc(gl!.ONE, dark ? gl!.ONE : gl!.ONE_MINUS_SRC_ALPHA);
    const calm = currentCalm();
    gl!.uniform4f(uni.u_calm, calm?.left ?? -1e4, calm?.top ?? -1e4, calm?.right ?? -1e4, calm?.bottom ?? -1e4);
    gl!.uniform1f(uni.u_time, clock);

    // スクロールの速さ（px/ms をなめらかにして -1.5〜1.5 程度に）
    vel += ((smoothY - lastY) / Math.max(1, now - lastT) - vel) * 0.08;
    lastY = smoothY;
    lastT = now;
    gl!.uniform1f(uni.u_scroll, smoothY);
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
