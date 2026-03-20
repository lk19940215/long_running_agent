import { useCallback, useMemo, useState } from 'react'
import { TaskItem } from './TaskItem'
import { TaskDragLayer } from './TaskDragLayer'
import { TaskForm } from './TaskForm'
import { Button } from '../ui/Button'
import { useTasks } from '../../hooks/useTasks'
import { useTags } from '../../hooks/useTags'
import type { Task, CreateTaskParams, UpdateTaskParams } from '../../types'

export interface TaskListProps {
  className?: string
}

export function TaskList({ className = '' }: TaskListProps) {
  const {
    tasks: allTasks,
    addTask,
    updateTask,
    deleteTask,
    toggleTaskStatus,
    reorderTasks,
  } = useTasks()

  const { selectedTagIds, isAllSelected } = useTags()

  // 根据选中标签筛选任务
  const tasks = useMemo(() => {
    if (isAllSelected) return allTasks
    return allTasks.filter(task =>
      task.tagIds.some(tagId => selectedTagIds.includes(tagId))
    )
  }, [allTasks, selectedTagIds, isAllSelected])

  // 表单状态
  const [formOpen, setFormOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  // 处理拖拽排序
  const handleReorder = useCallback((dragIndex: number, hoverIndex: number) => {
    reorderTasks(dragIndex, hoverIndex)
  }, [reorderTasks])

  // 打开创建表单
  const handleCreate = useCallback(() => {
    setEditingTask(null)
    setFormOpen(true)
  }, [])

  // 打开编辑表单
  const handleEdit = useCallback((task: Task) => {
    setEditingTask(task)
    setFormOpen(true)
  }, [])

  // 提交表单
  const handleSubmit = useCallback((params: CreateTaskParams | UpdateTaskParams) => {
    if (editingTask) {
      updateTask(editingTask.id, params)
    } else {
      addTask(params as CreateTaskParams)
    }
  }, [editingTask, addTask, updateTask])

  // 关闭表单
  const handleCloseForm = useCallback(() => {
    setFormOpen(false)
    setEditingTask(null)
  }, [])

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* 头部 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#E5E7EB]">任务列表</h2>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<span>+</span>}
          onClick={handleCreate}
        >
          添加任务
        </Button>
      </div>

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <EmptyState onCreateTask={handleCreate} />
        ) : (
          <div className="space-y-3">
            {tasks.map((task, index) => (
              <TaskItem
                key={task.id}
                task={task}
                index={index}
                onToggleStatus={toggleTaskStatus}
                onDelete={deleteTask}
                onEdit={handleEdit}
                onReorder={handleReorder}
              />
            ))}
          </div>
        )}
      </div>

      {/* 拖拽层 */}
      <TaskDragLayer />

      {/* 表单弹窗 */}
      <TaskForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        onSubmit={handleSubmit}
        task={editingTask}
        mode={editingTask ? 'edit' : 'create'}
      />
    </div>
  )
}

// 空状态组件
interface EmptyStateProps {
  onCreateTask: () => void
}

function EmptyState({ onCreateTask }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12">
      <div className="text-6xl mb-4">📝</div>
      <h3 className="text-lg font-medium text-[#E5E7EB] mb-2">暂无任务</h3>
      <p className="text-sm text-[#6B7280] mb-6">
        点击下方按钮添加你的第一个任务
      </p>
      <Button
        variant="primary"
        leftIcon={<span>+</span>}
        onClick={onCreateTask}
      >
        添加任务
      </Button>
    </div>
  )
}

export default TaskList