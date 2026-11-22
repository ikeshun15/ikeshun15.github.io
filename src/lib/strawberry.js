// G = 葉, R = 実, . = 空き（種の部分）
const PATTERN = [
  '..G.G..',
  '.GGGGG.',
  'RRRGRRR',
  'RR.RR.R',
  'RRRRRRR',
  '.R.RRR.',
  '.RRR.R.',
  '..RRR..',
  '...R...',
];

export function strawberryDots() {
  /** @type {{ x: number; y: number; leaf: boolean }[]} */
  const dots = [];
  PATTERN.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === 'G' || c === 'R') dots.push({ x, y, leaf: c === 'G' });
    }),
  );
  return { cols: PATTERN[0].length, rows: PATTERN.length, dots };
}
