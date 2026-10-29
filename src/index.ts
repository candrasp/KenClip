import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { unlink, mkdir, readdir, stat, copyFile } from 'fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const app = new Hono();

// Struktur & konfigurasi lokal KenClip
interface AppSettings {
  videoSaveDir: string;
  audioSaveDir: string;
  autoOpenFolder: boolean;
  autoCleanup: boolean;
}

const CONFIG_PATH = './kenclip.config.json';
const defaultSettings: AppSettings = {
  videoSaveDir: '',
  audioSaveDir: '',
  autoOpenFolder: false,
  autoCleanup: true,
};

function getSettings(): AppSettings {
  try {
    if (existsSync(CONFIG_PATH)) {
      const data = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      return { ...defaultSettings, ...data };
    }
  } catch (e) {
    console.error('Error membaca config:', e);
  }
  return { ...defaultSettings };
}

function saveSettings(settings: AppSettings) {
  writeFileSync(CONFIG_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

// Pastikan folder clips ada
const ensureDirs = async () => {
  if (!existsSync('./clips')) await mkdir('./clips', { recursive: true });
};

ensureDirs();

const YT_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com',
  'music.youtube.com', 'youtu.be',
]);
const SAFE_FILE = /^clip-\d+(?:-[a-z0-9_]+)*\.(mp4|mp3)$/;
const VALID_QUALITIES: Record<string, number> = {
  '360': 360,
  '480': 480,
  '720': 720,
  '1080': 1080,
};
const MAX_CLIP_SECONDS = 600;
let busy = false;

// Pembersihan otomatis file klip yang lebih tua dari 1 jam (berjalan tiap 15 menit)
const cleanupOldClips = async () => {
  try {
    const settings = getSettings();
    if (!settings.autoCleanup) return;
    if (!existsSync('./clips')) return;
    const files = await readdir('./clips');
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    for (const file of files) {
      if (!SAFE_FILE.test(file)) continue;
      const filePath = join('./clips', file);
      const fileStat = await stat(filePath);
      if (now - fileStat.mtimeMs > ONE_HOUR) {
        await unlink(filePath).catch(() => {});
        console.log(`[Auto-Clean] Menghapus file klip lama: ${file}`);
      }
    }
  } catch (err) {
    console.error('Error saat cleanup klip lama:', err);
  }
};

setInterval(cleanupOldClips, 15 * 60 * 1000);
cleanupOldClips();

function isYouTubeUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  try {
    const u = new URL(raw);
    return (u.protocol === 'https:' || u.protocol === 'http:') && YT_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

// Serve static frontend files
app.use('/*', serveStatic({ root: './src/public' }));

// API untuk mendapatkan settings
app.get('/api/settings', (c) => {
  return c.json({ success: true, settings: getSettings() });
});

// API untuk menyimpan settings
app.post('/api/settings', async (c) => {
  try {
    const body = await c.req.json();
    const current = getSettings();
    const updated: AppSettings = {
      videoSaveDir: typeof body.videoSaveDir === 'string' ? body.videoSaveDir.trim() : current.videoSaveDir,
      audioSaveDir: typeof body.audioSaveDir === 'string' ? body.audioSaveDir.trim() : current.audioSaveDir,
      autoOpenFolder: typeof body.autoOpenFolder === 'boolean' ? body.autoOpenFolder : current.autoOpenFolder,
      autoCleanup: typeof body.autoCleanup === 'boolean' ? body.autoCleanup : current.autoCleanup,
    };
    saveSettings(updated);
    return c.json({ success: true, settings: updated });
  } catch (e: any) {
    return c.json({ error: 'Gagal menyimpan pengaturan: ' + e.message }, 500);
  }
});

let isFolderPickerActive = false;

// API untuk memilih folder khusus Video
app.post('/api/select-folder/video', async (c) => {
  return handleSelectFolder('Pilih Folder Simpan Video (.mp4)');
});

// API untuk memilih folder khusus Audio
app.post('/api/select-folder/audio', async (c) => {
  return handleSelectFolder('Pilih Folder Simpan Audio (.mp3)');
});

// Helper dialog File Explorer Windows yang tangguh
async function handleSelectFolder(title: string) {
  if (isFolderPickerActive) {
    return new Response(JSON.stringify({ success: false, busy: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  isFolderPickerActive = true;
  try {
    const psCommand = `
      Add-Type -AssemblyName System.Windows.Forms
      $f = New-Object System.Windows.Forms.OpenFileDialog
      $f.ValidateNames = $false
      $f.CheckFileExists = $false
      $f.CheckPathExists = $true
      $f.FileName = "PILIH_FOLDER"
      $f.Title = "${title} - Buka folder lalu klik Open"
      $f.Filter = "Folder Selection|*.*"
      if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $selected = $f.FileName
        if ([System.IO.Directory]::Exists($selected)) {
          Write-Output $selected
        } else {
          Write-Output ([System.IO.Path]::GetDirectoryName($selected))
        }
      }
    `;

    const proc = Bun.spawn(['powershell', '-NoProfile', '-Command', psCommand], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    const selectedPath = out.trim();

    if (code === 0 && selectedPath) {
      return new Response(JSON.stringify({ success: true, path: selectedPath }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ success: false, cancelled: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Gagal membuka pemilih folder: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  } finally {
    isFolderPickerActive = false;
  }
}

// API untuk membuka folder di Windows Explorer
app.post('/api/open-folder', async (c) => {
  try {
    const { path: targetDir } = await c.req.json();
    const folderToOpen = targetDir && existsSync(targetDir) ? resolve(targetDir) : resolve('./clips');
    Bun.spawn(['explorer.exe', folderToOpen]);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: 'Gagal membuka folder: ' + err.message }, 500);
  }
});

// API untuk simpan/salin file ke folder tujuan yang diatur
app.post('/api/save-to-custom-dir', async (c) => {
  try {
    const { filename, type } = await c.req.json();
    if (!filename || !SAFE_FILE.test(filename)) {
      return c.json({ error: 'Nama file tidak valid' }, 400);
    }

    const sourcePath = join('./clips', filename);
    if (!existsSync(sourcePath)) {
      return c.json({ error: 'File sumber tidak ditemukan' }, 404);
    }

    const settings = getSettings();
    const customDir = type === 'audio' ? settings.audioSaveDir : settings.videoSaveDir;

    // Jika user belum menyetel folder khusus, beri tahu frontend agar menggunakan browser download
    if (!customDir || !existsSync(customDir)) {
      return c.json({ success: true, savedPath: '', openedFolder: false });
    }

    const targetDir = customDir;
    const destPath = join(targetDir, filename);
    if (resolve(sourcePath) !== resolve(destPath)) {
      await copyFile(sourcePath, destPath);
    }

    if (settings.autoOpenFolder) {
      Bun.spawn(['explorer.exe', targetDir]);
    }

    return c.json({ success: true, savedPath: destPath, openedFolder: settings.autoOpenFolder });
  } catch (err: any) {
    return c.json({ error: 'Gagal menyimpan file ke direktori tujuan: ' + err.message }, 500);
  }
});

// API untuk mengambil info video dari oEmbed YouTube
app.post('/api/video-info', async (c) => {
  try {
    const { url } = await c.req.json();

    if (!isYouTubeUrl(url)) {
      return c.json({ error: 'URL YouTube tidak valid' }, 400);
    }

    const videoIdMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([^&?\s]+)/);
    const videoId = videoIdMatch ? videoIdMatch[1] : '';

    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl);

    if (!res.ok) {
      return c.json({ error: 'Video tidak ditemukan atau bersifat privat' }, 404);
    }

    const oembedData: any = await res.json();

    return c.json({
      success: true,
      title: oembedData.title || 'Video YouTube',
      videoId,
      duration: 0
    });

  } catch (error: any) {
    console.error('Error mendapatkan info video:', error);
    return c.json({ error: 'Gagal mendapatkan informasi video: ' + error.message }, 500);
  }
});

// API terpisah untuk cek resolusi maksimal di background (non-blocking)
app.post('/api/video-quality', async (c) => {
  try {
    const { url } = await c.req.json();
    if (!isYouTubeUrl(url)) return c.json({ maxResolution: 720 });

    let maxResolution = 720;
    const proc = Bun.spawn([
      'yt-dlp',
      '--no-playlist',
      '--dump-single-json',
      '--simulate',
      '--', url,
    ], { stdout: 'pipe', stderr: 'ignore' });

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    if (stdout) {
      const json = JSON.parse(stdout);
      const formats = json.formats || [];
      let highestH = 0;
      for (const f of formats) {
        if (f.height && typeof f.height === 'number') {
          if (f.height > highestH) highestH = f.height;
        }
      }
      if (highestH > 0) maxResolution = highestH;
    }

    return c.json({ success: true, maxResolution });
  } catch (err) {
    return c.json({ success: false, maxResolution: 720 });
  }
});

// API untuk memproses klip video secara langsung & cepat via yt-dlp --download-sections
app.post('/api/clip', async (c) => {
  const { url, startTime, endTime, quality } = await c.req.json();

  if (!isYouTubeUrl(url)) return c.json({ error: 'URL YouTube tidak valid' }, 400);

  const timeRegex = /^\d{2}:\d{2}$/;
  if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
    return c.json({ error: 'Format waktu harus MM:SS' }, 400);
  }

  const toSec = (t: string) => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
  const startSeconds = toSec(startTime);
  const endSeconds = toSec(endTime);
  const duration = endSeconds - startSeconds;

  if (duration <= 0) return c.json({ error: 'Waktu selesai harus lebih besar dari waktu mulai' }, 400);
  if (duration > MAX_CLIP_SECONDS) return c.json({ error: `Durasi klip maksimal ${MAX_CLIP_SECONDS} detik` }, 400);
  if (busy) return c.json({ error: 'Sedang memproses klip lain, mohon tunggu antrean' }, 429);

  // Tentukan batas resolusi sesuai pilihan pengguna (default 720 jika tidak valid)
  const targetHeight = VALID_QUALITIES[String(quality)] || 720;

  busy = true;
  const filename = `clip-${Date.now()}.mp4`;
  const clipPath = join('./clips', filename);

  try {
    console.log(`[Clip Start] Memotong bagian ${startTime} - ${endTime} (${duration}s) [Kualitas: ${targetHeight}p]`);

    const proc = Bun.spawn([
      'yt-dlp',
      '--no-playlist',
      '-f', `bv*[height<=${targetHeight}][ext=mp4]+ba[ext=m4a]/b[height<=${targetHeight}][ext=mp4]/b`,
      '--download-sections', `*${startSeconds}-${endSeconds}`,
      '--force-keyframes-at-cuts',
      '--merge-output-format', 'mp4',
      '-o', clipPath,
      '--', url,
    ], { stdout: 'ignore', stderr: 'pipe' });

    const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    if (code !== 0) {
      console.error('yt-dlp error:', err);
      return c.json({ error: 'Gagal memotong video: ' + err.slice(-300) }, 500);
    }

    console.log(`[Clip Success] Klip berhasil dibuat: ${filename}`);
    return c.json({ success: true, filename, duration });
  } catch (error: any) {
    if (String(error.message).includes('ENOENT')) {
      return c.json({ error: 'yt-dlp atau FFmpeg tidak ditemukan di PATH' }, 500);
    }
    return c.json({ error: 'Gagal memproses klip: ' + error.message }, 500);
  } finally {
    busy = false;
  }
});

// API untuk konversi aspek rasio video lokal yang sudah ada
app.post('/api/convert-aspect', async (c) => {
  try {
    const { filename, mode } = await c.req.json();
    if (!filename || !SAFE_FILE.test(filename) || !filename.endsWith('.mp4')) {
      return c.json({ error: 'Nama file video tidak valid' }, 400);
    }

    const inputPath = join('./clips', filename);
    if (!existsSync(inputPath)) {
      return c.json({ error: 'File video asli tidak ditemukan' }, 404);
    }

    if (busy) return c.json({ error: 'Sedang memproses tugas lain, mohon tunggu antrean' }, 429);

    let vfFilter = '';
    let suffix = 'custom';

    if (mode === '9:16-crop') {
      vfFilter = 'crop=ih*(9/16):ih';
      suffix = '9x16_crop';
    } else if (mode === '9:16-blur') {
      vfFilter = 'split[original][blur];[blur]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,boxblur=luma_radius=min(h\\,w)/20:luma_power=1:chroma_radius=min(h\\,w)/20:chroma_power=1[bg];[original]scale=720:1280:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2';
      suffix = '9x16_blur';
    } else if (mode === '1:1') {
      vfFilter = 'crop=ih:ih';
      suffix = '1x1';
    } else {
      return c.json({ error: 'Mode aspek rasio tidak valid' }, 400);
    }

    const baseName = filename.replace(/\.mp4$/, '');
    const outFilename = `${baseName}-${suffix}.mp4`;
    const outputPath = join('./clips', outFilename);

    busy = true;
    console.log(`[FFmpeg Crop] Memproses rasio ${mode} untuk ${filename} -> ${outFilename}`);

    const proc = Bun.spawn([
      'ffmpeg',
      '-y',
      '-i', inputPath,
      '-vf', vfFilter,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-c:a', 'copy',
      outputPath,
    ], { stdout: 'ignore', stderr: 'pipe' });

    const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    if (code !== 0) {
      console.error('FFmpeg crop error:', err);
      return c.json({ error: 'Gagal mengonversi video: ' + err.slice(-300) }, 500);
    }

    return c.json({ success: true, filename: outFilename });
  } catch (error: any) {
    return c.json({ error: 'Gagal memproses video: ' + error.message }, 500);
  } finally {
    busy = false;
  }
});

// API untuk ekstraksi audio saja (MP3) on-demand
app.post('/api/extract-audio', async (c) => {
  try {
    const { filename } = await c.req.json();
    if (!filename || !SAFE_FILE.test(filename) || !filename.endsWith('.mp4')) {
      return c.json({ error: 'Nama file video tidak valid' }, 400);
    }

    const inputPath = join('./clips', filename);
    if (!existsSync(inputPath)) {
      return c.json({ error: 'File video tidak ditemukan' }, 404);
    }

    if (busy) return c.json({ error: 'Sedang memproses tugas lain, mohon tunggu antrean' }, 429);

    const baseName = filename.replace(/\.mp4$/, '');
    const outFilename = `${baseName}.mp3`;
    const outputPath = join('./clips', outFilename);

    busy = true;
    console.log(`[FFmpeg Audio] Mengekstrak audio MP3 dari ${filename}`);

    const proc = Bun.spawn([
      'ffmpeg',
      '-y',
      '-i', inputPath,
      '-vn',
      '-acodec', 'libmp3lame',
      '-q:a', '2',
      outputPath,
    ], { stdout: 'ignore', stderr: 'pipe' });

    const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    if (code !== 0) {
      console.error('FFmpeg audio error:', err);
      return c.json({ error: 'Gagal mengekstrak audio: ' + err.slice(-300) }, 500);
    }

    return c.json({ success: true, audioFilename: outFilename });
  } catch (error: any) {
    return c.json({ error: 'Gagal mengekstrak audio: ' + error.message }, 500);
  } finally {
    busy = false;
  }
});

// API untuk membuang audio dari video (Mute Video) secara instan tanpa re-encode
app.post('/api/mute-video', async (c) => {
  try {
    const { filename } = await c.req.json();
    if (!filename || !SAFE_FILE.test(filename) || !filename.endsWith('.mp4')) {
      return c.json({ error: 'Nama file video tidak valid' }, 400);
    }

    const inputPath = join('./clips', filename);
    if (!existsSync(inputPath)) {
      return c.json({ error: 'File video tidak ditemukan' }, 404);
    }

    if (busy) return c.json({ error: 'Sedang memproses tugas lain, mohon tunggu antrean' }, 429);

    const baseName = filename.replace(/\.mp4$/, '');
    const outFilename = `${baseName}-muted.mp4`;
    const outputPath = join('./clips', outFilename);

    busy = true;
    console.log(`[FFmpeg Mute] Menghapus audio dari ${filename} -> ${outFilename}`);

    // -c:v copy -an (copy stream video murni, buang audio - instan < 1 detik)
    const proc = Bun.spawn([
      'ffmpeg',
      '-y',
      '-i', inputPath,
      '-c:v', 'copy',
      '-an',
      outputPath,
    ], { stdout: 'ignore', stderr: 'pipe' });

    const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    if (code !== 0) {
      console.error('FFmpeg mute error:', err);
      return c.json({ error: 'Gagal memproses video bisu: ' + err.slice(-300) }, 500);
    }

    return c.json({ success: true, filename: outFilename });
  } catch (error: any) {
    return c.json({ error: 'Gagal memproses video: ' + error.message }, 500);
  } finally {
    busy = false;
  }
});

// API untuk download / streaming file dengan dukungan HTTP Range (seekable di browser)
app.get('/api/download/:filename', async (c) => {
  try {
    const filename = c.req.param('filename');
    if (!SAFE_FILE.test(filename)) return c.json({ error: 'Nama file tidak valid' }, 400);

    const filePath = join('./clips', filename);

    if (!existsSync(filePath)) {
      return c.json({ error: 'File tidak ditemukan' }, 404);
    }

    const file = Bun.file(filePath);
    return new Response(file);

  } catch (error: any) {
    console.error('Error mengunduh file:', error);
    return c.json({ error: 'Gagal mengunduh file: ' + error.message }, 500);
  }
});

// API untuk menghapus file klip
app.delete('/api/clip/:filename', async (c) => {
  try {
    const filename = c.req.param('filename');
    if (!SAFE_FILE.test(filename)) return c.json({ error: 'Nama file tidak valid' }, 400);

    const filePath = join('./clips', filename);

    if (existsSync(filePath)) {
      await unlink(filePath);
      return c.json({ success: true, message: 'File berhasil dihapus' });
    }

    return c.json({ error: 'File tidak ditemukan' }, 404);

  } catch (error: any) {
    console.error('Error menghapus file:', error);
    return c.json({ error: 'Gagal menghapus file: ' + error.message }, 500);
  }
});

// API untuk stop server
app.post('/api/shutdown', async (c) => {
  console.log('🛑 Server shutdown requested...');

  // Send response first, then shutdown
  setTimeout(() => {
    console.log('👋 Goodbye!');
    process.exit(0);
  }, 500);

  return c.json({ success: true, message: 'Server shutting down...' });
});

const port = 57777;
console.log(`🚀 KenClip Server berjalan di http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
