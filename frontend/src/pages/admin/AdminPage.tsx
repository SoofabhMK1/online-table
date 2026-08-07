import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Key,
} from 'react'
import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Layout,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Transfer,
  Typography,
  Upload,
  message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  UndoOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { IWorkbookData } from '@univerjs/core'
import UniverSheet, { type UniverSheetHandle } from '../../components/UniverSheet'
import ChangePasswordModal from '../../components/ChangePasswordModal'
import OrgManager from '../../components/OrgManager'
import { parseCellRef, formatCell, formatRange } from '../../utils/cellRef'
import { computeUsedRange, type UsedRange } from '../../utils/usedRange'
import { snapshotToXlsx, xlsxToSnapshot } from '../../utils/excelBridge'
import { useAuthStore } from '../../store/useAuthStore'
import {
  archiveTemplate,
  bindRoleTemplates,
  createRole,
  createTemplate,
  deleteRole,
  duplicateTemplate,
  fetchAdminWorkbookDetail,
  fetchFillingOverview,
  fetchOrgTree,
  fetchPeriods,
  fetchRoleTemplates,
  fetchRoles,
  fetchTemplateDetail,
  fetchTemplates,
  resetRolePassword,
  reviewWorkbook,
  unarchiveTemplate,
  updateRole,
  updateTemplate,
  upsertPeriod,
} from '../../api/admin'
import type {
  AdminBindingStatus,
  AdminWorkbookDetail,
  FillingPeriodItem,
  OrgTree,
  RoleItem,
  TemplateItem,
  WorkbookStatus,
} from '../../api/types'
import {
  currentPeriod,
  dayjsToPeriod,
  periodToDayjs,
  STATUS_META,
  STATUS_ORDER,
} from '../../utils/workbookStatus'

const { Header, Content } = Layout

interface TemplateFormValues {
  name: string
  year: number
  contentNumeric: boolean
}

interface RoleFormValues {
  name: string
  segmentId?: number
  entityId?: number
  departmentId?: number
  tagId?: number
}

/** 根据数据区域起始单元格与使用区域，推算行标签/列标签/内容区。 */
function deriveLabels(
  start: { row: number; col: number } | null,
  used: UsedRange | null,
): {
  rowLabelCols: number
  colLabelRows: number
  contentRows: number
  contentCols: number
  rowLabelRange: string | null
  colLabelRange: string | null
  dataRange: string
} | null {
  if (!start || !used) return null
  const rowLabelCols = start.col
  const colLabelRows = start.row
  const contentRows = Math.max(0, used.endRow - start.row + 1)
  const contentCols = Math.max(0, used.endCol - start.col + 1)
  const rowLabelRange =
    rowLabelCols > 0 ? formatRange(start.row, 0, used.endRow, start.col - 1) : null
  const colLabelRange =
    colLabelRows > 0 ? formatRange(0, 0, start.row - 1, used.endCol) : null
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

export default function AdminPage() {
  const navigate = useNavigate()
  const username = useAuthStore((s) => s.username)
  const logout = useAuthStore((s) => s.logout)

  // 模板管理
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [templateLoading, setTemplateLoading] = useState(false)
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

  // 复制模板
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [duplicateTargetId, setDuplicateTargetId] = useState<number | null>(null)
  const [duplicateYear, setDuplicateYear] = useState(new Date().getFullYear() + 1)
  const [duplicateCopyBindings, setDuplicateCopyBindings] = useState(true)
  const [duplicating, setDuplicating] = useState(false)

  // 权限配置
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null)
  const [targetKeys, setTargetKeys] = useState<Key[]>([])
  const [permissionLoading, setPermissionLoading] = useState(false)
  const [orgTree, setOrgTree] = useState<OrgTree>({ segments: [], tags: [] })
  const [orgLoading, setOrgLoading] = useState(false)
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null)
  const [savingRole, setSavingRole] = useState(false)
  const [roleForm] = Form.useForm<RoleFormValues>()
  const watchedSegmentId = Form.useWatch('segmentId', roleForm)
  const watchedEntityId = Form.useWatch('entityId', roleForm)
  const roleEntityOptions = useMemo(
    () =>
      orgTree.segments
        .find((s) => s.id === watchedSegmentId)
        ?.entities.map((e) => ({ value: e.id, label: e.name })) ?? [],
    [orgTree, watchedSegmentId],
  )
  const roleDepartmentOptions = useMemo(
    () =>
      orgTree.segments
        .find((s) => s.id === watchedSegmentId)
        ?.entities.find((e) => e.id === watchedEntityId)
        ?.departments.map((d) => ({ value: d.id, label: d.name })) ?? [],
    [orgTree, watchedSegmentId, watchedEntityId],
  )

  // 修改密码
  const [changePwdOpen, setChangePwdOpen] = useState(false)

  // 填报总览
  const [overviewPeriod, setOverviewPeriod] = useState<string>(currentPeriod())
  const [overview, setOverview] = useState<AdminBindingStatus[]>([])
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewRoleFilter, setOverviewRoleFilter] = useState<number | undefined>(undefined)
  const [overviewStatusFilter, setOverviewStatusFilter] = useState<WorkbookStatus | undefined>(undefined)
  const [overviewTemplateSearch, setOverviewTemplateSearch] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewMounted, setPreviewMounted] = useState(false)
  const [previewCell, setPreviewCell] = useState<AdminBindingStatus | null>(null)
  const [previewDetail, setPreviewDetail] = useState<AdminWorkbookDetail | null>(null)
  const [previewSnapshot, setPreviewSnapshot] = useState<
    IWorkbookData | undefined
  >(undefined)
  const [reviewing, setReviewing] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  // 填报期间锁定
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear())
  const [periods, setPeriods] = useState<FillingPeriodItem[]>([])
  const [periodsLoading, setPeriodsLoading] = useState(false)
  const [periodToggling, setPeriodToggling] = useState<string | null>(null)

  // 模板导入 / 导出 / 归档
  const [importing, setImporting] = useState(false)
  const [archivedTemplates, setArchivedTemplates] = useState<TemplateItem[]>([])
  const [archivedLoading, setArchivedLoading] = useState(false)
  const [archivingId, setArchivingId] = useState<number | null>(null)
  const [exportingId, setExportingId] = useState<number | null>(null)

  const loadTemplates = useCallback(async () => {
    setTemplateLoading(true)
    try {
      setTemplates(await fetchTemplates(false))
    } finally {
      setTemplateLoading(false)
    }
  }, [])

  const loadArchivedTemplates = useCallback(async () => {
    setArchivedLoading(true)
    try {
      setArchivedTemplates(await fetchTemplates(true))
    } finally {
      setArchivedLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  useEffect(() => {
    loadArchivedTemplates()
  }, [loadArchivedTemplates])

  useEffect(() => {
    fetchRoles().then((data) => {
      setRoles(data)
      if (data.length > 0) {
        setSelectedRoleId(data[0].id)
      }
    })
  }, [])

  const loadOrgTree = useCallback(async () => {
    setOrgLoading(true)
    try {
      setOrgTree(await fetchOrgTree())
    } catch {
      message.error('加载组织架构失败')
    } finally {
      setOrgLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOrgTree()
  }, [loadOrgTree])

  useEffect(() => {
    if (selectedRoleId == null) {
      return
    }
    setPermissionLoading(true)
    fetchRoleTemplates(selectedRoleId)
      .then((ids) => setTargetKeys(ids.map(String)))
      .finally(() => setPermissionLoading(false))
  }, [selectedRoleId])

  const loadOverview = useCallback(async (period: string) => {
    setOverviewLoading(true)
    try {
      setOverview(await fetchFillingOverview(period))
    } catch {
      message.error('加载填报总览失败')
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOverview(overviewPeriod)
  }, [loadOverview, overviewPeriod])

  const loadPeriods = useCallback(async (year: number) => {
    setPeriodsLoading(true)
    try {
      setPeriods(await fetchPeriods(year))
    } catch {
      message.error('加载填报期间失败')
    } finally {
      setPeriodsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPeriods(periodYear)
  }, [loadPeriods, periodYear])

  const handleTogglePeriod = async (period: string, locked: boolean) => {
    setPeriodToggling(period)
    try {
      await upsertPeriod(period, locked)
      setPeriods((prev) =>
        prev.map((p) => (p.period === period ? { ...p, locked } : p)),
      )
      message.success(locked ? `已锁定 ${period}` : `已解锁 ${period}`)
    } catch (error) {
      const detail = (
        error as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail
      message.error(detail ?? '操作失败，请重试')
    } finally {
      setPeriodToggling(null)
    }
  }

  const overviewRoleOptions = useMemo(() => {
    const map = new Map<number, string>()
    overview.forEach((o) => map.set(o.role_id, o.role_name))
    return Array.from(map.entries()).map(([id, name]) => ({ value: id, label: name }))
  }, [overview])

  const overviewStatusCounts = useMemo(() => {
    const counts: Record<WorkbookStatus, number> = {
      none: 0,
      draft: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
    }
    overview.forEach((o) => {
      counts[o.status] = (counts[o.status] ?? 0) + 1
    })
    return counts
  }, [overview])

  const filteredOverview = useMemo(() => {
    const keyword = overviewTemplateSearch.trim().toLowerCase()
    return overview.filter((o) => {
      if (overviewRoleFilter !== undefined && o.role_id !== overviewRoleFilter) return false
      if (overviewStatusFilter !== undefined && o.status !== overviewStatusFilter) return false
      if (keyword && !o.template_name.toLowerCase().includes(keyword)) return false
      return true
    })
  }, [overview, overviewRoleFilter, overviewStatusFilter, overviewTemplateSearch])

  const openPreview = async (cell: AdminBindingStatus) => {
    if (cell.status === 'none') {
      return
    }
    try {
      const detail = await fetchAdminWorkbookDetail(
        cell.role_id,
        cell.template_id,
        overviewPeriod,
      )
      setPreviewCell(cell)
      setPreviewDetail(detail)
      setPreviewSnapshot(detail.snapshot as unknown as IWorkbookData)
      setPreviewOpen(true)
    } catch {
      message.error('加载填报数据失败')
    }
  }

  const handleReview = async (action: 'approved' | 'rejected', reason?: string) => {
    if (!previewCell) {
      return
    }
    setReviewing(true)
    try {
      await reviewWorkbook(previewCell.role_id, previewCell.template_id, overviewPeriod, {
        action,
        reject_reason: action === 'rejected' ? reason : undefined,
      })
      message.success(action === 'approved' ? '已审核通过' : '已退回')
      setRejectOpen(false)
      setPreviewOpen(false)
      await loadOverview(overviewPeriod)
    } catch (error) {
      const detail = (
        error as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail
      message.error(detail ?? '审核失败，请重试')
    } finally {
      setReviewing(false)
    }
  }

  const handleLogout = () => {
    logout()
    message.success('已退出登录')
    navigate('/login', { replace: true })
  }

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

  const handleExportTemplate = async (template: TemplateItem) => {
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
  }

  const handleArchiveTemplate = async (template: TemplateItem) => {
    setArchivingId(template.id)
    try {
      await archiveTemplate(template.id)
      message.success(`模板「${template.name}」已归档`)
      await Promise.all([loadTemplates(), loadArchivedTemplates()])
    } catch {
      message.error('归档失败')
    } finally {
      setArchivingId(null)
    }
  }

  const handleUnarchiveTemplate = async (template: TemplateItem) => {
    setArchivingId(template.id)
    try {
      await unarchiveTemplate(template.id)
      message.success(`模板「${template.name}」已恢复`)
      await Promise.all([loadTemplates(), loadArchivedTemplates()])
    } catch {
      message.error('恢复失败')
    } finally {
      setArchivingId(null)
    }
  }

  const openEdit = async (template: TemplateItem) => {
    try {
      const detail = await fetchTemplateDetail(template.id)
      const snapshot = detail.snapshot as unknown as IWorkbookData
      setEditingId(template.id)
      setInitialSnapshot(snapshot)
      setDataStartCell(formatCell(detail.col_label_rows, detail.row_label_cols))
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
  }

  /** 从当前表格内容重新检测「使用区域」。notify=true 时给出提示（点按钮时），挂载自动检测时不提示。 */
  const refreshUsedRange = (notify: boolean) => {
    const snapshot = sheetRef.current?.getWorkbookData() ?? initialSnapshot
    if (!snapshot) {
      return
    }
    const used = computeUsedRange(snapshot)
    setUsedRange(used)
    if (notify) {
      message.info(
        `检测到使用区域：${formatRange(used.startRow, used.startCol, used.endRow, used.endCol)}`,
      )
    }
  }

  const handleSaveTemplate = async () => {
    const values = await form.validateFields()
    const snapshot = sheetRef.current?.getWorkbookData()
    if (!snapshot) {
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
      return
    }
    const labels = {
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
    setSaving(true)
    try {
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
      await loadTemplates()
    } catch {
      message.error('保存失败，请重试')
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
    if (duplicateTargetId == null) {
      return
    }
    setDuplicating(true)
    try {
      const detail = await duplicateTemplate(duplicateTargetId, {
        year: duplicateYear,
        copy_bindings: duplicateCopyBindings,
      })
      message.success(`已复制为「${detail.name}」`)
      setDuplicateOpen(false)
      await loadTemplates()
    } catch {
      message.error('复制模板失败，请重试')
    } finally {
      setDuplicating(false)
    }
  }

  const openCreateRole = async () => {
    await loadOrgTree()
    setEditingRole(null)
    roleForm.resetFields()
    setRoleModalOpen(true)
  }

  const openEditRole = async (role: RoleItem) => {
    await loadOrgTree()
    setEditingRole(role)
    roleForm.setFieldsValue({
      name: role.name,
      segmentId: role.segment_id ?? undefined,
      entityId: role.entity_id ?? undefined,
      departmentId: role.department_id ?? undefined,
      tagId: role.function_tag_id ?? undefined,
    })
    setRoleModalOpen(true)
  }

  const handleRoleFormChange = (changed: Partial<RoleFormValues>) => {
    if ('segmentId' in changed) {
      roleForm.setFieldsValue({ entityId: undefined, departmentId: undefined })
    }
    if ('entityId' in changed) {
      roleForm.setFieldsValue({ departmentId: undefined })
    }
  }

  const handleRoleModalOk = async () => {
    const values = await roleForm.validateFields()
    const payload = {
      name: values.name,
      segment_id: values.segmentId,
      entity_id: values.entityId,
      department_id: values.departmentId,
      function_tag_id: values.tagId,
    }
    setSavingRole(true)
    try {
      if (editingRole) {
        await updateRole(editingRole.id, payload)
        message.success('角色已更新')
      } else {
        await createRole(payload)
        message.success('角色创建成功')
      }
      setRoleModalOpen(false)
      setRoles(await fetchRoles())
    } catch (error) {
      const detail = (
        error as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail
      message.error(detail ?? '保存失败')
    } finally {
      setSavingRole(false)
    }
  }

  const handleDeleteRole = async (roleId: number) => {
    try {
      await deleteRole(roleId)
      message.success('角色已删除')
      const data = await fetchRoles()
      setRoles(data)
      if (selectedRoleId === roleId) {
        setSelectedRoleId(data[0]?.id ?? null)
      }
    } catch {
      message.error('删除失败：该角色下存在用户，无法删除')
    }
  }

  const handleResetPassword = async (roleId: number) => {
    try {
      const res = await resetRolePassword(roleId)
      message.success(
        `已重置账号「${res.username}」的密码为初始密码「${res.password}」`,
      )
    } catch {
      message.error('重置密码失败')
    }
  }

  const handleSavePermission = async () => {
    if (selectedRoleId == null) {
      return
    }
    try {
      await bindRoleTemplates(selectedRoleId, targetKeys.map(Number))
      message.success('权限配置已保存')
    } catch {
      message.error('保存权限失败')
    }
  }

  const columns: TableColumnsType<TemplateItem> = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: '模板名称', dataIndex: 'name' },
    { title: '年份', dataIndex: 'year', width: 80 },
    {
      title: '数字校验',
      width: 100,
      render: (_, record) =>
        record.content_numeric ? <Tag color="gold">仅数字</Tag> : '-',
    },
    {
      title: '操作',
      width: 300,
      render: (_, record) => (
        <Space size={0} wrap>
          <Button type="link" size="small" onClick={() => openEdit(record)}>
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
            onClick={() => handleExportTemplate(record)}
          >
            导出
          </Button>
          <Popconfirm
            title={`确认归档模板「${record.name}」？`}
            description="归档后将从工作台、填报总览与绑定列表中隐藏（历史填报数据保留），可在「归档模板」中恢复。"
            onConfirm={() => handleArchiveTemplate(record)}
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
  ]

  const archivedColumns: TableColumnsType<TemplateItem> = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: '模板名称', dataIndex: 'name' },
    { title: '年份', dataIndex: 'year', width: 80 },
    {
      title: '归档时间',
      dataIndex: 'archived_at',
      width: 180,
      render: (value: string | null) => (value ? new Date(value).toLocaleString() : '-'),
    },
    {
      title: '操作',
      width: 120,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<UndoOutlined />}
          loading={archivingId === record.id}
          onClick={() => handleUnarchiveTemplate(record)}
        >
          恢复
        </Button>
      ),
    },
  ]

  const roleColumns: TableColumnsType<RoleItem> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '角色名称', dataIndex: 'name', width: 140 },
    {
      title: '所属分类',
      render: (_, record) => {
        if (!record.segment_name) {
          return <Typography.Text type="secondary">未分类</Typography.Text>
        }
        return [record.segment_name, record.entity_name, record.department_name]
          .filter(Boolean)
          .join(' / ')
      },
    },
    {
      title: '职能',
      dataIndex: 'function_tag_name',
      width: 110,
      render: (value: string | null) => (value ? <Tag color="blue">{value}</Tag> : '-'),
    },
    {
      title: '默认账号',
      width: 170,
      render: (_, record) => `${record.default_username ?? `role_${record.id}`} / 初始密码 123456`,
    },
    {
      title: '操作',
      width: 240,
      render: (_, record) => (
        <Space size={0} wrap>
          <Button type="link" size="small" onClick={() => openEditRole(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认将账号密码重置为初始密码 123456？"
            onConfirm={() => handleResetPassword(record.id)}
          >
            <Button type="link" size="small" icon={<ThunderboltOutlined />}>
              重置密码
            </Button>
          </Popconfirm>
          <Popconfirm
            title="确认删除该角色？"
            onConfirm={() => handleDeleteRole(record.id)}
          >
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const overviewTableColumns: TableColumnsType<AdminBindingStatus> = [
    { title: '部门', dataIndex: 'role_name', width: 140 },
    { title: '模板', dataIndex: 'template_name' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (status: WorkbookStatus) => {
        const meta = STATUS_META[status]
        return <Tag color={meta.color}>{meta.text}</Tag>
      },
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      width: 180,
      render: (value: string | null) => (value ? new Date(value).toLocaleString() : '-'),
    },
    {
      title: '操作',
      width: 100,
      render: (_, record) => {
        if (record.status === 'none') {
          return '-'
        }
        return (
          <Button type="link" size="small" onClick={() => openPreview(record)}>
            {record.status === 'submitted' ? '审核' : '预览'}
          </Button>
        )
      },
    },
  ]

  const overviewPanel = (
    <Space orientation="vertical" style={{ width: '100%' }} size="large">
      <Space wrap>
        <Typography.Text strong>月度填报总览</Typography.Text>
        <DatePicker
          picker="month"
          value={periodToDayjs(overviewPeriod)}
          onChange={(v) => setOverviewPeriod(dayjsToPeriod(v))}
          allowClear={false}
          style={{ width: 140 }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => loadOverview(overviewPeriod)}>
          刷新
        </Button>
        <Typography.Text type="secondary">
          共 {overview.length} 项，点击状态可筛选
        </Typography.Text>
      </Space>
      <Space wrap>
        {STATUS_ORDER.map((s) => (
          <Tag
            key={s}
            color={STATUS_META[s].color}
            style={{
              cursor: 'pointer',
              padding: '4px 14px',
              fontSize: 14,
              ...(overviewStatusFilter === s ? { outline: '2px solid #1677ff' } : {}),
            }}
            onClick={() =>
              setOverviewStatusFilter((prev) => (prev === s ? undefined : s))
            }
          >
            {STATUS_META[s].text}（{overviewStatusCounts[s]}）
          </Tag>
        ))}
        <Select
          allowClear
          placeholder="筛选部门"
          style={{ width: 180 }}
          value={overviewRoleFilter}
          onChange={setOverviewRoleFilter}
          options={overviewRoleOptions}
        />
        <Input.Search
          placeholder="搜索模板名称"
          allowClear
          style={{ width: 220 }}
          value={overviewTemplateSearch}
          onChange={(e) => setOverviewTemplateSearch(e.target.value)}
        />
      </Space>
      <Table
        rowKey={(record) => `${record.role_id}-${record.template_id}`}
        columns={overviewTableColumns}
        dataSource={filteredOverview}
        loading={overviewLoading}
        size="small"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
        }}
        scroll={{ x: 900 }}
      />
    </Space>
  )

  const periodPanel = (
    <Space orientation="vertical" style={{ width: '100%' }} size="large">
      <Space wrap>
        <Typography.Text strong>填报期间锁定</Typography.Text>
        <InputNumber
          min={2000}
          max={2100}
          value={periodYear}
          onChange={(v) => setPeriodYear(v ?? new Date().getFullYear())}
          style={{ width: 100 }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => loadPeriods(periodYear)}>
          刷新
        </Button>
        <Typography.Text type="secondary">
          锁定某月后，该月所有部门不可再保存或提交填报（管理员可随时解锁）。
        </Typography.Text>
      </Space>
      <Spin spinning={periodsLoading}>
        <Table
          rowKey="period"
          size="small"
          pagination={false}
          dataSource={periods}
          columns={[
            { title: '月份', dataIndex: 'period', width: 120 },
            {
              title: '状态',
              dataIndex: 'locked',
              width: 120,
              render: (locked: boolean) =>
                locked ? (
                  <Tag color="red">已锁定</Tag>
                ) : (
                  <Tag color="green">开放</Tag>
                ),
            },
            {
              title: '锁定/解锁',
              width: 160,
              render: (_, record) => (
                <Switch
                  checked={record.locked}
                  loading={periodToggling === record.period}
                  onChange={(checked) =>
                    handleTogglePeriod(record.period, checked)
                  }
                  checkedChildren="锁定"
                  unCheckedChildren="开放"
                />
              ),
            },
          ]}
        />
      </Spin>
    </Space>
  )

  const templatePanel = (
    <Space orientation="vertical" style={{ width: '100%' }} size="large">
      <Space wrap>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建模板
        </Button>
        <Upload
          accept=".xlsx,.xls"
          showUploadList={false}
          beforeUpload={(file) => {
            handleImportFile(file)
            return false
          }}
        >
          <Button icon={<UploadOutlined />} loading={importing}>
            导入模板
          </Button>
        </Upload>
        <Typography.Text type="secondary">
          导入 Excel（仅取第一张工作表，自动处理合并单元格与样式），随后在弹窗中确认名称/年份/标签区。
        </Typography.Text>
      </Space>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={templates}
        loading={templateLoading}
        pagination={false}
      />
    </Space>
  )

  const archivedPanel = (
    <Space orientation="vertical" style={{ width: '100%' }} size="large">
      <Space wrap>
        <Typography.Text strong>归档模板</Typography.Text>
        <Button icon={<ReloadOutlined />} onClick={loadArchivedTemplates}>
          刷新
        </Button>
        <Typography.Text type="secondary">
          归档模板已从工作台/填报总览/绑定列表中隐藏，恢复后即可重新使用（原角色绑定保留）。
        </Typography.Text>
      </Space>
      <Table
        rowKey="id"
        columns={archivedColumns}
        dataSource={archivedTemplates}
        loading={archivedLoading}
        pagination={false}
      />
    </Space>
  )

  const rolePanel = (
    <Space orientation="vertical" style={{ width: '100%' }} size="large">
      <Card title="角色管理" size="small">
        <Space style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateRole}>
            新增角色
          </Button>
          <Typography.Text type="secondary">
            一个部门下可创建多个角色；创建时需选择 业务板块 / 主体 / 部门 与 职能标签。
          </Typography.Text>
        </Space>
        <Table
          rowKey="id"
          columns={roleColumns}
          dataSource={roles}
          pagination={false}
          size="small"
        />
      </Card>
    </Space>
  )

  const bindingPanel = (
    <Space orientation="vertical" style={{ width: '100%' }} size="large">
      <Card title="模板绑定" size="small">
        <Space orientation="vertical" style={{ width: '100%' }} size="large">
          <Space>
            <Typography.Text>选择角色：</Typography.Text>
            <Select
              style={{ width: 200 }}
              value={selectedRoleId ?? undefined}
              onChange={setSelectedRoleId}
              options={roles.map((r) => ({ value: r.id, label: r.name }))}
              placeholder="请选择角色"
            />
          </Space>
          <Spin spinning={permissionLoading}>
            <Transfer
              dataSource={templates.map((t) => ({
                key: String(t.id),
                title: `${t.name}（${t.year}）`,
              }))}
              targetKeys={targetKeys}
              onChange={(keys) => setTargetKeys(keys)}
              render={(item) => item.title}
              titles={['未绑定模板', '已绑定模板']}
              showSearch
              styles={{ section: { width: 360, height: 300 } }}
            />
          </Spin>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            disabled={selectedRoleId == null}
            onClick={handleSavePermission}
          >
            保存权限配置
          </Button>
        </Space>
      </Card>
    </Space>
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography.Text style={{ color: '#fff', fontSize: 18 }}>
          在线表格 · 管理端
        </Typography.Text>
        <Space>
          <Typography.Text style={{ color: '#fff' }}>
            当前用户：{username ?? ''}
          </Typography.Text>
          <Button onClick={() => setChangePwdOpen(true)}>修改密码</Button>
          <Button onClick={handleLogout}>退出登录</Button>
        </Space>
      </Header>
      <Content style={{ padding: 24 }}>
        <Tabs
          items={[
            { key: 'templates', label: '模板管理', children: templatePanel },
            { key: 'roles', label: '角色管理', children: rolePanel },
            { key: 'org', label: '组织架构', children: <OrgManager tree={orgTree} onChanged={loadOrgTree} loading={orgLoading} /> },
            { key: 'permissions', label: '模板权限', children: bindingPanel },
            { key: 'overview', label: '填报总览', children: overviewPanel },
            { key: 'periods', label: '填报期间', children: periodPanel },
            { key: 'archived', label: '归档模板', children: archivedPanel },
          ]}
        />
      </Content>

      <ChangePasswordModal
        open={changePwdOpen}
        onClose={() => setChangePwdOpen(false)}
      />

      <Modal
        title={editingRole ? '编辑角色' : '新增角色'}
        open={roleModalOpen}
        onCancel={() => setRoleModalOpen(false)}
        onOk={handleRoleModalOk}
        confirmLoading={savingRole}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
        width={520}
      >
        <Form
          form={roleForm}
          layout="vertical"
          onValuesChange={handleRoleFormChange}
        >
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="例如：预算编制" />
          </Form.Item>
          <Form.Item
            name="segmentId"
            label="业务板块"
            rules={[{ required: true, message: '请选择业务板块' }]}
          >
            <Select
              placeholder="请选择业务板块"
              options={orgTree.segments.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Form.Item>
          <Form.Item
            name="entityId"
            label="主体"
            rules={[{ required: true, message: '请选择主体' }]}
          >
            <Select
              placeholder="请选择主体"
              options={roleEntityOptions}
              disabled={watchedSegmentId == null}
            />
          </Form.Item>
          <Form.Item
            name="departmentId"
            label="部门"
            rules={[{ required: true, message: '请选择部门' }]}
          >
            <Select
              placeholder="请选择部门"
              options={roleDepartmentOptions}
              disabled={watchedEntityId == null}
            />
          </Form.Item>
          <Form.Item
            name="tagId"
            label="职能标签"
            rules={[{ required: true, message: '请选择职能标签' }]}
          >
            <Select
              placeholder="请选择职能标签"
              options={orgTree.tags.map((t) => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          previewDetail
            ? `${previewDetail.role_name} · ${previewDetail.template_name} · ${previewDetail.period}`
            : '填报预览'
        }
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        afterOpenChange={(open) => setPreviewMounted(open)}
        width={1000}
        forceRender
        footer={
          [
            <Button
              key="export"
              icon={<DownloadOutlined />}
              disabled={!previewDetail}
              onClick={() =>
                previewDetail &&
                snapshotToXlsx(
                  previewDetail.snapshot as unknown as IWorkbookData,
                  `${previewDetail.role_name}_${previewDetail.template_name}_${previewDetail.period}.xlsx`,
                )
              }
            >
              导出 Excel
            </Button>,
            <Button key="close" onClick={() => setPreviewOpen(false)}>
              关闭
            </Button>,
            ...(previewDetail?.status === 'submitted'
              ? [
                  <Button
                    key="reject"
                    danger
                    loading={reviewing}
                    onClick={() => setRejectOpen(true)}
                  >
                    退回
                  </Button>,
                  <Button
                    key="approve"
                    type="primary"
                    loading={reviewing}
                    onClick={() => handleReview('approved')}
                  >
                    审核通过
                  </Button>,
                ]
              : []),
          ]
        }
      >
        {previewDetail?.status === 'rejected' && previewDetail.reject_reason && (
          <Typography.Paragraph type="danger">
            退回原因：{previewDetail.reject_reason}
          </Typography.Paragraph>
        )}
        <div style={{ height: '60vh' }}>
          {previewMounted && (
            <UniverSheet initialSnapshot={previewSnapshot} readOnly />
          )}
        </div>
      </Modal>

      <Modal
        title="退回填报"
        open={rejectOpen}
        onCancel={() => setRejectOpen(false)}
        onOk={() => handleReview('rejected', rejectReason)}
        confirmLoading={reviewing}
        okText="确认退回"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <Typography.Paragraph type="secondary">
          请填写退回原因，部门将据此修改后重新提交。
        </Typography.Paragraph>
        <Input.TextArea
          rows={3}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="例如：预算金额格式不正确，请核对后重新提交"
        />
      </Modal>

      <Modal
        title="复制模板"
        open={duplicateOpen}
        onCancel={() => setDuplicateOpen(false)}
        onOk={handleDuplicate}
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
            onClick={handleSaveTemplate}
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
              <Input placeholder="例如：费用报销表" style={{ width: 240 }} />
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
                <Button icon={<ThunderboltOutlined />} onClick={() => refreshUsedRange(true)}>
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
          <Card size="small" style={{ marginBottom: 8, background: '#fafafa' }}>
            <Space orientation="vertical" size={4}>
              <Typography.Text>
                使用区域：
                {usedRange
                  ? formatRange(usedRange.startRow, usedRange.startCol, usedRange.endRow, usedRange.endCol)
                  : '（点击「检测使用区域」从表格内容计算）'}
              </Typography.Text>
              <Typography.Text>
                行标签范围：
                {derived?.rowLabelRange ? (
                  <Tag>{derived.rowLabelRange}</Tag>
                ) : (
                  <Typography.Text type="secondary">无</Typography.Text>
                )}
                　列标签范围：
                {derived?.colLabelRange ? (
                  <Tag>{derived.colLabelRange}</Tag>
                ) : (
                  <Typography.Text type="secondary">无</Typography.Text>
                )}
              </Typography.Text>
              <Typography.Text>
                数据区域（用户可填写）：{derived ? <Tag color="blue">{derived.dataRange}</Tag> : '（请先填写起始单元格）'}
              </Typography.Text>
            </Space>
          </Card>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
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
    </Layout>
  )
}
