import axios, { AxiosError, type AxiosInstance } from 'axios'

// API 基础 URL，支持环境变量
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// TODO 数据类型定义
export interface Todo {
  id: number
  title: string
  completed: boolean
  createdAt: string
}

// 创建 axios 实例
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
})

// 请求拦截器：可在此添加认证 token
apiClient.interceptors.request.use(
  (config) => {
    // 未来可在此添加 Authorization header
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器：统一错误处理
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    console.error('[API Error]', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      message: error.message,
    })

    // 根据状态码处理不同错误
    if (error.response) {
      const { status } = error.response
      if (status === 404) {
        console.error('资源不存在')
      } else if (status === 500) {
        console.error('服务器错误')
      }
    } else if (error.request) {
      console.error('网络错误：无法连接到服务器')
    }

    return Promise.reject(error)
  }
)

export default apiClient
