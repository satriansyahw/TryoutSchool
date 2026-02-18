import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import useAuthStore from '../store/authStore'
import { Loader2, Upload, Save, ArrowLeft, AlertCircle, FileText } from 'lucide-react'

export default function CreateExamPage() {
    const navigate = useNavigate()
    // ... (rest of hook calls)
    const { user } = useAuthStore()
    const [loading, setLoading] = useState(false)
    const [statusText, setStatusText] = useState('')
    const [schools, setSchools] = useState([])

    const [formData, setFormData] = useState({
        title: '',
        school_id: '',
        duration_minutes: 60,
        pdf_file: null
    })

    // ... (rest of logic up to return)

    useEffect(() => {
        async function fetchSchools() {
            const { data } = await supabase.from('schools').select('*')
            if (data) setSchools(data)
        }
        fetchSchools()
    }, [])

    const handleChange = (e) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFormData(prev => ({ ...prev, pdf_file: e.target.files[0] }))
        }
    }

    const generateAccessCode = (schoolName, examTitle) => {
        const clean = (str) => {
            if (!str) return 'XXX'
            return str.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 3)
        }

        const sName = schoolName ? schoolName : 'SCH'
        const eTitle = examTitle ? examTitle : 'EXAM'

        const schoolPart = clean(sName)
        const titlePart = clean(eTitle)

        const now = new Date()
        const day = String(now.getDate()).padStart(2, '0')
        const hour = String(now.getHours()).padStart(2, '0')
        const minute = String(now.getMinutes()).padStart(2, '0')
        const second = String(now.getSeconds()).padStart(2, '0')

        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')

        return `${schoolPart}${titlePart}${day}${hour}${minute}${second}${random}`
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setStatusText('Initializing...')

        try {
            const selectedSchool = schools.find(s => s.id === formData.school_id)
            const schoolName = selectedSchool ? selectedSchool.name : 'VIRTUAL'

            const generatedCode = generateAccessCode(schoolName, formData.title)

            let pdf_url = null

            if (formData.pdf_file) {
                setStatusText('Uploading PDF (Please wait)...')
                const fileExt = formData.pdf_file.name.split('.').pop()
                const fileName = `${Math.random()}.${fileExt}`
                const filePath = `${user.id}/${fileName}`

                const { error: uploadError } = await supabase.storage
                    .from('soal_pdf')
                    .upload(filePath, formData.pdf_file)

                if (uploadError) throw uploadError

                const { data: { publicUrl } } = supabase.storage
                    .from('soal_pdf')
                    .getPublicUrl(filePath)

                pdf_url = publicUrl
            }

            setStatusText('Saving Exam Data...')
            const { data, error } = await supabase
                .from('exams')
                .insert([
                    {
                        title: formData.title,
                        school_id: formData.school_id || (schools[0]?.id),
                        created_by: user.id,
                        duration_minutes: formData.duration_minutes,
                        access_code: generatedCode,
                        pdf_url: pdf_url,
                        is_published: false
                    }
                ])
                .select()

            if (error) throw error

            alert(`Exam Created! Access Code: ${generatedCode}`)
            navigate('/dashboard')

        } catch (error) {
            console.error('Error creating exam:', error)
            alert('Error: ' + error.message)
        } finally {
            setLoading(false)
            setStatusText('')
        }
    }

    return (
        <div className="max-w-3xl mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-6">
                <button onClick={() => navigate(-1)} className="flex items-center text-gray-500 hover:text-gray-700">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Dashboard
                </button>
                <Link to="/logout" className="text-red-600 hover:text-red-700 font-medium text-sm">
                    Logout
                </Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">Create New Exam</h1>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Exam Title</label>
                        <input
                            type="text"
                            name="title"
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="e.g. Mathematics Final Exam"
                            value={formData.title}
                            onChange={handleChange}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">School</label>
                            <select
                                name="school_id"
                                required
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                value={formData.school_id}
                                onChange={handleChange}
                            >
                                <option value="">Select School</option>
                                {schools.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                            <input
                                type="number"
                                name="duration_minutes"
                                required
                                min="1"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.duration_minutes}
                                onChange={handleChange}
                            />
                        </div>
                    </div>

                    <div>
                        {/* Access Code is auto-generated */}
                    </div>

                    <div className="border-t border-gray-100 pt-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Upload Soal PDF (Optional)
                            </label>

                            {!formData.title || (!formData.school_id && schools.length > 0) ? (
                                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-200 border-dashed rounded-lg bg-gray-50">
                                    <div className="text-center text-gray-400">
                                        <AlertCircle className="mx-auto h-12 w-12 mb-2" />
                                        <p className="text-sm font-medium">Please enter Exam Title and Select School first.</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-blue-400 transition-colors">
                                        <div className="space-y-1 text-center">
                                            <Upload className="mx-auto h-12 w-12 text-gray-400" />
                                            <div className="flex text-sm text-gray-600">
                                                <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                                                    <span>Upload a file</span>
                                                    <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".pdf" onChange={handleFileChange} />
                                                </label>
                                                <p className="pl-1">or drag and drop</p>
                                            </div>
                                            <p className="text-xs text-gray-500">PDF up to 10MB</p>
                                        </div>
                                    </div>
                                    {formData.pdf_file && (
                                        <div className="mt-2 flex items-center p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                                            <FileText className="w-4 h-4 mr-2" />
                                            <span className="truncate flex-1">{formData.pdf_file.name}</span>
                                            <span className="text-xs font-semibold bg-blue-200 px-2 py-0.5 rounded ml-2">Ready to Upload</span>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end pt-6">
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium flex items-center transition-colors disabled:bg-blue-400"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                    {statusText || 'Processing...'}
                                </>
                            ) : (
                                'Create Exam'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
