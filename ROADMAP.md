# Roadmap & Rencana Pengembangan KenClip

Dokumen ini mencatat rencana fitur dan arsitektur pengembangan KenClip untuk versi-versi mendatang.

---

## 🎯 Fitur Mendatang (Upcoming Features)

### 1. 📐 Crop & Konversi Aspek Rasio (Aspect Ratio Crop)
Fitur untuk memotong dan mengubah rasio dimensi video hasil klip agar langsung siap diunggah ke platform media sosial (seperti YouTube Shorts, TikTok, Instagram Reels, dll).

#### Skenario Kebutuhan:
* **16:9 Landscape $\rightarrow$ 9:16 Vertical**: Mengubah video standar YouTube menjadi video vertikal untuk TikTok / YouTube Shorts / IG Reels.
* **9:16 Vertical $\rightarrow$ 16:9 Landscape**: Menyesuaikan video Shorts untuk format monitor desktop standar.
* **1:1 Square**: Format kotak untuk feed media sosial.

#### Implementasi Teknis & Filter FFmpeg:
Untuk melakukan cropping aspek rasio secara presisi di tengah video (*center crop*), diperlukan filter video FFmpeg (`-vf`):

1. **Crop 16:9 ke 9:16 (Center Crop Vertikal)**:
   ```bash
   -vf "crop=ih*(9/16):ih"
   ```
   * *Penjelasan*: Mengambil tinggi penuh (`ih`) dan memotong lebar video menjadi proporsi `9/16` dari tinggi video tepat di titik tengah.

2. **Crop dengan Latar Belakang Blur (No Content Loss / Blur Background)**:
   * Alternatif agar bagian samping video landscape tidak terpotong habis, yaitu menempatkan video asli di tengah dengan background video yang di-blur:
   ```bash
   -vf "split[original][blur];[blur]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:20[bg];[original]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2"
   ```

3. **Opsi UI yang Direncanakan**:
   * Dropdown / Switch Aspek Rasio di samping pilihan resolusi:
     * `Asli (Original)`
     * `9:16 (TikTok / Shorts)`
     * `1:1 (Square)`
     * `16:9 (Landscape)`

---

## 🚀 Fitur Lain yang Sedang Dipertimbangkan

- [ ] **Multi-Clip Selection**: Memilih dan mengekspor beberapa segmen waktu sekaligus dalam satu video.
- [ ] **Audio Only Export (MP3/M4A)**: Opsi mengunduh hanya suara/audio dari klip yang dipilih.
- [ ] **Subtitles / Caption Embedding**: Opsi menempelkan subtitle otomatis dari YouTube ke dalam klip video hasil ekspor.

