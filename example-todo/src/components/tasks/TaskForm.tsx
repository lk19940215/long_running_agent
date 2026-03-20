import { useState, useEffect, useCallback } from 'react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { useTags } from '../../hooks/useTags'
import type { Task, CreateTaskParams, UpdateTaskParams, Tag } from '../../types'

export interface TaskFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (params: CreateTaskParams | UpdateTaskParams) => void
  task?: Task | null // 编辑模式时传入
  mode?: 'create' | 'edit'
}

export function TaskForm({
  isOpen,
  onClose,
  onSubmit,
  task,
  mode = 'create',
}: TaskFormProps) {
  const { tags } = useTags()

  // 表单状态
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  // 错误状态
  const [errors, setErrors] = useState<{ title?: string }>({})

  // 初始化表单（编辑模式）
  useEffect(() => {
    if (isOpen) {
      if (task && mode === 'edit') {
        setTitle(task.title)
        setDescription(task.description)
        setSelectedTagIds(task.tagIds)
      } else {
        // 创建模式：重置表单
        setTitle('')
        setDescription('')
        setSelectedTagIds([])
      }
      setErrors({})
    }
  }, [isOpen, task, mode])

  // 切换标签选择
  const toggleTag = useCallback((tagId: string) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    )
  }, [])

  // 验证表单
  const validate = useCallback((): boolean => {
    const newErrors: { title?: string } = {}

    if (!title.trim()) {
      newErrors.title = '请输入任务名称'
    } else if (title.length > 100) {
      newErrors.title = '任务名称不能超过 100 个字符'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [title])

  // 提交表单
  const handleSubmit = useCallback(() => {
    if (!validate()) return

    const params: CreateTaskParams | UpdateTaskParams = {
      title: title.trim(),
      description: description.trim(),
      tagIds: selectedTagIds,
    }

    onSubmit(params)
    onClose()
  }, [title, description, selectedTagIds, validate, onSubmit, onClose])

  // 键盘事件处理
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  // 可选标签（过滤已选中的）
  const availableTags = tags.filter(tag => !tag.isBuiltIn || ['tag-work', 'tag-personal', 'tag-study'].includes(tag.id))

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'create' ? '添加任务' : '编辑任务'}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            {mode === 'create' ? '添加任务' : '保存修改'}
          </Button>
        </>
      }
    >
      <div className="space-y-5" onKeyDown={handleKeyDown}>
        {/* 任务名称 */}
        <div>
          <label className="block text-sm font-medium text-[#E5E7EB] mb-2">
            任务名称 <span className="text-[#EF4444]">*</span>
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="输入任务名称..."
            error={errors.title}
            autoFocus
          />
        </div>

        {/* 任务描述 */}
        <div>
          <label className="block text-sm font-medium text-[#E5E7EB] mb-2">
            任务描述
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="添加详细描述（可选）..."
            className="
              w-full h-20 px-4 py-3
              bg-[#1A1D21] border border-[#2D3139]
              rounded-lg text-sm text-[#E5E7EB]
              placeholder:text-[#6B7280]
              focus:border-[#7CB68E] focus:ring-1 focus:ring-[#7CB68E]
              focus:outline-none
              resize-none
              transition-colors
            "
          />
        </div>

        {/* 标签选择 */}
        <div>
          <label className="block text-sm font-medium text-[#E5E7EB] mb-2">
            选择标签
          </label>
          <div className="flex flex-wrap gap-2">
            {availableTags.map(tag => (
              <TagSelectButton
                key={tag.id}
                tag={tag}
                isSelected={selectedTagIds.includes(tag.id)}
                onClick={() => toggleTag(tag.id)}
              />
            ))}
          </div>
          {selectedTagIds.length === 0 && (
            <p className="mt-2 text-xs text-[#6B7280]">
              可选择多个标签对任务进行分类
            </p>
          )}
        </div>

        {/* 快捷键提示 */}
        <div className="pt-2 border-t border-[#2D3139]">
          <p className="text-xs text-[#6B7280]">
            提示：按 <kbd className="px-1.5 py-0.5 bg-[#2D3139] rounded text-[#9CA3AF]">⌘</kbd> + <kbd className="px-1.5 py-0.5 bg-[#2D3139] rounded text-[#9CA3AF]">Enter</kbd> 快速提交
          </p>
        </div>
      </div>
    </Modal>
  )
}

// 标签选择按钮
interface TagSelectButtonProps {
  tag: Tag
  isSelected: boolean
  onClick: () => void
}

function TagSelectButton({ tag, isSelected, onClick }: TagSelectButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        h-8 px-3 inline-flex items-center gap-1.5
        rounded-full text-sm font-medium
        transition-all duration-200
        ${isSelected
          ? 'ring-2 ring-offset-2 ring-offset-[#1A1D21]'
          : 'opacity-70 hover:opacity-100'
        }
      `}
      style={{
        backgroundColor: isSelected ? tag.color.bg : '#2D3139',
        color: isSelected ? tag.color.text : '#9CA3AF',
        border: `1px solid ${isSelected ? tag.color.border || tag.color.text : '#3D4149'}`,
        // @ts-expect-error CSS variable for ring color
        '--tw-ring-color': isSelected ? tag.color.text : undefined,
      }}
    >
      <span>{tag.icon}</span>
      <span>{tag.name}</span>
    </button>
  )
}

export default TaskForm