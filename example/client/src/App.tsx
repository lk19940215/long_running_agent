import { useEffect } from 'react'
import {
  Container,
  Paper,
  Title,
  Text,
  Checkbox,
  Button,
  Group,
  Badge,
  ActionIcon,
  Divider,
  Center,
} from '@mantine/core'
import { IconTrash, IconPlus, IconCheck, IconList } from '@tabler/icons-react'
import { useTodoStore } from './store/todoStore'

function App() {
  const { todos, filter, loading, error, fetchTodos, addTodo, toggleTodo, deleteTodo, setFilter } = useTodoStore()

  // 组件挂载时获取数据
  useEffect(() => {
    fetchTodos()
  }, [])

  const completedCount = todos.filter(t => t.completed).length
  const totalCount = todos.length

  // 根据过滤条件过滤数据
  const filteredTodos = todos.filter(todo => {
    if (filter === 'active') return !todo.completed
    if (filter === 'completed') return todo.completed
    return true
  })

  return (
    <Container size="md" className="py-8">
      {/* 标题区域 */}
      <Center mb="xl">
        <div className="text-center">
          <Title order={1} className="heading-primary flex items-center justify-center gap-3">
            <IconList size={40} />
            TODO 待办事项
          </Title>
          <Text c="dimmed" size="lg">
            管理你的任务，提高效率
          </Text>
        </div>
      </Center>

      {/* 统计信息卡片 */}
      <Paper p="lg" radius="lg" shadow="md" mb="lg" className="card-custom">
        <Group justify="space-between">
          <div>
            <Text size="sm" c="dimmed">总任务数</Text>
            <Title order={4}>{totalCount}</Title>
          </div>
          <Divider orientation="vertical" />
          <div>
            <Text size="sm" c="dimmed">已完成</Text>
            <Title order={4} c="green">{completedCount}</Title>
          </div>
          <Divider orientation="vertical" />
          <div>
            <Text size="sm" c="dimmed">进行中</Text>
            <Title order={4} c="blue">{totalCount - completedCount}</Title>
          </div>
          <Badge size="lg" color="blue" variant="light">
            {totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}% 完成
          </Badge>
        </Group>
      </Paper>

      {/* 添加任务按钮 */}
      <Group mb="lg">
        <Button
          leftSection={<IconPlus size={18} />}
          color="blue"
          fullWidth
          onClick={() => {
            const title = prompt('请输入任务标题:')
            if (title && title.trim()) {
              addTodo(title.trim())
            }
          }}
          loading={loading}
        >
          添加新任务
        </Button>
      </Group>

      {/* 过滤按钮 */}
      <Group mb="lg" gap="xs">
        <Button
          variant={filter === 'all' ? 'filled' : 'outline'}
          color="blue"
          size="sm"
          onClick={() => setFilter('all')}
          flex={1}
        >
          全部
        </Button>
        <Button
          variant={filter === 'active' ? 'filled' : 'outline'}
          color="blue"
          size="sm"
          onClick={() => setFilter('active')}
          flex={1}
        >
          待办
        </Button>
        <Button
          variant={filter === 'completed' ? 'filled' : 'outline'}
          color="blue"
          size="sm"
          onClick={() => setFilter('completed')}
          flex={1}
        >
          已完成
        </Button>
      </Group>

      {/* 任务列表 */}
      <Paper p="lg" radius="lg" shadow="md" className="card-custom">
        <Title order={3} mb="md" className="flex items-center gap-2">
          <IconCheck size={24} />
          任务列表
        </Title>

        {loading && todos.length === 0 ? (
          <Center py="xl">
            <Text c="dimmed">加载中...</Text>
          </Center>
        ) : error ? (
          <Center py="xl">
            <Text c="red">{error}</Text>
          </Center>
        ) : filteredTodos.length === 0 ? (
          <Center py="xl">
            <Text c="dimmed">
              {todos.length === 0 ? '暂无任务，点击添加新任务' : '没有符合条件的任务'}
            </Text>
          </Center>
        ) : (
          filteredTodos.map(todo => (
            <Paper
              key={todo.id}
              p="md"
              mb="sm"
              radius="md"
              className={`transition-all hover:shadow-md cursor-pointer ${
                todo.completed ? 'bg-gray-50' : 'bg-white'
              }`}
            >
              <Group>
                <Checkbox
                  checked={todo.completed}
                  onChange={() => toggleTodo(todo.id)}
                  color="blue"
                  size="lg"
                />
                <Text
                  flex={1}
                  style={{
                    textDecoration: todo.completed ? 'line-through' : 'none',
                    color: todo.completed ? 'var(--mantine-color-dimmed)' : 'inherit'
                  }}
                >
                  {todo.title}
                </Text>
                <Badge color={todo.completed ? 'green' : 'blue'} variant="light">
                  {todo.completed ? '已完成' : '进行中'}
                </Badge>
                <ActionIcon
                  color="red"
                  variant="subtle"
                  onClick={() => deleteTodo(todo.id)}
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Group>
            </Paper>
          ))
        )}
      </Paper>
    </Container>
  )
}

export default App
