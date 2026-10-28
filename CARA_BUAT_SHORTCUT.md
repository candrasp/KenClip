# 🖱️ Cara Membuat Shortcut Desktop KenClip

## Langkah-langkah Membuat Shortcut:

### 1. Buat Shortcut ke Desktop

1. **Klik kanan** pada file `KenClip-Start.vbs`
2. Pilih **"Send to"** → **"Desktop (create shortcut)"**
   
   *Atau cara alternatif:*
   - Klik kanan pada file `KenClip-Start.vbs`
   - Pilih **"Create shortcut"**
   - Drag shortcut tersebut ke Desktop

### 2. Ubah Nama Shortcut (Opsional)

1. Klik kanan pada shortcut di desktop
2. Pilih **"Rename"**
3. Ubah nama menjadi **"KenClip"** atau **"🎬 KenClip"**

### 3. Tambahkan Icon KenClip

1. **Klik kanan** pada shortcut di desktop
2. Pilih **"Properties"**
3. Klik tab **"Shortcut"**
4. Klik tombol **"Change Icon..."**
5. Klik **"Browse..."**
6. Navigasi ke folder KenClip: `I:\Bun Project\KenClip\`
7. **Penting:** Ubah filter file dari "Icon files" menjadi **"All Files (*.*)"** di dropdown
8. Pilih file **"icon.png"**
9. Klik **"OK"** → **"OK"** → **"Apply"** → **"OK"**

### 4. Pengaturan Tambahan (Opsional)

Untuk pengalaman lebih baik:

1. Klik kanan shortcut → **"Properties"**
2. Di tab **"Shortcut"**:
   - **Start in:** `I:\Bun Project\KenClip`
   - **Run:** pilih **"Minimized"** (agar console tidak mengganggu)
3. Klik **"Apply"** → **"OK"**

---

## 📌 Bonus: Pin ke Taskbar

Setelah membuat shortcut:

1. **Klik kanan** shortcut KenClip di desktop
2. Pilih **"Pin to taskbar"**

Sekarang Anda bisa menjalankan KenClip langsung dari taskbar! 🎉

---

## 🛑 Menghentikan Server

Ada 3 cara menghentikan KenClip Server:

### Cara 1: Tombol Stop Server di Interface (Tercepat) ⭐
- Klik tombol **"Stop Server"** di pojok kanan atas interface KenClip
- Konfirmasi, dan server akan otomatis berhenti

### Cara 2: Gunakan Script Stop
- Double-click file **`KenClip-Stop.vbs`**

### Cara 3: Manual via Task Manager
- Tekan **Ctrl + Shift + Esc**
- Cari proses **"bun.exe"**
- Klik kanan → **"End Task"**

---

## ✅ Hasil Akhir

Setelah selesai, Anda akan memiliki:

- ✨ Icon shortcut cantik di desktop dengan logo KenClip
- 🚀 Double-click langsung menjalankan server (Silent Mode - tanpa popup)
- 🌐 Browser otomatis terbuka ke http://localhost:8888
- 🛑 Tombol Stop Server terintegrasi di interface
- 📌 (Opsional) Pinned di taskbar untuk akses cepat

---

## 🔧 Troubleshooting

### Icon tidak muncul?
- Pastikan file `icon.png` ada di folder `I:\Bun Project\KenClip\`
- Coba restart Windows Explorer (Task Manager → Windows Explorer → Restart)
- Atau gunakan file `.ico` format (konversi dari PNG jika perlu)

### Script tidak jalan?
- Pastikan Bun sudah terinstall: `bun --version`
- Pastikan path di script sesuai dengan lokasi folder KenClip Anda
- Coba klik kanan `KenClip-Start.vbs` → **"Open with"** → **"Microsoft Windows Based Script Host"**

### Browser tidak terbuka otomatis?
- Buka manual: http://localhost:8888
- Periksa apakah server sudah jalan (cek Task Manager untuk proses bun.exe)

### Port 8888 sudah digunakan?
- Edit file `src/index.ts`, ubah `const port = 8888;` ke port lain (misal 8889)
- Edit file `KenClip-Start.vbs`, ubah `http://localhost:8888` sesuai port baru

---

**Selamat menggunakan KenClip! 🎬✂️**
