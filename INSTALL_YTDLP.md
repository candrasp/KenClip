# Cara Install yt-dlp di Windows

yt-dlp diperlukan untuk mengunduh video dari YouTube. Berikut cara installnya:

## Opsi 1: Menggunakan pip (Python)

Jika sudah punya Python terinstall:
```bash
pip install yt-dlp
```

Atau upgrade jika sudah ada:
```bash
pip install -U yt-dlp
```

## Opsi 2: Menggunakan Scoop (Recommended untuk Windows)

Jika sudah punya Scoop package manager:
```bash
scoop install yt-dlp
```

## Opsi 3: Menggunakan winget (Windows 11)

```bash
winget install yt-dlp
```

## Opsi 4: Manual Download

1. Download yt-dlp.exe dari: https://github.com/yt-dlp/yt-dlp/releases/latest
2. Download file `yt-dlp.exe`
3. Pindahkan ke folder di PATH (misalnya `C:\Windows` atau `C:\Program Files\yt-dlp`)
4. Atau tambahkan folder tersebut ke PATH

## Verifikasi Instalasi

Setelah install, buka terminal baru dan jalankan:
```bash
yt-dlp --version
```

Jika muncul versi yt-dlp, berarti sudah berhasil!

## Catatan

- **Restart terminal** setelah instalasi agar PATH terupdate
- yt-dlp adalah fork aktif dari youtube-dl dengan fitur lebih banyak
- Diperlukan untuk mengunduh video dari YouTube sebelum diproses

## Instalasi Python (jika belum punya)

Download dari: https://www.python.org/downloads/
- Pastikan centang "Add Python to PATH" saat install
- Setelah install Python, jalankan `pip install yt-dlp`
