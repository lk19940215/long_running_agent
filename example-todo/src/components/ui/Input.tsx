import React, { forwardRef } from 'react'

export type InputVariant = 'default' | 'filled' | 'flushed'
export type InputSize = 'sm' | 'md' | 'lg'

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  variant?: InputVariant
  inputSize?: InputSize
  label?: string
  error?: string
  hint?: string
  leftElement?: React.ReactNode
  rightElement?: React.ReactNode
  fullWidth?: boolean
}

const variantStyles: Record<InputVariant, string> = {
  default: `bg-[#1A1D21] border border-[#2D3139] text-[#E5E7EB]
            placeholder:text-[#6B7280]
            focus:border-[#7CB68E] focus:ring-1 focus:ring-[#7CB68E]
            hover:border-[#3D4149]`,
  filled: `bg-[#2D3139] border border-transparent text-[#E5E7EB]
           placeholder:text-[#6B7280]
           focus:bg-[#1A1D21] focus:border-[#7CB68E] focus:ring-1 focus:ring-[#7CB68E]`,
  flushed: `bg-transparent border-b-2 border-[#2D3139] text-[#E5E7EB]
            placeholder:text-[#6B7280] rounded-none px-0
            focus:border-[#7CB68E] focus:ring-0`,
}

const sizeStyles: Record<InputSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-4 py-3 text-base rounded-xl',
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      variant = 'default',
      inputSize = 'md',
      label,
      error,
      hint,
      leftElement,
      rightElement,
      fullWidth = true,
      disabled,
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`

    const baseStyles = `
      w-full transition-all duration-200
      focus:outline-none
      disabled:opacity-50 disabled:cursor-not-allowed
    `

    const errorStyles = error
      ? 'border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]'
      : ''

    return (
      <div className={`${fullWidth ? 'w-full' : 'inline-block'}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-[#E5E7EB] mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftElement && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]">
              {leftElement}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={`
              ${baseStyles}
              ${variantStyles[variant]}
              ${sizeStyles[inputSize]}
              ${errorStyles}
              ${leftElement ? 'pl-10' : ''}
              ${rightElement ? 'pr-10' : ''}
              ${className}
            `.trim().replace(/\s+/g, ' ')}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280]">
              {rightElement}
            </div>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-sm text-[#EF4444]">{error}</p>
        )}
        {hint && !error && (
          <p className="mt-1.5 text-sm text-[#6B7280]">{hint}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input