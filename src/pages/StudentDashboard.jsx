import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import useAuthStore from '../store/authStore'
import { Search, Loader2, AlertCircle, BookOpen } from 'lucide-react'

export default function StudentDashboard() {
    const [accessCode, setAccessCode] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const navigate = useNavigate()
    const { user, profile } = useAuthStore()

    const handleEnterExam = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            if (!accessCode.trim()) throw new Error('Please enter an access code.')

            // 1. Find Exam
            // First check if access code exists at all
            const { data: exams, error: examError } = await supabase
                .from('exams')
                .select('*')
                .eq('access_code', accessCode.trim().toUpperCase())
            // .eq('is_published', true) // Remove strict check here to give better feedback

            if (examError) throw examError

            if (!exams || exams.length === 0) {
                throw new Error('Exam not found! Please check the code.')
            }

            const exam = exams[0]

            if (!exam.is_published) {
                throw new Error('This exam is not yet active (Draft mode). Please ask your teacher to publish it.')
            }

            // 2. Check/Create Attempt
            const { data: attempts, error: attemptError } = await supabase
                .from('exam_attempts')
                .select('*')
                .eq('exam_id', exam.id)
                .eq('user_id', user.id)
                .maybeSingle()

            if (attemptError) throw attemptError

            let attemptId = attempts?.id

            if (!attemptId) {
                // Create new attempt
                const { data: newAttempt, error: createError } = await supabase
                    .from('exam_attempts')
                    .insert([{
                        exam_id: exam.id,
                        user_id: user.id,
                        start_time: new Date().toISOString()
                    }])
                    .select()
                    .single()

                if (createError) throw createError
                attemptId = newAttempt.id
            } else {
                // Check if already completed
                if (attempts.status === 'completed') {
                    const score = attempts.score !== null ? attempts.score.toFixed(1) : 'Not released'
                    alert(`You have already completed this exam. Your score is ${score}`)
                    navigate(`/exam/${attempts.id}/result`)
                    return
                }
            }

            // 3. Redirect to Exam Room
            navigate(`/exam/${attemptId}`)

        } catch (err) {
            console.error(err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-20 px-4">
            <div className="max-w-md w-full flex justify-between items-center mb-10">
                <div className="text-left">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Hello, {profile?.full_name || 'Student'}! 👋</h1>
                    <p className="text-gray-500">Ready to take your exam?</p>
                </div>
                <Link to="/logout" className="text-sm text-red-600 hover:text-red-700 font-medium">
                    Logout
                </Link>
            </div>

            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
                <div className="flex justify-center mb-6">
                    <div className="bg-blue-100 p-4 rounded-full">
                        <BookOpen className="w-10 h-10 text-blue-600" />
                    </div>
                </div>

                <form onSubmit={handleEnterExam} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Exam Access Code</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={accessCode}
                                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                                className="w-full pl-12 pr-4 py-4 text-xl tracking-widest font-mono border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all uppercase placeholder:normal-case placeholder:tracking-normal"
                                placeholder="e.g. MATH-01"
                            />
                            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-6 h-6" />
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-start gap-3 bg-red-50 text-red-600 p-4 rounded-lg text-sm">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-xl transition-colors flex items-center justify-center text-lg shadow-blue-200 shadow-lg"
                    >
                        {loading ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            'Enter Exam Room'
                        )}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-gray-100 text-center text-sm text-gray-400">
                    Ensure you have a stable internet connection.
                </div>
            </div>
        </div>
    )
}
