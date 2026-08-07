import {
  LocaleType,
  type ICellData,
  type IStyleData,
  type IWorkbookData,
  type IWorksheetData,
} from '@univerjs/core'
import ExcelJS from 'exceljs'

// ---------- 枚举映射 ----------

/** Excel 边框样式名 → Univer BorderStyleTypes 数值。 */
const EXCEL_TO_UNIVER_BORDER: Record<string, number> = {
  thin: 1,
  hair: 2,
  dotted: 3,
  dashed: 4,
  dashDot: 5,
  dashDotDot: 6,
  double: 7,
  medium: 8,
  mediumDashed: 9,
  mediumDashDot: 10,
  mediumDashDotDot: 11,
  slantDashDot: 12,
  thick: 13,
}
const UNIVER_TO_EXCEL_BORDER: Record<number, string> = Object.fromEntries(
  Object.entries(EXCEL_TO_UNIVER_BORDER).map(([k, v]) => [v, k]),
)

/** Univer 边框键（t/b/l/r）与 Excel 边框键（top/bottom/left/right）的对应顺序。 */
const UNIVER_SIDES = ['t', 'b', 'l', 'r'] as const
const EXCEL_SIDES = ['top', 'bottom', 'left', 'right'] as const

const EXCEL_TO_UNIVER_H: Record<string, number | undefined> = {
  left: 1,
  center: 2,
  right: 3,
  justify: 4,
}
const UNIVER_TO_EXCEL_H: Record<number, string | undefined> = {
  1: 'left',
  2: 'center',
  3: 'right',
  4: 'justify',
}
const EXCEL_TO_UNIVER_V: Record<string, number | undefined> = {
  top: 1,
  middle: 2,
  bottom: 3,
}
const UNIVER_TO_EXCEL_V: Record<number, string | undefined> = {
  1: 'top',
  2: 'middle',
  3: 'bottom',
}

// ---------- 颜色 ----------

/** Excel argb（FFRRGGBB 或 RRGGBB）→ Univer '#rrggbb'。 */
function toUniverColor(argb: string | undefined): string | undefined {
  if (!argb) return undefined
  let s = argb.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{8}$/.test(s)) s = s.slice(2)
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`
  return undefined
}

/** Univer 颜色（#rrggbb 或 rgb()）→ Excel argb 'FFRRGGBB'。 */
function toExcelArgb(rgb: string): string | undefined {
  if (!rgb) return undefined
  const hex = rgb.trim().match(/^#([0-9a-fA-F]{6})$/)
  if (hex && hex[1]) return `FF${hex[1].toUpperCase()}`
  const css = rgb.trim().match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/)
  if (css && css[1] && css[2] && css[3]) {
    const hexPart = [css[1], css[2], css[3]]
      .map((c) => Number(c).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
    return `FF${hexPart}`
  }
  return undefined
}

// ---------- 样式：Excel 单元格 → Univer ----------

function cellStyleToUniver(cell: ExcelJS.Cell): IStyleData | undefined {
  const out: IStyleData = {}

  const font = cell.font
  if (font) {
    if (font.bold) out.bl = 1
    if (font.italic) out.it = 1
    if (font.size) out.fs = font.size
    if (font.name) out.ff = font.name
    const rgb = toUniverColor(font.color?.argb)
    if (rgb) out.cl = { rgb }
  }
  const fill = cell.fill
  if (fill && fill.type === 'pattern' && fill.pattern === 'solid') {
    const rgb = toUniverColor(fill.fgColor?.argb ?? fill.bgColor?.argb)
    if (rgb) out.bg = { rgb }
  }
  const border = cell.border
  if (border) {
    const bd: NonNullable<IStyleData['bd']> = {}
    for (let i = 0; i < UNIVER_SIDES.length; i++) {
      const side = UNIVER_SIDES[i]
      const excelSide = EXCEL_SIDES[i]
      const b = side && excelSide ? border[excelSide] : undefined
      if (b && b.style) {
        const s = EXCEL_TO_UNIVER_BORDER[b.style]
        if (s !== undefined && side) {
          const rgb = toUniverColor(b.color?.argb)
          bd[side] = { s, cl: { rgb } }
        }
      }
    }
    if (Object.keys(bd).length > 0) out.bd = bd
  }
  const alignment = cell.alignment
  if (alignment) {
    if (alignment.horizontal) {
      const ht = EXCEL_TO_UNIVER_H[alignment.horizontal]
      if (ht !== undefined) out.ht = ht
    }
    if (alignment.vertical) {
      const vt = EXCEL_TO_UNIVER_V[alignment.vertical]
      if (vt !== undefined) out.vt = vt
    }
    if (alignment.wrapText) out.tb = 3 // WrapStrategy.WRAP
  }
  if (cell.numFmt) out.n = { pattern: cell.numFmt }

  return Object.keys(out).length > 0 ? out : undefined
}

// ---------- 样式：Univer → Excel 单元格 ----------

function applyUniverStyle(cell: ExcelJS.Cell, us: IStyleData | undefined): void {
  if (!us) return

  if (us.bl || us.it || us.fs || us.ff || us.cl?.rgb) {
    const font: Partial<ExcelJS.Font> = {}
    if (us.ff) font.name = us.ff
    if (us.fs) font.size = us.fs
    if (us.bl) font.bold = true
    if (us.it) font.italic = true
    if (us.cl?.rgb) {
      const argb = toExcelArgb(us.cl.rgb)
      if (argb) font.color = { argb }
    }
    cell.font = font as ExcelJS.Font
  }
  if (us.bg?.rgb) {
    const argb = toExcelArgb(us.bg.rgb)
    if (argb) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
  }
  if (us.bd) {
    const border: Partial<Record<'top' | 'bottom' | 'left' | 'right', ExcelJS.Border>> = {}
    for (let i = 0; i < UNIVER_SIDES.length; i++) {
      const side = UNIVER_SIDES[i]
      const b = side ? us.bd[side] : undefined
      if (b && b.s) {
        const style = UNIVER_TO_EXCEL_BORDER[b.s]
        if (style) {
          const argb = b.cl?.rgb ? toExcelArgb(b.cl.rgb) : undefined
          const excelSide = EXCEL_SIDES[i]
          if (excelSide) {
            border[excelSide] = {
              style: style as ExcelJS.BorderStyle,
              color: argb ? { argb } : {},
            }
          }
        }
      }
    }
    if (Object.keys(border).length > 0) cell.border = border as ExcelJS.Borders
  }
  if (us.ht != null || us.vt != null || us.tb === 3) {
    const alignment: Partial<ExcelJS.Alignment> = {}
    if (us.ht != null) {
      const horizontal = UNIVER_TO_EXCEL_H[us.ht]
      if (horizontal) alignment.horizontal = horizontal as ExcelJS.Alignment['horizontal']
    }
    if (us.vt != null) {
      const vertical = UNIVER_TO_EXCEL_V[us.vt]
      if (vertical) alignment.vertical = vertical as ExcelJS.Alignment['vertical']
    }
    if (us.tb === 3) alignment.wrapText = true
    if (Object.keys(alignment).length > 0) cell.alignment = alignment
  }
  if (us.n?.pattern) cell.numFmt = us.n.pattern
}

// ---------- 值转换 ----------

function parseAddress(addr: string): { row: number; col: number } {
  const m = addr.match(/^([A-Za-z]+)(\d+)$/)
  if (!m || !m[1] || !m[2]) return { row: 0, col: 0 }
  let col = 0
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { row: Number(m[2]) - 1, col: col - 1 }
}

/** 将 exceljs 合并单元格条目（范围字符串如 "A1:B1"，或 {top,left,bottom,right}）解码为 0 起始 IRange。 */
function decodeMerge(entry: string | { top: number; left: number; bottom: number; right: number }): {
  startRow: number
  startColumn: number
  endRow: number
  endColumn: number
} {
  if (typeof entry === 'string') {
    const [start, end] = entry.split(':')
    if (!start) return { startRow: 0, startColumn: 0, endRow: 0, endColumn: 0 }
    const s = parseAddress(start)
    const e = end ? parseAddress(end) : s
    return { startRow: s.row, startColumn: s.col, endRow: e.row, endColumn: e.col }
  }
  if (entry.top != null && entry.left != null && entry.bottom != null && entry.right != null) {
    return {
      startRow: entry.top - 1,
      startColumn: entry.left - 1,
      endRow: entry.bottom - 1,
      endColumn: entry.right - 1,
    }
  }
  return { startRow: 0, startColumn: 0, endRow: 0, endColumn: 0 }
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}/${m}/${day}`
}

function excelValueToUniver(val: unknown): { v: string | number | boolean; t: number } | null {
  if (val === null || val === undefined) return null
  if (val instanceof Date) return { v: formatDate(val), t: 1 }
  if (typeof val === 'number') return { v: val, t: 2 }
  if (typeof val === 'boolean') return { v: val, t: 3 }
  if (typeof val === 'string') return { v: val, t: 1 }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>
    if (Array.isArray(obj.richText)) {
      return {
        v: (obj.richText as Array<{ text?: string }>).map((r) => r.text ?? '').join(''),
        t: 1,
      }
    }
    if ('formula' in obj) {
      const result = obj.result
      if (result instanceof Date) return { v: formatDate(result), t: 1 }
      if (typeof result === 'number') return { v: result, t: 2 }
      return { v: result != null ? String(result) : '', t: 1 }
    }
    if ('error' in obj) return { v: String(obj.error ?? ''), t: 1 }
    if ('text' in obj) return { v: String(obj.text ?? ''), t: 1 }
    return { v: String(val), t: 1 }
  }
  return { v: String(val), t: 1 }
}

// ---------- 导入：.xlsx → Univer 快照 ----------

/**
 * 读取 Excel 文件（ArrayBuffer）并转换为 Univer 工作簿快照。
 * - 只取第一张 sheet；
 * - 合并单元格转换为 `mergeData`（合并区只保留左上角格值）；
 * - 保留基本样式（字体/边框/填充/对齐/数字格式）与列宽/行高。
 */
export async function xlsxToSnapshot(arrayBuffer: ArrayBuffer): Promise<IWorkbookData> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(arrayBuffer)
  const sheet = wb.worksheets[0]
  if (!sheet) {
    throw new Error('Excel 文件中没有工作表')
  }

  const styles: Record<string, IStyleData> = {}
  const styleByJson = new Map<string, string>()
  let styleCounter = 0
  const internStyle = (us: IStyleData | undefined): string | undefined => {
    if (!us) return undefined
    const key = JSON.stringify(us)
    const existing = styleByJson.get(key)
    if (existing) return existing
    const id = String(styleCounter++)
    styles[id] = us
    styleByJson.set(key, id)
    return id
  }

  const cellData: Record<string, Record<string, ICellData>> = {}
  let maxRow = 0
  let maxCol = 0
  sheet.eachRow((row, rowNumber) => {
    const r = rowNumber - 1
    row.eachCell((cell, colNumber) => {
      const c = colNumber - 1
      const converted = excelValueToUniver(cell.value)
      if (!converted) return
      const entry: ICellData = { v: converted.v, t: converted.t }
      const styleId = internStyle(cellStyleToUniver(cell))
      if (styleId !== undefined) entry.s = styleId
      const rowKey = String(r)
      const colKey = String(c)
      cellData[rowKey] = cellData[rowKey] ?? {}
      cellData[rowKey]![colKey] = entry
      maxRow = Math.max(maxRow, r)
      maxCol = Math.max(maxCol, c)
    })
  })

  const mergeData = (sheet.model.merges ?? []).map(decodeMerge)

  const columnData: Record<string, { w?: number }> = {}
  sheet.columns.forEach((col, idx) => {
    if (col && col.width != null && col.width > 0) {
      columnData[String(idx)] = { w: Math.round(col.width * 7 + 5) }
    }
  })

  const rowData: Record<string, { h?: number }> = {}
  sheet.eachRow((row, rowNumber) => {
    if (row.height != null && row.height > 0) {
      rowData[String(rowNumber - 1)] = { h: Math.round(row.height * (96 / 72)) }
    }
  })

  const rowCount = maxRow + 1 + 10
  const columnCount = maxCol + 1 + 5
  const sheetId = 'sheet1'
  const sheetName = sheet.name || 'Sheet1'

  const worksheet: Partial<IWorksheetData> = {
    id: sheetId,
    name: sheetName,
    rowCount,
    columnCount,
    cellData,
    mergeData,
    rowData,
    columnData,
  }

  return {
    id: `wb_${Date.now()}`,
    appVersion: '0.25.1',
    locale: LocaleType.ZH_CN,
    name: sheetName,
    styles,
    sheetOrder: [sheetId],
    sheets: { [sheetId]: worksheet },
  }
}

// ---------- 导出：Univer 快照 → .xlsx ----------

function resolveStyle(styles: Record<string, unknown>, s: unknown): IStyleData | undefined {
  if (!s) return undefined
  if (typeof s === 'string') {
    const value = styles[s]
    return value && typeof value === 'object' ? (value as IStyleData) : undefined
  }
  if (typeof s === 'object') return s as IStyleData
  return undefined
}

async function buildWorkbook(snapshot: IWorkbookData): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  const styles = snapshot.styles ?? {}
  const sheets = snapshot.sheets ?? {}
  const sheetOrder = snapshot.sheetOrder ?? Object.keys(sheets)
  const sheetIds = sheetOrder.length > 0 ? sheetOrder : Object.keys(sheets)

  for (const sheetId of sheetIds) {
    const sheet = sheets[sheetId]
    if (!sheet) continue
    const ws = wb.addWorksheet(sheet.name || 'Sheet1')

    const cellData = (sheet.cellData ?? {}) as Record<string, Record<string, ICellData>>

    // 先合并，避免合并区非左上角单元格写入值。
    for (const m of sheet.mergeData ?? []) {
      ws.mergeCells(m.startRow + 1, m.startColumn + 1, m.endRow + 1, m.endColumn + 1)
    }

    const mergedCells = new Set<string>()
    for (const m of sheet.mergeData ?? []) {
      for (let r = m.startRow; r <= m.endRow; r++) {
        for (let c = m.startColumn; c <= m.endColumn; c++) {
          if (r !== m.startRow || c !== m.startColumn) mergedCells.add(`${r},${c}`)
        }
      }
    }

    for (const rStr of Object.keys(cellData)) {
      const r = Number(rStr)
      const rowCells = cellData[rStr]
      if (!rowCells) continue
      for (const cStr of Object.keys(rowCells)) {
        const c = Number(cStr)
        if (mergedCells.has(`${r},${c}`)) continue
        const entry = rowCells[cStr]
        if (!entry) continue
        const v = entry.v
        if (v === undefined || v === null || v === '') continue
        const cell = ws.getCell(r + 1, c + 1)
        cell.value = v
        applyUniverStyle(cell, resolveStyle(styles, entry.s))
      }
    }

    for (const [idx, col] of Object.entries(sheet.columnData ?? {})) {
      if (col && col.w != null && col.w > 0) {
        const target = ws.getColumn(Number(idx) + 1)
        target.width = Math.max(1, Math.round(col.w / 7))
      }
    }
    for (const [idx, row] of Object.entries(sheet.rowData ?? {})) {
      if (row && row.h != null && row.h > 0) {
        ws.getRow(Number(idx) + 1).height = row.h * (72 / 96)
      }
    }
  }

  return wb
}

/** 将 Univer 工作簿快照转换为 .xlsx 文件字节（ArrayBuffer），用于下载/保存。 */
export async function snapshotToXlsxBuffer(snapshot: IWorkbookData): Promise<ArrayBuffer> {
  const wb = await buildWorkbook(snapshot)
  const buf = await wb.xlsx.writeBuffer()
  if (buf instanceof ArrayBuffer) return buf
  return (buf as Uint8Array).buffer.slice(
    (buf as Uint8Array).byteOffset,
    (buf as Uint8Array).byteOffset + (buf as Uint8Array).byteLength,
  ) as ArrayBuffer
}

/** 触发浏览器下载一个 ArrayBuffer 文件。 */
export function downloadArrayBuffer(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** 将 Univer 快照导出为 .xlsx 并直接触发浏览器下载。 */
export async function snapshotToXlsx(snapshot: IWorkbookData, filename: string): Promise<void> {
  const buffer = await snapshotToXlsxBuffer(snapshot)
  downloadArrayBuffer(buffer, filename)
}
