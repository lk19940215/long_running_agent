import { SegmentedControl } from '@mantine/core'
import { type FilterType } from '../store/todoStore'

interface FilterBarProps {
  filter: FilterType
  onFilterChange: (filter: FilterType) => void
}

const filterOptions: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '待办' },
  { value: 'completed', label: '已完成' },
]

export function FilterBar({ filter, onFilterChange }: FilterBarProps) {
  return (
    <SegmentedControl
      value={filter}
      onChange={(value) => onFilterChange(value as FilterType)}
      data={filterOptions}
      fullWidth
      size="md"
      radius="md"
      color="blue"
    />
  )
}
