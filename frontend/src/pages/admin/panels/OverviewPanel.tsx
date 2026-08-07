/**
 * OverviewPanel：填报总览 Tab 内容（period 筛选 + 状态标签 + 级联筛选 + 树形表 + 预览/审核/退回 modal）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  DatePicker,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import type { IWorkbookData } from '@univerjs/core'
import UniverSheet from '../../../components/UniverSheet'
import {
  fetchAdminWorkbookDetail,
  fetchFillingOverview,
  reviewWorkbook,
} from '../../../api/admin'
import type {
  AdminBindingStatus,
  AdminWorkbookDetail,
  WorkbookStatus,
} from '../../../api/types'
import { snapshotToXlsx } from '../../../utils/excelBridge'
import { currentPeriod, dayjsToPeriod, periodToDayjs, STATUS_META, STATUS_ORDER } from '../../../utils/workbookStatus'
import {
  buildOverviewTree,
  countStatus,
  formatStatusSummary,
  totalItems,
  type OverviewRow,
} from '../../../utils/overviewTree'

export default function OverviewPanel() {
  const [period, setPeriod] = useState<string>(currentPeriod())
  const [overview, setOverview] = useState<AdminBindingStatus[]>([])
  const [overviewLoading, setOverviewLoading] = useState(false)

  // 级联筛选
  const [ovSegmentId, setOvSegmentId] = useState<number | null>(null)
  const [ovEntityId, setOvEntityId] = useState<number | null>(null)
  const [ovDepartmentId, setOvDepartmentId] = useState<number | null>(null)
  const [ovRoleSearch, setOvRoleSearch] = useState('')
  const [ovFunctionTagId, setOvFunctionTagId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<WorkbookStatus | undefined>(undefined)

  // 预览 / 审核 / 退回
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewMounted, setPreviewMounted] = useState(false)
  const [previewCell, setPreviewCell] = useState<AdminBindingStatus | null>(null)
  const [previewDetail, setPreviewDetail] = useState<AdminWorkbookDetail | null>(null)
  const [previewSnapshot, setPreviewSnapshot] = useState<IWorkbookData | undefined>(undefined)
  const [reviewing, setReviewing] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const reloadOverview = useCallback(async (p: string) => {
    setOverviewLoading(true)
    try {
      setOverview(await fetchFillingOverview(p))
    } catch {
      message.error('加载填报总览失败')
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  useEffect(() => {
    void reloadOverview(period)
  }, [period, reloadOverview])

  const statusCounts = useMemo(() => {
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

  const segmentOptions = useMemo(() => {
    const map = new Map<number, string>()
    overview.forEach((o) => {
      if (o.segment_id != null) map.set(o.segment_id, o.segment_name ?? '')
    })
    return Array.from(map.entries()).map(([id, name]) => ({
      value: id,
      label: name || '未命名板块',
    }))
  }, [overview])

  const entityOptions = useMemo(() => {
    const map = new Map<number, string>()
    overview.forEach((o) => {
      if (o.entity_id != null && (ovSegmentId == null || o.segment_id === ovSegmentId)) {
        map.set(o.entity_id, o.entity_name ?? '')
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({
      value: id,
      label: name || '未命名主体',
    }))
  }, [overview, ovSegmentId])

  const departmentOptions = useMemo(() => {
    const map = new Map<number, string>()
    overview.forEach((o) => {
      if (
        o.department_id != null &&
        (ovSegmentId == null || o.segment_id === ovSegmentId) &&
        (ovEntityId == null || o.entity_id === ovEntityId)
      ) {
        map.set(o.department_id, o.department_name ?? '')
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({
      value: id,
      label: name || '未命名部门',
    }))
  }, [overview, ovSegmentId, ovEntityId])

  const functionTagOptions = useMemo(() => {
    const map = new Map<number, string>()
    overview.forEach((o) => {
      if (o.function_tag_id != null) map.set(o.function_tag_id, o.function_tag_name ?? '')
    })
    return Array.from(map.entries()).map(([id, name]) => ({
      value: id,
      label: name || '未命名职能',
    }))
  }, [overview])

  const filteredOverview = useMemo(() => {
    const keyword = ovRoleSearch.trim().toLowerCase()
    return overview.filter((o) => {
      if (ovSegmentId != null && o.segment_id !== ovSegmentId) return false
      if (ovEntityId != null && o.entity_id !== ovEntityId) return false
      if (ovDepartmentId != null && o.department_id !== ovDepartmentId) return false
      if (ovFunctionTagId != null && o.function_tag_id !== ovFunctionTagId) return false
      if (statusFilter !== undefined && o.status !== statusFilter) return false
      if (keyword && !o.role_name.toLowerCase().includes(keyword)) return false
      return true
    })
  }, [overview, ovSegmentId, ovEntityId, ovDepartmentId, ovFunctionTagId, statusFilter, ovRoleSearch])

  const treeRows = useMemo(() => buildOverviewTree(filteredOverview), [filteredOverview])

  const openPreview = async (cell: AdminBindingStatus) => {
    if (cell.status === 'none') {
      return
    }
    try {
      const detail = await fetchAdminWorkbookDetail(
        cell.role_id,
        cell.template_id,
        period,
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
      await reviewWorkbook(previewCell.role_id, previewCell.template_id, period, {
        action,
        reject_reason: action === 'rejected' ? reason : undefined,
      })
      message.success(action === 'approved' ? '已审核通过' : '已退回')
      setRejectOpen(false)
      setPreviewOpen(false)
      await reloadOverview(period)
    } catch (error) {
      const detail = (
        error as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail
      message.error(detail ?? '审核失败，请重试')
    } finally {
      setReviewing(false)
    }
  }

  const overviewTableColumns: TableColumnsType<OverviewRow> = [
    {
      title: '组织（板块/主体/部门）',
      key: 'org',
      width: 260,
      render: (_, row) => {
        if (row.type === 'dept') {
          const parts = [row.segmentName, row.entityName, row.departmentName].filter(Boolean)
          return parts.length ? (
            parts.join(' / ')
          ) : (
            <Typography.Text type="secondary">未分类</Typography.Text>
          )
        }
        return ''
      },
    },
    {
      title: '角色',
      key: 'role',
      width: 140,
      render: (_, row) =>
        row.type === 'item'
          ? row.item.role_name
          : row.type === 'role'
            ? row.roleName
            : '',
    },
    {
      title: '职能',
      key: 'tag',
      width: 110,
      render: (_, row) => {
        const tag =
          row.type === 'item'
            ? row.item.function_tag_name
            : row.type === 'role'
              ? row.functionTagName
              : null
        return tag ? <Tag color="blue">{tag}</Tag> : '-'
      },
    },
    {
      title: '模板',
      key: 'tpl',
      width: 160,
      render: (_, row) => {
        if (row.type === 'item') return row.item.template_name
        return `${totalItems(countStatus(row.children))} 个模板`
      },
    },
    {
      title: '状态',
      key: 'status',
      width: 200,
      render: (_, row) => {
        if (row.type === 'item') {
          const meta = STATUS_META[row.item.status]
          return <Tag color={meta.color}>{meta.text}</Tag>
        }
        return (
          <Typography.Text type="secondary">
            {formatStatusSummary(countStatus(row.children))}
          </Typography.Text>
        )
      },
    },
    {
      title: '更新时间',
      key: 'updated',
      width: 180,
      render: (_, row) =>
        row.type === 'item' && row.item.updated_at
          ? new Date(row.item.updated_at).toLocaleString()
          : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, row) => {
        if (row.type !== 'item') return ''
        if (row.item.status === 'none') return '-'
        return (
          <Button type="link" size="small" onClick={() => void openPreview(row.item)}>
            {row.item.status === 'submitted' ? '审核' : '预览'}
          </Button>
        )
      },
    },
  ]

  return (
    <>
      <Space orientation="vertical" style={{ width: '100%' }} size="large">
        <Space wrap>
          <Typography.Text strong>月度填报总览</Typography.Text>
          <DatePicker
            picker="month"
            value={periodToDayjs(period)}
            onChange={(v) => v && setPeriod(dayjsToPeriod(v))}
            allowClear={false}
            style={{ width: 140 }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void reloadOverview(period)}>
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
                ...(statusFilter === s ? { outline: '2px solid #1677ff' } : {}),
              }}
              onClick={() =>
                setStatusFilter((prev) => (prev === s ? undefined : s))
              }
            >
              {STATUS_META[s].text}（{statusCounts[s]}）
            </Tag>
          ))}
          <Select
            allowClear
            placeholder="业务板块"
            style={{ width: 150 }}
            value={ovSegmentId ?? undefined}
            onChange={(v) => {
              setOvSegmentId(v ?? null)
              setOvEntityId(null)
              setOvDepartmentId(null)
            }}
            options={segmentOptions}
          />
          <Select
            allowClear
            placeholder="主体"
            style={{ width: 150 }}
            value={ovEntityId ?? undefined}
            onChange={(v) => {
              setOvEntityId(v ?? null)
              setOvDepartmentId(null)
            }}
            options={entityOptions}
          />
          <Select
            allowClear
            placeholder="部门"
            style={{ width: 150 }}
            value={ovDepartmentId ?? undefined}
            onChange={(v) => setOvDepartmentId(v ?? null)}
            options={departmentOptions}
          />
          <Input.Search
            allowClear
            placeholder="搜索角色名"
            style={{ width: 170 }}
            value={ovRoleSearch}
            onChange={(e) => setOvRoleSearch(e.target.value)}
          />
          <Select
            allowClear
            placeholder="职能"
            style={{ width: 130 }}
            value={ovFunctionTagId ?? undefined}
            onChange={(v) => setOvFunctionTagId(v ?? null)}
            options={functionTagOptions}
          />
        </Space>
        <Table
          rowKey="key"
          columns={overviewTableColumns}
          dataSource={treeRows}
          loading={overviewLoading}
          size="small"
          pagination={false}
          scroll={{ x: 1300 }}
          expandable={{ defaultExpandAllRows: false }}
        />
      </Space>

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
        footer={[
          <Button
            key="export"
            icon={<DownloadOutlined />}
            disabled={!previewDetail}
            onClick={() => {
              if (previewDetail) {
                void snapshotToXlsx(
                  previewDetail.snapshot as unknown as IWorkbookData,
                  `${previewDetail.role_name}_${previewDetail.template_name}_${previewDetail.period}.xlsx`,
                )
              }
            }}
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
                  onClick={() => void handleReview('approved')}
                >
                  审核通过
                </Button>,
              ]
            : []),
        ]}
      >
        {previewDetail?.status === 'rejected' && previewDetail.reject_reason && (
          <Typography.Paragraph type="danger">
            退回原因：{previewDetail.reject_reason}
          </Typography.Paragraph>
        )}
        <div style={{ height: '60vh' }}>
          {previewMounted && <UniverSheet initialSnapshot={previewSnapshot} readOnly />}
        </div>
      </Modal>

      <Modal
        title="退回填报"
        open={rejectOpen}
        onCancel={() => setRejectOpen(false)}
        onOk={() => void handleReview('rejected', rejectReason)}
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
    </>
  )
}