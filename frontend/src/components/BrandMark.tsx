import type { CSSProperties } from 'react'
import { BRAND_PRIMARY } from '../constants'

interface BrandMarkProps {
  size?: number
  style?: CSSProperties
  withWord?: boolean
  wordColor?: string
}

export default function BrandMark({
  size = 32,
  style,
  withWord = false,
  wordColor = 'var(--ot-color-text)',
}: BrandMarkProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        ...style,
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
          background: `linear-gradient(135deg, ${BRAND_PRIMARY} 0%, #6E8CFF 100%)`,
          color: '#fff',
          fontWeight: 700,
          fontSize: Math.round(size * 0.4),
          letterSpacing: '-0.02em',
          boxShadow: '0 4px 12px -2px rgba(45, 91, 255, 0.35)',
        }}
      >
        OT
      </span>
      {withWord && (
        <span
          style={{
            fontSize: Math.max(14, size * 0.46),
            fontWeight: 600,
            color: wordColor,
            letterSpacing: '-0.01em',
          }}
        >
          在线表格
        </span>
      )}
    </span>
  )
}
