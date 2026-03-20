import { useTags } from '../../hooks/useTags'
import { BUILTIN_TAG_IDS } from '../../types/constants'
import type { Tag } from '../../types'

export interface TagSidebarProps {
  className?: string
}

export function TagSidebar({ className = '' }: TagSidebarProps) {
  const {
    tags,
    selectTag,
    isTagSelected,
    isAllSelected,
  } = useTags()

  // 获取任务数量（从 tags 数据中）
  const getTaskCount = (): number => {
    // 任务数量将在后续集成 TaskContext 时实现
    return 0
  }

  return (
    <aside
      className={`
        w-64 h-full
        bg-[#1A1D21] border-r border-[#2D3139]
        flex flex-col
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      {/* 标题 */}
      <div className="px-4 py-3 border-b border-[#2D3139]">
        <h2 className="text-sm font-semibold text-[#9CA3AF] uppercase tracking-wider">
          标签
        </h2>
      </div>

      {/* 标签列表 */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* 全部任务 */}
        <TagItem
          icon="📋"
          name="全部任务"
          count={0} // 将在集成时实现
          isSelected={isAllSelected}
          onClick={() => selectTag(BUILTIN_TAG_IDS.ALL)}
          isSpecial
        />

        {/* 分隔线 */}
        <div className="my-2 border-t border-[#2D3139]" />

        {/* 内置标签 */}
        {tags.filter(tag => tag.isBuiltIn).map(tag => (
          <TagItem
            key={tag.id}
            icon={tag.icon}
            name={tag.name}
            color={tag.color}
            count={getTaskCount()}
            isSelected={isTagSelected(tag.id)}
            onClick={() => selectTag(tag.id)}
          />
        ))}

        {/* 分隔线 */}
        {tags.some(tag => !tag.isBuiltIn) && (
          <>
            <div className="my-2 border-t border-[#2D3139]" />
            <div className="px-2 py-1 text-xs text-[#6B7280]">自定义标签</div>
          </>
        )}

        {/* 自定义标签 */}
        {tags.filter(tag => !tag.isBuiltIn).map(tag => (
          <TagItem
            key={tag.id}
            icon={tag.icon}
            name={tag.name}
            color={tag.color}
            count={getTaskCount()}
            isSelected={isTagSelected(tag.id)}
            onClick={() => selectTag(tag.id)}
          />
        ))}

        {/* 新建标签按钮 */}
        <button
          className="
            w-full mt-2 px-3 py-2.5
            flex items-center gap-3
            text-sm text-[#6B7280]
            bg-transparent border border-dashed border-[#3D4149]
            rounded-lg
            hover:text-[#5A9A6D] hover:border-[#5A9A6D55]
            transition-colors
          "
        >
          <span className="text-lg">+</span>
          <span>新建标签</span>
        </button>
      </nav>

      {/* 底部统计 */}
      <div className="px-4 py-3 border-t border-[#2D3139]">
        <p className="text-xs text-[#6B7280]">
          共 {tags.length} 个标签
        </p>
      </div>
    </aside>
  )
}

// 标签项组件
interface TagItemProps {
  icon?: string
  name: string
  color?: Tag['color']
  count: number
  isSelected: boolean
  onClick: () => void
  isSpecial?: boolean // 用于"全部任务"特殊样式
}

function TagItem({
  icon,
  name,
  color,
  count,
  isSelected,
  onClick,
  isSpecial = false,
}: TagItemProps) {
  // 选中状态的样式
  const selectedBg = isSpecial
    ? 'bg-gradient-to-r from-[#7CB68E20] to-[#D4A57420] border border-[#7CB68E55]'
    : color
      ? `border border-[${color.border}]`
      : 'bg-[#7CB68E20] border border-[#7CB68E55]'

  const baseStyles = `
    w-full h-11 px-3
    flex items-center gap-3
    rounded-lg
    transition-all duration-200
    cursor-pointer
  `

  const unselectedStyles = `
    bg-[#1E2128] border border-transparent
    hover:bg-[#252930]
  `

  return (
    <button
      className={`
        ${baseStyles}
        ${isSelected ? selectedBg : unselectedStyles}
      `.trim().replace(/\s+/g, ' ')}
      onClick={onClick}
      style={isSelected && color && !isSpecial ? {
        backgroundColor: color.bg,
        borderColor: color.border,
      } : undefined}
    >
      {/* 图标 */}
      <span className="text-lg flex-shrink-0">
        {icon}
      </span>

      {/* 名称 */}
      <span className={`
        flex-1 text-left text-sm
        ${isSelected ? 'text-[#E5E7EB] font-medium' : 'text-[#9CA3AF]'}
      `}>
        {name}
      </span>

      {/* 数量徽章 */}
      <span
        className={`
          w-7 h-5.5
          flex items-center justify-center
          rounded-md text-xs font-medium
          ${isSelected
            ? 'bg-gradient-to-r from-[#7CB68E] to-[#D4A574] text-white'
            : 'bg-[#2D3139] text-[#6B7280]'
          }
        `}
      >
        {count}
      </span>
    </button>
  )
}

export default TagSidebar