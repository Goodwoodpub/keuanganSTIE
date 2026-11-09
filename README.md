# Sistem Manajemen Dana Operasional — STIE Krakatau

Aplikasi web untuk request dana, persetujuan pimpinan, pencairan, realisasi + nota, LPJ per request, LPJ bulanan, RAB (termasuk impor Excel), laporan, dan audit log.

## Arsitektur

| Bagian | Isi |
|---|---|
| `server.js` | Server Node.js (Express): login, sesi, API data, upload berkas |
| `src/store.js` | Penyimpanan: **PostgreSQL** (jika `DATABASE_URL` ada) atau file JSON lokal |
| `public/` | Tampilan (HTML, CSS, JS, logo, template RAB Excel) |
| `railway.json` | Konfigurasi deploy Railway (start command + health check) |

Bedanya dengan versi file HTML tunggal:
- Data tersimpan di **database server**, bukan di browser. Bendahara dan pimpinan melihat data yang sama dari perangkat mana pun.
- Login diperiksa di server; password disimpan dalam bentuk **hash (scrypt)**, tidak lagi terlihat di kode atau di halaman login.
- Nota dan berkas diunggah ke server (tidak lagi base64 di browser), sehingga tidak ada batas "penyimpanan penuh".
- Pembaruan dari pengguna lain muncul otomatis (dicek tiap 10 detik). Jika dua orang menyimpan bersamaan, sistem menolak penyimpanan yang bentrok dan memuat ulang data terbaru, jadi tidak ada data yang saling menimpa diam-diam.
- Fitur baru: ganti password sendiri, pimpinan dapat mengatur ulang password dan menghapus pengguna.

## Menjalankan di komputer sendiri

```bash
npm install
npm start
# buka http://localhost:3000
```

Tanpa `DATABASE_URL`, data disimpan di folder `data/` (sudah di-ignore oleh git).

Akun awal (dibuat otomatis saat database masih kosong):

| Username | Password awal | Role |
|---|---|---|
| `bendahara` | `bendahara123` (atau nilai `BENDAHARA_PASSWORD`) | Bendahara |
| `pimpinan` | `pimpinan123` (atau nilai `PIMPINAN_PASSWORD`) | Pimpinan |

**Segera ganti password** lewat menu *Akun Saya* / *Pengguna & Pengaturan* setelah login pertama.

## Upload ke GitHub

```bash
cd stie-dana
git init
git add .
git commit -m "Sistem Dana Operasional STIE Krakatau"
git branch -M main
git remote add origin https://github.com/USERNAME/stie-dana-operasional.git
git push -u origin main
```

(Buat dulu repository kosong di github.com, sebaiknya **Private**.)

## Deploy ke Railway

1. Buka railway.com → **New Project** → **Deploy from GitHub repo** → pilih repository tadi.
2. Di project yang sama: **+ New** → **Database** → **Add PostgreSQL**.
3. Buka service aplikasi → tab **Variables**, tambahkan:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (pilih dari daftar *Add Reference*)
   - `SESSION_SECRET` = string acak panjang (misalnya hasil `openssl rand -hex 32`)
   - `NODE_ENV` = `production`
   - `BENDAHARA_PASSWORD` dan `PIMPINAN_PASSWORD` = password awal yang Anda inginkan
4. Tab **Settings** → **Networking** → **Generate Domain** untuk mendapatkan alamat web (`https://xxx.up.railway.app`). Domain sendiri (misalnya `dana.stiekrakatau.ac.id`) bisa ditambahkan di bagian yang sama.
5. Railway otomatis menjalankan `npm install` lalu `npm start`. Tabel database dibuat otomatis saat pertama kali jalan. Cek `https://alamat-anda/api/health` → harus berisi `{"ok":true,"store":"postgres"}`.

Setiap `git push` ke branch `main` akan otomatis men-deploy ulang. Data tetap aman di PostgreSQL.

> Jika `store` menunjukkan `"file"`, berarti `DATABASE_URL` belum terhubung, dan data akan **hilang** setiap redeploy. Pastikan langkah 2–3 sudah benar.

## Integrasi dengan LMS (Pembayaran Mahasiswa)

Menu **Pembayaran Mahasiswa** menampilkan data dari LMS STIE Krakatau secara baca-saja:
- **Ringkasan**: total tagihan, sudah dibayar, piutang, uang masuk per bulan dan per jenis tagihan, mahasiswa menunggak.
- **Status Mahasiswa**: setiap mahasiswa dengan status Lunas / Dibayar sebagian / Menunggu verifikasi / Belum bayar / Menunggak, bisa difilter per periode, angkatan, prodi; klik untuk melihat tagihan, angsuran, dan riwayat pembayarannya.
- **Uang Masuk**: semua pembayaran yang sudah divalidasi di LMS, per rentang tanggal, lengkap dengan total dan per metode; bisa diekspor ke Excel (CSV).

Verifikasi pembayaran tetap dilakukan di LMS. Data diambil ulang otomatis tiap 2 menit, atau seketika lewat tombol **Muat Ulang Data**.

Cara mengaktifkan:
1. Unggah file integrasi ke LMS (paket `lms-integrasi-keuangan.zip`) dan isi `KEUANGAN_API_TOKEN` di `.env` LMS.
2. Di Railway → Variables tambahkan `LMS_API_URL` (mis. `https://lms.stiekrakatau.ac.id`) dan `LMS_API_TOKEN` (token yang sama).

## Catatan keamanan

- Aturan alur kerja (siapa boleh menyetujui, mencairkan, dsb.) masih dijalankan di sisi tampilan, sama seperti versi aslinya. Server sudah mewajibkan login dan membatasi fitur admin (kelola pengguna, reset data) hanya untuk pimpinan, tetapi belum memeriksa setiap langkah persetujuan. Untuk pemakaian internal kampus dengan akun terbatas ini memadai; bila nanti dibuka lebih luas, validasi per aksi sebaiknya dipindah ke server.
- Login dibatasi 10 percobaan gagal per 15 menit per alamat IP.
- Backup: aktifkan backup PostgreSQL di Railway (tab database → *Backups*).
