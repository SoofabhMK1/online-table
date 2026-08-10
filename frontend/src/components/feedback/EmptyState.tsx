import type { ReactNode } from 'react'
import { Empty } from 'antd'
import { EmptyPreset } from './EmptyPreset'

export interface EmptyStateProps {
  variant?: 'templates' | 'roles' | 'workbooks' | 'archived' | 'search' | 'generic'
  title?: string
  description?: ReactNode
  action?: ReactNode
}

const DEFAULTS: Record<NonNullable<EmptyStateProps['variant']>, { title: string; desc: string }> = {
  templates: { title: '还没有模板', desc: '先新建一个模板，或导入现成的 Excel' },
  roles: { title: '暂无角色', desc: '先在「组织架构」配置业务板块 / 主体 / 部门，再创建角色' },
  workbooks: { title: '当前周期暂无可填报模板', desc: '可能该年份尚未建模板，或管理员还未为你配置权限' },
  archived: { title: '归档仓库为空', desc: '归档的模板会显示在这里，可随时恢复' },
  search: { title: '未找到匹配项', desc: '尝试调整搜索关键词或筛选条件' },
  generic: { title: '暂无数据', desc: '稍后再来看看' },
}

export default function EmptyState({
  variant = 'generic',
  title,
  description,
  action,
}: EmptyStateProps) {
  const def = DEFAULTS[variant]
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
      }}
    >
      <EmptyPreset variant={variant} />
      <div
        style={{
          marginTop: 16,
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--ot-color-text)',
        }}
      >
        {title ?? def.title}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 13,
          color: 'var(--ot-color-text-secondary)',
          maxWidth: 360,
        }}
      >
        {description ?? def.desc}
      </div>
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}

export function EmptyStateLegacy(props: { description?: ReactNode }) {
  return <Empty description={props.description} />
}
