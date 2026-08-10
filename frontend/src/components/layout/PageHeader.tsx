import type { ReactNode } from 'react'
import { Typography } from 'antd'

export interface PageHeaderProps {
  title: string
  description?: string
  eyebrow?: string
  actions?: ReactNode
  meta?: ReactNode
}

export default function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  meta,
}: PageHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 24,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        {eyebrow && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--ot-color-primary)',
              marginBottom: 6,
            }}
          >
            {eyebrow}
          </div>
        )}
        <Typography.Title
          level={2}
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </Typography.Title>
        {description && (
          <Typography.Paragraph
            type="secondary"
            style={{
              marginTop: 6,
              marginBottom: 0,
              fontSize: 14,
            }}
          >
            {description}
          </Typography.Paragraph>
        )}
        {meta && <div style={{ marginTop: 12 }}>{meta}</div>}
      </div>
      {actions && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {actions}
        </div>
      )}
    </div>
  )
}
