import React from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  fullWidth?: boolean
  children: React.ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `bg-gradient-to-r from-[#7CB68E] to-[#D4A574] text-white
             hover:from-[#6BA67E] hover:to-[#C49564]
             active:from-[#5A9A6D] active:to-[#B48554]
             shadow-md hover:shadow-lg
             disabled:from-[#7CB68E80] disabled:to-[#D4A57480]`,
  secondary: `bg-[#10B981] text-white
               hover:bg-[#0EA572]
               active:bg-[#0C9665]
               disabled:bg-[#10B98180]`,
  outline: `bg-transparent border border-[#7CB68E] text-[#5A9A6D]
            hover:bg-[#7CB68E15]
            active:bg-[#7CB68E25]
            disabled:border-[#7CB68E50] disabled:text-[#5A9A6D50]`,
  ghost: `bg-transparent text-[#5A9A6D]
          hover:bg-[#7CB68E15]
          active:bg-[#7CB68E25]
          disabled:text-[#5A9A6D50]`,
  danger: `bg-[#EF4444] text-white
           hover:bg-[#DC3636]
           active:bg-[#C72B2B]
           disabled:bg-[#EF444480]`,
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5 rounded-md',
  md: 'px-4 py-2 text-sm gap-2 rounded-lg',
  lg: 'px-6 py-3 text-base gap-2 rounded-xl',
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const baseStyles = `
    inline-flex items-center justify-center
    font-medium transition-all duration-200
    focus:outline-none focus:ring-2 focus:ring-[#7CB68E40] focus:ring-offset-2
    disabled:cursor-not-allowed disabled:opacity-60
  `

  return (
    <button
      className={`
        ${baseStyles}
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  )
}

export default Button