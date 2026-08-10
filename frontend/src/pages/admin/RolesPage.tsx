import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  DeleteOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import type { RoleCreateRequest, RoleItem } from '../../api/types'
import { useRolesStore } from '../../store/useRolesStore'
import PageHeader from '../../components/layout/PageHeader'
import EmptyState from '../../components/feedback/EmptyState'
import ConfirmDialog from '../../components/feedback/ConfirmDialog'

interface RoleFormValues {
  name: string
  segmentId?: number
  entityId?: number
  departmentId?: number
  tagId?: number
}

export default function RolesPage() {
  const { message } = App.useApp()
  const roles = useRolesStore((s) => s.roles)
  const orgTree = useRolesStore((s) => s.orgTree)
  const orgLoading = useRolesStore((s) => s.orgLoading)
  const fetchOrgTree = useRolesStore((s) => s.fetchOrgTree)
  const fetchRoles = useRolesStore((s) => s.fetchRoles)
  const create = useRolesStore((s) => s.create)
  const update = useRolesStore((s) => s.update)
  const remove = useRolesStore((s) => s.remove)
  const resetPassword = useRolesStore((s) => s.resetPassword)

  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null)
  const [savingRole, setSavingRole] = useState(false)
  const [roleForm] = Form.useForm<RoleFormValues>()
  const watchedSegmentId = Form.useWatch('segmentId', roleForm)
  const watchedEntityId = Form.useWatch('entityId', roleForm)

  const [deleteRoleTarget, setDeleteRoleTarget] = useState<RoleItem | null>(null)
  const [deleteRoleNameInput, setDeleteRoleNameInput] = useState('')

  useEffect(() => {
    void fetchRoles()
  }, [fetchRoles])

  useEffect(() => {
    if (roleModalOpen) {
      void fetchOrgTree()
    }
  }, [roleModalOpen, fetchOrgTree])

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

  const openCreateRole = () => {
    setEditingRole(null)
    roleForm.resetFields()
    setRoleModalOpen(true)
  }

  const openEditRole = useCallback(
    (role: RoleItem) => {
      setEditingRole(role)
      roleForm.setFieldsValue({
        name: role.name,
        segmentId: role.segment_id ?? undefined,
        entityId: role.entity_id ?? undefined,
        departmentId: role.department_id ?? undefined,
        tagId: role.function_tag_id ?? undefined,
      })
      setRoleModalOpen(true)
    },
    [roleForm],
  )

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
    const payload: RoleCreateRequest = {
      name: values.name,
      segment_id: values.segmentId,
      entity_id: values.entityId,
      department_id: values.departmentId,
      function_tag_id: values.tagId,
    }
    setSavingRole(true)
    try {
      if (editingRole) {
        await update(editingRole.id, payload)
        message.success('角色已更新')
      } else {
        await create(payload)
        message.success('角色创建成功')
      }
      setRoleModalOpen(false)
    } catch (error) {
      const detail = (
        error as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail
      message.error(detail ?? '保存失败')
    } finally {
      setSavingRole(false)
    }
  }

  const handleDeleteRole = async (roleId: number, confirmName: string) => {
    try {
      await remove(roleId, confirmName)
      message.success('角色已删除（默认账号、模板绑定、填报历史已一并清理）')
      setDeleteRoleTarget(null)
      setDeleteRoleNameInput('')
    } catch (error) {
      const detail = (
        error as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail
      message.error(detail ?? '删除失败')
    }
  }

  const handleResetPassword = useCallback(
    async (roleId: number) => {
      try {
        await resetPassword(roleId)
        message.success('密码已重置为统一初始密码')
      } catch {
        message.error('重置密码失败')
      }
    },
    [resetPassword, message],
  )

  const columns: TableColumnsType<RoleItem> = useMemo(
    () => [
      {
        title: 'ID',
        dataIndex: 'id',
        width: 70,
        render: (v: number) => (
          <span
            className="ot-mono"
            style={{ color: 'var(--ot-color-text-tertiary)' }}
          >
            #{v}
          </span>
        ),
      },
      {
        title: '角色名称',
        dataIndex: 'name',
        width: 160,
        render: (v: string) => (
          <span style={{ fontWeight: 500 }}>{v}</span>
        ),
      },
      {
        title: '所属分类',
        render: (_, record) => {
          if (!record.segment_name) {
            return (
              <Typography.Text type="secondary">未分类</Typography.Text>
            )
          }
          return (
            <Space size={4} wrap>
              {[record.segment_name, record.entity_name, record.department_name]
                .filter(Boolean)
                .map((name, i, arr) => (
                  <span key={`${name}-${i}`} style={{ fontSize: 13 }}>
                    {name}
                    {i < arr.length - 1 && (
                      <span
                        style={{
                          color: 'var(--ot-color-text-tertiary)',
                          margin: '0 6px',
                        }}
                      >
                        /
                      </span>
                    )}
                  </span>
                ))}
            </Space>
          )
        },
      },
      {
        title: '职能',
        dataIndex: 'function_tag_name',
        width: 110,
        render: (value: string | null) =>
          value ? (
            <Tag color="blue" style={{ borderRadius: 6 }}>
              {value}
            </Tag>
          ) : (
            '-'
          ),
      },
      {
        title: '默认账号',
        width: 200,
        render: (_, record) => (
          <div style={{ fontSize: 12 }}>
            <div className="ot-mono">{record.default_username ?? `role_${record.id}`}</div>
            <div style={{ color: 'var(--ot-color-text-tertiary)' }}>
              初始密码 123456
            </div>
          </div>
        ),
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
              onConfirm={() => void handleResetPassword(record.id)}
            >
              <Button
                type="link"
                size="small"
                icon={<ThunderboltOutlined />}
              >
                重置密码
              </Button>
            </Popconfirm>
            <Button
              type="link"
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => setDeleteRoleTarget(record)}
            >
              删除
            </Button>
          </Space>
        ),
      },
    ],
    [openEditRole, handleResetPassword],
  )

  return (
    <div className="ot-fade-in">
      <PageHeader
        eyebrow="管理中心"
        title="角色管理"
        description="角色按「业务板块 → 主体 → 部门 + 职能标签」分类；一个部门下可创建多个角色。"
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreateRole}
          >
            新增角色
          </Button>
        }
      />

      <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: 12 }}>
        {roles.length === 0 ? (
          <EmptyState
            variant="roles"
            description="先在「组织架构」配置业务板块 / 主体 / 部门，再创建角色"
            action={
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateRole}>
                新增角色
              </Button>
            }
          />
        ) : (
          <Table<RoleItem>
            rowKey="id"
            columns={columns}
            dataSource={roles}
            pagination={false}
            size="middle"
            className="ot-cv-auto"
          />
        )}
      </Card>

      <Modal
        title={editingRole ? '编辑角色' : '新增角色'}
        open={roleModalOpen}
        onCancel={() => setRoleModalOpen(false)}
        onOk={() => void handleRoleModalOk()}
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
              loading={orgLoading}
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

      <ConfirmDialog
        open={deleteRoleTarget !== null}
        title={`删除角色「${deleteRoleTarget?.name ?? ''}」`}
        okText="确认删除"
        danger
        onCancel={() => {
          setDeleteRoleTarget(null)
          setDeleteRoleNameInput('')
        }}
        onConfirm={() => {
          if (deleteRoleTarget) {
            void handleDeleteRole(deleteRoleTarget.id, deleteRoleNameInput)
          }
        }}
      >
        <Typography.Paragraph type="danger" style={{ marginTop: 8 }}>
          此操作将级联清理以下数据，且不可恢复：
        </Typography.Paragraph>
        <ul style={{ marginTop: 0, paddingLeft: 20 }}>
          <li>该角色的所有模板绑定</li>
          <li>该角色的全部填报历史（草稿/已提交/已通过/已退回）</li>
          <li>该角色的默认账号</li>
        </ul>
        <Typography.Paragraph>
          请输入角色名称「
          <Typography.Text strong>{deleteRoleTarget?.name}</Typography.Text>
          」以确认删除：
        </Typography.Paragraph>
        <Input
          value={deleteRoleNameInput}
          onChange={(e) => setDeleteRoleNameInput(e.target.value)}
          placeholder={deleteRoleTarget?.name}
          allowClear
          status={
            deleteRoleNameInput &&
            deleteRoleTarget &&
            deleteRoleNameInput.trim() !== deleteRoleTarget.name
              ? 'error'
              : ''
          }
        />
      </ConfirmDialog>
    </div>
  )
}
