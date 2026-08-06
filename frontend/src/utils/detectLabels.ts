import type { IWorkbookData } from '@univerjs/core'

export interface LabelGuess {
  rowLabelCols: number
  colLabelRows: number
  contentRows: number
  contentCols: number
}

interface StyleInfo {
  bl?: boolean | number
  bg?: unknown
  bd?: unknown
}

/**
 * 从工作簿快照中「自动识别」标签区与内容区。
 *
 * 假设：管理员画的模板中，标签区（左侧行标签列 + 上方列标签行）有内容，
 * 而待填写的内容区在模板阶段通常为空。据此识别 L 形标签区：
 *   - rowLabelCols：从第 1 列起，某列在「第 2 行及以后」存在非空单元格，则它是行标签列；
 *   - colLabelRows：从第 1 行起，某行在「行标签列之后」存在非空单元格，则它是列标签行。
 *
 * 内容区行/列数：以「被使用的区域」为界（含内容或边框样式的最大行列范围），
 * 减去标签区后即内容区尺寸；若管理员未给内容区加边框/样式，则无法识别（返回 0，
 * 需手动填写）。
 */
export function detectLabels(snapshot: IWorkbookData): LabelGuess {
  const sheetId = snapshot.sheetOrder?.[0]
  if (!sheetId) {
    return { rowLabelCols: 0, colLabelRows: 0, contentRows: 0, contentCols: 0 }
  }
  const sheet = snapshot.sheets?.[sheetId]
  if (!sheet) {
    return { rowLabelCols: 0, colLabelRows: 0, contentRows: 0, contentCols: 0 }
  }

  const cellData = (sheet.cellData ?? {}) as Record<
    string,
    Record<string, { v?: unknown; s?: string }>
  >
  const mergeData = (sheet.mergeData ?? []) as Array<{
    startRow: number
    endRow: number
    startColumn: number
    endColumn: number
  }>
  const styles = (snapshot.styles ?? {}) as Record<string, StyleInfo>

  const nonEmpty = (row: number, col: number): boolean => {
    const cell = cellData[String(row)]?.[String(col)]
    if (cell == null) {
      return false
    }
    const v = cell.v
    return v !== undefined && v !== null && v !== ''
  }

  // 单元格是否「被使用」：有内容、有边框/填充样式、或属于合并单元格
  const used = new Set<string>()
  for (const m of mergeData) {
    for (let r = m.startRow; r <= m.endRow; r++) {
      for (let c = m.startColumn; c <= m.endColumn; c++) {
        used.add(`${r},${c}`)
      }
    }
  }
  const isUsed = (row: number, col: number): boolean => {
    if (used.has(`${row},${col}`)) {
      return true
    }
    if (nonEmpty(row, col)) {
      return true
    }
    const s = cellData[String(row)]?.[String(col)]?.s
    const st = s ? styles[s] : undefined
    return !!st && (st.bd != null || st.bg != null || st.bl === 1 || st.bl === true)
  }

  const maxRows = Math.min(sheet.rowCount ?? 100, 100)
  const maxCols = Math.min(sheet.columnCount ?? 50, 50)

  // 行标签列数：从第 1 列起，逐列检查是否存在「第 2 行及以后」的非空单元格
  let rowLabelCols = 0
  for (let col = 0; col < maxCols; col++) {
    let hasBelow = false
    for (let row = 1; row < maxRows; row++) {
      if (nonEmpty(row, col)) {
        hasBelow = true
        break
      }
    }
    if (hasBelow) {
      rowLabelCols++
    } else {
      break
    }
  }

  // 列标签行数：从第 1 行起，逐行检查「行标签列之后」是否存在非空单元格
  let colLabelRows = 0
  for (let row = 0; row < maxRows; row++) {
    let hasRight = false
    for (let col = rowLabelCols; col < maxCols; col++) {
      if (nonEmpty(row, col)) {
        hasRight = true
        break
      }
    }
    if (hasRight) {
      colLabelRows++
    } else {
      break
    }
  }

  // 被使用区域的最大行列，用于估算内容区尺寸
  let usedMaxRow = colLabelRows - 1
  let usedMaxCol = rowLabelCols - 1
  for (let r = 0; r < maxRows; r++) {
    for (let c = 0; c < maxCols; c++) {
      if (isUsed(r, c)) {
        usedMaxRow = Math.max(usedMaxRow, r)
        usedMaxCol = Math.max(usedMaxCol, c)
      }
    }
  }
  const contentRows = Math.max(0, usedMaxRow + 1 - colLabelRows)
  const contentCols = Math.max(0, usedMaxCol + 1 - rowLabelCols)

  return { rowLabelCols, colLabelRows, contentRows, contentCols }
}