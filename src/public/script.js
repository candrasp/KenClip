let currentMaxResolution = 720;

// Konfigurasi dropdown opsi kualitas berdasarkan resolusi maksimal video
function updateQualityOptions(maxRes) {
    const select = document.getElementById('clip-quality');
    if (!select) return;

    select.innerHTML = '';
    const availableQualities = [];

    if (maxRes >= 1080) availableQualities.push(1080);
    if (maxRes >= 720) availableQualities.push(720);
    if (maxRes >= 480) availableQualities.push(480);
    if (maxRes >= 360) availableQualities.push(360);

    // Jika resolusi maksimal video di bawah 360p (misal 240p atau 144p)
    if (availableQualities.length === 0) {
        select.style.display = 'none';
        return;
    }

    select.style.display = 'inline-block';

    availableQualities.forEach((q, idx) => {
        const opt = document.createElement('option');
        opt.value = q.toString();
        opt.textContent = `${q}p`;
        // Default pilih 720p jika ada, atau kualitas tertinggi yang tersedia
        if (q === 720 || (idx === 0 && !availableQualities.includes(720))) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });
}

// Global Toast Notification Helper
function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-text">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-hiding');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 250);
    }, duration);
}

// Global Confirmation Modal Helper
function showConfirmModal(title, message, confirmText = 'Hapus', isDanger = true) {
    return new Promise((resolve) => {
        const modalBackdrop = document.getElementById('modal-container');
        const modalTitle = document.getElementById('modal-title');
        const modalMessage = document.getElementById('modal-message');
        const modalConfirmBtn = document.getElementById('modal-confirm-btn');
        const modalCancelBtn = document.getElementById('modal-cancel-btn');

        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modalConfirmBtn.textContent = confirmText;

        modalBackdrop.style.display = 'flex';

        const cleanup = () => {
            modalBackdrop.style.display = 'none';
            modalConfirmBtn.onclick = null;
            modalCancelBtn.onclick = null;
        };

        modalConfirmBtn.onclick = () => {
            cleanup();
            resolve(true);
        };

        modalCancelBtn.onclick = () => {
            cleanup();
            resolve(false);
        };
    });
}

// Global variables
let player;
let videoDuration = 0;
let videoId = '';
let isDragging = false;
let currentMarker = null;
let playbackInterval = null; // Untuk monitoring playback
let lastSeekTime = 0; // Untuk throttling auto-seek
let wasPlayingBeforeDrag = false; // Track player state sebelum drag

// Timeline viewport state (untuk zoom Ctrl+Scroll)
let viewStart = 0; // detik awal viewport yang terlihat
let viewEnd = 0;   // detik akhir viewport yang terlihat

// Show/hide clear button
const urlInput = document.getElementById('youtube-url');
const clearBtn = document.getElementById('clear-url-btn');

urlInput.addEventListener('input', () => {
    clearBtn.style.display = urlInput.value ? 'flex' : 'none';
});

clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    clearBtn.style.display = 'none';
    urlInput.focus();
});

// Reset all display and UI state
function resetAllState() {
    // Stop and clear playback monitoring
    if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
    }

    videoDuration = 0;

    // Reset timeline viewport
    viewStart = 0;
    viewEnd = 0;
    updateZoomIndicator();

    // Reset controls
    const clipBtn = document.getElementById('clip-btn');
    const playBtn = document.getElementById('play-selection-btn');
    const clipQuality = document.getElementById('clip-quality');
    if (clipBtn) {
        clipBtn.disabled = true;
        clipBtn.title = 'Putar bagian terpilih terlebih dahulu sebelum memotong';
    }
    if (playBtn) {
        playBtn.disabled = true;
    }
    if (clipQuality) {
        clipQuality.disabled = true;
    }

    // Reset inputs & duration display
    const startTimeInput = document.getElementById('start-time');
    const endTimeInput = document.getElementById('end-time');
    const clipDuration = document.getElementById('clip-duration');
    if (startTimeInput) startTimeInput.value = '';
    if (endTimeInput) endTimeInput.value = '';
    if (clipDuration) clipDuration.textContent = '00:00';

    // Reset timeline markers & visual range
    const startMarker = document.getElementById('start-marker');
    const endMarker = document.getElementById('end-marker');
    const selectedRange = document.getElementById('selected-range');
    if (startMarker) {
        startMarker.style.left = '10%';
        const mTime = startMarker.querySelector('.marker-time');
        if (mTime) mTime.textContent = '00:00';
    }
    if (endMarker) {
        endMarker.style.left = '90%';
        const mTime = endMarker.querySelector('.marker-time');
        if (mTime) mTime.textContent = '00:00';
    }
    if (selectedRange) {
        selectedRange.style.left = '10%';
        selectedRange.style.width = '80%';
    }

    // Reset timeline labels
    for (let i = 1; i < 8; i++) {
        const label = document.getElementById(`timeline-label-${i}`);
        if (label) label.textContent = '00:00';
    }
    const timelineDuration = document.getElementById('timeline-duration');
    if (timelineDuration) timelineDuration.textContent = '00:00';

    // Reset sidebar output states
    const emptyState = document.getElementById('empty-state');
    const loadingSection = document.getElementById('loading-section');
    const resultSection = document.getElementById('result-section');
    if (emptyState) emptyState.style.display = 'flex';
    if (loadingSection) loadingSection.style.display = 'none';
    if (resultSection) resultSection.style.display = 'none';

    // Pause result video if playing
    const resultVideo = document.getElementById('result-video');
    if (resultVideo) {
        resultVideo.pause();
        resultVideo.src = '';
    }
}

// Konversi detik ke format MM:SS
function secondsToMMSS(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Konversi MM:SS ke detik
function mmssToSeconds(mmss) {
    const [mins, secs] = mmss.split(':').map(Number);
    return mins * 60 + secs;
}

// Validasi format waktu MM:SS
function isValidTimeFormat(time) {
    const regex = /^\d{2}:\d{2}$/;
    return regex.test(time);
}

// Initialize YouTube Player API
function onYouTubeIframeAPIReady() {
    console.log('YouTube IFrame API ready');
}

// Load video
document.getElementById('load-video-btn').addEventListener('click', async () => {
    const url = document.getElementById('youtube-url').value.trim();

    if (!url) {
        showToast('Masukkan URL YouTube terlebih dahulu', 'warning');
        return;
    }

    // Extract video ID - support watch, shorts, dan youtu.be
    const videoIdMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([^&?\s]+)/);
    if (!videoIdMatch) {
        showToast('URL YouTube tidak valid. Mohon periksa kembali link Anda', 'error');
        return;
    }

    videoId = videoIdMatch[1];

    // Reset seluruh state dan timeline sebelum memuat video baru
    resetAllState();

    try {
        // Get video info
        const response = await fetch('/api/video-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Gagal memuat video');
        }

        videoDuration = data.duration;
        currentMaxResolution = 720; // Default awal sementara di-load

        // Tampilkan opsi standar sementara
        updateQualityOptions(720);

        // Show video info
        document.getElementById('video-info').style.display = 'flex';
        document.getElementById('video-title').textContent = data.title || 'Video YouTube';
        document.getElementById('video-id-display').textContent = `ID video: ${data.videoId}`;
        document.getElementById('video-meta').textContent = 'Memuat informasi durasi...';

        // Lakukan pengecekan resolusi maksimal di background tanpa menghambat pemuatan video
        fetch('/api/video-quality', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        })
        .then(res => res.json())
        .then(qData => {
            if (qData && qData.maxResolution) {
                currentMaxResolution = qData.maxResolution;

                // Update teks info kualitas video
                const metaEl = document.getElementById('video-meta');
                if (metaEl && videoDuration > 0) {
                    metaEl.textContent = `Durasi ${secondsToMMSS(videoDuration)} · kualitas terbaik tersedia ${currentMaxResolution}p`;
                }

                // Cek kualitas rendah (<= 240p)
                if (currentMaxResolution <= 240) {
                    showToast(`Kualitas video terlalu buruk (hanya ${currentMaxResolution}p) dan tidak didukung`, 'error', 5000);
                    const clipBtn = document.getElementById('clip-btn');
                    if (clipBtn) {
                        clipBtn.disabled = true;
                        clipBtn.title = `Video hanya ${currentMaxResolution}p (tidak didukung)`;
                    }
                }

                // Update dropdown kualitas secara mulus
                updateQualityOptions(currentMaxResolution);
            }
        })
        .catch(err => console.warn('Background quality check warning:', err));

        // Initialize YouTube Player
        if (player && typeof player.loadVideoById === 'function') {
            player.loadVideoById(videoId);
        } else {
            player = new YT.Player('youtube-player', {
                videoId: videoId,
                playerVars: {
                    controls: 1,
                    modestbranding: 1,
                    rel: 0,
                    fs: 0,              // Sembunyikan tombol fullscreen YouTube
                    iv_load_policy: 3,  // Nonaktifkan anotasi / kartu popup rekomendasi
                    enablejsapi: 1,
                    origin: window.location.origin
                },
                events: {
                    onReady: onPlayerReady,
                    onStateChange: onPlayerStateChange
                }
            });
        }

        // Show player, hide placeholder
        document.getElementById('youtube-player').style.display = 'block';
        document.getElementById('video-placeholder').style.display = 'none';

        // Note: Timeline dan controls akan diaktifkan setelah onPlayerReady dipanggil

    } catch (error) {
        console.error('Error:', error);
        showToast('Gagal memuat video: ' + error.message, 'error');
    }
});

function onPlayerReady(event) {
    console.log('Player ready');
    syncDurationAndTimeline();
}

function onPlayerStateChange(event) {
    // Saat video berganti dan mulai di-buffering atau diputar, update durasi video barunya
    if (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.BUFFERING) {
        syncDurationAndTimeline();
    }
}

function syncDurationAndTimeline() {
    if (!player || typeof player.getDuration !== 'function') return;

    const newDuration = player.getDuration();
    if (!newDuration || newDuration <= 0) return;

    // Bulatkan durasi ke integer/detik untuk menghindari floating point jitter (misal 2051 vs 2050.581)
    const normalizedNew = Math.round(newDuration);
    const normalizedOld = Math.round(videoDuration);

    // Jika durasi berbeda dari video sebelumnya atau baru pertama kali
    if (normalizedNew !== normalizedOld || videoDuration === 0) {
        videoDuration = newDuration;
        console.log('Synchronized new video duration:', videoDuration);

        // Reset viewport ke full duration saat video baru di-load
        viewStart = 0;
        viewEnd = videoDuration;

        // Update timeline labels
        updateTimelineLabels();
        const timelineDuration = document.getElementById('timeline-duration');
        if (timelineDuration) timelineDuration.textContent = secondsToMMSS(videoDuration);

        // Update video meta with real duration
        const durationText = secondsToMMSS(videoDuration);
        document.getElementById('video-meta').textContent = `Durasi ${durationText} · kualitas terbaik tersedia ${currentMaxResolution}p`;

        // Initialize markers sesuai durasi video baru ini
        initializeMarkers();

        // Aktifkan tombol putar terpilih (tombol potong klip tetap menunggu tombol putar diklik)
        document.getElementById('play-selection-btn').disabled = false;
        const clipBtn = document.getElementById('clip-btn');

        if (currentMaxResolution <= 240) {
            clipBtn.disabled = true;
            clipBtn.title = `Video hanya ${currentMaxResolution}p (tidak didukung)`;
        } else {
            clipBtn.disabled = true;
            clipBtn.title = 'Putar bagian terpilih terlebih dahulu sebelum memotong';
        }
    }
}

// Update timeline labels dynamically based on duration
function updateTimelineLabels() {
    if (videoDuration === 0) return;

    const segments = 8;
    const vStart = viewStart || 0;
    const vEnd = viewEnd || videoDuration;
    const viewDuration = vEnd - vStart;

    for (let i = 1; i < segments; i++) {
        const time = vStart + (viewDuration / segments) * i;
        const label = document.getElementById(`timeline-label-${i}`);
        if (label) {
            label.textContent = secondsToMMSS(time);
        }
    }

    const labelStart = document.querySelector('.timeline-labels span:first-child');
    if (labelStart) labelStart.textContent = secondsToMMSS(vStart);
    const labelEnd = document.getElementById('timeline-duration');
    if (labelEnd) labelEnd.textContent = secondsToMMSS(vEnd);
}

// Initialize markers
function initializeMarkers() {
    if (videoDuration === 0) {
        console.warn('Video duration is 0, cannot initialize markers');
        return;
    }

    // Reset viewport ke full duration setiap video baru
    viewStart = 0;
    viewEnd = videoDuration;

    const startMarker = document.getElementById('start-marker');
    const endMarker = document.getElementById('end-marker');

    // Set initial positions (10% dan 90% dari viewport)
    startMarker.style.left = '10%';
    endMarker.style.left = '90%';

    // Update times berdasarkan viewport
    updateMarkerTime('start', videoDuration * 0.1);
    updateMarkerTime('end', videoDuration * 0.9);

    updateSelectedRange();
    updateClipDuration();

    console.log('Markers initialized with duration:', videoDuration);
}

// Update marker time display
function updateMarkerTime(marker, seconds) {
    const timeStr = secondsToMMSS(seconds);
    const markerId = marker === 'start' ? 'start-marker' : 'end-marker';
    const inputId = marker === 'start' ? 'start-time' : 'end-time';

    document.querySelector(`#${markerId} .marker-time`).textContent = timeStr;
    document.getElementById(inputId).value = timeStr;
}

// Konversi detik ke posisi persen dalam viewport
function secondsToViewPct(seconds) {
    const vStart = viewStart || 0;
    const vEnd = viewEnd || videoDuration;
    return ((seconds - vStart) / (vEnd - vStart)) * 100;
}

// Konversi posisi persen dalam viewport ke detik
function viewPctToSeconds(pct) {
    const vStart = viewStart || 0;
    const vEnd = viewEnd || videoDuration;
    return vStart + (pct / 100) * (vEnd - vStart);
}

// Reposisi ulang marker di timeline setelah zoom/pan agar tetap di posisi waktu yang benar
function repositionMarkersAfterZoom() {
    const startTime = document.getElementById('start-time').value;
    const endTime = document.getElementById('end-time').value;

    if (isValidTimeFormat(startTime)) {
        const sec = mmssToSeconds(startTime);
        const pct = secondsToViewPct(sec);
        document.getElementById('start-marker').style.left = Math.max(0, Math.min(100, pct)) + '%';
    }
    if (isValidTimeFormat(endTime)) {
        const sec = mmssToSeconds(endTime);
        const pct = secondsToViewPct(sec);
        document.getElementById('end-marker').style.left = Math.max(0, Math.min(100, pct)) + '%';
    }
    updateSelectedRange();
}

// Update selected range visual
function updateSelectedRange() {
    const startMarker = document.getElementById('start-marker');
    const endMarker = document.getElementById('end-marker');
    const selectedRange = document.getElementById('selected-range');

    const startPos = parseFloat(startMarker.style.left) || 0;
    const endPos = parseFloat(endMarker.style.left) || 0;

    selectedRange.style.left = startPos + '%';
    selectedRange.style.width = (endPos - startPos) + '%';

    // Hindari tabrakan horizontal badge waktu bawah jika jarak marker sangat dekat (< 6%)
    const endBadge = endMarker.querySelector('.marker-time');
    if (endBadge) {
        if (Math.abs(endPos - startPos) < 6) {
            endBadge.style.top = '72px'; // Turunkan sedikit jika terlalu rapat
        } else {
            endBadge.style.top = '48px';
        }
    }
}

// Update clip duration
function updateClipDuration() {
    const startTime = document.getElementById('start-time').value;
    const endTime = document.getElementById('end-time').value;

    if (isValidTimeFormat(startTime) && isValidTimeFormat(endTime)) {
        const duration = mmssToSeconds(endTime) - mmssToSeconds(startTime);
        document.getElementById('clip-duration').textContent = secondsToMMSS(Math.max(0, duration));
    }
}

// Marker dragging
function setupMarkerDragging() {
    const timeline = document.getElementById('timeline');
    const startMarker = document.getElementById('start-marker');
    const endMarker = document.getElementById('end-marker');

    function onMouseDown(e, marker) {
        if (videoDuration === 0) {
            console.warn('Cannot drag marker: video duration is 0');
            return;
        }

        // Simpan state player sebelum drag
        if (player && player.getPlayerState) {
            wasPlayingBeforeDrag = (player.getPlayerState() === 1); // 1 = playing
            if (wasPlayingBeforeDrag) {
                player.pauseVideo(); // Pause saat drag untuk smooth experience
            }
        }

        isDragging = true;
        currentMarker = marker;
        e.preventDefault();
    }

    startMarker.addEventListener('mousedown', (e) => onMouseDown(e, 'start'));
    endMarker.addEventListener('mousedown', (e) => onMouseDown(e, 'end'));

    document.addEventListener('mousemove', (e) => {
        if (!isDragging || videoDuration === 0) return;

        const timelineRect = timeline.getBoundingClientRect();
        let x = e.clientX - timelineRect.left;
        x = Math.max(0, Math.min(x, timelineRect.width));

        const percentage = (x / timelineRect.width) * 100;
        // Konversi posisi pixel ke detik via viewport
        const seconds = viewPctToSeconds(percentage);
        const clampedSeconds = Math.max(viewStart, Math.min(viewEnd, seconds));

        const startMarker = document.getElementById('start-marker');
        const endMarker = document.getElementById('end-marker');
        const startSeconds = viewPctToSeconds(parseFloat(startMarker.style.left));
        const endSeconds = viewPctToSeconds(parseFloat(endMarker.style.left));

        // Batasi jarak minimum 1 detik (nyata, bukan persen)
        if (currentMarker === 'start' && clampedSeconds <= endSeconds - 1) {
            startMarker.style.left = percentage + '%';
            updateMarkerTime('start', clampedSeconds);
            autoSeekToMarker(clampedSeconds);
        } else if (currentMarker === 'end' && clampedSeconds >= startSeconds + 1) {
            endMarker.style.left = percentage + '%';
            updateMarkerTime('end', clampedSeconds);
            autoSeekToMarker(clampedSeconds);
        }

        updateSelectedRange();
        updateClipDuration();
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            // Resume playback jika sebelumnya playing
            if (wasPlayingBeforeDrag && player) {
                player.playVideo();
            }
        }

        isDragging = false;
        currentMarker = null;
        wasPlayingBeforeDrag = false;
    });
}

setupMarkerDragging();

// Cegah zoom browser jika kursor berada di luar area timeline
window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        const isOverTimeline = e.target.closest('#timeline');
        if (!isOverTimeline) {
            e.preventDefault();
        }
    }
}, { passive: false });

// Cegah pintasan tombol zoom global browser (Ctrl +, Ctrl -, Ctrl 0)
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && (e.key === '=' || e.key === '-' || e.key === '0' || e.key === '+')) {
        e.preventDefault();
    }
});

// Zoom Timeline via Ctrl+Scroll — terpusat pada posisi kursor di timeline
document.getElementById('timeline').addEventListener('wheel', (e) => {
    if (!e.ctrlKey || videoDuration === 0) return;
    e.preventDefault();

    const timeline = document.getElementById('timeline');
    const timelineRect = timeline.getBoundingClientRect();

    // Hitung posisi kursor dalam detik sebagai titik pusat zoom
    const cursorX = e.clientX - timelineRect.left;
    const cursorPct = Math.max(0, Math.min(1, cursorX / timelineRect.width));
    const vStart = viewStart || 0;
    const vEnd = viewEnd || videoDuration;
    const viewDuration = vEnd - vStart;
    const cursorSeconds = vStart + cursorPct * viewDuration;

    // Faktor zoom: batasi jendela viewport minimal 30 detik (agar tidak over-zoom sampai ratusan kali)
    const MIN_VIEWPORT_SECONDS = Math.min(videoDuration, 30);
    const zoomFactor = e.deltaY < 0 ? 0.75 : 1.35;
    const newViewDuration = Math.min(videoDuration, Math.max(MIN_VIEWPORT_SECONDS, viewDuration * zoomFactor));

    // Pertahankan posisi kursor sebagai titik anchor
    let newStart = cursorSeconds - cursorPct * newViewDuration;
    let newEnd = newStart + newViewDuration;

    // Klem ke batas durasi total
    if (newStart < 0) { newEnd = Math.min(videoDuration, newEnd - newStart); newStart = 0; }
    if (newEnd > videoDuration) { newStart = Math.max(0, newStart - (newEnd - videoDuration)); newEnd = videoDuration; }

    viewStart = newStart;
    viewEnd = newEnd;

    updateTimelineLabels();
    repositionMarkersAfterZoom();
    updateZoomIndicator();
}, { passive: false });

// Helper untuk memperbarui badge persentase zoom & tombol reset
function updateZoomIndicator() {
    const badgeGroup = document.getElementById('zoom-badge-group');
    const badgeLevel = document.getElementById('zoom-level-badge');
    if (!badgeGroup || !badgeLevel || videoDuration === 0) return;

    const vStart = viewStart || 0;
    const vEnd = viewEnd || videoDuration;
    const currentViewDur = vEnd - vStart;
    const zoomMultiplier = videoDuration / currentViewDur;

    if (zoomMultiplier > 1.05) {
        badgeGroup.style.display = 'flex';
        badgeLevel.textContent = `${zoomMultiplier.toFixed(1)}x`;
    } else {
        badgeGroup.style.display = 'none';
    }
}

// Reset Zoom ke tampilan penuh
function resetTimelineZoom() {
    if (videoDuration === 0) return;
    viewStart = 0;
    viewEnd = videoDuration;
    updateTimelineLabels();
    repositionMarkersAfterZoom();
    updateZoomIndicator();
}

// Event: Klik tombol Reset Zoom
const resetZoomBtn = document.getElementById('reset-zoom-btn');
if (resetZoomBtn) {
    resetZoomBtn.addEventListener('click', resetTimelineZoom);
}

// Event: Double-click pada track timeline untuk reset zoom instan
document.getElementById('timeline').addEventListener('dblclick', (e) => {
    // Jangan picu jika double-click mengenai penanda marker
    if (e.target.closest('.marker')) return;
    resetTimelineZoom();
    showToast('Zoom timeline dikembalikan ke tampilan penuh', 'info', 2000);
});

// Throttled auto-seek function
function autoSeekToMarker(seconds) {
    if (!player) return;

    const now = Date.now();
    const throttleDelay = 250; // 250ms throttle

    // Hanya seek jika sudah lewat throttle delay
    if (now - lastSeekTime >= throttleDelay) {
        player.seekTo(seconds, true);
        lastSeekTime = now;
        console.log('Auto-seek to:', seconds.toFixed(2));
    }
}

// Tombol Cepat: Set Mulai & Set Selesai dari posisi pemutaran video saat ini
document.getElementById('set-start-btn').addEventListener('click', () => {
    if (!player || typeof player.getCurrentTime !== 'function' || videoDuration === 0) return;

    const currentSec = Math.floor(player.getCurrentTime());
    const endVal = document.getElementById('end-time').value;
    const endSec = isValidTimeFormat(endVal) ? mmssToSeconds(endVal) : videoDuration;

    if (currentSec >= endSec) {
        showToast('Waktu mulai tidak boleh melebihi atau sama dengan waktu selesai', 'warning');
        return;
    }

    const percentage = (currentSec / videoDuration) * 100;
    document.getElementById('start-marker').style.left = percentage + '%';
    updateMarkerTime('start', currentSec);
    updateSelectedRange();
    updateClipDuration();
    showToast(`Waktu mulai di-set ke ${secondsToMMSS(currentSec)}`, 'info');
});

document.getElementById('set-end-btn').addEventListener('click', () => {
    if (!player || typeof player.getCurrentTime !== 'function' || videoDuration === 0) return;

    const currentSec = Math.ceil(player.getCurrentTime());
    const startVal = document.getElementById('start-time').value;
    const startSec = isValidTimeFormat(startVal) ? mmssToSeconds(startVal) : 0;

    if (currentSec <= startSec) {
        showToast('Waktu selesai harus lebih besar dari waktu mulai', 'warning');
        return;
    }

    const percentage = (currentSec / videoDuration) * 100;
    document.getElementById('end-marker').style.left = percentage + '%';
    updateMarkerTime('end', currentSec);
    updateSelectedRange();
    updateClipDuration();
    showToast(`Waktu selesai di-set ke ${secondsToMMSS(currentSec)}`, 'info');
});

// Manual time input
document.getElementById('start-time').addEventListener('input', (e) => {
    const value = e.target.value;
    if (isValidTimeFormat(value) && videoDuration > 0) {
        const seconds = mmssToSeconds(value);
        if (seconds <= videoDuration) {
            const percentage = (seconds / videoDuration) * 100;
            document.getElementById('start-marker').style.left = percentage + '%';
            document.querySelector('#start-marker .marker-time').textContent = value;
            updateSelectedRange();
            updateClipDuration();
        }
    }
});

document.getElementById('end-time').addEventListener('input', (e) => {
    const value = e.target.value;
    if (isValidTimeFormat(value) && videoDuration > 0) {
        const seconds = mmssToSeconds(value);
        if (seconds <= videoDuration) {
            const percentage = (seconds / videoDuration) * 100;
            document.getElementById('end-marker').style.left = percentage + '%';
            document.querySelector('#end-marker .marker-time').textContent = value;
            updateSelectedRange();
            updateClipDuration();
        }
    }
});

// Play selection
document.getElementById('play-selection-btn').addEventListener('click', () => {
    if (!player) return;

    const startTime = document.getElementById('start-time').value;
    const endTime = document.getElementById('end-time').value;

    if (isValidTimeFormat(startTime) && isValidTimeFormat(endTime)) {
        const startSeconds = mmssToSeconds(startTime);
        const endSeconds = mmssToSeconds(endTime);

        // Aktifkan tombol potong klip setelah tombol putar terpilih diklik jika kualitas memenuhi syarat
        const clipBtn = document.getElementById('clip-btn');
        if (clipBtn) {
            if (currentMaxResolution <= 240) {
                clipBtn.disabled = true;
                clipBtn.title = `Video hanya ${currentMaxResolution}p (kualitas buruk, tidak didukung)`;
                showToast(`Video hanya ${currentMaxResolution}p (kualitas buruk, tidak didukung)`, 'error');
            } else {
                clipBtn.disabled = false;
                clipBtn.removeAttribute('title');

                // Aktifkan dropdown resolusi bersamaan dengan tombol klip
                const qualitySelect = document.getElementById('clip-quality');
                if (qualitySelect && qualitySelect.options.length > 0) {
                    qualitySelect.disabled = false;
                }
            }
        }

        // Clear interval sebelumnya jika ada
        if (playbackInterval) {
            clearInterval(playbackInterval);
            playbackInterval = null;
        }

        // Seek ke start dan play
        player.seekTo(startSeconds, true);
        player.playVideo();

        // Monitor playback dan stop di endTime
        playbackInterval = setInterval(() => {
            const currentTime = player.getCurrentTime();

            // Jika sudah mencapai atau melewati endTime, stop
            if (currentTime >= endSeconds) {
                player.pauseVideo();
                clearInterval(playbackInterval);
                playbackInterval = null;
                console.log('Playback stopped at end time:', endSeconds);
            }
        }, 100); // Check setiap 100ms
    }
});

// Clip video
document.getElementById('clip-btn').addEventListener('click', async () => {
    const url = document.getElementById('youtube-url').value.trim();
    const startTime = document.getElementById('start-time').value;
    const endTime = document.getElementById('end-time').value;
    const qualitySelect = document.getElementById('clip-quality');
    const quality = qualitySelect ? qualitySelect.value : '720';

    if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
        showToast('Format waktu harus MM:SS (contoh: 01:30)', 'warning');
        return;
    }

    const startSeconds = mmssToSeconds(startTime);
    const endSeconds = mmssToSeconds(endTime);

    if (endSeconds <= startSeconds) {
        showToast('Waktu selesai harus lebih besar dari waktu mulai', 'warning');
        return;
    }

    // Show loading
    const emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.style.display = 'none';
    document.getElementById('loading-section').style.display = 'flex';
    document.getElementById('result-section').style.display = 'none';
    document.getElementById('clip-btn').disabled = true;

    // Helper untuk update UI progress & label dinamis
    const updateProgressUI = (percent, title, desc) => {
        const clampedPercent = Math.min(100, Math.max(0, Math.round(percent)));
        const circleBar = document.getElementById('circle-bar');
        const percentText = document.getElementById('progress-percent');
        const progressBarFill = document.getElementById('progress-bar-fill');
        const statusTitle = document.getElementById('loading-status-title');
        const statusDesc = document.getElementById('loading-status-desc');

        if (percentText) percentText.textContent = `${clampedPercent}%`;
        if (progressBarFill) progressBarFill.style.width = `${clampedPercent}%`;
        if (circleBar) {
            const circumference = 2 * Math.PI * 42;
            const offset = circumference - (clampedPercent / 100) * circumference;
            circleBar.style.strokeDashoffset = offset;
        }
        if (statusTitle && title) statusTitle.textContent = title;
        if (statusDesc && desc) statusDesc.textContent = desc;
    };

    updateProgressUI(10, 'Menyiapkan Klip...', `Menghubungi YouTube (${quality}p)...`);

    // Simulasi progres dinamis (maksimal tertahan di 92% hingga backend selesai 100%)
    let currentP = 15;
    const progressTimer = setInterval(() => {
        if (currentP < 90) {
            currentP += Math.random() * 8 + 4;
            const displayP = Math.min(92, Math.round(currentP));
            updateProgressUI(displayP, `Memproses Klip (${displayP}%)`, `Mengunduh potongan ${startTime} - ${endTime} [${quality}p]...`);
        }
    }, 450);

    try {
        const response = await fetch('/api/clip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, startTime, endTime, quality })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Gagal memproses klip');
        }

        clearInterval(progressTimer);
        updateProgressUI(100, 'Selesai!', 'Klip berhasil dibuat!');

        setTimeout(() => {
            // Show result
            document.getElementById('loading-section').style.display = 'none';
            document.getElementById('result-section').style.display = 'flex';

            let originalClipFilename = data.filename; // Simpan file asli hasil potongan awal
            let currentClipFilename = data.filename;
            const resultVideo = document.getElementById('result-video');
            resultVideo.src = `/api/download/${currentClipFilename}`;

            const durationStr = secondsToMMSS(data.duration);
            const updateFilenameDisplay = () => {
                document.getElementById('result-filename').textContent = `${currentClipFilename} · ${durationStr}`;
            };
            updateFilenameDisplay();

            // Setup Dropdown Tunggal: Simpan Video / Audio
            const saveMainBtn = document.getElementById('save-main-btn');
            const saveDropdown = document.getElementById('save-unified-dropdown');
            const optNormal = document.getElementById('save-opt-normal');
            const optMuted = document.getElementById('save-opt-muted');
            const optAudio = document.getElementById('save-opt-audio');

            if (saveMainBtn && saveDropdown) {
                saveMainBtn.onclick = (e) => {
                    e.stopPropagation();
                    const isVisible = saveDropdown.style.display === 'flex';
                    saveDropdown.style.display = isVisible ? 'none' : 'flex';
                };

                document.addEventListener('click', (e) => {
                    if (!e.target.closest('.save-unified-wrapper')) {
                        saveDropdown.style.display = 'none';
                    }
                });
            }

            // Eksekusi Simpan Video (Normal / Bisu)
            async function executeSaveVideo(isMuted = false) {
                if (saveDropdown) saveDropdown.style.display = 'none';
                saveMainBtn.disabled = true;

                const originalHTML = saveMainBtn.innerHTML;
                saveMainBtn.innerHTML = `<span class="btn-icon">⏳</span><span>${isMuted ? 'Membisukan...' : 'Menyimpan...'}</span>`;

                let targetSaveFilename = currentClipFilename;

                try {
                    if (isMuted) {
                        const muteRes = await fetch('/api/mute-video', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ filename: currentClipFilename })
                        });
                        const muteJson = await muteRes.json();
                        if (!muteRes.ok) throw new Error(muteJson.error || 'Gagal memproses video bisu');
                        targetSaveFilename = muteJson.filename;
                    }

                    let customSavedPath = '';
                    try {
                        const saveRes = await fetch('/api/save-to-custom-dir', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ filename: targetSaveFilename, type: 'video' })
                        });
                        const resJson = await saveRes.json();
                        if (resJson.success && resJson.savedPath) {
                            customSavedPath = resJson.savedPath;
                        }
                    } catch (e) {
                        console.warn('Gagal salin ke folder custom:', e);
                    }

                    const labelType = isMuted ? 'Video tanpa suara' : 'Video';

                    // Jika pengguna TIDAK mengatur custom directory, baru picu unduhan browser bawaan
                    if (!customSavedPath) {
                        const a = document.createElement('a');
                        a.href = `/api/download/${targetSaveFilename}`;
                        a.download = targetSaveFilename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        showToast(`${labelType} disimpan: ${targetSaveFilename}`, 'success');
                    } else {
                        showToast(`${labelType} berhasil disimpan ke:\n${customSavedPath}`, 'success', 4500);
                    }
                } catch (err) {
                    showToast('Gagal menyimpan video: ' + err.message, 'error');
                } finally {
                    saveMainBtn.disabled = false;
                    saveMainBtn.innerHTML = originalHTML;
                }
            }

            // Eksekusi Simpan Audio (MP3)
            async function executeSaveAudio() {
                if (saveDropdown) saveDropdown.style.display = 'none';
                saveMainBtn.disabled = true;

                const originalHTML = saveMainBtn.innerHTML;
                saveMainBtn.innerHTML = `<span class="btn-icon">⏳</span><span>Mengekstrak Audio...</span>`;

                try {
                    const res = await fetch('/api/extract-audio', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filename: currentClipFilename })
                    });
                    const audioData = await res.json();
                    if (!res.ok) throw new Error(audioData.error || 'Gagal ekstrak audio');

                    let customAudioPath = '';
                    try {
                        const copyRes = await fetch('/api/save-to-custom-dir', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ filename: audioData.audioFilename, type: 'audio' })
                        });
                        const copyJson = await copyRes.json();
                        if (copyJson.success && copyJson.savedPath) {
                            customAudioPath = copyJson.savedPath;
                        }
                    } catch (e) {
                        console.warn('Gagal salin audio ke custom dir:', e);
                    }

                    // Jika pengguna TIDAK mengatur custom directory, baru picu unduhan browser bawaan
                    if (!customAudioPath) {
                        const a = document.createElement('a');
                        a.href = `/api/download/${audioData.audioFilename}`;
                        a.download = audioData.audioFilename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        showToast(`Audio berhasil disimpan (${audioData.audioFilename})`, 'success');
                    } else {
                        showToast(`Audio MP3 berhasil disimpan ke:\n${customAudioPath}`, 'success', 4500);
                    }
                } catch (err) {
                    showToast('Gagal mengekstrak audio: ' + err.message, 'error');
                } finally {
                    saveMainBtn.disabled = false;
                    saveMainBtn.innerHTML = originalHTML;
                }
            }

            if (optNormal) optNormal.onclick = () => executeSaveVideo(false);
            if (optMuted) optMuted.onclick = () => executeSaveVideo(true);
            if (optAudio) optAudio.onclick = executeSaveAudio;

            // Setup Terapkan Aspek Rasio (Crop / Blur)
            const applyAspectBtn = document.getElementById('apply-aspect-btn');
            const aspectSelect = document.getElementById('aspect-mode-select');
            applyAspectBtn.onclick = async () => {
                const mode = aspectSelect.value;
                applyAspectBtn.disabled = true;
                const originalText = applyAspectBtn.innerHTML;
                applyAspectBtn.innerHTML = '<span>⏳ Memproses...</span>';

                try {
                    // Selalu gunakan klip asli sebagai basis konversi (bukan klip yang sudah di-crop bertumpuk)
                    const res = await fetch('/api/convert-aspect', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filename: originalClipFilename, mode })
                    });
                    const convertData = await res.json();
                    if (!res.ok) throw new Error(convertData.error || 'Gagal mengubah rasio');

                    // Ganti file klip aktif ke file hasil konversi dengan cache buster agar browser langsung refresh tampilan
                    currentClipFilename = convertData.filename;
                    resultVideo.src = `/api/download/${currentClipFilename}?t=${Date.now()}`;
                    resultVideo.load();
                    updateFilenameDisplay();
                    showToast('Aspek rasio berhasil diubah!', 'success');
                } catch (err) {
                    showToast('Gagal mengubah rasio: ' + err.message, 'error');
                } finally {
                    applyAspectBtn.disabled = false;
                    applyAspectBtn.innerHTML = originalText;
                }
            };

            // Setup Delete Klip
            const deleteBtn = document.getElementById('delete-btn');
            deleteBtn.onclick = async () => {
                const confirmed = await showConfirmModal(
                    'Hapus Klip Video?',
                    `File klip "${currentClipFilename}" akan dihapus permanen dari server lokal.`,
                    'Ya, Hapus'
                );

                if (!confirmed) return;

                try {
                    const deleteResponse = await fetch(`/api/clip/${currentClipFilename}`, {
                        method: 'DELETE'
                    });

                    const deleteData = await deleteResponse.json();

                    if (!deleteResponse.ok) {
                        throw new Error(deleteData.error || 'Gagal menghapus file');
                    }

                    // Hide result section & show empty state
                    document.getElementById('result-section').style.display = 'none';
                    if (emptyState) emptyState.style.display = 'flex';
                    showToast('File klip berhasil dihapus', 'success');

                } catch (error) {
                    console.error('Error:', error);
                    showToast('Gagal menghapus file: ' + error.message, 'error');
                }
            };
        }, 400);

    } catch (error) {
        clearInterval(progressTimer);
        console.error('Error:', error);
        showToast('Gagal memproses klip: ' + error.message, 'error');
        document.getElementById('loading-section').style.display = 'none';
        if (emptyState) emptyState.style.display = 'flex';
    } finally {
        document.getElementById('clip-btn').disabled = false;
    }
});

// Event: Stop Server
document.getElementById('stop-server-btn').addEventListener('click', async () => {
    const confirmed = await showConfirmModal(
        'Stop KenClip Server?',
        'Server akan dihentikan dan browser tab ini akan tertutup.',
        'Ya, Stop Server'
    );

    if (!confirmed) return;

    try {
        showToast('Menghentikan server...', 'info');

        // Call shutdown endpoint
        await fetch('/api/shutdown', {
            method: 'POST'
        });

        // Wait a bit then close tab
        setTimeout(() => {
            window.close();
            // Fallback if window.close() doesn't work
            document.body.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui; flex-direction: column;"><h1>✅ Server Stopped</h1><p>Anda dapat menutup tab ini.</p></div>';
        }, 500);

    } catch (error) {
        console.error('Error stopping server:', error);
        showToast('Server stopped', 'success');
        setTimeout(() => {
            window.close();
            document.body.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui; flex-direction: column;"><h1>✅ Server Stopped</h1><p>Anda dapat menutup tab ini.</p></div>';
        }, 500);
    }
});
