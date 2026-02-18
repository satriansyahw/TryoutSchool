import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import useAuthStore from './store/authStore'
import { Loader2 } from 'lucide-react'
import Dashboard from './DashboardWrapper'
import CreateExamPage from './pages/CreateExamPage'
import EditExamPage from './pages/EditExamPage'
import ExamResultPage from './pages/ExamResultPage'
import ExamResultsPage from './pages/ExamResultsPage'
import ExamRoomPage from './pages/ExamRoomPage'

// Logout page — defined outside App to avoid Rules of Hooks violation
function LogoutPage() {
  const { signOut } = useAuthStore()
  useEffect(() => { signOut() }, [])
  return <Navigate to="/login" replace />
}

// Route guard: requires authentication
function ProtectedRoute({ children }) {
  const { user, loading } = useAuthStore()
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Route guard: requires teacher role
function TeacherRoute({ children }) {
  const { user, profile, loading } = useAuthStore()
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
  if (!user) return <Navigate to="/login" replace />
  if (profile?.role !== 'teacher') return <Navigate to="/dashboard" replace />
  return children
}

function App() {
  const { initializeAuth } = useAuthStore()

  useEffect(() => {
    initializeAuth()
  }, [initializeAuth])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/logout" element={<LogoutPage />} />

        {/* Role-based Dashboard */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />

        {/* Teacher-only Routes — students redirected to /dashboard */}
        <Route path="/exams/create" element={
          <TeacherRoute>
            <CreateExamPage />
          </TeacherRoute>
        } />

        <Route path="/exams/:id/edit" element={
          <TeacherRoute>
            <EditExamPage />
          </TeacherRoute>
        } />

        <Route path="/exams/:id/results" element={
          <TeacherRoute>
            <ExamResultsPage />
          </TeacherRoute>
        } />

        {/* Student Routes */}
        <Route path="/exam/:attemptId" element={
          <ProtectedRoute>
            <ExamRoomPage />
          </ProtectedRoute>
        } />

        <Route path="/exam/:attemptId/result" element={
          <ProtectedRoute>
            <ExamResultPage />
          </ProtectedRoute>
        } />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
