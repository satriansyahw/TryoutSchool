import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import useAuthStore from '../store/authStore'
import { Plus, FileText, Users, Clock, Trash2, Edit } from 'lucide-react'

export default function TeacherDashboard() {
    const { user } = useAuthStore()
    const [exams, setExams] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchExams()
    }, [user])

    const fetchExams = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('exams')
                .select('*')
                .eq('created_by', user.id)
                .order('created_at', { ascending: false })

            if (error) throw error
            setExams(data || [])
        } catch (error) {
            console.error('Error fetching exams:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this exam?')) return

        try {
            const { error } = await supabase.from('exams').delete().eq('id', id)
            if (error) throw error
            setExams(exams.filter(exam => exam.id !== id))
        } catch (error) {
            console.error('Error deleting exam:', error)
            alert('Failed to delete exam')
        }
    }

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading exams...</div>
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Exam Dashboard</h1>
                    <p className="mt-1 text-sm text-gray-500">Manage your exams and view results</p>
                </div>
                <div className="flex gap-3">
                    <Link
                        to="/logout"
                        className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                    >
                        Logout
                    </Link>
                    <Link
                        to="/exams/create"
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                    >
                        <Plus className="w-5 h-5" />
                        Create New Exam
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {exams.length === 0 ? (
                    <div className="col-span-full text-center py-12 bg-white rounded-xl shadow-sm border border-gray-200">
                        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900">No exams yet</h3>
                        <p className="text-gray-500 mb-6">Create your first exam to get started</p>
                        <Link
                            to="/exams/create"
                            className="text-blue-600 hover:text-blue-700 font-medium"
                        >
                            Create Exam &rarr;
                        </Link>
                    </div>
                ) : (
                    exams.map((exam) => (
                        <div key={exam.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 line-clamp-1">{exam.title}</h3>
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-2 ${exam.is_published ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                        {exam.is_published ? 'Published' : 'Draft'}
                                    </span>
                                </div>
                                <div className="flex gap-2">
                                    <Link to={`/exams/${exam.id}/edit`} className="text-gray-400 hover:text-blue-600 p-1">
                                        <Edit className="w-5 h-5" />
                                    </Link>
                                    <button onClick={() => handleDelete(exam.id)} className="text-gray-400 hover:text-red-600 p-1">
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3 text-sm text-gray-500">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    {exam.duration_minutes} minutes
                                </div>
                                <div className="flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    Code: <span className="font-mono font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{exam.access_code || 'N/A'}</span>
                                </div>
                            </div>

                            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-between items-center">
                                <Link to={`/exams/${exam.id}/results`} className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                                    View Results
                                </Link>
                                {exam.pdf_url && (
                                    <span className="text-xs text-gray-400 border border-gray-200 px-2 py-1 rounded">PDF Exam</span>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
