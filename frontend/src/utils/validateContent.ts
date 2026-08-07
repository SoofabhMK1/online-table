import type { TemplateLabelConfig } from '../api/admin'

export interface CellCoordinate {
  row: number
  col: number
  label: string
}

function isNumeric(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return false
  }
  if (typeof value === 'number') {
    return true
  }
  if (typeof value === 'string') {
    const stripped = value.trim()
    if (!stripped) {
      return true
    }
    return /^-?\d{1,3}(,\d{3})+(\.\d+)?$|^-?\d+(\.\d+)?$/.test(stripped)
  }
  return false
}

function colToLetter(col: number): string {
  let letters = ''
  let n = col + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

/**
 * 校验内容区矩形内非空单元格是否均为数字（仅当 contentNumeric 开启时）。
 * 返回非法单元格坐标列表；为空表示校验通过。
 */
export function validateContentNumeric(
  snapshot: Record<string, unknown>,
  labels: TemplateLabelConfig,
): CellCoordinate[] {
  if (!labels.contentNumeric || labels.contentRows <= 0 || labels.contentCols <= 0) {
    return []
  }
  const invalid: CellCoordinate[] = []
  const sheets = (snapshot.sheets ?? {}) as Record<string, { cellData?: Record<string, Record<string, { v?: unknown }>> }>
  for (const sheet of Object.values(sheets)) {
    const cellData = sheet?.cellData ?? {}
    for (let row = labels.colLabelRows; row < labels.colLabelRows + labels.contentRows; row++) {
      for (let col = labels.rowLabelCols; col < labels.rowLabelCols + labels.contentCols; col++) {
        const cell = cellData[String(row)]?.[String(col)]
        if (cell && cell.v !== undefined && cell.v !== null && cell.v !== '') {
          if (!isNumeric(cell.v)) {
            invalid.push({ row, col, label: `${colToLetter(col)}${row + 1}` })
          }
        }
      }
    }
  }
  return invalid
}
