import { useState } from 'react'
import DailyLog      from './pages/DailyLog'
import Analytics     from './pages/Analytics'
import TaskList      from './pages/TaskList'
import HabitSettings from './pages/HabitSettings'
import Login         from './pages/Login'

const TABS = ['Today', 'Progress', 'Tasks', 'Configure']

function getToken() {
  return localStorage.getItem('dt_token')
}

export default function App() {
  const [activeTab, setActiveTab]     = useState('Today')
  const [authenticated, setAuthenticated] = useState(() => Boolean(getToken()))

  if (!authenticated) {
    return <Login onAuthenticated={() => setAuthenticated(true)} />
  }

  function handleLogout() {
    localStorage.removeItem('dt_token')
    setAuthenticated(false)
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:py-4 lg:py-5">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-white">
            Discipline Tracker
          </h1>
          <div className="flex items-center gap-3">
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
            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors whitespace-nowrap"
              title="Sign out"
            >
              Sign out
            </button>
          </div>
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
