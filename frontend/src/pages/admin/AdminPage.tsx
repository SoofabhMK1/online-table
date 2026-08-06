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
  Table,
  Tabs,
  Tag,
  Transfer,
  Typography,
  message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CopyOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { IWorkbookData } from '@univerjs/core'
import UniverSheet, { type UniverSheetHandle } from '../../components/UniverSheet'
import ChangePasswordModal from '../../components/ChangePasswordModal'
import { detectLabels } from '../../utils/detectLabels'
import { useAuthStore } from '../../store/useAuthStore'
import {
  bindRoleTemplates,
  createRole,
  createTemplate,
  deleteRole,
  duplicateTemplate,
  fetchAdminWorkbookDetail,
  fetchFillingOverview,
  fetchRoleTemplates,
  fetchRoles,
  fetchTemplateDetail,
  fetchTemplates,
  resetRolePassword,
  reviewWorkbook,
  updateTemplate,
} from '../../api/admin'
import type {
  AdminBindingStatus,
  AdminWorkbookDetail,
  RoleItem,
  TemplateItem,
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
  rowLabelCols: number
  colLabelRows: number
  contentRows: number
  contentCols: number
}

interface OverviewRoleRow {
  id: number
  name: string
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
  const [newRoleName, setNewRoleName] = useState('')

  // 修改密码
  const [changePwdOpen, setChangePwdOpen] = useState(false)

  // 填报总览
  const [overviewPeriod, setOverviewPeriod] = useState<string>(currentPeriod())
  const [overview, setOverview] = useState<AdminBindingStatus[]>([])
  const [overviewLoading, setOverviewLoading] = useState(false)
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

  const loadTemplates = useCallback(async () => {
    setTemplateLoading(true)
    try {
      setTemplates(await fetchTemplates())
    } finally {
      setTemplateLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  useEffect(() => {
    fetchRoles().then((data) => {
      setRoles(data)
      if (data.length > 0) {
        setSelectedRoleId(data[0].id)
      }
    })
  }, [])

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

  const overviewRoles = useMemo<OverviewRoleRow[]>(() => {
    const map = new Map<number, string>()
    overview.forEach((o) => map.set(o.role_id, o.role_name))
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [overview])

  const overviewTemplates = useMemo(() => {
    const map = new Map<number, string>()
    overview.forEach((o) => map.set(o.template_id, o.template_name))
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [overview])

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
    form.setFieldsValue({
      name: '',
      year: new Date().getFullYear(),
      rowLabelCols: 0,
      colLabelRows: 0,
      contentRows: 0,
      contentCols: 0,
    })
    setModalOpen(true)
  }

  const openEdit = async (template: TemplateItem) => {
    try {
      const detail = await fetchTemplateDetail(template.id)
      setEditingId(template.id)
      setInitialSnapshot(detail.snapshot as unknown as IWorkbookData)
      form.setFieldsValue({
        name: detail.name,
        year: detail.year,
        rowLabelCols: detail.row_label_cols,
        colLabelRows: detail.col_label_rows,
        contentRows: detail.content_rows,
        contentCols: detail.content_cols,
      })
      setModalOpen(true)
    } catch {
      message.error('加载模板详情失败')
    }
  }

  const handleAutoDetect = () => {
    const snapshot = sheetRef.current?.getWorkbookData()
    if (!snapshot) {
      return
    }
    const guess = detectLabels(snapshot)
    form.setFieldsValue({
      rowLabelCols: guess.rowLabelCols,
      colLabelRows: guess.colLabelRows,
      contentRows: guess.contentRows,
      contentCols: guess.contentCols,
    })
    message.info(
      `自动识别结果：行标签 ${guess.rowLabelCols} 列、列标签 ${guess.colLabelRows} 行，` +
        `内容区 ${guess.contentRows} 行 × ${guess.contentCols} 列（可手动调整）`,
    )
  }

  const handleSaveTemplate = async () => {
    const values = await form.validateFields()
    const snapshot = sheetRef.current?.getWorkbookData()
    if (!snapshot) {
      return
    }
    const labels = {
      rowLabelCols: values.rowLabelCols ?? 0,
      colLabelRows: values.colLabelRows ?? 0,
      contentRows: values.contentRows ?? 0,
      contentCols: values.contentCols ?? 0,
    }
    if (labels.contentRows === 0 || labels.contentCols === 0) {
      message.warning('尚未配置内容区行数/列数，用户将无法填写任何单元格，请确认')
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

  const handleCreateRole = async () => {
    const name = newRoleName.trim()
    if (!name) {
      return
    }
    try {
      await createRole(name)
      message.success('角色创建成功')
      setNewRoleName('')
      setRoles(await fetchRoles())
    } catch {
      message.error('角色创建失败（可能已存在同名角色）')
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
      title: '标签区',
      width: 180,
      render: (_, record) =>
        `${record.row_label_cols}列 × ${record.col_label_rows}行`,
    },
    {
      title: '操作',
      width: 160,
      render: (_, record) => (
        <Space>
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
        </Space>
      ),
    },
  ]

  const roleColumns: TableColumnsType<RoleItem> = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '角色名称', dataIndex: 'name' },
    {
      title: '默认账号',
      width: 200,
      render: (_, record) => `${record.name} / 初始密码 123456`,
    },
    {
      title: '操作',
      width: 200,
      render: (_, record) => (
        <Space>
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

  const overviewColumns: TableColumnsType<OverviewRoleRow> = useMemo(
    () => [
      { title: '部门', dataIndex: 'name', fixed: 'left', width: 120 },
      ...overviewTemplates.map((t) => ({
        title: t.name,
        key: t.id,
        width: 150,
        render: (_: unknown, record: OverviewRoleRow) => {
          const cell = overview.find(
            (o) => o.role_id === record.id && o.template_id === t.id,
          )
          if (!cell) {
            return '-'
          }
          const meta = STATUS_META[cell.status]
          return (
            <Tag
              color={meta.color}
              style={{ cursor: 'pointer', width: '100%', textAlign: 'center', marginInlineEnd: 0 }}
              onClick={() => openPreview(cell)}
            >
              {meta.text}
            </Tag>
          )
        },
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overview, overviewTemplates],
  )

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
      </Space>
      <Space wrap>
        <Typography.Text type="secondary">图例：</Typography.Text>
        {STATUS_ORDER.map((s) => (
          <Tag key={s} color={STATUS_META[s].color}>
            {STATUS_META[s].text}
          </Tag>
        ))}
        <Typography.Text type="secondary">点击单元格可预览/审核</Typography.Text>
      </Space>
      <Table
        rowKey="id"
        columns={overviewColumns}
        dataSource={overviewRoles}
        loading={overviewLoading}
        pagination={false}
        size="small"
        scroll={{ x: 'max-content' }}
      />
    </Space>
  )

  const templatePanel = (
    <Space orientation="vertical" style={{ width: '100%' }} size="large">
      <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
        新建模板
      </Button>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={templates}
        loading={templateLoading}
        pagination={false}
      />
    </Space>
  )

  const permissionPanel = (
    <Space orientation="vertical" style={{ width: '100%' }} size="large">
      <Card title="角色管理" size="small">
        <Space style={{ marginBottom: 16 }}>
          <Input
            placeholder="新角色名称，例如：财务部"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            onPressEnter={handleCreateRole}
            style={{ width: 240 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateRole}>
            新增角色
          </Button>
        </Space>
        <Table
          rowKey="id"
          columns={roleColumns}
          dataSource={roles}
          pagination={false}
          size="small"
        />
      </Card>

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
            { key: 'permissions', label: '角色与权限', children: permissionPanel },
            { key: 'overview', label: '填报总览', children: overviewPanel },
          ]}
        />
      </Content>

      <ChangePasswordModal
        open={changePwdOpen}
        onClose={() => setChangePwdOpen(false)}
      />

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
          previewDetail?.status === 'submitted'
            ? [
                <Button key="close" onClick={() => setPreviewOpen(false)}>
                  关闭
                </Button>,
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
            : [
                <Button key="close" onClick={() => setPreviewOpen(false)}>
                  关闭
                </Button>,
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
            <Form.Item
              name="rowLabelCols"
              label="行标签占几列"
              tooltip="行标签在最左侧的哪几列。例如行标签都在 A 列（A1/A2/A3...），则填 1；若 A、B 两列都是行标签则填 2。注意填的是列数，不是标签个数。"
            >
              <InputNumber min={0} max={20} style={{ width: 110 }} />
            </Form.Item>
            <Form.Item
              name="colLabelRows"
              label="列标签占几行"
              tooltip="列标签在最上方的哪几行。例如列标签都在第 1 行（B1/C1/D1...），则填 1；若第 1、2 行都是列标签则填 2。注意填的是行数，不是标签个数。"
            >
              <InputNumber min={0} max={20} style={{ width: 110 }} />
            </Form.Item>
            <Form.Item
              name="contentRows"
              label="内容区行数"
              tooltip="用户可填写的行数。例如内容为 3 行则填 3。"
            >
              <InputNumber min={0} max={100} style={{ width: 110 }} />
            </Form.Item>
            <Form.Item
              name="contentCols"
              label="内容区列数"
              tooltip="用户可填写的列数。例如内容为 3 列则填 3。"
            >
              <InputNumber min={0} max={50} style={{ width: 110 }} />
            </Form.Item>
            <Form.Item>
              <Button icon={<ThunderboltOutlined />} onClick={handleAutoDetect}>
                自动识别
              </Button>
            </Form.Item>
          </Space>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            只有内容区（标签之后的矩形区域）允许用户填写，其余单元格一律只读。建议先给内容区加上边框后点「自动识别」。
          </Typography.Text>
        </Form>
        <div style={{ height: '50vh' }}>
          {sheetMounted && (
            <UniverSheet ref={sheetRef} initialSnapshot={initialSnapshot} />
          )}
        </div>
      </Modal>
    </Layout>
  )
}
