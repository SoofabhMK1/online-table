import { useCallback, useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  InputNumber,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
} from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { fetchPeriods, upsertPeriod } from '../../api/admin'
import type { FillingPeriodItem } from '../../api/types'
import PageHeader from '../../components/layout/PageHeader'
import StatusChip from '../../components/feedback/StatusChip'
import type { WorkbookStatus } from '../../api/types'

export default function PeriodsPage() {
  const { message } = App.useApp()
  const [year, setYear] = useState(new Date().getFullYear())
  const [periods, setPeriods] = useState<FillingPeriodItem[]>([])
  const [loading, setLoading] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  const reload = useCallback(
    async (y: number) => {
      setLoading(true)
      try {
        setPeriods(await fetchPeriods(y))
      } catch {
        message.error('加载填报期间失败')
      } finally {
        setLoading(false)
      }
    },
    [message],
  )

  useEffect(() => {
    void reload(year)
  }, [year, reload])

  const handleToggle = async (period: string, locked: boolean) => {
    setToggling(period)
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
      setToggling(null)
    }
  }

  return (
    <div className="ot-fade-in">
      <PageHeader
        eyebrow="管理中心"
        title="填报期间锁定"
        description="锁定某月后，该月所有部门不可再保存或提交填报（管理员可随时解锁）。"
        actions={
          <Space wrap>
            <InputNumber
              min={2000}
              max={2100}
              value={year}
              onChange={(v) => setYear(v ?? new Date().getFullYear())}
              style={{ width: 110 }}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void reload(year)}>
              刷新
            </Button>
          </Space>
        }
      />

      <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: 12 }}>
        <Spin spinning={loading}>
          <Table
            rowKey="period"
            size="middle"
            pagination={false}
            dataSource={periods}
            className="ot-cv-auto"
            columns={[
              {
                title: '月份',
                dataIndex: 'period',
                width: 140,
                render: (v: string) => (
                  <span className="ot-mono" style={{ fontWeight: 500 }}>
                    {v}
                  </span>
                ),
              },
              {
                title: '状态',
                dataIndex: 'locked',
                width: 160,
                render: (locked: boolean) => (
                  <StatusChip
                    status={(locked ? 'rejected' : 'approved') as WorkbookStatus}
                    showText={false}
                  />
                ),
              },
              {
                title: '说明',
                render: (_, record) =>
                  record.locked ? (
                    <Tag
                      color="red"
                      style={{ borderRadius: 6 }}
                    >
                      已锁定 · 部门无法再保存或提交
                    </Tag>
                  ) : (
                    <Tag
                      color="green"
                      style={{ borderRadius: 6 }}
                    >
                      开放 · 部门可正常填报
                    </Tag>
                  ),
              },
              {
                title: '锁定/解锁',
                width: 180,
                render: (_, record) => (
                  <Switch
                    checked={record.locked}
                    loading={toggling === record.period}
                    onChange={(checked) =>
                      void handleToggle(record.period, checked)
                    }
                    checkedChildren="锁定"
                    unCheckedChildren="开放"
                  />
                ),
              },
            ]}
          />
        </Spin>
      </Card>
    </div>
  )
}
