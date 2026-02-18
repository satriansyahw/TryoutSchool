import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Plus, Save, Trash2, CheckCircle, XCircle, Loader2 } from 'lucide-react'

export default function EditExamPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [exam, setExam] = useState(null)
    const [questions, setQuestions] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // New Question State
    const [newQuestion, setNewQuestion] = useState({
        question_text: '',
        point_value: 1,
        options: [
            { option_text: '', is_correct: false },
            { option_text: '', is_correct: false },
            { option_text: '', is_correct: false },
            { option_text: '', is_correct: false }
        ]
    })

    useEffect(() => {
        fetchExamData()
    }, [id])

    const fetchExamData = async () => {
        try {
            setLoading(true)
            // Fetch Exam
            const { data: examData, error: examError } = await supabase
                .from('exams')
                .select('*')
                .eq('id', id)
                .single()

            if (examError) throw examError
            setExam(examData)

            // Fetch Questions
            const { data: qData, error: qError } = await supabase
                .from('questions')
                .select(`
            *,
            options (*)
        `)
                .eq('exam_id', id)
                .order('created_at', { ascending: true })

            if (qError) throw qError
            console.log("Loaded questions:", qData)
            setQuestions(qData || [])

        } catch (error) {
            console.error('Error fetching data:', error)
            alert('Error loading exam data. Please check console.')
        } finally {
            setLoading(false)
        }
    }

    const handleAddQuestion = async () => {
        if (!newQuestion.question_text) return alert('Question text is required')

        // Check if at least one correct answer
        if (!newQuestion.options.some(o => o.is_correct)) return alert('Select at least one correct answer')

        setSaving(true)
        try {
            // 1. Insert Question
            const { data: qData, error: qError } = await supabase
                .from('questions')
                .insert([{
                    exam_id: id,
                    question_text: newQuestion.question_text,
                    point_value: newQuestion.point_value,
                    order_index: questions.length + 1
                }])
                .select()
                .single()

            if (qError) throw qError

            // 2. Insert Options
            const optionsToInsert = newQuestion.options.map(opt => ({
                question_id: qData.id,
                option_text: opt.option_text,
                is_correct: opt.is_correct
            }))

            const { error: oError } = await supabase
                .from('options')
                .insert(optionsToInsert)

            if (oError) throw oError

            // Refresh
            fetchExamData()

            // Reset Form
            setNewQuestion({
                question_text: '',
                point_value: 1,
                options: [
                    { option_text: '', is_correct: false },
                    { option_text: '', is_correct: false },
                    { option_text: '', is_correct: false },
                    { option_text: '', is_correct: false }
                ]
            })

        } catch (error) {
            console.error('Error adding question:', error)
            alert('Failed to add question')
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteQuestion = async (qId) => {
        if (!window.confirm('Delete this question?')) return
        try {
            const { error } = await supabase.from('questions').delete().eq('id', qId)
            if (error) throw error
            setQuestions(questions.filter(q => q.id !== qId))
        } catch (error) {
            console.error('Error deleting question:', error)
        }
    }

    const togglePublish = async () => {
        try {
            const { error } = await supabase
                .from('exams')
                .update({ is_published: !exam.is_published })
                .eq('id', id)

            if (error) throw error
            setExam({ ...exam, is_published: !exam.is_published })
        } catch (error) {
            console.error('Error updating exam:', error)
        }
    }

    const handleSetCorrectOption = async (qId, optionId) => {
        try {
            // Optimistic Update
            setQuestions(prev => prev.map(q => {
                if (q.id === qId) {
                    return {
                        ...q,
                        options: (q.options || []).map(o => ({
                            ...o,
                            is_correct: o.id === optionId
                        }))
                    }
                }
                return q
            }))

            // Database Update: Set all options for this question to false first
            // Note: A better way would be a stored procedure but let's do 2 calls for simplicity or relying on UI state
            // Actually, we can just update the specific option to true and others to false.
            // But doing it purely client-side state + server update is tricky if we don't have a "reset all for question"
            // Let's use a small loop or Promise.all to update relevant options.
            // Or better: update `is_correct` for ALL options of this question.

            // Get current options from state to know IDs
            const currentQ = questions.find(q => q.id === qId)
            if (!currentQ) return

            const updates = (currentQ.options || []).map(o => ({
                id: o.id,
                question_id: qId,
                option_text: o.option_text,
                is_correct: o.id === optionId
            }))

            const { error } = await supabase
                .from('options')
                .upsert(updates) // Upsert by ID to update is_correct

            if (error) throw error

        } catch (error) {
            console.error('Error setting correct option:', error)
            alert('Failed to update answer key')
            fetchExamData() // Revert on error
        }
    }

    const handleBulkAdd = async () => {
        const countStr = prompt("How many blank questions to add?")
        const count = parseInt(countStr)
        if (!count || count <= 0) return

        setSaving(true)
        try {
            // Sequential insert to maintain order (and avoid overwhelming basic tier)
            for (let i = 0; i < count; i++) {
                const qNum = questions.length + i + 1

                // 1. Insert Question
                const { data: qData, error: qError } = await supabase
                    .from('questions')
                    .insert([{
                        exam_id: id,
                        question_text: `Question ${qNum}`,
                        point_value: 1,
                        order_index: qNum
                    }])
                    .select()
                    .single()

                if (qError) throw qError

                // 2. Insert Options A-E
                const optionsToInsert = ["A", "B", "C", "D", "E"].map(optText => ({
                    question_id: qData.id,
                    option_text: optText,
                    is_correct: false // Default none selected
                }))

                const { error: oError } = await supabase.from('options').insert(optionsToInsert)
                if (oError) throw oError
            }

            fetchExamData()
            alert(`Added ${count} questions!`)

        } catch (error) {
            console.error('Error adding bulk questions:', error)
            alert('Failed to add some questions')
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <div className="p-8 text-center text-gray-500">Loading...</div>
    if (!exam) return <div className="p-8 text-center">Exam not found</div>

    return (
        <div className="max-w-5xl mx-auto px-4 py-8 pb-20">
            <div className="flex items-center justify-between mb-6">
                <Link to="/dashboard" className="flex items-center text-gray-500 hover:text-gray-700">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Dashboard
                </Link>
                <div className="flex items-center gap-4">
                    <Link to="/logout" className="text-red-600 hover:text-red-700 font-medium mr-4 text-sm">
                        Logout
                    </Link>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${exam.is_published ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {exam.is_published ? 'Published' : 'Draft'}
                    </span>
                    <button
                        onClick={togglePublish}
                        className="text-sm text-blue-600 hover:underline"
                    >
                        {exam.is_published ? 'Unpublish' : 'Publish'}
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{exam.title}</h1>
                <p className="text-gray-500">Access Code: <span className="font-mono font-medium text-gray-900">{exam.access_code}</span></p>
            </div>

            {/* Question List */}
            <div className="space-y-6 mb-12">
                <h2 className="text-xl font-bold text-gray-900">Questions ({questions.length})</h2>

                <button
                    onClick={handleBulkAdd}
                    disabled={saving}
                    className="w-full py-3 mb-8 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl border border-dashed border-indigo-200 font-medium flex items-center justify-center gap-2 transition-colors"
                >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    Bulk Add Questions (Quick Answer Sheet)
                </button>

                {questions.map((q, idx) => (
                    <div key={q.id} className="bg-white rounded-lg border border-gray-200 p-6 relative group">
                        <button
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="absolute top-4 right-4 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>

                        <div className="flex gap-4">
                            <span className="font-bold text-gray-400">#{idx + 1}</span>
                            <div className="flex-1">
                                <p className="font-medium text-gray-900 mb-4">{q.question_text}</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {(q.options || []).map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => handleSetCorrectOption(q.id, opt.id)}
                                            className={`p-3 rounded-lg border flex items-center justify-between text-left transition-all ${opt.is_correct ? 'bg-green-50 border-green-500 text-green-800 ring-1 ring-green-500' : 'bg-gray-50 border-gray-100 text-gray-600 hover:border-gray-300 hover:bg-gray-100'}`}
                                        >
                                            <span className="font-medium">{opt.option_text}</span>
                                            {opt.is_correct && <CheckCircle className="w-4 h-4 text-green-600" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {questions.length === 0 && (
                    <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                        <p className="mb-4">No questions yet.</p>
                        <button
                            onClick={handleBulkAdd}
                            className="text-blue-600 hover:underline font-medium"
                        >
                            Add Answers for PDF Questions
                        </button>
                    </div>
                )}
            </div>

            {/* Add Question Form */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-6">Add New Question</h3>

                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
                        <textarea
                            rows={3}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Enter question here..."
                            value={newQuestion.question_text}
                            onChange={(e) => setNewQuestion({ ...newQuestion, question_text: e.target.value })}
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-700">Options</label>
                        {newQuestion.options.map((opt, idx) => (
                            <div key={idx} className="flex gap-3">
                                <button
                                    onClick={() => {
                                        const newOpts = [...newQuestion.options]
                                        newOpts.forEach((o, i) => o.is_correct = (i === idx)) // Single correct answer for now
                                        setNewQuestion({ ...newQuestion, options: newOpts })
                                    }}
                                    className={`p-2 rounded-lg border transition-colors ${opt.is_correct ? 'bg-green-100 border-green-300 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100'}`}
                                >
                                    <CheckCircle className="w-5 h-5" />
                                </button>
                                <input
                                    type="text"
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                                    value={opt.option_text}
                                    onChange={(e) => {
                                        const newOpts = [...newQuestion.options]
                                        newOpts[idx].option_text = e.target.value
                                        setNewQuestion({ ...newQuestion, options: newOpts })
                                    }}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center justify-between pt-6 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-gray-700">Points:</label>
                            <input
                                type="number"
                                min="1"
                                className="w-20 px-3 py-1 border border-gray-300 rounded-lg text-center"
                                value={newQuestion.point_value}
                                onChange={(e) => setNewQuestion({ ...newQuestion, point_value: parseInt(e.target.value) })}
                            />
                        </div>
                        <button
                            onClick={handleAddQuestion}
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium flex items-center transition-colors"
                        >
                            {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Plus className="w-5 h-5 mr-2" />}
                            Add Question
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
