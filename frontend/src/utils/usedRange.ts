import type { IWorkbookData, IStyleData } from '@univerjs/core'

/** 使用区域（0 起始，含端点）。 */
export interface UsedRange {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

/**
 * 计算工作表「使用区域」（类似 Excel 的 UsedRange）：
 * 包含有内容、有样式（边框/填充/加粗/颜色等）、或属于合并单元格的区域。
 * 仅取第一张 sheet。
 */
export function computeUsedRange(snapshot: IWorkbookData): UsedRange {
  const sheetId = snapshot.sheetOrder?.[0]
  const sheet = sheetId ? snapshot.sheets?.[sheetId] : undefined
  if (!sheet) return { startRow: 0, startCol: 0, endRow: 0, endCol: 0 }

  const cellData = (sheet.cellData ?? {}) as Record<
    string,
    Record<string, { v?: unknown; s?: unknown }>
  >
  const styles = (snapshot.styles ?? {}) as Record<string, IStyleData | null | undefined>

  const hasStyle = (s: unknown): boolean => {
    if (!s) return false
    if (typeof s === 'string') return !!styles[s]
    if (typeof s === 'object') return Object.keys(s).length > 0
    return false
  }

  let minRow = Infinity
  let minCol = Infinity
  let maxRow = -1
  let maxCol = -1
  const mark = (r: number, c: number) => {
    if (r < minRow) minRow = r
    if (c < minCol) minCol = c
    if (r > maxRow) maxRow = r
    if (c > maxCol) maxCol = c
  }

  for (const rStr of Object.keys(cellData)) {
    const r = Number(rStr)
    const rowCells = cellData[rStr]
    if (!rowCells) continue
    for (const cStr of Object.keys(rowCells)) {
      const cell = rowCells[cStr]
      if (!cell) continue
      const v = cell.v
      const hasValue = v !== undefined && v !== null && v !== ''
      if (hasValue || hasStyle(cell.s)) mark(r, Number(cStr))
    }
  }

  for (const m of sheet.mergeData ?? []) {
    for (let r = m.startRow; r <= m.endRow; r++) {
      for (let c = m.startColumn; c <= m.endColumn; c++) mark(r, c)
    }
  }

  if (maxRow < 0) return { startRow: 0, startCol: 0, endRow: 0, endCol: 0 }
  return { startRow: minRow, startCol: minCol, endRow: maxRow, endCol: maxCol }
}
