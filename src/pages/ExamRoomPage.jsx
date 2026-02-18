import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Loader2, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { differenceInSeconds, addMinutes, format } from 'date-fns'

export default function ExamRoomPage() {
    const { attemptId } = useParams()
    const navigate = useNavigate()

    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [exam, setExam] = useState(null)
    const [questions, setQuestions] = useState([])
    const [answers, setAnswers] = useState({}) // map questionId -> optionId
    const [attempt, setAttempt] = useState(null)
    const [timeLeft, setTimeLeft] = useState(0) // seconds

    const timerRef = useRef(null)

    useEffect(() => {
        fetchExamSession()
        return () => clearInterval(timerRef.current)
    }, [attemptId])

    useEffect(() => {
        if (attempt && exam) {
            const endTime = addMinutes(new Date(attempt.start_time), exam.duration_minutes)
            const now = new Date()
            const diff = differenceInSeconds(endTime, now)
            setTimeLeft(diff > 0 ? diff : 0)

            timerRef.current = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current)
                        handleSubmitExam() // Auto submit
                        return 0
                    }
                    return prev - 1
                })
            }, 1000)
        }
    }, [attempt, exam])

    const fetchExamSession = async () => {
        try {
            setLoading(true)

            // 1. Fetch Attempt
            const { data: attemptData, error: atError } = await supabase
                .from('exam_attempts')
                .select('*')
                .eq('id', attemptId)
                .single()

            if (atError) throw atError
            setAttempt(attemptData)

            if (attemptData.status === 'completed') {
                console.log("[DEBUG] Exam already completed. Attempt Data:", attemptData)
                const score = attemptData.score !== null ? attemptData.score.toFixed(1) : 'Not released'
                alert(`[DEBUG] You have already completed this exam. Your score is ${score}`)
                navigate(`/exam/${attemptId}/result`, { replace: true })
                return
            }

            // 2. Fetch Exam
            const { data: examData, error: exError } = await supabase
                .from('exams')
                .select('*')
                .eq('id', attemptData.exam_id)
                .single()

            if (exError) throw exError
            setExam(examData)

            // 3. Fetch Questions & Options
            const { data: qData, error: qError } = await supabase
                .from('questions')
                .select(`
                *,
                options (id, option_text)
            `)
                .eq('exam_id', examData.id)
                .order('order_index', { ascending: true }) // assuming order_index exists, else created_at

            if (qError) throw qError
            setQuestions(qData)

            // 4. Fetch Existing Answers (if refreshing page)
            const { data: ansData, error: ansError } = await supabase
                .from('user_answers')
                .select('question_id, selected_option_id')
                .eq('attempt_id', attemptId)

            if (ansError) throw ansError

            const initialAnswers = {}
            ansData.forEach(a => {
                initialAnswers[a.question_id] = a.selected_option_id
            })
            setAnswers(initialAnswers)

        } catch (error) {
            console.error("Error loading exam:", error)
            alert('Failed to load exam.')
            navigate('/dashboard')
        } finally {
            setLoading(false)
        }
    }

    const handleOptionSelect = async (questionId, optionId) => {
        // Optimistic Update
        setAnswers(prev => ({ ...prev, [questionId]: optionId }))

        // Save to DB
        try {
            const { error } = await supabase
                .from('user_answers')
                .upsert({
                    attempt_id: attemptId,
                    question_id: questionId,
                    selected_option_id: optionId
                }, { onConflict: 'attempt_id, question_id' })

            if (error) throw error
        } catch (err) {
            console.error('Failed to save answer:', err)
            // Optionally revert state or show error
        }
    }

    const handleSubmitExam = async () => {
        setSubmitting(true)
        clearInterval(timerRef.current)
        try {
            const { data, error } = await supabase.rpc('submit_exam', { p_attempt_id: attemptId })

            if (error) {
                console.error("submit_exam RPC Error:", error)
                throw error
            }

            const finalScore = data && data[0] ? data[0].final_score : 0

            // Send email notification to teacher (fire and forget — don't block navigation)
            sendTeacherNotification(finalScore).catch(err =>
                console.warn('Email notification failed (non-critical):', err)
            )

            alert(`Exam Submitted! Your score: ${finalScore.toFixed(1)}`)
            navigate(`/exam/${attemptId}/result`, { replace: true })
        } catch (error) {
            console.error('Error submitting exam:', error)
            alert('Failed to submit exam: ' + (error.message || 'Unknown error'))
            setSubmitting(false)
        }
    }

    const sendTeacherNotification = async (finalScore) => {
        try {
            // Fetch teacher info from the exam
            const { data: examInfo, error: examErr } = await supabase
                .from('exams')
                .select('title, created_by')
                .eq('id', attempt.exam_id)
                .single()

            console.log('[EMAIL] examInfo:', examInfo, examErr)
            if (!examInfo) return

            // Fetch teacher profile
            const { data: teacherProfile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', examInfo.created_by)
                .single()

            // Fetch student profile
            const { data: studentProfile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', attempt.user_id)
                .single()

            const functionsUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL
            const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

            console.log('[EMAIL] Calling Edge Function:', `${functionsUrl}/notify-teacher`)
            console.log('[EMAIL] Payload:', {
                teacher_id: examInfo.created_by,
                teacher_name: teacherProfile?.full_name,
                student_name: studentProfile?.full_name,
                exam_title: examInfo.title,
                score: finalScore,
            })

            const response = await fetch(`${functionsUrl}/notify-teacher`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${anonKey}`,
                },
                body: JSON.stringify({
                    teacher_id: examInfo.created_by,
                    teacher_name: teacherProfile?.full_name || 'Guru',
                    student_name: studentProfile?.full_name || 'Siswa',
                    exam_title: examInfo.title,
                    score: finalScore,
                }),
            })

            const result = await response.json()
            console.log('[EMAIL] Edge Function response:', response.status, result)

            if (!response.ok) {
                console.error('[EMAIL] Failed:', result)
            } else {
                console.log('[EMAIL] Email sent successfully!')
            }
        } catch (err) {
            console.error('[EMAIL] sendTeacherNotification error:', err)
        }
    }

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60)
        const s = seconds % 60
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }

    if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>

    return (
        <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 h-16 px-6 flex items-center justify-between shrink-0 z-10">
                <h1 className="font-bold text-gray-800 truncate max-w-md">{exam.title}</h1>

                <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-2 font-mono text-xl font-bold px-4 py-2 rounded-lg ${timeLeft < 300 ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-gray-100 text-gray-700'}`}>
                        <Clock className="w-5 h-5" />
                        {formatTime(timeLeft)}
                    </div>

                    <button
                        onClick={() => {
                            if (window.confirm("Are you sure you want to submit? You cannot change answers after submission.")) {
                                handleSubmitExam()
                            }
                        }}
                        disabled={submitting}
                        className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                    >
                        {submitting ? 'Submitting...' : 'Finish Exam'}
                    </button>

                    <button
                        onClick={() => {
                            if (window.confirm("Are you sure you want to logout? Warning: Your exam progress might be lost depending on connectivity.")) {
                                navigate('/logout')
                            }
                        }}
                        className="text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg font-medium transition-colors text-sm"
                    >
                        Logout
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left : PDF (Optional) */}
                {exam.pdf_url && (
                    <div className="w-1/2 border-r border-gray-200 bg-gray-100">
                        <iframe
                            src={exam.pdf_url}
                            className="w-full h-full"
                            title="Exam PDF"
                        />
                        {/* Fallback if embedding fails can be added here */}
                        {/* Note: Embedding might fail if the PDF is cross-origin or viewing permissions are strict. 
                            Ideally, we should rely on browser default PDF viewer if embedded fails, or generate Signed URL.
                        */}
                    </div>
                )}

                {/* Right: Questions */}
                <div className={`${exam.pdf_url ? 'w-1/2' : 'max-w-3xl mx-auto w-full'} overflow-y-auto p-6 scroll-smooth`}>
                    {questions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                            <AlertCircle className="w-12 h-12 mb-4 text-gray-400" />
                            <h3 className="text-lg font-medium text-gray-900">No Questions Yet</h3>
                            <p className="text-sm mt-2 max-w-sm">
                                The teacher has not added any answer slots for this exam.
                                Please ask them to add questions in the Edit Exam page.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-8 pb-20">
                            {questions.map((q, idx) => (
                                <div key={q.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                    <div className="flex gap-4 mb-4">
                                        <span className="bg-blue-100 text-blue-800 w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm shrink-0">
                                            {idx + 1}
                                        </span>
                                        <div className="text-gray-800 text-lg font-medium">
                                            {q.question_text}
                                            {/* Image if any */}
                                            {q.image_url && (
                                                <img src={q.image_url} alt="Question" className="mt-4 rounded-lg max-h-64 object-contain" />
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-3 pl-12">
                                        {q.options.map((opt) => {
                                            const isSelected = answers[q.id] === opt.id
                                            return (
                                                <label
                                                    key={opt.id}
                                                    className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${isSelected
                                                        ? 'border-blue-500 bg-blue-50'
                                                        : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name={`q-${q.id}`}
                                                        value={opt.id}
                                                        checked={isSelected}
                                                        onChange={() => handleOptionSelect(q.id, opt.id)}
                                                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                                    />
                                                    <span className={`ml-3 ${isSelected ? 'text-blue-900 font-medium' : 'text-gray-700'}`}>
                                                        {opt.option_text}
                                                    </span>
                                                </label>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
