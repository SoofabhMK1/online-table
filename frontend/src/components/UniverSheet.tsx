import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import {
  LocaleType,
  Univer,
  UniverInstanceType,
  type IWorkbookData,
} from '@univerjs/core'
import { FUniver } from '@univerjs/core/facade'
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core'
import { SheetInterceptorService, VALIDATE_CELL } from '@univerjs/sheets'
import '@univerjs/preset-sheets-core/lib/index.css'
import '@univerjs/design/lib/index.css'
import '@univerjs/ui/lib/index.css'
import '@univerjs/docs-ui/lib/index.css'
import '@univerjs/sheets-ui/lib/index.css'
import '@univerjs/sheets-formula-ui/lib/index.css'
import '@univerjs/sheets-numfmt-ui/lib/index.css'
import { buildLocales } from './univerLocales'

/** 向上级暴露的 UniverSheet 句柄。 */
export interface UniverSheetHandle {
  /** 获取当前工作簿的最新 Snapshot。 */
  getWorkbookData: () => IWorkbookData
}

/** 标签与内容区配置。 */
export interface ProtectedLabels {
  /** 行标签占用的左侧列数 */
  rowLabelCols: number
  /** 列标签占用的上方行数 */
  colLabelRows: number
  /** 内容区行数（从 colLabelRows 行起） */
  contentRows: number
  /** 内容区列数（从 rowLabelCols 列起） */
  contentCols: number
}

interface UniverSheetProps {
  /** 初始工作簿快照；为空时创建一个空白工作簿。 */
  initialSnapshot?: IWorkbookData
  /** 标签保护配置；提供后，标签区单元格对当前用户只读（供用户填报场景使用）。 */
  protectedLabels?: ProtectedLabels
  /** Univer 实例就绪回调。 */
  onReady?: () => void
}

/** 生成一个默认的空白工作簿快照。 */
function createBlankWorkbookData(): IWorkbookData {
  return {
    id: `wb_${Date.now()}`,
    appVersion: '0.25.1',
    locale: LocaleType.ZH_CN,
    name: '未命名表格',
    styles: {},
    sheetOrder: ['sheet1'],
    sheets: {
      sheet1: {
        id: 'sheet1',
        name: 'Sheet1',
        rowCount: 100,
        columnCount: 20,
        cellData: {},
      },
    },
  }
}

/**
 * 封装 Univer 表格编辑器。
 * - 使用官方 UniverSheetsCorePreset 预设完成插件装配。
 * - 挂载时在 useEffect 中初始化 Univer 实例，卸载时调用 univer.dispose() 销毁。
 * - 通过 useImperativeHandle 向上级暴露 getWorkbookData()。
 */
const UniverSheet = forwardRef<UniverSheetHandle, UniverSheetProps>(
  function UniverSheet({ initialSnapshot, protectedLabels, onReady }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const univerRef = useRef<Univer | null>(null)
    const apiRef = useRef<FUniver | null>(null)

    useImperativeHandle(ref, () => ({
      getWorkbookData: () => {
        const api = apiRef.current
        if (!api) {
          throw new Error('Univer 尚未初始化')
        }
        const workbook = api.getActiveWorkbook()
        if (!workbook) {
          throw new Error('没有活动的工作簿')
        }
        return workbook.save()
      },
    }))

    useEffect(() => {
      const container = containerRef.current
      if (!container) {
        return
      }

      const univer = new Univer({
        locale: LocaleType.ZH_CN,
        locales: buildLocales(LocaleType.ZH_CN),
      })
      const preset = UniverSheetsCorePreset({ container })
      for (const plugin of preset.plugins) {
        if (Array.isArray(plugin)) {
          const [ctor, options] = plugin
          univer.registerPlugin(ctor, options)
        } else {
          univer.registerPlugin(plugin)
        }
      }

      const api = FUniver.newAPI(univer)
      univerRef.current = univer
      apiRef.current = api

      const snapshot = initialSnapshot ?? createBlankWorkbookData()
      univer.createUnit(UniverInstanceType.UNIVER_SHEET, snapshot)

      // 内容区与标签保护：仅内容区（矩形）可编辑，其余全部只读。
      // 内容区 = 行 [colLabelRows, colLabelRows+contentRows) × 列 [rowLabelCols, rowLabelCols+contentCols)
      // 若未配置内容区尺寸（contentRows/Cols 均为 0），则退化为仅锁定标签区。
      const disposables: Array<() => void> = []
      if (protectedLabels && (protectedLabels.rowLabelCols > 0 || protectedLabels.colLabelRows > 0)) {
        const { rowLabelCols, colLabelRows, contentRows, contentCols } = protectedLabels
        const hasContentArea = contentRows > 0 && contentCols > 0
        const interceptorService = univer.__getInjector().get(SheetInterceptorService)
        const disposable = interceptorService.writeCellInterceptor.intercept(VALIDATE_CELL, {
          priority: 99,
          handler: (value, context) => {
            const { row, col } = context
            let editable: boolean
            if (hasContentArea) {
              editable =
                row >= colLabelRows &&
                row < colLabelRows + contentRows &&
                col >= rowLabelCols &&
                col < rowLabelCols + contentCols
            } else {
              editable = !(col < rowLabelCols || row < colLabelRows)
            }
            return editable ? (value ?? Promise.resolve(true)) : Promise.resolve(false)
          },
        })
        disposables.push(disposable)
      }

      onReady?.()

      // 卸载时销毁实例，防止内存泄漏。
      // 必须将 univer.dispose() 延后到 React 提交阶段之后执行：
      // Univer 会把内部 React root 渲染到容器中，若在 React 卸载/提交阶段同步
      // 调用 dispose()，会触发 React 19 的
      // "Attempted to synchronously unmount a root while React was already rendering"
      // 警告。延后执行后，Univer 内部 root 的卸载发生在 React 渲染之外，无此问题。
      // （另：本项目已移除 StrictMode，避免双挂载复用同一容器时 dispose 清空新实例。）
      return () => {
        disposables.forEach((d) => d())
        const instance = univer
        setTimeout(() => {
          instance.dispose()
        }, 0)
        univerRef.current = null
        apiRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    )
  },
)

export default UniverSheet