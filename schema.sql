-- ============================================================
-- SmartTryout - Complete Database Schema
-- ============================================================
-- CARA PAKAI:
-- 1. Buka Supabase Dashboard -> SQL Editor
-- 2. Jalankan SELURUH file ini sekaligus
-- 3. Setelah selesai, buat bucket storage 'soal_pdf' di menu Storage
-- 4. Buat user Guru & Murid di Authentication -> Users -> Add User
-- 5. Jalankan query UPDATE profiles di bagian bawah untuk set role
-- ============================================================


-- ============================================================
-- BAGIAN 1: TABEL MASTER
-- ============================================================

-- Tabel Sekolah
CREATE TABLE IF NOT EXISTS schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    npsn TEXT UNIQUE,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel Profil User (terhubung ke auth.users)
-- Dibuat otomatis via trigger saat user signup
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    role TEXT CHECK (role IN ('teacher', 'student')),
    school_id UUID REFERENCES schools(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- BAGIAN 2: TRIGGER AUTO-CREATE PROFILE
-- Setiap kali user baru signup, profil otomatis dibuat
-- full_name & role diambil dari metadata signup
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        COALESCE(NEW.raw_user_meta_data->>'role', 'student')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ============================================================
-- BAGIAN 3: TABEL UJIAN & BANK SOAL
-- ============================================================

-- Tabel Ujian (Header)
CREATE TABLE IF NOT EXISTS exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(id),
    created_by UUID REFERENCES auth.users(id),
    title TEXT NOT NULL,
    access_code VARCHAR(50) UNIQUE,
    duration_minutes INT DEFAULT 60,
    pdf_url TEXT,                          -- URL PDF soal (opsional)
    is_published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel Soal
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
    question_text TEXT,                    -- Null jika soal pakai PDF
    image_url TEXT,
    point_value INT DEFAULT 1,
    order_index INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel Pilihan Jawaban
CREATE TABLE IF NOT EXISTS options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT FALSE
);


-- ============================================================
-- BAGIAN 4: TABEL TRANSAKSI (HASIL MURID)
-- ============================================================

-- Sesi Pengerjaan Ujian
CREATE TABLE IF NOT EXISTS exam_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    score FLOAT DEFAULT 0,
    status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed'))
);

-- Detail Jawaban Murid
CREATE TABLE IF NOT EXISTS user_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID REFERENCES exam_attempts(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
    selected_option_id UUID REFERENCES options(id) ON DELETE CASCADE,
    is_correct BOOLEAN,                    -- Diupdate otomatis oleh submit_exam RPC
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(attempt_id, question_id)        -- 1 jawaban per soal per sesi
);


-- ============================================================
-- BAGIAN 5: STORAGE POLICIES
-- Pastikan bucket 'soal_pdf' sudah dibuat di menu Storage
-- dengan akses Public sebelum menjalankan ini
-- ============================================================

CREATE POLICY "Allow public uploads"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'soal_pdf');

CREATE POLICY "Allow public select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'soal_pdf');


-- ============================================================
-- BAGIAN 6: ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE options ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_answers ENABLE ROW LEVEL SECURITY;

-- ---- SCHOOLS ----
CREATE POLICY "Public read schools"
ON schools FOR SELECT TO authenticated USING (true);

-- ---- PROFILES ----
CREATE POLICY "Users see own profile"
ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ---- EXAMS ----
-- Semua user bisa lihat ujian (untuk lookup kode akses)
CREATE POLICY "Authenticated users see exams"
ON exams FOR SELECT TO authenticated USING (true);

-- Hanya pembuat yang bisa insert/update/delete
CREATE POLICY "Teachers can insert exams"
ON exams FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Teachers can update exams"
ON exams FOR UPDATE TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Teachers can delete exams"
ON exams FOR DELETE TO authenticated
USING (auth.uid() = created_by);

-- ---- QUESTIONS ----
CREATE POLICY "Authenticated users see questions"
ON questions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Teachers can insert questions"
ON questions FOR INSERT TO authenticated
WITH CHECK (exam_id IN (SELECT id FROM exams WHERE created_by = auth.uid()));

CREATE POLICY "Teachers can update questions"
ON questions FOR UPDATE TO authenticated
USING (exam_id IN (SELECT id FROM exams WHERE created_by = auth.uid()))
WITH CHECK (exam_id IN (SELECT id FROM exams WHERE created_by = auth.uid()));

CREATE POLICY "Teachers can delete questions"
ON questions FOR DELETE TO authenticated
USING (exam_id IN (SELECT id FROM exams WHERE created_by = auth.uid()));

-- ---- OPTIONS ----
CREATE POLICY "Authenticated users see options"
ON options FOR SELECT TO authenticated USING (true);

CREATE POLICY "Teachers can insert options"
ON options FOR INSERT TO authenticated
WITH CHECK (
    question_id IN (
        SELECT id FROM questions
        WHERE exam_id IN (SELECT id FROM exams WHERE created_by = auth.uid())
    )
);

CREATE POLICY "Teachers can update options"
ON options FOR UPDATE TO authenticated
USING (
    question_id IN (
        SELECT id FROM questions
        WHERE exam_id IN (SELECT id FROM exams WHERE created_by = auth.uid())
    )
)
WITH CHECK (
    question_id IN (
        SELECT id FROM questions
        WHERE exam_id IN (SELECT id FROM exams WHERE created_by = auth.uid())
    )
);

CREATE POLICY "Teachers can delete options"
ON options FOR DELETE TO authenticated
USING (
    question_id IN (
        SELECT id FROM questions
        WHERE exam_id IN (SELECT id FROM exams WHERE created_by = auth.uid())
    )
);

-- ---- EXAM ATTEMPTS ----
-- Murid lihat milik sendiri; Guru lihat semua di ujian miliknya
CREATE POLICY "View attempt policy"
ON exam_attempts FOR SELECT TO authenticated
USING (
    auth.uid() = user_id OR
    exam_id IN (SELECT id FROM exams WHERE created_by = auth.uid())
);

CREATE POLICY "Students can start exam"
ON exam_attempts FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can update own attempt"
ON exam_attempts FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Guru bisa hapus attempt (untuk reset agar murid bisa ulang)
CREATE POLICY "Teachers can delete attempts"
ON exam_attempts FOR DELETE TO authenticated
USING (exam_id IN (SELECT id FROM exams WHERE created_by = auth.uid()));

-- ---- USER ANSWERS ----
-- Murid lihat milik sendiri; Guru lihat jawaban di ujian miliknya
CREATE POLICY "View answers policy"
ON user_answers FOR SELECT TO authenticated
USING (
    attempt_id IN (SELECT id FROM exam_attempts WHERE user_id = auth.uid()) OR
    attempt_id IN (
        SELECT ea.id FROM exam_attempts ea
        JOIN exams e ON ea.exam_id = e.id
        WHERE e.created_by = auth.uid()
    )
);

CREATE POLICY "Students can insert answers"
ON user_answers FOR INSERT TO authenticated
WITH CHECK (
    attempt_id IN (SELECT id FROM exam_attempts WHERE user_id = auth.uid())
);

CREATE POLICY "Students can update answers"
ON user_answers FOR UPDATE TO authenticated
USING (attempt_id IN (SELECT id FROM exam_attempts WHERE user_id = auth.uid()))
WITH CHECK (attempt_id IN (SELECT id FROM exam_attempts WHERE user_id = auth.uid()));

-- Guru bisa hapus jawaban (untuk reset attempt murid)
CREATE POLICY "Teachers can delete answers for their exams"
ON user_answers FOR DELETE TO authenticated
USING (
    attempt_id IN (
        SELECT ea.id FROM exam_attempts ea
        JOIN exams e ON ea.exam_id = e.id
        WHERE e.created_by = auth.uid()
    )
);


-- ============================================================
-- BAGIAN 7: RPC FUNCTIONS (SECURITY DEFINER)
-- Fungsi-fungsi ini berjalan dengan hak superuser
-- sehingga bisa bypass RLS untuk operasi yang diperlukan
-- ============================================================

-- RPC 1: Hitung skor dan selesaikan ujian
-- Dipanggil dari ExamRoomPage saat murid klik Submit
CREATE OR REPLACE FUNCTION submit_exam(p_attempt_id UUID)
RETURNS TABLE (final_score FLOAT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_total_q INT;
    v_correct_q INT;
BEGIN
    -- Update is_correct berdasarkan kunci jawaban
    UPDATE user_answers ua
    SET is_correct = o.is_correct
    FROM options o
    WHERE ua.selected_option_id = o.id AND ua.attempt_id = p_attempt_id;

    -- Hitung jumlah benar
    SELECT COUNT(*) INTO v_correct_q
    FROM user_answers
    WHERE attempt_id = p_attempt_id AND is_correct = TRUE;

    -- Hitung total soal
    SELECT COUNT(*) INTO v_total_q
    FROM questions q
    JOIN exam_attempts ea ON q.exam_id = ea.exam_id
    WHERE ea.id = p_attempt_id;

    -- Update skor dan status
    UPDATE exam_attempts
    SET
        score = (CASE WHEN v_total_q > 0 THEN (v_correct_q::FLOAT / v_total_q::FLOAT) * 100 ELSE 0 END),
        status = 'completed',
        end_time = NOW()
    WHERE id = p_attempt_id;

    RETURN QUERY SELECT score FROM exam_attempts WHERE id = p_attempt_id;
END;
$$;


-- RPC 2: Reset attempt murid (hapus jawaban + attempt)
-- Dipanggil dari ExamResultsPage oleh Guru
-- Hanya guru pemilik ujian yang bisa melakukan ini
CREATE OR REPLACE FUNCTION reset_exam_attempt(p_attempt_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    -- Verifikasi bahwa pemanggil adalah guru pemilik ujian
    IF NOT EXISTS (
        SELECT 1 FROM exam_attempts ea
        JOIN exams e ON e.id = ea.exam_id
        WHERE ea.id = p_attempt_id AND e.created_by = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized to reset this attempt';
    END IF;

    -- Hapus jawaban terlebih dahulu
    DELETE FROM user_answers WHERE attempt_id = p_attempt_id;

    -- Hapus attempt
    DELETE FROM exam_attempts WHERE id = p_attempt_id;
END;
$$;


-- RPC 3: Ambil hasil ujian beserta email murid dari auth.users
-- Dipanggil dari ExamResultsPage (Teacher view)
-- Menggunakan SECURITY DEFINER untuk akses auth.users
DROP FUNCTION IF EXISTS get_exam_results(UUID);

CREATE FUNCTION get_exam_results(p_exam_id UUID)
RETURNS TABLE (
    attempt_id UUID,
    user_id UUID,
    user_email TEXT,
    full_name TEXT,
    score FLOAT8,
    status TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ea.id::UUID,
        ea.user_id::UUID,
        u.email::TEXT,
        COALESCE(p.full_name, u.email)::TEXT,  -- Fallback ke email jika full_name kosong
        ea.score::FLOAT8,
        ea.status::TEXT,
        ea.start_time::TIMESTAMPTZ,
        ea.end_time::TIMESTAMPTZ
    FROM exam_attempts ea
    JOIN auth.users u ON u.id = ea.user_id
    LEFT JOIN profiles p ON p.id = ea.user_id
    WHERE ea.exam_id = p_exam_id
    ORDER BY ea.score DESC NULLS LAST;
END;
$$;


-- ============================================================
-- BAGIAN 8: DATA AWAL (MASTER DATA)
-- Jalankan setelah tabel dibuat
-- ============================================================

-- Contoh data sekolah (sesuaikan dengan kebutuhan)
-- INSERT INTO schools (name, npsn, address) VALUES
-- ('SMA Negeri 1 Jakarta', 'NPSN123456', 'Jl. Budi Utomo No.7, Jakarta Pusat');


-- ============================================================
-- BAGIAN 9: SETUP ROLE USER
-- Jalankan setelah membuat user di Authentication -> Users
-- Ganti email sesuai akun yang sudah dibuat
-- ============================================================

-- Set role GURU
-- UPDATE profiles SET full_name = 'Nama Guru', role = 'teacher'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'guru@sekolah.com');

-- Set role MURID
-- UPDATE profiles SET full_name = 'Nama Murid', role = 'student'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'murid@sekolah.com');


-- ============================================================
-- BAGIAN 10: BACKFILL PROFILES
-- Jalankan SEKALI jika ada user lama yang belum punya profil
-- (misalnya user yang dibuat manual di Supabase Dashboard)
-- ============================================================

INSERT INTO public.profiles (id, full_name, role)
SELECT
    u.id,
    COALESCE(u.raw_user_meta_data->>'full_name', u.email),
    COALESCE(u.raw_user_meta_data->>'role', 'student')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
