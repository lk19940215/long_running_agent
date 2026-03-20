export interface TimerDisplayProps {
  formattedTime: string
  progress: number
  modeLabel: string
  modeColor: string
}

export function TimerDisplay({
  formattedTime,
  progress,
  modeLabel,
  modeColor,
}: TimerDisplayProps) {
  // 圆环周长 (r=77, 周长 ≈ 483.8)
  const circumference = 2 * Math.PI * 77
  const strokeDashoffset = circumference * (1 - progress / 100)

  return (
    <div className="flex flex-col items-center gap-4">
      {/* 圆环进度 */}
      <div className="relative w-40 h-40">
        {/* 背景圆 */}
        <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
          <circle
            cx="80"
            cy="80"
            r="77"
            fill="#1A1D21"
            stroke="#2D3139"
            strokeWidth="2"
          />
          {/* 进度圆 */}
          <circle
            cx="80"
            cy="80"
            r="77"
            fill="none"
            stroke={modeColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-[stroke-dashoffset] duration-1000"
          />
        </svg>

        {/* 中心内容 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold text-[#E5E7EB] tabular-nums">
            {formattedTime}
          </span>
        </div>
      </div>

      {/* 模式标签 */}
      <div className="text-sm font-medium text-[#9CA3AF]">
        {modeLabel}
      </div>
    </div>
  )
}

export default TimerDisplay