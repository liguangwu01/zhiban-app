import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/auth.store'
import { useSocket } from './hooks/useSocket'
import AuthPage from './pages/AuthPage'
import ChatPage from './pages/ChatPage'
import EventsPage from './pages/EventsPage'
import ReminderContainer from './components/ReminderCard'

// 需要登录才能访问的路由
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuthStore()
  return isLoggedIn ? <>{children}</> : <Navigate to="/login" replace />
}

// 初始化 WebSocket（登录后自动连接）
function SocketInitializer() {
  useSocket()
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <SocketInitializer />
      <ReminderContainer />
      <Toaster
        position="top-center"
        toastOptions={{
          style: { borderRadius: '12px', fontSize: '14px' },
          success: { duration: 2000 },
          error: { duration: 4000 },
        }}
      />
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/" element={<PrivateRoute><ChatPage /></PrivateRoute>} />
        <Route path="/events" element={<PrivateRoute><EventsPage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
