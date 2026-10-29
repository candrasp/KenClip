// settings.js - Modul Manajemen Pengaturan Penyimpanan & Dialog Lokal

document.addEventListener('DOMContentLoaded', () => {
    const settingsModal = document.getElementById('settings-modal');
    const openSettingsBtn = document.getElementById('open-settings-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const resetSettingsBtn = document.getElementById('reset-settings-btn');

    const videoDirInput = document.getElementById('setting-video-dir');
    const audioDirInput = document.getElementById('setting-audio-dir');
    const browseVideoBtn = document.getElementById('browse-video-dir-btn');
    const browseAudioBtn = document.getElementById('browse-audio-dir-btn');
    const openVideoBtn = document.getElementById('open-video-dir-btn');
    const openAudioBtn = document.getElementById('open-audio-dir-btn');

    // Load data pengaturan saat aplikasi dimuat
    loadSettings();

    // Event buka & tutup modal
    if (openSettingsBtn) {
        openSettingsBtn.addEventListener('click', () => {
            loadSettings();
            settingsModal.style.display = 'flex';
        });
    }

    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });
    }

    // Tutup jika klik backdrop
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });

    let isSelecting = false;

    // Pemilih Folder Khusus Video
    if (browseVideoBtn) {
        browseVideoBtn.addEventListener('click', async () => {
            if (isSelecting) return;
            isSelecting = true;
            browseVideoBtn.disabled = true;
            browseVideoBtn.textContent = 'Membuka...';
            try {
                const res = await fetch('/api/select-folder/video', { method: 'POST' });
                const data = await res.json();
                if (data.success && data.path) {
                    videoDirInput.value = data.path;
                    if (window.showToast) {
                        window.showToast(`Folder Video dipilih: ${data.path}`, 'success');
                    }
                }
            } catch (err) {
                console.error('Error selecting video folder:', err);
            } finally {
                browseVideoBtn.disabled = false;
                browseVideoBtn.textContent = 'Pilih Folder';
                isSelecting = false;
            }
        });
    }

    // Pemilih Folder Khusus Audio
    if (browseAudioBtn) {
        browseAudioBtn.addEventListener('click', async () => {
            if (isSelecting) return;
            isSelecting = true;
            browseAudioBtn.disabled = true;
            browseAudioBtn.textContent = 'Membuka...';
            try {
                const res = await fetch('/api/select-folder/audio', { method: 'POST' });
                const data = await res.json();
                if (data.success && data.path) {
                    audioDirInput.value = data.path;
                    if (window.showToast) {
                        window.showToast(`Folder Audio dipilih: ${data.path}`, 'success');
                    }
                }
            } catch (err) {
                console.error('Error selecting audio folder:', err);
            } finally {
                browseAudioBtn.disabled = false;
                browseAudioBtn.textContent = 'Pilih Folder';
                isSelecting = false;
            }
        });
    }

    // Tombol buka Windows Explorer langsung
    if (openVideoBtn) {
        openVideoBtn.addEventListener('click', () => {
            const path = videoDirInput.value.trim();
            fetch('/api/open-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            });
        });
    }

    if (openAudioBtn) {
        openAudioBtn.addEventListener('click', () => {
            const path = audioDirInput.value.trim();
            fetch('/api/open-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            });
        });
    }

    // Simpan pengaturan
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', async () => {
            const autoOpenVal = document.querySelector('input[name="auto-open-folder"]:checked')?.value === 'true';
            const autoCleanupVal = document.querySelector('input[name="auto-cleanup"]:checked')?.value === 'true';

            const payload = {
                videoSaveDir: videoDirInput.value.trim(),
                audioSaveDir: audioDirInput.value.trim(),
                autoOpenFolder: autoOpenVal,
                autoCleanup: autoCleanupVal
            };

            saveSettingsBtn.disabled = true;
            saveSettingsBtn.textContent = 'Menyimpan...';

            try {
                const res = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Gagal menyimpan');

                if (window.showToast) {
                    window.showToast('Pengaturan berhasil disimpan!', 'success');
                }
                settingsModal.style.display = 'none';
            } catch (err) {
                if (window.showToast) {
                    window.showToast('Gagal: ' + err.message, 'error');
                }
            } finally {
                saveSettingsBtn.disabled = false;
                saveSettingsBtn.textContent = 'Simpan Pengaturan';
            }
        });
    }

    // Reset default
    if (resetSettingsBtn) {
        resetSettingsBtn.addEventListener('click', () => {
            videoDirInput.value = '';
            audioDirInput.value = '';
            setRadioValue('auto-open-folder', 'false');
            setRadioValue('auto-cleanup', 'true');
        });
    }

    async function loadSettings() {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            if (data.success && data.settings) {
                const s = data.settings;
                if (videoDirInput) videoDirInput.value = s.videoSaveDir || '';
                if (audioDirInput) audioDirInput.value = s.audioSaveDir || '';
                setRadioValue('auto-open-folder', s.autoOpenFolder ? 'true' : 'false');
                setRadioValue('auto-cleanup', s.autoCleanup ? 'true' : 'false');
            }
        } catch (e) {
            console.warn('Gagal memuat settings:', e);
        }
    }

    function setRadioValue(name, val) {
        const radio = document.querySelector(`input[name="${name}"][value="${val}"]`);
        if (radio) radio.checked = true;
    }
});

