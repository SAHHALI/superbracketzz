# 🏆 BRACKETZZ V2 - Sports & Tournament Manager

Aplikasi manajemen turnamen modern dan generator bagan kompetisi dengan dukungan Cloud Database Supabase, sistem Liga 3 Putaran, statistik rekor kemenangan pemain, serta leaderboard podium interaktif.

---

## ✨ Fitur Utama

- ⚡ **Sistem Gugur (Knockout)**: Bagan interaktif otomatis dengan babak penyisihan hingga final.
- 🔄 **Sistem Liga 3 Putaran (Triple Round-Robin)**: Setiap peserta bertemu sebanyak 3 kali dengan jadwal kandang/tandang seimbang dan klasemen poin otomatis.
- 📊 **Statistik & Profil Pemain**:
  - Rekor Menang - Seri - Kalah (W - D - L)
  - Persentase Win Rate (%) dinamis dengan progress bar
  - Form Guide 5 laga terakhir (W / D / L pills)
  - Gelar kehormatan arena otomatis (`👑 GOAT / Legenda Arena`, dll)
  - Log riwayat pertandingan (*Match History*)
- 🏆 **Hall of Fame & Leaderboard**:
  - Podium visual Juara 1 (Emas bermahkota), Juara 2 (Perak), dan Juara 3 (Perunggu)
  - Klasemen peringkat global seluruh petarung
- ☁️ **Integrasi Cloud Supabase**:
  - Sinkronisasi data pemain, turnamen, dan skor pertandingan ke database PostgreSQL di cloud
  - Dukungan fallback otomatis ke penyimpanan lokal (*sessionStorage*) jika offline

---

## 🚀 Panduan Menghubungkan ke Supabase

1. Buat proyek baru di [supabase.com](https://supabase.com).
2. Masuk ke **SQL Editor** di dashboard Supabase, salin seluruh isi berkas `supabase-schema.sql`, lalu klik **Run**.
3. Buka **Project Settings** -> **API**, salin **Project URL** dan **anon public key**.
4. Buka berkas `assets/js/supabaseClient.js`, lalu masukkan kredensial:
   ```javascript
   const SUPABASE_CONFIG = {
       url: 'https://xyzabcdefg.supabase.co',
       anonKey: 'eyJhbGciOiJIUzI1Ni...'
   };
   ```
5. Buka `index.html` di browser. Indikator di header akan otomatis bertuliskan `🟢 Supabase Cloud`.

---

## 💻 Menjalankan Aplikasi

Aplikasi ini berbasis Vanilla HTML, CSS, dan JavaScript tanpa perlu build tools. Cukup buka berkas `index.html` di browser web favorit Anda atau gunakan ekstensi *Live Server*.
