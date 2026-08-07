import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Col,
  Input,
  Modal,
  Popconfirm,
  Row,
  Space,
  Spin,
  Typography,
  message,
} from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  createOrgDepartment,
  createOrgEntity,
  createOrgSegment,
  createOrgTag,
  deleteOrgDepartment,
  deleteOrgEntity,
  deleteOrgSegment,
  deleteOrgTag,
  renameOrgDepartment,
  renameOrgEntity,
  renameOrgSegment,
  renameOrgTag,
} from '../api/admin'
import type { OrgTree } from '../api/types'

type NodeType = 'segment' | 'entity' | 'department' | 'tag'

interface RenameTarget {
  type: NodeType
  id: number
  name: string
}

interface OrgManagerProps {
  tree: OrgTree
  onChanged: () => void
  loading?: boolean
}

/** 组织架构管理：业务板块 → 主体 → 部门 + 职能标签。 */
export default function OrgManager({ tree, onChanged, loading = false }: OrgManagerProps) {
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null)
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null)

  const [newSegment, setNewSegment] = useState('')
  const [newEntity, setNewEntity] = useState('')
  const [newDepartment, setNewDepartment] = useState('')
  const [newTag, setNewTag] = useState('')

  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)

  useEffect(() => {
    setSelectedSegmentId((prev) =>
      tree.segments.some((s) => s.id === prev) ? prev : (tree.segments[0]?.id ?? null),
    )
  }, [tree])

  useEffect(() => {
    if (selectedSegmentId == null) {
      setSelectedEntityId(null)
      return
    }
    const segment = tree.segments.find((s) => s.id === selectedSegmentId)
    if (!segment?.entities.some((e) => e.id === selectedEntityId)) {
      setSelectedEntityId(segment?.entities[0]?.id ?? null)
    }
  }, [tree, selectedSegmentId, selectedEntityId])

  const selectedSegment = useMemo(
    () => tree.segments.find((s) => s.id === selectedSegmentId) ?? null,
    [tree, selectedSegmentId],
  )
  const selectedEntity = useMemo(
    () => selectedSegment?.entities.find((e) => e.id === selectedEntityId) ?? null,
    [selectedSegment, selectedEntityId],
  )

  const handleAdd = async (kind: NodeType) => {
    const value = { segment: newSegment, entity: newEntity, department: newDepartment, tag: newTag }[kind].trim()
    if (!value) return
    try {
      if (kind === 'segment') {
        await createOrgSegment(value)
        setNewSegment('')
      } else if (kind === 'entity') {
        if (selectedSegmentId == null) return
        await createOrgEntity(value, selectedSegmentId)
        setNewEntity('')
      } else if (kind === 'department') {
        if (selectedEntityId == null) return
        await createOrgDepartment(value, selectedEntityId)
        setNewDepartment('')
      } else {
        await createOrgTag(value)
        setNewTag('')
      }
      message.success('已新增')
      onChanged()
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(detail ?? '新增失败')
    }
  }

  const handleDelete = async (target: RenameTarget) => {
    try {
      if (target.type === 'segment') await deleteOrgSegment(target.id)
      else if (target.type === 'entity') await deleteOrgEntity(target.id)
      else if (target.type === 'department') await deleteOrgDepartment(target.id)
      else await deleteOrgTag(target.id)
      message.success('已删除')
      onChanged()
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(detail ?? '删除失败（可能仍被下级或角色引用）')
    }
  }

  const openRename = (target: RenameTarget) => {
    setRenameTarget(target)
    setRenameValue(target.name)
  }

  const confirmRename = async () => {
    if (!renameTarget) return
    const name = renameValue.trim()
    if (!name) return
    setRenaming(true)
    try {
      if (renameTarget.type === 'segment') await renameOrgSegment(renameTarget.id, name)
      else if (renameTarget.type === 'entity') await renameOrgEntity(renameTarget.id, name)
      else if (renameTarget.type === 'department') await renameOrgDepartment(renameTarget.id, name)
      else await renameOrgTag(renameTarget.id, name)
      message.success('已改名')
      setRenameTarget(null)
      onChanged()
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(detail ?? '改名失败')
    } finally {
      setRenaming(false)
    }
  }

  const renderList = (
    title: string,
    items: Array<{ id: number; name: string }>,
    addValue: string,
    setAddValue: (v: string) => void,
    addPlaceholder: string,
    onAdd: () => void,
    canAdd: boolean,
    type: NodeType,
    onSelect?: (id: number | null) => void,
    selectedId?: number | null,
    emptyHint?: string,
  ) => (
    <div>
      <Typography.Text strong>{title}</Typography.Text>
      <Space.Compact style={{ width: '100%', margin: '8px 0' }}>
        <Input
          size="small"
          placeholder={addPlaceholder}
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
          onPressEnter={onAdd}
          disabled={!canAdd}
        />
        <Button size="small" icon={<PlusOutlined />} onClick={onAdd} disabled={!canAdd || !addValue.trim()} />
      </Space.Compact>
      {items.length === 0 ? (
        <Typography.Text type="secondary">{emptyHint ?? '暂无，可先添加'}</Typography.Text>
      ) : (
        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelect?.(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 8px',
                borderRadius: 4,
                cursor: onSelect ? 'pointer' : 'default',
                background: selectedId === item.id ? '#e6f4ff' : undefined,
              }}
            >
              <Typography.Text
                ellipsis
                style={{ flex: 1, fontWeight: selectedId === item.id ? 600 : undefined }}
              >
                {item.name}
              </Typography.Text>
              <Space size={0}>
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openRename({ type, id: item.id, name: item.name })}
                />
                <Popconfirm
                  title={`确认删除「${item.name}」？`}
                  onConfirm={() => handleDelete({ type, id: item.id, name: item.name })}
                >
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            </div>
          ))}
        </Space>
      )}
    </div>
  )

  return (
    <Spin spinning={loading}>
      <Space orientation="vertical" style={{ width: '100%' }} size="large">
        <Card title="部门架构" size="small">
          <Typography.Paragraph type="secondary">
            配置 业务板块 → 主体 → 部门 三级组织架构；角色创建时将从这里「选择」所属分类。
          </Typography.Paragraph>
          <Row gutter={16}>
            <Col span={8}>
              {renderList(
                '业务板块',
                tree.segments,
                newSegment,
                setNewSegment,
                '新增业务板块',
                () => handleAdd('segment'),
                true,
                'segment',
                setSelectedSegmentId,
                selectedSegmentId,
              )}
            </Col>
            <Col span={8}>
              {renderList(
                '主体',
                selectedSegment?.entities ?? [],
                newEntity,
                setNewEntity,
                '新增主体',
                () => handleAdd('entity'),
                selectedSegment != null,
                'entity',
                setSelectedEntityId,
                selectedEntityId,
                selectedSegment == null ? '请先选择业务板块' : '暂无，可先添加',
              )}
            </Col>
            <Col span={8}>
              {renderList(
                '部门',
                selectedEntity?.departments ?? [],
                newDepartment,
                setNewDepartment,
                '新增部门',
                () => handleAdd('department'),
                selectedEntity != null,
                'department',
                undefined,
                undefined,
                selectedEntity == null ? '请先选择主体' : '暂无，可先添加',
              )}
            </Col>
          </Row>
        </Card>

        <Card title="职能标签" size="small">
          <Typography.Paragraph type="secondary">
            全局职能标签列表（如 行政、预算、报表等），角色创建时选择其一。
          </Typography.Paragraph>
          <div style={{ maxWidth: 360 }}>
            {renderList(
              '职能标签',
              tree.tags,
              newTag,
              setNewTag,
              '新增职能标签',
              () => handleAdd('tag'),
              true,
              'tag',
            )}
          </div>
        </Card>
      </Space>

      <Modal
        title="改名"
        open={renameTarget != null}
        onCancel={() => setRenameTarget(null)}
        onOk={confirmRename}
        confirmLoading={renaming}
        okText="确认"
        cancelText="取消"
        destroyOnHidden
      >
        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onPressEnter={confirmRename} placeholder="请输入新名称" />
      </Modal>
    </Spin>
  )
}
