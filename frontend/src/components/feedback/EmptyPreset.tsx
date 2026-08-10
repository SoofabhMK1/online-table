import type { CSSProperties } from 'react'
import type { EmptyStateProps } from './EmptyState'

interface EmptyPresetProps {
  variant: NonNullable<EmptyStateProps['variant']>
}

const wrap: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 132,
  height: 132,
  borderRadius: 24,
  background:
    'linear-gradient(135deg, rgba(45,91,255,0.06) 0%, rgba(110,140,255,0.10) 100%)',
}

const stroke = 'rgba(45, 91, 255, 0.32)'
const fill = 'rgba(45, 91, 255, 0.06)'
const mutedStroke = 'rgba(15, 23, 42, 0.18)'
const mutedFill = 'rgba(15, 23, 42, 0.04)'

export function EmptyPreset({ variant }: EmptyPresetProps) {
  if (variant === 'search') {
    return (
      <div style={wrap}>
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <circle cx="34" cy="34" r="20" stroke={stroke} strokeWidth="3" />
          <path
            d="M50 50l16 16"
            stroke={stroke}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M26 34h16M34 26v16"
            stroke={mutedStroke}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    )
  }
  if (variant === 'roles') {
    return (
      <div style={wrap}>
        <svg width="84" height="80" viewBox="0 0 84 80" fill="none">
          <circle cx="32" cy="26" r="10" fill={mutedFill} stroke={mutedStroke} strokeWidth="2" />
          <path
            d="M14 60c0-10 8-18 18-18s18 8 18 18"
            fill={fill}
            stroke={stroke}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="60" cy="22" r="6" fill={fill} stroke={stroke} strokeWidth="2" />
          <path
            d="M50 50c0-6 4-10 10-10s10 4 10 10"
            stroke={stroke}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
    )
  }
  if (variant === 'templates' || variant === 'archived') {
    return (
      <div style={wrap}>
        <svg width="84" height="80" viewBox="0 0 84 80" fill="none">
          <rect
            x="12"
            y="14"
            width="60"
            height="52"
            rx="6"
            fill={fill}
            stroke={stroke}
            strokeWidth="2.4"
          />
          <path
            d="M12 30h60M30 14v52M48 14v52"
            stroke={stroke}
            strokeWidth="2"
          />
          <circle cx="65" cy="22" r="6" fill="#fff" stroke={stroke} strokeWidth="2" />
          <path
            d="M62 22l2 2 4-4"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    )
  }
  // workbooks / generic
  return (
    <div style={wrap}>
      <svg width="84" height="80" viewBox="0 0 84 80" fill="none">
        <rect
          x="10"
          y="12"
          width="64"
          height="56"
          rx="8"
          fill={fill}
          stroke={stroke}
          strokeWidth="2.4"
        />
        <path
          d="M22 28h40M22 40h40M22 52h24"
          stroke={stroke}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
