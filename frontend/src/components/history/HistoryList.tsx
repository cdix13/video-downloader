import { useState, useMemo } from 'react'
import { useHistory } from '../../hooks/useHistory'
import { Card, CardHeader } from '../ui/Card'
import { Tabs } from '../ui/Tabs'
import { Spinner } from '../ui/Spinner'
import { HistoryItem } from './HistoryItem'
import type { HistoryFilter } from '../../types'

const filterTabs = [
  { id: 'all', label: 'All' },
  { id: 'video', label: 'Videos', icon: '🎬' },
  { id: 'audio', label: 'Audio', icon: '🎵' },
]

export function HistoryList() {
  const { data, isLoading, error } = useHistory()
  const [filter, setFilter] = useState<HistoryFilter>('all')

  const filteredHistory = useMemo(() => {
    if (!data?.history) return []

    if (filter === 'all') return data.history
    return data.history.filter((item) => item.type === filter)
  }, [data?.history, filter])

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Download History"
        icon="📚"
        action={
          <span className="text-sm text-text-muted">
            {data?.history?.length || 0} files
          </span>
        }
      />

      <div className="mb-4">
        <Tabs
          tabs={filterTabs}
          activeTab={filter}
          onChange={(id) => setFilter(id as HistoryFilter)}
          size="sm"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="text-center py-8 text-error">
          <p>Failed to load history</p>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="text-center py-8 text-text-muted">
          <p className="text-4xl mb-2">📝</p>
          <p>
            {filter === 'all'
              ? 'No download history yet'
              : `No ${filter} files found`}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredHistory.map((item) => (
            <HistoryItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </Card>
  )
}
