import { useState } from 'react'
import DailyLog      from './pages/DailyLog'
import Analytics     from './pages/Analytics'
import TaskList      from './pages/TaskList'
import HabitSettings from './pages/HabitSettings'

const TABS = ['Today', 'Progress', 'Tasks', 'Configure']

export default function App() {
  const [activeTab, setActiveTab] = useState('Today')

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:py-4 lg:py-5">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-white">
            Discipline Tracker
          </h1>
          <nav className="flex gap-1 bg-gray-900 rounded-lg p-1 w-full sm:w-auto">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 sm:flex-none px-2.5 sm:px-4 lg:px-5 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-white text-gray-900'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 lg:px-8 py-6 lg:py-8">
        {activeTab === 'Today'     && <DailyLog />}
        {activeTab === 'Progress'  && <Analytics />}
        {activeTab === 'Tasks'     && <TaskList />}
        {activeTab === 'Configure' && <HabitSettings />}
      </main>
    </div>
  )
}
