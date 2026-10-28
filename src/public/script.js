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

    // Reset controls
    const clipBtn = document.getElementById('clip-btn');
    const playBtn = document.getElementById('play-selection-btn');
    if (clipBtn) {
        clipBtn.disabled = true;
        clipBtn.title = 'Putar bagian terpilih terlebih dahulu sebelum memotong';
    }
    if (playBtn) {
        playBtn.disabled = true;
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
    for (let i = 1; i < segments; i++) {
        const time = (videoDuration / segments) * i;
        const label = document.getElementById(`timeline-label-${i}`);
        if (label) {
            label.textContent = secondsToMMSS(time);
        }
    }
}

// Initialize markers
function initializeMarkers() {
    if (videoDuration === 0) {
        console.warn('Video duration is 0, cannot initialize markers');
        return;
    }

    const startMarker = document.getElementById('start-marker');
    const endMarker = document.getElementById('end-marker');

    // Set initial positions (10% and 90%)
    startMarker.style.left = '10%';
    endMarker.style.left = '90%';

    // Update times
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

// Update selected range visual
function updateSelectedRange() {
    const startMarker = document.getElementById('start-marker');
    const endMarker = document.getElementById('end-marker');
    const selectedRange = document.getElementById('selected-range');

    const startPos = parseFloat(startMarker.style.left);
    const endPos = parseFloat(endMarker.style.left);

    selectedRange.style.left = startPos + '%';
    selectedRange.style.width = (endPos - startPos) + '%';
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
        const seconds = (percentage / 100) * videoDuration;

        const startMarker = document.getElementById('start-marker');
        const endMarker = document.getElementById('end-marker');
        const startPos = parseFloat(startMarker.style.left);
        const endPos = parseFloat(endMarker.style.left);

        if (currentMarker === 'start' && percentage < endPos - 1) {
            startMarker.style.left = percentage + '%';
            updateMarkerTime('start', seconds);

            // Throttled auto-seek
            autoSeekToMarker(seconds);
        } else if (currentMarker === 'end' && percentage > startPos + 1) {
            endMarker.style.left = percentage + '%';
            updateMarkerTime('end', seconds);

            // Throttled auto-seek
            autoSeekToMarker(seconds);
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

    // Simulasi progres dinamis yang cepat (karena pemotongan kini langsung via --download-sections)
    let currentP = 10;
    const progressTimer = setInterval(() => {
        if (currentP < 90) {
            currentP += Math.random() * 14 + 6;
            updateProgressUI(currentP, `Memproses Klip (${Math.round(currentP)}%)`, `Mengunduh potongan ${startTime} - ${endTime} [${quality}p]...`);
        }
    }, 400);

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

            const resultVideo = document.getElementById('result-video');
            resultVideo.src = `/api/download/${data.filename}`;

            const durationStr = secondsToMMSS(data.duration);
            document.getElementById('result-filename').textContent = `${data.filename} · ${durationStr}`;

            // Setup download
            document.getElementById('download-btn').onclick = () => {
                window.location.href = `/api/download/${data.filename}`;
            };

            // Setup delete
            document.getElementById('delete-btn').onclick = async () => {
                const confirmed = await showConfirmModal(
                    'Hapus Klip Video?',
                    'File klip video ini akan dihapus secara permanen dari server lokal.',
                    'Ya, Hapus'
                );

                if (!confirmed) return;

                try {
                    const deleteResponse = await fetch(`/api/clip/${data.filename}`, {
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
