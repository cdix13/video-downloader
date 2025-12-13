import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Header } from './components/layout/Header'
import { ServerInfo } from './components/server/ServerInfo'
import { DependencyAlert } from './components/DependencyAlert'
import { DownloadForm } from './components/download/DownloadForm'
import { QueueList } from './components/queue/QueueList'
import { HistoryList } from './components/history/HistoryList'
import { VideoModal } from './components/player/VideoModal'
import { ToastContainer } from './components/notifications/ToastContainer'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-bg-primary">
        <div className="max-w-6xl mx-auto px-4 py-6 md:py-8">
          <Header />
          <DependencyAlert />
          <ServerInfo />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <DownloadForm />
            <QueueList />
            <HistoryList />
          </div>
        </div>

        <VideoModal />
        <ToastContainer />
      </div>
    </QueryClientProvider>
  )
}
