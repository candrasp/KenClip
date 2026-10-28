# ✂️ KenClip - YouTube Video Clipper

Aplikasi web modern, cepat, dan ringan berbasis **Bun & Hono** untuk memotong dan mengunduh klip video dari YouTube secara presisi tanpa harus mengunduh video utuh.

![KenClip Interface Preview](Screenshot.png)

---

## ✨ Fitur Utama

- ⚡ **Pemotongan Cepat (Instant Clipping)** - Memanfaatkan fitur `--download-sections` dari `yt-dlp`. Video berdurasi 1 jam hanya diunduh pada segmen detik yang Anda potong saja, menghemat kuota & bandwidth secara drastis.
- 🎯 **Presisi Titik Potong Tinggi** - Didukung `--force-keyframes-at-cuts` untuk memastikan video dipotong tepat pada detik yang ditentukan.
- 🎬 **Pratinjau Interaktif (Preview First)** - Tombol *Potong Klip* hanya aktif setelah Anda memvalidasi segmen dengan tombol *▶ Putar Terpilih*, memastikan klip tidak meleset.
- 🎥 **Sistem Resolusi Adaptif** - Opsi resolusi ekspor (1080p, 720p, 480p, 360p) otomatis menyesuaikan ketersediaan kualitas video sumber di YouTube.
- 🛡️ **Quality & Security Protection**:
  - Validasi ketat domain YouTube & regex nama file aman (`Anti Path-Traversal`).
  - Proteksi eksekusi argumen `Bun.spawn` murni (`Anti Command-Injection`).
  - Proteksi video kualitas buruk (≤ 240p) agar hasil klip tetap layak ditonton.
- 🧹 **Auto-Cleanup 1 Jam** - File klip lama di folder `clips/` otomatis dibersihkan setiap 15 menit agar media penyimpanan tidak penuh.
- 🎨 **Tampilan Gelap Modern (Full-Width Desktop Optimized)** - Didesain pas 1 layar penuh (khususnya rasio 1366×768 / 1080p), dilengkapi sistem **Toast Notifications** dan **Confirmation Modal Dialog** estetis.

---

## 🚀 Cara Menggunakan

1. **Masukkan URL YouTube**:
   - Tempel link video YouTube (mendukung format `watch?v=`, `shorts/`, atau `youtu.be/`).
   - Klik tombol **Muat Video** (video langsung termuat instan < 0.2 detik).
2. **Tentukan Rentang Waktu Klip**:
   - Geser penanda slider oranye di timeline, atau ketik langsung format `MM:SS` pada kolom **Mulai** dan **Selesai**.
3. **Pilih Resolusi Ekspor**:
   - Pilih kualitas dari dropdown yang muncul (1080p, 720p, 480p, atau 360p).
4. **Validasi & Eksekusi Potong**:
   - Klik tombol **▶ Putar Terpilih** untuk mempratinjau bagian video yang dipilih.
   - Tombol **✂ Potong Klip** akan otomatis terbuka dan siap diklik.
5. **Unduh Klip**:
   - Setelah proses selesai (biasanya hanya beberapa detik), video hasil siap diputar langsung di panel kanan dan diunduh (`⬇ Unduh .mp4`).

---

## 🎥 Sistem Resolusi Adaptif

KenClip menggunakan pemindaian format di latar belakang *(non-blocking)* sehingga tidak memperlambat pemuatan player utama:

| Resolusi Maksimal Video Sumber | Opsi Dropdown yang Ditampilkan |
| :--- | :--- |
| **Tersedia 1080p (Full HD)** | `1080p`, `720p` *(default)*, `480p`, `360p` |
| **Maksimal 720p (HD)** | `720p` *(default)*, `480p`, `360p` (1080p disembunyikan) |
| **Maksimal 480p (SD)** | `480p`, `360p` |
| **Maksimal 360p** | `360p` |
| **Sangat Rendah (≤ 240p)** | Muncul peringatan error & tombol potong dinonaktifkan |

---

## 📋 Prasyarat Sistem

Pastikan binary berikut telah terpasang di sistem dan terdaftar pada PATH lingkungan:

- [Bun](https://bun.sh/) (v1.0 ke atas)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (versi terbaru, disarankan `yt-dlp -U`)
- [FFmpeg](https://ffmpeg.org/) (digunakan internal oleh yt-dlp untuk muxing stream)

> Panduan instalasi external binary:
> - [INSTALL_FFMPEG.md](INSTALL_FFMPEG.md)
> - [INSTALL_YTDLP.md](INSTALL_YTDLP.md)

---

## 📦 Instalasi & Menjalankan

1. Clone repositori:
   ```bash
   git clone https://github.com/CandraSP/KenClip.git
   cd KenClip
   ```

2. Pasang dependensi:
   ```bash
   bun install
   ```

3. Jalankan aplikasi:
   - **Mode Development (Hot-Reload)**:
     ```bash
     bun run dev
     ```
   - **Mode Production**:
     ```bash
     bun start
     ```

4. Buka di browser favorit Anda: `http://localhost:3000`

---

## 📁 Struktur Direktori

```text
KenClip/
├── clips/                # Direktori penyimpanan hasil potongan klip (.mp4)
├── src/
│   ├── index.ts          # Server backend (Hono + Bun.spawn CLI controller)
│   └── public/           # Frontend Web Application
│       ├── index.html    # Layout UI & player markup
│       ├── style.css     # Styling Dark Mode responsif (1366x768 optimized)
│       ├── script.js     # Logika timeline, IFrame API, & modal handler
│       └── logo.svg      # Logo vektor resmi KenClip
├── package.json          # Manifest dependensi & scripts
├── ROADMAP.md            # Catatan rencana pengembangan fitur mendatang
└── README.md             # Dokumentasi proyek
```

---

## 🔌 API Endpoints

- `POST /api/video-info` - Mengambil info judul & thumbnail video instan via YouTube oEmbed API.
- `POST /api/video-quality` - Memindai daftar kualitas maksimal video sumber di latar belakang.
- `POST /api/clip` - Memotong segmen video dengan yt-dlp sesuai durasi dan resolusi pilihan.
- `GET /api/download/:filename` - Streaming/unduh file klip MP4 (didukung HTTP range).
- `DELETE /api/clip/:filename` - Menghapus file klip dari server lokal.

---

## 👨‍💻 Developer & Attribution

© **KenClip** by [CandraSP](https://www.instagram.com/kenvanoprabowo/)  
Instagram: [@kenvanoprabowo](https://www.instagram.com/kenvanoprabowo/)

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah lisensi [MIT](LICENSE).
