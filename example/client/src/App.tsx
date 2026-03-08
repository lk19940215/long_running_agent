import { useEffect } from 'react'
import {
  Container,
  Paper,
  Title,
  Text,
  Group,
  Badge,
  Divider,
  Center,
} from '@mantine/core'
import { IconList } from '@tabler/icons-react'
import { useTodoStore } from './store/todoStore'
import { TodoList } from './components/TodoList'
import { TodoForm } from './components/TodoForm'
import { FilterBar } from './components/FilterBar'

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
            <IconList size={40} stroke={1.5} />
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

      {/* 添加任务表单 */}
      <TodoForm onAdd={addTodo} loading={loading} />

      <Divider my="lg" />

      {/* 过滤栏 */}
      <FilterBar filter={filter} onFilterChange={setFilter} />

      <Divider my="lg" />

      {/* 任务列表组件 */}
      <TodoList
        todos={filteredTodos}
        loading={loading}
        error={error}
        onToggle={toggleTodo}
        onDelete={deleteTodo}
      />
    </Container>
  )
}

export default App
