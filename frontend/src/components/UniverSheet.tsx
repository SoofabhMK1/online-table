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
  /** 获取当前工作簿的最新 Snapshot；未就绪时返回 null（不抛错，便于上层兜底）。 */
  getWorkbookData: () => IWorkbookData | null
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
  /** 整表只读：拦截所有单元格写入（用于已提交/已通过后的只读展示与管理员预览）。 */
  readOnly?: boolean
  /** 禁止工作表级别操作（新建/删除/重命名/移动/隐藏/复制工作表），用于普通用户填报视图。 */
  disableSheetOps?: boolean
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
/** 禁止工作表级别的结构操作：通过工作簿权限点关闭 新建/删除/重命名/移动/隐藏/复制。 */
async function blockSheetOperations(api: FUniver) {
  const workbook = api.getActiveWorkbook()
  if (!workbook) {
    return
  }
  const permission = workbook.getWorkbookPermission()
  if (!permission) {
    return
  }
  type Point = Parameters<typeof permission.setPoint>[0]
  const deny = (point: Point) => permission.setPoint(point, false).catch(() => {})
  await Promise.all([
    deny('WorkbookCreateSheet' as Point),
    deny('WorkbookDeleteSheet' as Point),
    deny('WorkbookRenameSheet' as Point),
    deny('WorkbookMoveSheet' as Point),
    deny('WorkbookHideSheet' as Point),
    deny('WorkbookCopySheet' as Point),
  ])
}

const UniverSheet = forwardRef<UniverSheetHandle, UniverSheetProps>(
  function UniverSheet({ initialSnapshot, protectedLabels, readOnly, disableSheetOps, onReady }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const univerRef = useRef<Univer | null>(null)
    const apiRef = useRef<FUniver | null>(null)

    useImperativeHandle<UniverSheetHandle, UniverSheetHandle>(
      ref,
      () => ({
        getWorkbookData: (): IWorkbookData | null => {
          const api = apiRef.current
          if (!api) {
            return null
          }
          const workbook = api.getActiveWorkbook()
          if (!workbook) {
            return null
          }
          return workbook.save() as IWorkbookData
        },
      }),
      [],
    )

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

      // 关闭工作表级操作（仅在 mount 时调用一次即可，权限点设入后无副作用）
      if (readOnly || disableSheetOps) {
        blockSheetOperations(api)
      }

      onReady?.()

      // 卸载时销毁实例：必须延后到 React 提交阶段之后执行（Univer 内部 root 同步
      // dispose 会触发 React 19 的 "Attempted to synchronously unmount a root" 警告）。
      return () => {
        const instance = univer
        setTimeout(() => {
          instance.dispose()
        }, 0)
        univerRef.current = null
        apiRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // 标签保护 / readOnly 拦截器：随 readOnly / protectedLabels 变化重注册。
    // 让父组件只需通过 prop 切换 readOnly 即可即时生效，无需更换 key 重新挂载整个
    // Univer 实例（大表时可显著减少白屏与状态丢失）。
    useEffect(() => {
      const univer = univerRef.current
      if (!univer) {
        return
      }
      const needsGuard =
        readOnly ||
        (protectedLabels != null &&
          (protectedLabels.rowLabelCols > 0 || protectedLabels.colLabelRows > 0))
      if (!needsGuard) {
        return
      }
      const { rowLabelCols, colLabelRows, contentRows, contentCols } = protectedLabels ?? {
        rowLabelCols: 0,
        colLabelRows: 0,
        contentRows: 0,
        contentCols: 0,
      }
      const hasContentArea = contentRows > 0 && contentCols > 0
      const interceptorService = univer.__getInjector().get(SheetInterceptorService)
      const disposable = interceptorService.writeCellInterceptor.intercept(VALIDATE_CELL, {
        priority: 99,
        handler: (value, context) => {
          if (readOnly) {
            return Promise.resolve(false)
          }
          const { row, col } = context
          const editable = hasContentArea
            ? row >= colLabelRows &&
              row < colLabelRows + contentRows &&
              col >= rowLabelCols &&
              col < rowLabelCols + contentCols
            : !(col < rowLabelCols || row < colLabelRows)
          return editable ? (value ?? Promise.resolve(true)) : Promise.resolve(false)
        },
      })
      return () => {
        disposable()
      }
    }, [readOnly, protectedLabels])

    return (
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    )
  },
)

export default UniverSheet