/** 5×7 のドットフォント。必要な文字だけ定義している（追加する場合はここに足す） */
/** @type {Record<string, string[]>} */
export const FONT = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
};

export const GLYPH_W = 5;
export const GLYPH_H = 7;
export const GLYPH_GAP = 1;
export const LINE_GAP = 2;

/**
 * 文字列をドット座標に展開する。
 * 戻り値の key は "col,row"、値は 1（通常）または 2（アクセント）
 * @param {string[]} lines
 * @param {number} [accentFrom]
 */
export function layoutText(lines, accentFrom = -1) {
  const lineCols = lines.map((l) => l.length * (GLYPH_W + GLYPH_GAP) - GLYPH_GAP);
  const cols = Math.max(...lineCols);
  const rows = lines.length * GLYPH_H + (lines.length - 1) * LINE_GAP;
  /** @type {Map<string, number>} */
  const cells = new Map();
  let charIndex = 0;
  lines.forEach((line, li) => {
    const off = Math.floor((cols - lineCols[li]) / 2);
    [...line].forEach((ch, ci) => {
      const glyph = FONT[ch.toUpperCase()];
      const k = accentFrom >= 0 && charIndex >= accentFrom ? 2 : 1;
      glyph?.forEach((row, ry) =>
        [...row].forEach((c, rx) => {
          if (c === '#') cells.set(`${off + ci * (GLYPH_W + GLYPH_GAP) + rx},${li * (GLYPH_H + LINE_GAP) + ry}`, k);
        }),
      );
      charIndex++;
    });
  });
  return { cols, rows, cells };
}
