import { TimerDisplay } from './TimerDisplay'
import { TimerControls } from './TimerControls'
import { usePomodoro } from '../../hooks/usePomodoro'
import { useTasks } from '../../hooks/useTasks'

export interface PomodoroTimerProps {
  className?: string
}

export function PomodoroTimer({ className = '' }: PomodoroTimerProps) {
  const {
    status,
    formattedTime,
    progress,
    modeLabel,
    modeColor,
    todayStats,
    taskId,
    start,
    pause,
    resume,
    reset,
    skip,
  } = usePomodoro()

  const { getTaskById } = useTasks()

  // 获取关联的任务
  const linkedTask = taskId ? getTaskById(taskId) : null

  return (
    <div className={`flex flex-col w-full ${className}`}>
      {/* 番茄钟面板 */}
      <div className="bg-[#1E2128] border border-[#2D3139] rounded-2xl p-6 flex flex-col items-center gap-6">
        {/* 标题 */}
        <div className="flex items-center gap-2">
          <span className="text-lg">🍅</span>
          <h3 className="text-base font-semibold text-[#E5E7EB]">番茄钟</h3>
        </div>

        {/* 计时器显示 */}
        <TimerDisplay
          formattedTime={formattedTime}
          progress={progress}
          modeLabel={modeLabel}
          modeColor={modeColor}
        />

        {/* 控制按钮 */}
        <TimerControls
          status={status}
          onStart={() => start()}
          onPause={pause}
          onResume={resume}
          onReset={reset}
          onSkip={skip}
        />

        {/* 今日统计 */}
        <div className="text-xs text-[#6B7280]">
          今日已完成 <span className="text-[#F59E0B] font-semibold">{todayStats.completedPomodoros}</span> 个番茄
        </div>
      </div>

      {/* 关联任务 */}
      {(linkedTask || status === 'idle') && (
        <div className="mt-4 bg-[#1E2128] border border-[#2D3139] rounded-xl p-4">
          <h4 className="text-xs font-semibold text-[#9CA3AF] mb-3">专注任务</h4>
          {linkedTask ? (
            <div className="flex items-center gap-3 p-3 bg-[#1A1D21] rounded-lg">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: modeColor }}
              />
              <span className="text-sm text-[#E5E7EB] truncate">
                {linkedTask.title}
              </span>
            </div>
          ) : (
            <p className="text-xs text-[#6B7280]">点击开始专注，可关联任务</p>
          )}
        </div>
      )}

      {/* 预设按钮 */}
      {status === 'idle' && (
        <div className="mt-4 flex gap-2">
          <PresetButton
            label="专注 25 分钟"
            description="标准番茄钟"
            onClick={() => start()}
          />
          <PresetButton
            label="短休息 5 分钟"
            description="短暂放松"
            onClick={() => {
              // 切换到短休息模式的逻辑会在 start 中自动处理
            }}
          />
        </div>
      )}
    </div>
  )
}

// 预设按钮组件
interface PresetButtonProps {
  label: string
  description: string
  onClick: () => void
}

function PresetButton({ label, description, onClick }: PresetButtonProps) {
  return (
    <button
      onClick={onClick}
      className="
        flex-1 px-3 py-2
        bg-[#1E2128] border border-[#2D3139]
        rounded-lg text-left
        hover:border-[#7CB68E55] hover:bg-[#252930]
        transition-colors
      "
    >
      <div className="text-xs font-medium text-[#E5E7EB]">{label}</div>
      <div className="text-xs text-[#6B7280]">{description}</div>
    </button>
  )
}

export default PomodoroTimer