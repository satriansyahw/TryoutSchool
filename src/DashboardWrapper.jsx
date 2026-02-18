import { Navigate } from 'react-router-dom'
import useAuthStore from './store/authStore'
import TeacherDashboard from './pages/TeacherDashboard'
import StudentDashboard from './pages/StudentDashboard'
import { Loader2 } from 'lucide-react'

export default function Dashboard() {
    const { user, profile, loading } = useAuthStore()

    if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>

    if (!user) return <Navigate to="/login" replace />

    // If no profile loaded yet, wait.
    // Although initializeAuth should load profile.
    // If profile is null but user exists -> validation issue or sync delay.
    // Assume profile.role exists.

    if (profile?.role === 'teacher') {
        return <TeacherDashboard />
    }

    // Default to Student Dashboard for 'student' or null role
    return <StudentDashboard />
}
