/**
 * PeriodPanel：填报期间锁定 Tab 内容（年份 + 12 个月 Switch）。
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  InputNumber,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { fetchPeriods, upsertPeriod } from '../../../api/admin'
import type { FillingPeriodItem } from '../../../api/types'

export default function PeriodPanel() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [periods, setPeriods] = useState<FillingPeriodItem[]>([])
  const [loading, setLoading] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  const reload = useCallback(async (y: number) => {
    setLoading(true)
    try {
      setPeriods(await fetchPeriods(y))
    } catch {
      message.error('加载填报期间失败')
    } finally {
      setLoading(false)
    }
  }, [])

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
    <Space orientation="vertical" style={{ width: '100%' }} size="large">
      <Space wrap>
        <Typography.Text strong>填报期间锁定</Typography.Text>
        <InputNumber
          min={2000}
          max={2100}
          value={year}
          onChange={(v) => setYear(v ?? new Date().getFullYear())}
          style={{ width: 100 }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void reload(year)}>
          刷新
        </Button>
        <Typography.Text type="secondary">
          锁定某月后，该月所有部门不可再保存或提交填报（管理员可随时解锁）。
        </Typography.Text>
      </Space>
      <Spin spinning={loading}>
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
                locked ? <Tag color="red">已锁定</Tag> : <Tag color="green">开放</Tag>,
            },
            {
              title: '锁定/解锁',
              width: 160,
              render: (_, record) => (
                <Switch
                  checked={record.locked}
                  loading={toggling === record.period}
                  onChange={(checked) => void handleToggle(record.period, checked)}
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
}