import type { Tag } from '../../types'

export interface TagPillProps {
  tag: Tag
  size?: 'sm' | 'md' | 'lg'
  isSelected?: boolean
  onClick?: () => void
  showIcon?: boolean
  className?: string
}

const sizeStyles = {
  sm: 'px-2 py-0.5 text-xs gap-1',
  md: 'px-3 py-1 text-xs gap-1.5',
  lg: 'px-4 py-1.5 text-sm gap-2',
}

export function TagPill({
  tag,
  size = 'md',
  isSelected = false,
  onClick,
  showIcon = true,
  className = '',
}: TagPillProps) {
  const { color, icon, name } = tag

  const baseStyles = `
    inline-flex items-center justify-center
    rounded-full font-medium
    transition-all duration-200
  `

  const interactiveStyles = onClick
    ? 'cursor-pointer hover:opacity-80 active:scale-95'
    : ''

  const selectedStyles = isSelected
    ? 'ring-2 ring-offset-2 ring-offset-[#1A1D21]'
    : ''

  return (
    <span
      className={`
        ${baseStyles}
        ${sizeStyles[size]}
        ${interactiveStyles}
        ${selectedStyles}
        ${isSelected ? `ring-[${color.text}]` : ''}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      style={{
        backgroundColor: color.bg,
        color: color.text,
        border: `1px solid ${color.border}`,
      }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
    >
      {showIcon && icon && <span>{icon}</span>}
      <span>{name}</span>
    </span>
  )
}

export default TagPill