import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ArrowLeft, User, Trash2 } from 'lucide-react'
import { format } from 'date-fns'

export default function ExamResultsPage() {
    const { id } = useParams()
    const [exam, setExam] = useState(null)
    const [attempts, setAttempts] = useState([])
    const [loading, setLoading] = useState(true)
    const [rpcError, setRpcError] = useState(null)

    useEffect(() => {
        fetchResults()
    }, [id])

    const fetchResults = async () => {
        try {
            setLoading(true)

            // Fetch Exam Details
            const { data: examData, error: examError } = await supabase
                .from('exams')
                .select('*')
                .eq('id', id)
                .single()

            if (examError) throw examError
            setExam(examData)

            // Use RPC to get attempts with email from auth.users
            const { data: resultData, error: resultError } = await supabase
                .rpc('get_exam_results', { p_exam_id: id })

            if (resultError) {
                setRpcError(`RPC Error: ${resultError.message} — Please run get_exam_results SQL in Supabase`)
                console.error('RPC get_exam_results failed:', resultError)
                // Fallback: direct query without email
                const { data: attemptData, error: attemptError } = await supabase
                    .from('exam_attempts')
                    .select('*')
                    .eq('exam_id', id)
                    .order('score', { ascending: false })
                if (attemptError) throw attemptError

                const userIds = [...new Set((attemptData || []).map(a => a.user_id))]
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('id, full_name')
                    .in('id', userIds)

                const profileMap = {}
                profileData?.forEach(p => profileMap[p.id] = p.full_name)

                const mapped = (attemptData || []).map(a => ({
                    id: a.id,
                    user_id: a.user_id,
                    score: a.score,
                    status: a.status,
                    start_time: a.start_time,
                    end_time: a.end_time,
                    profiles: { full_name: profileMap[a.user_id] || '(No Name - Run RPC)' }
                }))
                setAttempts(mapped)
                return
            }

            // Map RPC result to the shape the table expects
            const mapped = (resultData || []).map(r => ({
                id: r.attempt_id,
                user_id: r.user_id,
                score: r.score,
                status: r.status,
                start_time: r.start_time,
                end_time: r.end_time,
                profiles: { full_name: r.full_name || r.user_email || 'Unknown' }
            }))

            setAttempts(mapped)

        } catch (error) {
            console.error('Error fetching results:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleResetAttempt = async (attemptId, studentName) => {
        if (!window.confirm(`Reset attempt for "${studentName}"? This will delete all their answers and allow them to retake the exam.`)) return
        try {
            // Use RPC with SECURITY DEFINER to bypass RLS
            const { data, error } = await supabase.rpc('reset_exam_attempt', { p_attempt_id: attemptId })

            if (error) {
                console.error('Reset RPC error:', error)
                alert('Failed to reset: ' + error.message)
                return
            }

            console.log('Reset result:', data)
            setAttempts(prev => prev.filter(a => a.id !== attemptId))
            alert(`Attempt for "${studentName}" has been reset. They can now retake the exam.`)
        } catch (err) {
            console.error('Reset failed:', err)
            alert('Failed to reset attempt: ' + err.message)
        }
    }

    if (loading) return <div className="p-8 text-center text-gray-500">Loading results...</div>
    if (!exam) return <div className="p-8 text-center">Exam not found</div>
    if (rpcError) return (
        <div className="p-8">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                <p className="font-bold mb-1">⚠️ Database Function Missing</p>
                <p className="text-sm">{rpcError}</p>
            </div>
        </div>
    )

    const averageScore = attempts.length > 0
        ? (attempts.reduce((acc, curr) => acc + (curr.score || 0), 0) / attempts.length).toFixed(1)
        : 0

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-6">
                <Link to="/dashboard" className="flex items-center text-gray-500 hover:text-gray-700">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Dashboard
                </Link>
                <Link to="/logout" className="text-red-600 hover:text-red-700 font-medium text-sm">
                    Logout
                </Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{exam.title} - Results</h1>
                <div className="flex gap-6 text-sm text-gray-500 mt-4">
                    <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg">
                        <span className="block text-xs font-semibold uppercase tracking-wider">Total Attempts</span>
                        <span className="text-xl font-bold">{attempts.length}</span>
                    </div>
                    <div className="bg-green-50 text-green-700 px-4 py-2 rounded-lg">
                        <span className="block text-xs font-semibold uppercase tracking-wider">Average Score</span>
                        <span className="text-xl font-bold">{averageScore}%</span>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-500">
                        <thead className="bg-gray-50 text-xs uppercase text-gray-700 font-semibold">
                            <tr>
                                <th className="px-6 py-4">Student</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Submitted At</th>
                                <th className="px-6 py-4 text-right">Score</th>
                                <th className="px-6 py-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {attempts.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-8 text-center text-gray-400">
                                        No attempts recorded yet.
                                    </td>
                                </tr>
                            ) : (
                                attempts.map((attempt) => (
                                    <tr key={attempt.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                                                    <User className="w-4 h-4 text-gray-400" />
                                                </div>
                                                <div>
                                                    <div className="font-medium text-gray-900">{attempt.profiles?.full_name || 'Unknown User'}</div>
                                                    <div className="text-xs text-gray-400">ID: {attempt.user_id.slice(0, 8)}...</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {attempt.status === 'completed' ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                    Completed
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                                    In Progress
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {attempt.end_time ? format(new Date(attempt.end_time), 'PPp') : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`text-lg font-bold ${attempt.score >= 70 ? 'text-green-600' : 'text-red-600'}`}>
                                                {attempt.score?.toFixed(1)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleResetAttempt(attempt.id, attempt.profiles?.full_name)}
                                                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors ml-auto"
                                                title="Reset attempt — student can retake"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                Reset
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
