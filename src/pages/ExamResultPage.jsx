import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CheckCircle, XCircle, ArrowLeft, AlertCircle, PlayCircle } from 'lucide-react'

export default function ExamResultPage() {
    const { attemptId } = useParams()
    const [loading, setLoading] = useState(true)
    const [attempt, setAttempt] = useState(null)
    const [exam, setExam] = useState(null)
    const [details, setDetails] = useState([]) // Array of { question, user_answer, correct_answer }

    useEffect(() => {
        fetchResult()
    }, [attemptId])

    const fetchResult = async () => {
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

            // 2. Fetch Exam Info
            const { data: examData, error: exError } = await supabase
                .from('exams')
                .select('*')
                .eq('id', attemptData.exam_id)
                .single()
            if (exError) throw exError
            setExam(examData)

            // 3. Fetch Questions, Options, and User Answers
            // We need a complex join or multiple fetches. Let's do parallel fetches for simplicity.

            const [questionsRes, answersRes] = await Promise.all([
                supabase
                    .from('questions')
                    .select('*, options(*)')
                    .eq('exam_id', examData.id)
                    .order('order_index', { ascending: true }),
                supabase
                    .from('user_answers')
                    .select('*')
                    .eq('attempt_id', attemptId)
            ])

            if (questionsRes.error) throw questionsRes.error
            if (answersRes.error) throw answersRes.error

            const questions = questionsRes.data
            const userAnswersMap = {} // qId -> optionId
            answersRes.data.forEach(a => userAnswersMap[a.question_id] = a.selected_option_id)

            // Build Details Array
            const resultDetails = questions.map(q => {
                const userOptId = userAnswersMap[q.id]
                const userOpt = q.options?.find(o => o.id === userOptId)
                const correctOpt = q.options?.find(o => o.is_correct)

                return {
                    question: q,
                    userOption: userOpt,
                    correctOption: correctOpt,
                    isCorrect: userOpt?.id === correctOpt?.id
                }
            })

            setDetails(resultDetails)

        } catch (error) {
            console.error('Error loading results:', error)
            alert('Error loading results')
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <div className="p-8 text-center">Loading result...</div>
    if (!attempt) return <div className="p-8 text-center">Result not found.</div>

    return (
        <div className="max-w-4xl mx-auto px-4 py-8 pb-20">
            <Link to="/dashboard" className="flex items-center text-gray-500 hover:text-gray-700 mb-6">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
            </Link>

            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-8">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-center text-white">
                    <h1 className="text-3xl font-bold mb-2">{exam?.title}</h1>
                    <p className="opacity-90 max-w-lg mx-auto">Results for your attempt on {new Date(attempt.start_time).toLocaleDateString()}</p>

                    <div className="mt-8 flex justify-center gap-6">
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 min-w-[120px]">
                            <p className="text-sm font-medium opacity-70 mb-1">Score</p>
                            <p className="text-4xl font-bold">{attempt.score ? attempt.score.toFixed(1) : 0}</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 min-w-[120px]">
                            <p className="text-sm font-medium opacity-70 mb-1">Status</p>
                            <p className="text-xl font-bold uppercase tracking-wider">{attempt.status}</p>
                        </div>
                    </div>
                </div>

                <div className="p-8">
                    <h2 className="text-xl font-bold text-gray-900 mb-6">Detailed Review</h2>

                    <div className="space-y-6">
                        {details.map((item, idx) => (
                            <div key={item.question.id} className={`p-6 rounded-lg border ${item.isCorrect ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
                                <div className="flex gap-4">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${item.isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-medium text-gray-900 mb-4">{item.question.question_text}</p>

                                        {/* Review Options */}
                                        <div className="space-y-2">
                                            {item.question.options.map(opt => {
                                                const isSelected = item.userOption?.id === opt.id
                                                const isCorrectAnswer = opt.is_correct

                                                let styleClass = "border-gray-200 bg-white text-gray-500"
                                                let icon = null

                                                if (isSelected && isCorrectAnswer) {
                                                    styleClass = "border-green-500 bg-green-50 text-green-800"
                                                    icon = <CheckCircle className="w-5 h-5 text-green-600" />
                                                } else if (isSelected && !isCorrectAnswer) {
                                                    styleClass = "border-red-500 bg-red-50 text-red-800"
                                                    icon = <XCircle className="w-5 h-5 text-red-600" />
                                                } else if (!isSelected && isCorrectAnswer) {
                                                    styleClass = "border-green-200 bg-green-50 text-green-800"
                                                    icon = <CheckCircle className="w-5 h-5 text-green-600 opacity-50" />
                                                }

                                                return (
                                                    <div key={opt.id} className={`flex items-center justify-between p-3 rounded-lg border ${styleClass}`}>
                                                        <span>{opt.option_text}</span>
                                                        {icon}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
