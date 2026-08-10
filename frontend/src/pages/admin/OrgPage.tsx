import { useEffect, useMemo, useState } from 'react'
import {
  App,
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
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  createOrgDepartment,
  createOrgEntity,
  createOrgSegment,
  createOrgTag,
  deleteOrgDepartment,
  deleteOrgEntity,
  deleteOrgSegment,
  deleteOrgTag,
  fetchOrgTree,
  renameOrgDepartment,
  renameOrgEntity,
  renameOrgSegment,
  renameOrgTag,
} from '../../api/admin'
import type { OrgTree } from '../../api/types'
import PageHeader from '../../components/layout/PageHeader'
import { useCachedFetch } from '../../hooks/useCachedFetch'

type NodeType = 'segment' | 'entity' | 'department' | 'tag'

interface RenameTarget {
  type: NodeType
  id: number
  name: string
}

interface OrgNode {
  id: number
  name: string
}

export default function OrgPage() {
  const { message } = App.useApp()
  const { data, loading, refresh } = useCachedFetch<OrgTree>(
    'admin:org:tree',
    fetchOrgTree,
    [],
    5000,
  )
  const segments = useMemo(() => data?.segments ?? [], [data])
  const tags = useMemo(() => data?.tags ?? [], [data])
  const tree = useMemo<OrgTree>(
    () => ({ segments, tags }),
    [segments, tags],
  )

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
      tree.segments.some((s) => s.id === prev)
        ? prev
        : (tree.segments[0]?.id ?? null),
    )
  }, [tree.segments])

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
    const value = {
      segment: newSegment,
      entity: newEntity,
      department: newDepartment,
      tag: newTag,
    }[kind].trim()
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
      refresh()
    } catch (error) {
      const detail = (
        error as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail
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
      refresh()
    } catch (error) {
      const detail = (
        error as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail
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
      if (renameTarget.type === 'segment')
        await renameOrgSegment(renameTarget.id, name)
      else if (renameTarget.type === 'entity')
        await renameOrgEntity(renameTarget.id, name)
      else if (renameTarget.type === 'department')
        await renameOrgDepartment(renameTarget.id, name)
      else await renameOrgTag(renameTarget.id, name)
      message.success('已改名')
      setRenameTarget(null)
      refresh()
    } catch (error) {
      const detail = (
        error as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail
      message.error(detail ?? '改名失败')
    } finally {
      setRenaming(false)
    }
  }

  return (
    <div className="ot-fade-in">
      <PageHeader
        eyebrow="管理中心"
        title="组织架构"
        description="配置 业务板块 → 主体 → 部门 三级组织架构，以及全局职能标签。角色创建时会从这里选择分类。"
      />

      <Spin spinning={loading}>
        <Space orientation="vertical" style={{ width: '100%' }} size="large">
          <Card
            title="部门架构"
            styles={{ body: { padding: 20 } }}
            style={{ borderRadius: 12 }}
          >
            <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
              配置 业务板块 → 主体 → 部门 三级组织架构；角色创建时将从这里「选择」所属分类。
            </Typography.Paragraph>
            <Row gutter={16}>
              <Col span={8}>
                <OrgColumn
                  title="业务板块"
                  items={tree.segments}
                  addValue={newSegment}
                  setAddValue={setNewSegment}
                  addPlaceholder="新增业务板块"
                  onAdd={() => handleAdd('segment')}
                  canAdd
                  type="segment"
                  onSelect={setSelectedSegmentId}
                  selectedId={selectedSegmentId}
                  emptyHint="暂无，可先添加"
                  onRename={openRename}
                  onDelete={handleDelete}
                />
              </Col>
              <Col span={8}>
                <OrgColumn
                  title="主体"
                  items={selectedSegment?.entities ?? []}
                  addValue={newEntity}
                  setAddValue={setNewEntity}
                  addPlaceholder="新增主体"
                  onAdd={() => handleAdd('entity')}
                  canAdd={selectedSegment != null}
                  type="entity"
                  onSelect={setSelectedEntityId}
                  selectedId={selectedEntityId}
                  emptyHint={selectedSegment == null ? '请先选择业务板块' : '暂无，可先添加'}
                  onRename={openRename}
                  onDelete={handleDelete}
                />
              </Col>
              <Col span={8}>
                <OrgColumn
                  title="部门"
                  items={selectedEntity?.departments ?? []}
                  addValue={newDepartment}
                  setAddValue={setNewDepartment}
                  addPlaceholder="新增部门"
                  onAdd={() => handleAdd('department')}
                  canAdd={selectedEntity != null}
                  type="department"
                  emptyHint={selectedEntity == null ? '请先选择主体' : '暂无，可先添加'}
                  onRename={openRename}
                  onDelete={handleDelete}
                />
              </Col>
            </Row>
          </Card>

          <Card
            title="职能标签"
            styles={{ body: { padding: 20 } }}
            style={{ borderRadius: 12, maxWidth: 480 }}
          >
            <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
              全局职能标签列表（如 行政、预算、报表等），角色创建时选择其一。
            </Typography.Paragraph>
            <OrgColumn
              title="职能标签"
              items={tree.tags}
              addValue={newTag}
              setAddValue={setNewTag}
              addPlaceholder="新增职能标签"
              onAdd={() => handleAdd('tag')}
              canAdd
              type="tag"
              emptyHint="暂无，可先添加"
              onRename={openRename}
              onDelete={handleDelete}
            />
          </Card>
        </Space>
      </Spin>

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
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={confirmRename}
          placeholder="请输入新名称"
        />
      </Modal>
    </div>
  )
}

interface OrgColumnProps {
  title: string
  items: OrgNode[]
  addValue: string
  setAddValue: (v: string) => void
  addPlaceholder: string
  onAdd: () => void
  canAdd: boolean
  type: NodeType
  onSelect?: (id: number | null) => void
  selectedId?: number | null
  emptyHint?: string
  onRename: (t: RenameTarget) => void
  onDelete: (t: RenameTarget) => void
}

function OrgColumn({
  title,
  items,
  addValue,
  setAddValue,
  addPlaceholder,
  onAdd,
  canAdd,
  type,
  onSelect,
  selectedId,
  emptyHint,
  onRename,
  onDelete,
}: OrgColumnProps) {
  return (
    <div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--ot-color-text)',
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <Space.Compact style={{ width: '100%', marginBottom: 10 }}>
        <Input
          size="middle"
          placeholder={addPlaceholder}
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
          onPressEnter={onAdd}
          disabled={!canAdd}
          style={{ borderRadius: '8px 0 0 8px' }}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={onAdd}
          disabled={!canAdd || !addValue.trim()}
          style={{ borderRadius: '0 8px 8px 0' }}
        />
      </Space.Compact>
      <div
        style={{
          background: 'var(--ot-color-bg)',
          borderRadius: 8,
          padding: 4,
          minHeight: 80,
        }}
      >
        {items.length === 0 ? (
          <Typography.Text type="secondary" style={{ padding: 8, display: 'block' }}>
            {emptyHint ?? '暂无，可先添加'}
          </Typography.Text>
        ) : (
          <Space orientation="vertical" size={2} style={{ width: '100%' }}>
            {items.map((item) => (
              <OrgRow
                key={item.id}
                id={item.id}
                name={item.name}
                type={type}
                selected={selectedId === item.id}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))}
          </Space>
        )}
      </div>
    </div>
  )
}

interface OrgRowProps {
  id: number
  name: string
  type: NodeType
  selected: boolean
  onSelect?: (id: number) => void
  onRename: (t: RenameTarget) => void
  onDelete: (t: RenameTarget) => void
}

function OrgRow({
  id,
  name,
  type,
  selected,
  onSelect,
  onRename,
  onDelete,
}: OrgRowProps) {
  return (
    <div
      onClick={() => onSelect?.(id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px',
        borderRadius: 6,
        cursor: onSelect ? 'pointer' : 'default',
        background: selected ? 'var(--ot-color-primary-soft)' : 'transparent',
        transition: 'background 0.12s var(--ot-ease-out)',
      }}
      onMouseEnter={(e) => {
        if (!selected && onSelect)
          e.currentTarget.style.background = 'var(--ot-color-bg-hover)'
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent'
      }}
    >
      <span
        style={{
          flex: 1,
          fontSize: 13,
          fontWeight: selected ? 600 : 400,
          color: selected ? 'var(--ot-color-primary)' : 'var(--ot-color-text)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
      <Space size={2}>
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={(e) => {
            e.stopPropagation()
            onRename({ type, id, name })
          }}
        />
        <Popconfirm
          title={`确认删除「${name}」？`}
          onConfirm={(e) => {
            e?.stopPropagation()
            onDelete({ type, id, name })
          }}
          onCancel={(e) => e?.stopPropagation()}
        >
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={(e) => e.stopPropagation()}
          />
        </Popconfirm>
      </Space>
    </div>
  )
}
