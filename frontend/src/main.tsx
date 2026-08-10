import { createRoot } from 'react-dom/client'
import { ConfigProvider, App as AntdApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { RouterProvider } from 'react-router-dom'
import './index.css'
import { router } from './router'
import { antdTheme } from './styles/theme'

// 注意：本项目刻意不启用 React StrictMode。
// Univer 会把内部 React root 渲染到容器中，StrictMode 的双挂载（mount→unmount→mount）
// 会与 univer.dispose() 产生竞态，触发 React 19 的
// "Attempted to synchronously unmount a root while React was already rendering" 警告，
// 并可能导致重新挂载后的 Univer 实例状态异常（单元格无法输入）。
createRoot(document.getElementById('root')!).render(
  <ConfigProvider locale={zhCN} theme={antdTheme}>
    <AntdApp>
      <RouterProvider router={router} />
    </AntdApp>
  </ConfigProvider>,
)
