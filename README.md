# 🚀 SmartTryout: Multi-School Online Examination System

SmartTryout adalah platform ujian online berbasis web yang dirancang untuk memudahkan Guru dalam mendistribusikan soal (baik melalui input manual maupun PDF) kepada murid di berbagai sekolah. Aplikasi ini menggunakan sistem Access Code untuk menjamin keamanan ujian dan memberikan statistik hasil pengerjaan secara real-time.

---

## ✨ Fitur Utama

### 👨‍🏫 Fitur Guru
- **Buat & Kelola Ujian**: Input soal manual atau upload PDF.
- **Access Code System**: Kode unik untuk setiap ujian.
- **Lihat Hasil Murid**: Dashboard hasil lengkap dengan skor dan review jawaban.
- **Reset Attempt**: Hapus jawaban siswa agar bisa mengulang ujian.
- **Email Notifikasi Otomatis**: Guru menerima email setiap kali siswa menyelesaikan ujian.

### 👨‍🎓 Fitur Murid
- **Masuk dengan Kode Akses**: Tidak perlu tahu URL ujian.
- **Auto-Save Jawaban**: Tersimpan otomatis ke server setiap klik.
- **Real-time Timer**: Countdown tersinkronisasi dengan server.
- **Instant Results**: Skor dan review jawaban benar/salah langsung setelah submit.

---

## 🛠️ Tech Stack

| Layer | Teknologi |
|---|---|
| Frontend | React.js (Vite) |
| Styling | Vanilla CSS |
| Backend & Database | Supabase (PostgreSQL) |
| State Management | Zustand |
| File Storage | Supabase Storage |
| Email | Resend API via Supabase Edge Function |
| Security | Row Level Security (RLS) + PostgreSQL RPC |

---

## 📊 Skema Database

| Tabel | Fungsi |
|---|---|
| `schools` | Data instansi sekolah |
| `profiles` | Profil user (Guru/Murid), auto-created via trigger saat signup |
| `exams` | Header ujian: judul, kode akses, durasi, PDF |
| `questions` | Bank soal |
| `options` | Pilihan jawaban per soal |
| `exam_attempts` | Sesi pengerjaan murid (waktu mulai, selesai, skor) |
| `user_answers` | Detail jawaban yang dipilih murid |

---

## 🚀 Panduan Setup Lengkap

### Step 1 — Buat Project Supabase

1. Buka [supabase.com](https://supabase.com) → **New Project**
2. Catat **Project URL** dan **Anon Key** dari **Settings → API**
   - URL format: `https://xxxxxxxx.supabase.co`
   - Anon Key format: `eyJhbGci...` (JWT, bukan `sb_publishable_...`)

---

### Step 2 — Setup Database

1. Buka **SQL Editor** di Supabase Dashboard
2. Jalankan **seluruh isi file `schema.sql`** — sudah mencakup:
   - Semua tabel
   - Trigger auto-create profile saat user baru signup
   - Semua RLS policies
   - Storage policies
   - RPC functions (`submit_exam`, `reset_exam_attempt`, `get_exam_results`)
3. Buat bucket storage: **Storage → New Bucket** → nama: `soal_pdf` → centang **Public**
4. Isi data sekolah (sesuaikan):
   ```sql
   INSERT INTO schools (name, npsn, address) VALUES 
   ('SMA Negeri 1 Jakarta', 'NPSN123456', 'Jl. Budi Utomo No.7, Jakarta Pusat');
   ```
5. Buat akun Guru & Murid di **Authentication → Users → Add User**
6. Set profil user (ganti email sesuai akun yang dibuat):
   ```sql
   -- Setup GURU
   UPDATE profiles SET full_name = 'Nama Guru', role = 'teacher'
   WHERE id = (SELECT id FROM auth.users WHERE email = 'guru@sekolah.com');

   -- Setup MURID
   UPDATE profiles SET full_name = 'Nama Murid', role = 'student'
   WHERE id = (SELECT id FROM auth.users WHERE email = 'murid@sekolah.com');
   ```
   > Jika profil belum ada (user dibuat manual di dashboard), jalankan backfill di bagian bawah `schema.sql`.

---

### Step 3 — Setup Email Notifikasi (Resend + Edge Function)

#### a. Daftar Resend (Gratis — 3000 email/bulan)
1. Buka [resend.com](https://resend.com) → Sign Up
2. **API Keys** → **Create API Key** → copy key (`re_xxxxxxxxxxxx`)
3. ⚠️ **Free tier**: Email hanya bisa dikirim ke email yang sama dengan akun Resend, kecuali domain sudah diverifikasi di Resend.

#### b. Buat Edge Function di Supabase
1. Buka **Supabase Dashboard → Edge Functions → New Function**
2. Nama: `notify-teacher`
3. Paste kode berikut (sudah include CORS handler):

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { teacher_id, teacher_name, student_name, exam_title, score } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user } } = await supabase.auth.admin.getUserById(teacher_id)
    const teacher_email = user?.email

    if (!teacher_email) {
      return new Response(
        JSON.stringify({ error: 'Teacher email not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SmartTryout <onboarding@resend.dev>',
        to: [teacher_email],
        subject: `📝 ${student_name} telah menyelesaikan ujian "${exam_title}"`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #4F46E5;">📋 Hasil Ujian Masuk!</h2>
            <p>Halo <strong>${teacher_name}</strong>,</p>
            <p>Siswa <strong>${student_name}</strong> telah menyelesaikan ujian <strong>"${exam_title}"</strong>.</p>
            <div style="background: #F3F4F6; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
              <p style="margin: 0; font-size: 14px; color: #6B7280;">Skor Akhir</p>
              <p style="margin: 8px 0 0; font-size: 36px; font-weight: bold; color: ${score >= 70 ? '#16A34A' : '#DC2626'};">
                ${score.toFixed(1)}
              </p>
            </div>
            <p>Buka dashboard untuk melihat detail jawaban siswa.</p>
            <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">SmartTryout — Platform Ujian Online</p>
          </div>
        `,
      }),
    })

    const data = await res.json()
    console.log('Resend response:', res.status, data)

    return new Response(
      JSON.stringify(data),
      {
        status: res.ok ? 200 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (err) {
    console.error('Edge function error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

4. Klik **Deploy**

#### c. Tambahkan Secret
Buka **Edge Functions → Manage Secrets** → tambahkan:

| Key | Value |
|-----|-------|
| `RESEND_API_KEY` | API key dari Resend (`re_xxxxxxxxxxxx`) |

> `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` sudah otomatis tersedia di Edge Functions — tidak perlu ditambahkan manual.

---

### Step 4 — Konfigurasi File `.env`

1. Copy `.env.example` menjadi `.env`:
   ```bash
   cp .env.example .env
   ```
2. Isi dengan nilai yang benar:
   ```env
   # Supabase — dari Settings > API di Supabase Dashboard
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...   # HARUS format JWT (eyJ...), bukan sb_publishable_...

   # Resend Email API
   VITE_RESEND_API_KEY=re_xxxxxxxxxxxx

   # Supabase Edge Function URL (ganti project ID sesuai URL Supabase Anda)
   VITE_SUPABASE_FUNCTIONS_URL=https://xxxxxxxx.supabase.co/functions/v1
   ```

> ⚠️ **PENTING**: Jangan pernah commit file `.env` ke Git! File ini sudah ada di `.gitignore`.

---

### Step 5 — Install & Run

```bash
# Install dependencies
npm install

# Jalankan mode development
npm run dev
```

> Setiap kali mengubah file `.env`, **restart dev server** (`Ctrl+C` lalu `npm run dev`) agar perubahan terbaca.

---

### Step 6 — Deploy dengan Docker (Production)

> **Prasyarat**: [Docker Desktop](https://www.docker.com/products/docker-desktop/) sudah terinstall dan berjalan.

#### File yang digunakan:
| File | Fungsi |
|---|---|
| `Dockerfile` | Multi-stage build: Node 20 build → nginx serve |
| `docker-compose.yml` | Orchestration, port mapping, env vars |
| `nginx.conf` | SPA routing fallback + gzip + security headers |
| `.dockerignore` | Exclude `node_modules`, `.env`, dll dari image |

#### ⚠️ Penting: VITE_ env vars di-bake saat build
Variabel `VITE_*` **disisipkan ke dalam JavaScript bundle saat build** — bukan saat runtime. Pastikan `.env` sudah terisi sebelum menjalankan `docker-compose up --build`.

#### Perintah Docker:

**Build dan jalankan (foreground):**
```bash
docker-compose up --build
```

**Build dan jalankan di background:**
```bash
docker-compose up --build -d
```

**Buka di browser:**
```
http://localhost:3000
```

**Cek status container:**
```bash
docker-compose ps
```

**Lihat logs:**
```bash
docker-compose logs -f
```

**Stop container:**
```bash
docker-compose down
```

**Rebuild setelah ada perubahan kode atau `.env`:**
```bash
docker-compose down && docker-compose up --build
```

#### Troubleshooting:
| Masalah | Solusi |
|---|---|
| Port 3000 sudah dipakai | Ganti `"3000:80"` di `docker-compose.yml` menjadi `"8080:80"` |
| Perubahan kode tidak muncul | Jalankan `docker-compose up --build` (bukan hanya `up`) |
| Halaman 404 saat refresh | Sudah ditangani `nginx.conf` — semua route ke `index.html` |
| Env vars tidak terbaca | Pastikan `.env` ada di root folder dan terisi sebelum build |

---

## 🔒 Keamanan (RLS Policies)

| Tabel | Murid | Guru |
|---|---|---|
| `exams` | SELECT (semua) | SELECT, INSERT, UPDATE, DELETE (milik sendiri) |
| `exam_attempts` | SELECT, INSERT, UPDATE (milik sendiri) | SELECT, DELETE (ujian milik sendiri) |
| `user_answers` | SELECT, INSERT, UPDATE (milik sendiri) | SELECT, DELETE (ujian milik sendiri) |
| `profiles` | SELECT, INSERT, UPDATE (milik sendiri) | SELECT, INSERT, UPDATE (milik sendiri) |

### RPC Functions (SECURITY DEFINER — bypass RLS)

| Function | Fungsi |
|---|---|
| `submit_exam(p_attempt_id)` | Hitung skor, update status attempt ke `completed` |
| `reset_exam_attempt(p_attempt_id)` | Hapus jawaban + attempt (hanya guru pemilik ujian) |
| `get_exam_results(p_exam_id)` | Ambil hasil ujian beserta email murid dari `auth.users` |
| `handle_new_user()` | Trigger: auto-create profil saat user baru signup |
