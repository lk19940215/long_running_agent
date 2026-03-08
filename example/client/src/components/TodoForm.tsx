import { useState } from 'react'
import { TextInput, Button, Group, rem } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'

interface TodoFormProps {
  onAdd: (title: string) => Promise<void>
  loading?: boolean
}

export function TodoForm({ onAdd, loading }: TodoFormProps) {
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('请输入任务标题')
      return
    }
    setError(null)
    await onAdd(title.trim())
    setTitle('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit()
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        handleSubmit()
      }}
    >
      <Group gap="xs" align="flex-start">
        <div style={{ flex: 1 }}>
          <TextInput
            placeholder="输入任务标题，按 Enter 键添加..."
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={handleKeyDown}
            error={error}
            disabled={loading}
            size="md"
            radius="md"
            w="100%"
          />
        </div>
        <Button
          type="submit"
          leftSection={<IconPlus style={{ width: rem(18), height: rem(18) }} />}
          color="blue"
          loading={loading}
          size="md"
        >
          添加
        </Button>
      </Group>
    </form>
  )
}
