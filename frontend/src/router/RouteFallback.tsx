import { Spin } from 'antd'

export default function RouteFallback() {
  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--ot-color-bg)',
      }}
    >
      <Spin size="large" />
    </div>
  )
}
