import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import '@mantine/core/styles.css'
import { Notifications } from '@mantine/notifications'
import './index.css'
import App from './App.tsx'

// 创建自定义 Mantine 主题
const theme = createTheme({
  primaryColor: 'blue',
  colors: {
    blue: [
      '#f0f7ff',
      '#e0efff',
      '#bae0ff',
      '#7cc5ff',
      '#36aaff',
      '#008eff',
      '#0072e6',
      '#005ecc',
      '#0550a8',
      '#0a448b',
    ],
  },
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  fontFamilyMonospace: 'Fira Code, monospace',
  radius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },
  defaultRadius: 'md',
  cursorType: 'pointer',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme}>
      <Notifications position="top-right" />
      <App />
    </MantineProvider>
  </StrictMode>,
)
