// ============ TRANSLATE REAL ============
translateBtn.addEventListener('click', async () => {
    if (uploadedFiles.length === 0) return;

    const sourceLang = document.getElementById('sourceLang').value;
    const targetLang = document.getElementById('targetLang').value;
    const mode = document.getElementById('mode').value;

    resultContainer.classList.remove('hidden');
    resultContent.innerHTML = `<div class="loading"><div class="spinner"></div><p>🔍 Debugging scan-translator.com...</p></div>`;

    let results = [];

    for (const file of uploadedFiles) {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('source', sourceLang);
        formData.append('target', targetLang);
        formData.append('mode', mode);

        try {
            const res = await fetch('/api/debug', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            if (data.success) {
                results.push({
                    name: file.name,
                    status: data.cacheHit ? '✅ CACHE HIT' : '✅ TRANSLATED',
                    text: data.text,
                    creditUsed: data.creditUsed,
                    cacheHit: data.cacheHit
                });

                if (data.cacheHit) {
                    stats.cacheHit++;
                } else {
                    stats.creditUsed += data.creditUsed || 0;
                }
                stats.totalTranslate++;
            } else {
                results.push({
                    name: file.name,
                    status: '❌ ERROR',
                    text: data.message || 'Gagal',
                    creditUsed: 0,
                    cacheHit: false
                });
            }
        } catch (err) {
            results.push({
                name: file.name,
                status: '❌ ERROR',
                text: err.message,
                creditUsed: 0,
                cacheHit: false
            });
        }
    }

    renderResults(results);
    updateStats();
});