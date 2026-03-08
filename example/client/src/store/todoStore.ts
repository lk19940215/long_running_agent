import apiClient, { type Todo } from '../lib/api'

// ==================== API 服务层 ====================
// 封装所有 TODO 相关的 API 调用

export const todosApi = {
  /**
   * 获取所有 TODO 列表
   */
  async getTodos(): Promise<Todo[]> {
    const response = await apiClient.get<Todo[]>('/api/todos')
    return response.data
  },

  /**
   * 创建新的 TODO
   * @param title 任务标题
   */
  async createTodo(title: string): Promise<Todo> {
    const response = await apiClient.post<Todo>('/api/todos', { title })
    return response.data
  },

  /**
   * 更新 TODO 完成状态
   * @param id 任务 ID
   * @param completed 完成状态
   */
  async updateTodo(id: number, completed: boolean): Promise<Todo> {
    const response = await apiClient.put<Todo>(`/api/todos/${id}`, { completed })
    return response.data
  },

  /**
   * 删除 TODO
   * @param id 任务 ID
   */
  async deleteTodo(id: number): Promise<void> {
    await apiClient.delete(`/api/todos/${id}`)
  },
}

// ==================== Zustand Store ====================
// 管理 TODO 应用的状态

import { create } from 'zustand'

// 过滤类型
export type FilterType = 'all' | 'active' | 'completed'

// Store 状态类型定义
interface TodoState {
  // 状态数据
  todos: Todo[]
  filter: FilterType
  loading: boolean
  error: string | null

  // Actions
  // 获取 TODO 列表
  fetchTodos: () => Promise<void>
  // 添加 TODO
  addTodo: (title: string) => Promise<void>
  // 切换 TODO 完成状态
  toggleTodo: (id: number) => Promise<void>
  // 删除 TODO
  deleteTodo: (id: number) => Promise<void>
  // 设置过滤条件
  setFilter: (filter: FilterType) => void
  // 清除错误
  clearError: () => void
}

// 创建 Zustand Store
export const useTodoStore = create<TodoState>((set, get) => ({
  // 初始状态
  todos: [],
  filter: 'all',
  loading: false,
  error: null,

  // 获取 TODO 列表
  fetchTodos: async () => {
    set({ loading: true, error: null })
    try {
      const todos = await todosApi.getTodos()
      set({ todos, loading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '获取数据失败',
        loading: false
      })
    }
  },

  // 添加 TODO
  addTodo: async (title: string) => {
    set({ loading: true, error: null })
    try {
      const newTodo = await todosApi.createTodo(title)
      set((state) => ({
        todos: [...state.todos, newTodo],
        loading: false,
      }))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '添加任务失败',
        loading: false
      })
      throw error
    }
  },

  // 切换 TODO 完成状态
  toggleTodo: async (id: number) => {
    const state = get()
    const todo = state.todos.find((t) => t.id === id)
    if (!todo) return

    // 乐观更新（先更新 UI，再请求 API）
    const newTodos = state.todos.map((t) =>
      t.id === id ? { ...t, completed: !t.completed } : t
    )
    set({ todos: newTodos })

    try {
      await todosApi.updateTodo(id, !todo.completed)
    } catch (error) {
      // 如果失败，回滚状态
      set({ todos: state.todos })
      set({ error: error instanceof Error ? error.message : '更新任务失败' })
      throw error
    }
  },

  // 删除 TODO
  deleteTodo: async (id: number) => {
    const state = get()
    // 乐观更新
    set({ todos: state.todos.filter((t) => t.id !== id) })

    try {
      await todosApi.deleteTodo(id)
    } catch (error) {
      // 如果失败，回滚状态
      set({ todos: state.todos })
      set({ error: error instanceof Error ? error.message : '删除任务失败' })
      throw error
    }
  },

  // 设置过滤条件
  setFilter: (filter: FilterType) => {
    set({ filter })
  },

  // 清除错误
  clearError: () => {
    set({ error: null })
  },
}))
