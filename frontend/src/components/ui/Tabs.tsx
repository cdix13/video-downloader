import clsx from 'clsx'

interface Tab {
  id: string
  label: string
  icon?: string
}

interface TabsProps {
  tabs: Tab[]
  activeTab: string
  onChange: (id: string) => void
  size?: 'sm' | 'md'
}

export function Tabs({ tabs, activeTab, onChange, size = 'md' }: TabsProps) {
  return (
    <div className="flex bg-bg-secondary rounded-lg p-1 gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={clsx(
            'flex-1 rounded-md font-medium transition-all duration-200',
            size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-base',
            activeTab === tab.id
              ? 'bg-gradient-primary text-white shadow-md'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
          )}
        >
          {tab.icon && <span className="mr-1.5">{tab.icon}</span>}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
