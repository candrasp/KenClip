# Cara Install FFmpeg di Windows

FFmpeg diperlukan untuk memproses dan memotong video. Berikut cara installnya:

## Opsi 1: Menggunakan Chocolatey (Recommended)

Jika sudah punya Chocolatey package manager:
```powershell
choco install ffmpeg
```

## Opsi 2: Menggunakan winget (Windows 11)

```powershell
winget install FFmpeg
```

## Opsi 3: Manual Download

1. Download FFmpeg dari: https://www.gyan.dev/ffmpeg/builds/
2. Pilih "ffmpeg-release-essentials.zip"
3. Extract ke folder (misalnya `C:\ffmpeg`)
4. Tambahkan ke PATH:
   - Buka "Environment Variables" 
   - Edit "Path" di System Variables
   - Tambahkan: `C:\ffmpeg\bin`
   - Restart terminal

## Verifikasi Instalasi

Setelah install, buka terminal baru dan jalankan:
```bash
ffmpeg -version
```

Jika muncul versi FFmpeg, berarti sudah berhasil!

## Catatan

- **Restart terminal** setelah instalasi agar PATH terupdate
- Aplikasi YouTube Clipper memerlukan FFmpeg untuk berfungsi
- Tanpa FFmpeg, fitur potong video tidak akan bekerja
