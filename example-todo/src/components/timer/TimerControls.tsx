import { Button } from '../ui/Button'
import type { PomodoroStatus } from '../../types'

export interface TimerControlsProps {
  status: PomodoroStatus
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onReset: () => void
  onSkip?: () => void
}

export function TimerControls({
  status,
  onStart,
  onPause,
  onResume,
  onReset,
  onSkip,
}: TimerControlsProps) {
  return (
    <div className="flex items-center gap-3">
      {status === 'idle' && (
        <Button
          variant="primary"
          size="lg"
          leftIcon={<span>▶</span>}
          onClick={onStart}
          className="w-36"
        >
          开始专注
        </Button>
      )}

      {status === 'running' && (
        <>
          <Button
            variant="outline"
            size="lg"
            leftIcon={<span>⏸</span>}
            onClick={onPause}
            className="w-36"
          >
            暂停
          </Button>
          {onSkip && (
            <Button
              variant="ghost"
              size="lg"
              onClick={onSkip}
              title="跳过当前阶段"
            >
              ⏭
            </Button>
          )}
        </>
      )}

      {status === 'paused' && (
        <>
          <Button
            variant="primary"
            size="lg"
            leftIcon={<span>▶</span>}
            onClick={onResume}
            className="w-36"
          >
            继续
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={onReset}
            title="重置"
          >
            ↺
          </Button>
        </>
      )}
    </div>
  )
}

export default TimerControls