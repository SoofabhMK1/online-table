/** 0 起始的单元格行列引用。 */
export interface CellRef {
  row: number
  col: number
}

/**
 * 解析 Excel 单元格引用（大小写不敏感，可带空白），如 "B3" → { row: 2, col: 1 }。
 * 非法格式返回 null。
 */
export function parseCellRef(ref: string): CellRef | null {
  const m = ref.trim().match(/^([A-Za-z]+)(\d+)$/)
  if (!m) return null
  let col = 0
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { row: Number(m[2]) - 1, col: col - 1 }
}

/** 0 起始列号 → Excel 列字母（0 → A）。 */
export function colToLetter(col: number): string {
  let letters = ''
  let n = col + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

/** 0 起始行/列 → Excel 单元格引用（如 {row:2, col:1} → "B3"）。 */
export function formatCell(row: number, col: number): string {
  return `${colToLetter(col)}${row + 1}`
}

/** 0 起始矩形 → Excel 范围字符串（如 "A1:Q289"；单格返回 "A1"）。 */
export function formatRange(startRow: number, startCol: number, endRow: number, endCol: number): string {
  const start = formatCell(startRow, startCol)
  if (startRow === endRow && startCol === endCol) return start
  return `${start}:${formatCell(endRow, endCol)}`
}
