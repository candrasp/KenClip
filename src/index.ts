import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { unlink, mkdir, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const app = new Hono();

// Pastikan folder clips ada
const ensureDirs = async () => {
  if (!existsSync('./clips')) await mkdir('./clips', { recursive: true });
};

ensureDirs();

const YT_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com',
  'music.youtube.com', 'youtu.be',
]);
const SAFE_FILE = /^clip-\d+\.mp4$/;
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

// Serve static files
app.use('/*', serveStatic({ root: './src/public' }));

// Helper function untuk extract video ID dari URL
function extractVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([^&?\s]+)/);
  return match ? match[1] : null;
}

// API untuk mendapatkan info video dasar secara instan via oEmbed (< 0.2 detik)
app.post('/api/video-info', async (c) => {
  try {
    const { url } = await c.req.json();

    if (!url) {
      return c.json({ error: 'URL tidak boleh kosong' }, 400);
    }

    if (!isYouTubeUrl(url)) {
      return c.json({ error: 'URL YouTube tidak valid' }, 400);
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return c.json({ error: 'URL YouTube tidak valid' }, 400);
    }

    // Ambil info video dasar via YouTube oEmbed API (super cepat)
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    let title = 'Video YouTube';
    let thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    try {
      const response = await fetch(oembedUrl);
      const data = await response.json();
      if (data.title) title = data.title;
      if (data.thumbnail_url) thumbnail = data.thumbnail_url;
    } catch {}

    // Langsung respons seketika tanpa blocking
    return c.json({
      success: true,
      title,
      videoId,
      thumbnail,
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

const port = 8888;
console.log(`🚀 KenClip Server berjalan di http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
