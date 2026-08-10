import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  App,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CopyOutlined,
  DownloadOutlined,
  InboxOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import type { IWorkbookData } from '@univerjs/core'
import UniverSheet, { type UniverSheetHandle } from '../../components/UniverSheet'
import {
  createTemplate,
  duplicateTemplate,
  fetchTemplateDetail,
  updateTemplate,
  type TemplateLabelConfig,
} from '../../api/admin'
import type { TemplateItem } from '../../api/types'
import { snapshotToXlsx, xlsxToSnapshot } from '../../utils/excelBridge'
import { computeUsedRange, type UsedRange } from '../../utils/usedRange'
import { formatCell, formatRange, parseCellRef } from '../../utils/cellRef'
import { useTemplatesStore } from '../../store/useTemplatesStore'
import PageHeader from '../../components/layout/PageHeader'
import EmptyState from '../../components/feedback/EmptyState'

interface TemplateFormValues {
  name: string
  year: number
  contentNumeric: boolean
}

interface DerivedLabels {
  rowLabelCols: number
  colLabelRows: number
  contentRows: number
  contentCols: number
  rowLabelRange: string | null
  colLabelRange: string | null
  dataRange: string
}

function deriveLabels(
  start: { row: number; col: number } | null,
  used: UsedRange | null,
): DerivedLabels | null {
  if (!start || !used) return null
  const rowLabelCols = start.col
  const colLabelRows = start.row
  const contentRows = Math.max(0, used.endRow - start.row + 1)
  const contentCols = Math.max(0, used.endCol - start.col + 1)
  const rowLabelRange =
    rowLabelCols > 0
      ? formatRange(start.row, 0, used.endRow, start.col - 1)
      : null
  const colLabelRange =
    colLabelRows > 0
      ? formatRange(0, 0, start.row - 1, used.endCol)
      : null
  const dataRange = formatRange(start.row, start.col, used.endRow, used.endCol)
  return {
    rowLabelCols,
    colLabelRows,
    contentRows,
    contentCols,
    rowLabelRange,
    colLabelRange,
    dataRange,
  }
}

export default function TemplatesPage() {
  const { message } = App.useApp()
  const templates = useTemplatesStore((s) => s.templates)
  const loading = useTemplatesStore((s) => s.loading)
  const fetchActive = useTemplatesStore((s) => s.fetchActive)
  const archive = useTemplatesStore((s) => s.archive)
  const [archivingId, setArchivingId] = useState<number | null>(null)
  const [exportingId, setExportingId] = useState<number | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [sheetMounted, setSheetMounted] = useState(false)
  const [initialSnapshot, setInitialSnapshot] = useState<
    IWorkbookData | undefined
  >(undefined)
  const [saving, setSaving] = useState(false)
  const [dataStartCell, setDataStartCell] = useState('')
  const [usedRange, setUsedRange] = useState<UsedRange | null>(null)
  const sheetRef = useRef<UniverSheetHandle>(null)
  const [form] = Form.useForm<TemplateFormValues>()
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    void fetchActive()
  }, [fetchActive])

  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [duplicateTargetId, setDuplicateTargetId] = useState<number | null>(
    null,
  )
  const [duplicateYear, setDuplicateYear] = useState(
    new Date().getFullYear() + 1,
  )
  const [duplicateCopyBindings, setDuplicateCopyBindings] = useState(true)
  const [duplicating, setDuplicating] = useState(false)

  const openCreate = () => {
    setEditingId(null)
    setInitialSnapshot(undefined)
    setDataStartCell('')
    setUsedRange(null)
    form.setFieldsValue({
      name: '',
      year: new Date().getFullYear(),
      contentNumeric: false,
    })
    setModalOpen(true)
  }

  const handleImportFile = async (file: File) => {
    setImporting(true)
    try {
      const buffer = await file.arrayBuffer()
      const snapshot = await xlsxToSnapshot(buffer)
      setEditingId(null)
      setInitialSnapshot(snapshot)
      setDataStartCell('')
      setUsedRange(computeUsedRange(snapshot))
      form.setFieldsValue({
        name: '',
        year: new Date().getFullYear(),
        contentNumeric: false,
      })
      setModalOpen(true)
      message.success(`已导入「${file.name}」，请填写数据区域起始单元格后保存`)
    } catch {
      message.error('导入 Excel 失败，请确认文件为有效的 .xlsx 模板')
    } finally {
      setImporting(false)
    }
  }

  const handleExportTemplate = useCallback(
    async (template: TemplateItem) => {
      setExportingId(template.id)
      try {
        const detail = await fetchTemplateDetail(template.id)
        await snapshotToXlsx(
          detail.snapshot as unknown as IWorkbookData,
          `${template.name}.xlsx`,
        )
        message.success(`已导出「${template.name}.xlsx」`)
      } catch {
        message.error('导出模板失败')
      } finally {
        setExportingId(null)
      }
    },
    [message],
  )

  const handleArchiveTemplate = useCallback(
    async (template: TemplateItem) => {
      setArchivingId(template.id)
      try {
        await archive(template.id)
        message.success(`模板「${template.name}」已归档`)
      } catch {
        message.error('归档失败')
      } finally {
        setArchivingId(null)
      }
    },
    [archive, message],
  )

  const openEdit = useCallback(
    async (template: TemplateItem) => {
      try {
        const detail = await fetchTemplateDetail(template.id)
        const snapshot = detail.snapshot as unknown as IWorkbookData
        setEditingId(template.id)
        setInitialSnapshot(snapshot)
        setDataStartCell(
          formatCell(detail.col_label_rows, detail.row_label_cols),
        )
        setUsedRange(computeUsedRange(snapshot))
        form.setFieldsValue({
          name: detail.name,
          year: detail.year,
          contentNumeric: detail.content_numeric,
        })
        setModalOpen(true)
      } catch {
        message.error('加载模板详情失败')
      }
    },
    [form, message],
  )

  const refreshUsedRange = (notify: boolean) => {
    const snapshot = sheetRef.current?.getWorkbookData() ?? initialSnapshot
    if (!snapshot) return
    const used = computeUsedRange(snapshot)
    setUsedRange(used)
    if (notify) {
      message.info(
        `检测到使用区域：${formatRange(used.startRow, used.startCol, used.endRow, used.endCol)}`,
      )
    }
  }

  const handleSaveTemplate = async () => {
    setSaving(true)
    try {
      const values = await form.validateFields()
      const snapshot = sheetRef.current?.getWorkbookData()
      if (!snapshot) {
        message.error('未获取到表格内容，请稍候再试')
        return
      }
      const start = parseCellRef(dataStartCell)
      if (!start) {
        message.error('请输入数据区域起始单元格，格式如 B3（大小写均可）')
        return
      }
      const used = computeUsedRange(snapshot)
      const derived = deriveLabels(start, used)
      if (!derived) {
        message.error('无法推算标签区与内容区，请检查起始单元格')
        return
      }
      const labels: TemplateLabelConfig = {
        rowLabelCols: derived.rowLabelCols,
        colLabelRows: derived.colLabelRows,
        contentRows: derived.contentRows,
        contentCols: derived.contentCols,
        contentNumeric: values.contentNumeric ?? false,
      }
      if (labels.contentRows <= 0 || labels.contentCols <= 0) {
        message.warning(
          '数据区域为空（起始单元格超出使用区域），用户将无法填写任何单元格，请确认',
        )
      }
      if (editingId === null) {
        await createTemplate(
          values.name,
          values.year,
          snapshot as unknown as Record<string, unknown>,
          labels,
        )
        message.success('模板创建成功')
      } else {
        await updateTemplate(
          editingId,
          values.name,
          values.year,
          snapshot as unknown as Record<string, unknown>,
          labels,
        )
        message.success('模板已更新')
      }
      setModalOpen(false)
      await fetchActive()
    } catch (error) {
      const detail = (
        error as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail
      message.error(detail ?? '保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const derived = useMemo(
    () => deriveLabels(parseCellRef(dataStartCell), usedRange),
    [dataStartCell, usedRange],
  )

  const openDuplicate = (template: TemplateItem) => {
    setDuplicateTargetId(template.id)
    setDuplicateYear(new Date().getFullYear() + 1)
    setDuplicateCopyBindings(true)
    setDuplicateOpen(true)
  }

  const handleDuplicate = async () => {
    if (duplicateTargetId == null) return
    setDuplicating(true)
    try {
      const detail = await duplicateTemplate(duplicateTargetId, {
        year: duplicateYear,
        copy_bindings: duplicateCopyBindings,
      })
      message.success(`已复制为「${detail.name}」`)
      setDuplicateOpen(false)
      await fetchActive()
    } catch {
      message.error('复制模板失败，请重试')
    } finally {
      setDuplicating(false)
    }
  }

  const columns: TableColumnsType<TemplateItem> = useMemo(
    () => [
      {
        title: 'ID',
        dataIndex: 'id',
        width: 70,
        render: (v: number) => (
          <span className="ot-mono" style={{ color: 'var(--ot-color-text-tertiary)' }}>
            #{v}
          </span>
        ),
      },
      {
        title: '模板名称',
        dataIndex: 'name',
        render: (v: string, r) => (
          <div>
            <div style={{ fontWeight: 500 }}>{v}</div>
            {r.content_numeric && (
              <Tag
                color="gold"
                style={{ marginTop: 4, fontSize: 11, padding: '0 6px' }}
              >
                仅数字
              </Tag>
            )}
          </div>
        ),
      },
      {
        title: '年份',
        dataIndex: 'year',
        width: 80,
        render: (v: number) => (
          <Tag style={{ borderRadius: 6, fontVariantNumeric: 'tabular-nums' }}>
            {v}
          </Tag>
        ),
      },
      {
        title: '区域',
        width: 140,
        render: (_, r) => (
          <span className="ot-mono" style={{ fontSize: 12, color: 'var(--ot-color-text-secondary)' }}>
            {r.col_label_rows > 0 || r.row_label_cols > 0
              ? `标签 ${r.row_label_cols}/${r.col_label_rows}`
              : '—'}
          </span>
        ),
      },
      {
        title: '操作',
        width: 320,
        render: (_, record) => (
          <Space size={0} wrap>
            <Button type="link" size="small" onClick={() => void openEdit(record)}>
              编辑
            </Button>
            <Button
              type="link"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => openDuplicate(record)}
            >
              复制
            </Button>
            <Button
              type="link"
              size="small"
              icon={<DownloadOutlined />}
              loading={exportingId === record.id}
              onClick={() => void handleExportTemplate(record)}
            >
              导出
            </Button>
            <Popconfirm
              title={`确认归档模板「${record.name}」？`}
              description="归档后将从工作台、填报总览与绑定列表中隐藏（历史填报数据保留），可在「归档模板」中恢复。"
              onConfirm={() => void handleArchiveTemplate(record)}
            >
              <Button
                type="link"
                size="small"
                danger
                icon={<InboxOutlined />}
                loading={archivingId === record.id}
              >
                归档
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [archivingId, exportingId, openEdit, handleExportTemplate, handleArchiveTemplate],
  )

  return (
    <div className="ot-fade-in">
      <PageHeader
        eyebrow="管理中心"
        title="模板管理"
        description="新建 / 编辑 Excel 模板，指定「数据区域起始单元格」自动推算标签区与内容区。"
        actions={
          <Space wrap>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openCreate}
            >
              新建模板
            </Button>
            <Upload
              accept=".xlsx,.xls"
              showUploadList={false}
              customRequest={({ file }) => {
                if (file instanceof File) {
                  void handleImportFile(file)
                }
              }}
            >
              <Button icon={<UploadOutlined />} loading={importing}>
                导入模板
              </Button>
            </Upload>
          </Space>
        }
      />

      <Card
          styles={{ body: { padding: 0 } }}
          style={{ borderRadius: 12 }}
      >
        {templates.length === 0 && !loading ? (
          <EmptyState
            variant="templates"
            title="还没有模板"
            description="先新建一个模板，或导入现成的 Excel（仅取第一张工作表，自动处理合并单元格与样式）"
            action={
              <Space>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  新建模板
                </Button>
                <Upload
                  accept=".xlsx,.xls"
                  showUploadList={false}
                  customRequest={({ file }) => {
                    if (file instanceof File) {
                      void handleImportFile(file)
                    }
                  }}
                >
                  <Button icon={<UploadOutlined />}>导入 Excel</Button>
                </Upload>
              </Space>
            }
          />
        ) : (
          <Table<TemplateItem>
            rowKey="id"
            columns={columns}
            dataSource={templates}
            loading={loading}
            pagination={false}
            className="ot-cv-auto"
          />
        )}
      </Card>

      <Modal
        title={editingId === null ? '新建模板' : '编辑模板'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        afterOpenChange={(open) => setSheetMounted(open)}
        width={1000}
        forceRender
        footer={[
          <Button key="cancel" onClick={() => setModalOpen(false)}>
            取消
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={saving}
            onClick={() => void handleSaveTemplate()}
          >
            保存
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Space align="end" wrap>
            <Form.Item
              name="name"
              label="模板名称"
              rules={[{ required: true, message: '请输入模板名称' }]}
            >
              <Input id="name" placeholder="例如：费用报销表" style={{ width: 240 }} />
            </Form.Item>
            <Form.Item
              name="year"
              label="填报年份"
              tooltip="不同年份可使用不同的模板；部门在填报时只会看到该年份的模板。"
              rules={[{ required: true, message: '请输入年份' }]}
            >
              <InputNumber min={2000} max={2100} style={{ width: 110 }} />
            </Form.Item>
          </Space>
          <Space align="end" wrap>
            <Form.Item label="数据区域起始单元格">
              <Space.Compact>
                <Input
                  value={dataStartCell}
                  onChange={(e) => setDataStartCell(e.target.value)}
                  placeholder="如：B3"
                  style={{ width: 160 }}
                  onPressEnter={() => refreshUsedRange(true)}
                />
                <Button
                  icon={<ThunderboltOutlined />}
                  onClick={() => refreshUsedRange(true)}
                >
                  检测使用区域
                </Button>
              </Space.Compact>
            </Form.Item>
            <Form.Item
              name="contentNumeric"
              label="内容区仅允许数字"
              valuePropName="checked"
              tooltip="开启后，部门提交填报时内容区的非空单元格必须为数字，否则会被拦截。"
            >
              <Switch />
            </Form.Item>
          </Space>
          <Card
            size="small"
            styles={{ body: { padding: 16 } }}
            style={{
              marginBottom: 8,
              background: 'var(--ot-color-bg)',
              borderColor: 'var(--ot-color-border)',
            }}
          >
            <Space orientation="vertical" size={4}>
              <Typography.Text>
                使用区域：
                {usedRange
                  ? formatRange(
                      usedRange.startRow,
                      usedRange.startCol,
                      usedRange.endRow,
                      usedRange.endCol,
                    )
                  : '（点击「检测使用区域」从表格内容计算）'}
              </Typography.Text>
              <Typography.Text>
                行标签范围：
                {derived?.rowLabelRange ? (
                  <Tag style={{ marginLeft: 4 }}>{derived.rowLabelRange}</Tag>
                ) : (
                  <Typography.Text type="secondary">无</Typography.Text>
                )}
                　列标签范围：
                {derived?.colLabelRange ? (
                  <Tag style={{ marginLeft: 4 }}>{derived.colLabelRange}</Tag>
                ) : (
                  <Typography.Text type="secondary">无</Typography.Text>
                )}
              </Typography.Text>
              <Typography.Text>
                数据区域（用户可填写）：
                {derived ? (
                  <Tag color="blue" style={{ marginLeft: 4 }}>
                    {derived.dataRange}
                  </Tag>
                ) : (
                  '（请先填写起始单元格）'
                )}
              </Typography.Text>
            </Space>
          </Card>
          <Typography.Text
            type="secondary"
            style={{ display: 'block', marginBottom: 8 }}
          >
            系统会根据「使用区域」与数据区域起始单元格自动推算：起始单元格左侧为行标签、上方为列标签、右下为内容区（内容区之外一律只读）。
          </Typography.Text>
        </Form>
        <div style={{ height: '50vh' }}>
          {sheetMounted && (
            <UniverSheet
              ref={sheetRef}
              initialSnapshot={initialSnapshot}
              onReady={() => refreshUsedRange(false)}
            />
          )}
        </div>
      </Modal>

      <Modal
        title="复制模板"
        open={duplicateOpen}
        onCancel={() => setDuplicateOpen(false)}
        onOk={() => void handleDuplicate()}
        confirmLoading={duplicating}
        okText="复制"
        cancelText="取消"
      >
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <Space>
            <Typography.Text>目标年份：</Typography.Text>
            <InputNumber
              min={2000}
              max={2100}
              value={duplicateYear}
              onChange={(v) => setDuplicateYear(v ?? new Date().getFullYear() + 1)}
              style={{ width: 120 }}
            />
          </Space>
          <Checkbox
            checked={duplicateCopyBindings}
            onChange={(e) => setDuplicateCopyBindings(e.target.checked)}
          >
            同时复制到角色的模板绑定（新模板直接对所有已绑定部门可见）
          </Checkbox>
          <Typography.Text type="secondary">
            将复制当前模板的结构与内容区配置到指定年份，可用于「不同年份不同模板」的跨年复用。
          </Typography.Text>
        </Space>
      </Modal>
    </div>
  )
}
