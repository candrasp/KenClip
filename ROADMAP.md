# Roadmap & Rencana Pengembangan KenClip

Dokumen ini mencatat rencana fitur dan arsitektur pengembangan KenClip untuk versi-versi mendatang.

---

## 🎯 Fitur Mendatang (Upcoming Features)

### 1. 📐 Crop & Konversi Aspek Rasio (Aspect Ratio Crop) - ✅ IMPLEMENTED
Fitur untuk memotong dan mengubah rasio dimensi video hasil klip lokal on-demand agar langsung siap diunggah ke platform media sosial (seperti YouTube Shorts, TikTok, Instagram Reels, dll).

#### Skenario & Mode yang Didukung:
* **9:16 Shorts (Center Crop)**: Mengambil tinggi penuh dan memotong lebar video menjadi proporsi `9/16` (`-vf "crop=ih*(9/16):ih"`).
* **9:16 Shorts (Blur Background)**: Mempertahankan 100% video asli di tengah layar dengan background video yang di-blur.
* **1:1 Square (Instagram)**: Format kotak 1:1 (`-vf "crop=min(iw\,ih):min(iw\,ih)"`).

---

## 🚀 Fitur Lain yang Sedang Dipertimbangkan

- [ ] **Multi-Clip Selection**: Memilih dan mengekspor beberapa segmen waktu sekaligus dalam satu video.
- [x] **Audio Only Export (MP3)** ⭐ - Extract audio dari klip yang sudah dibuat (On-Demand).
- [ ] **Subtitles / Caption Embedding**: Opsi menempelkan subtitle otomatis dari YouTube ke dalam klip video hasil ekspor.

---

## 🎵 Audio Only Export (MP3) - ✅ IMPLEMENTED

### Konsep Fitur:
Setelah klip video selesai dibuat, user dapat mengekstrak audio saja dalam format MP3 tanpa perlu re-download atau re-process video dari YouTube.

### Implementasi (Opsi A - Extract On-Demand):

#### UI/UX Flow:
```
┌─────────────────────────────────────┐
│  HASIL KLIP                         │
├─────────────────────────────────────┤
│  clip-123456.mp4 · 01:30           │
│                                     │
│  📥 Download Video (MP4)            │
│  🎵 Extract & Download Audio (MP3)  │
│  🗑️ Hapus                           │
└─────────────────────────────────────┘
```

#### Backend API Endpoint:
```typescript
POST /api/extract-audio
Body: { filename: "clip-123456.mp4" }
Response: { success: true, audioFilename: "clip-123456.mp3" }
```

#### FFmpeg Command:
```bash
ffmpeg -i clips/clip-123456.mp4 -vn -acodec libmp3lame -q:a 2 clips/clip-123456.mp3
```

**Flags:**
- `-vn`: No video (audio only)
- `-acodec libmp3lame`: MP3 encoder
- `-q:a 2`: Audio quality (0=best, 9=worst; 2=high quality ~190kbps)

#### Keuntungan Opsi A:
- ✅ Hemat storage (generate hanya saat dibutuhkan)
- ✅ Proses cepat (ekstrak audio < 1 detik)
- ✅ User punya kontrol penuh
- ✅ File MP3 jauh lebih kecil dari MP4
- ✅ Auto-cleanup tetap berlaku (1 jam)

#### Technical Notes:
- File MP3 disimpan di folder `clips/` dengan pattern `clip-{timestamp}.mp3`
- Validasi: hanya file yang match pattern `SAFE_FILE` yang bisa diproses
- Loading state saat ekstraksi (~1-2 detik)
- Toast notification: "🎵 Audio berhasil diekstrak!"

### Status: **READY TO IMPLEMENT** 🚀
Diskusi selesai pada 2026-10-28, siap untuk development phase.

