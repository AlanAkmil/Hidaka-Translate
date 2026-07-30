// ============================================================
// SCAN-TRANSLATOR DEBUG — Unlimited Translation
// ============================================================

// State
let uploadedFiles = [];
let stats = {
    creditUsed: 0,
    cacheHit: 0,
    totalTranslate: 0
};
const cache = new Map();

// DOM
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const previewGrid = document.getElementById('previewGrid');
const actionBar = document.getElementById('actionBar');
const translateBtn = document.getElementById('translateBtn');
const clearBtn = document.getElementById('clearBtn');
const exportBtn = document.getElementById('exportBtn');
const clearCacheBtn = document.getElementById('clearCacheBtn');
const copyAllBtn = document.getElementById('copyAllBtn');
const resultContainer = document.getElementById('resultContainer');
const resultContent = document.getElementById('resultContent');

const creditUsedEl = document.getElementById('creditUsed');
const cacheHitEl = document.getElementById('cacheHit');
const totalTranslateEl = document.getElementById('totalTranslate');

// ---------- Drag & Drop ----------
dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--primary)';
});

dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--border)';
});

dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--border)';
    handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    fileInput.value = '';
});

// ---------- Handle Files ----------
function handleFiles(files) {
    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        if (file.size > 20 * 1024 * 1024) {
            alert(`File ${file.name} terlalu besar (max 20MB)`);
            continue;
        }
        uploadedFiles.push(file);
    }
    renderPreviews();
    if (uploadedFiles.length > 0) {
        actionBar.style.display = 'flex';
    }
}

// ---------- Render Previews ----------
function renderPreviews() {
    previewGrid.innerHTML = '';
    uploadedFiles.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.innerHTML = `
                <img src="${e.target.result}" alt="${file.name}" />
                <div class="info">
                    <span>${file.name.length > 12 ? file.name.slice(0, 10) + '...' : file.name}</span>
                    <button onclick="removeFile(${idx})"><i class="fas fa-times"></i></button>
                </div>
            `;
            previewGrid.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

window.removeFile = function(idx) {
    uploadedFiles.splice(idx, 1);
    renderPreviews();
    if (uploadedFiles.length === 0) {
        actionBar.style.display = 'none';
        resultContainer.classList.add('hidden');
    }
};

// ---------- Clear ----------
clearBtn.addEventListener('click', () => {
    uploadedFiles = [];
    previewGrid.innerHTML = '';
    actionBar.style.display = 'none';
    resultContainer.classList.add('hidden');
});

// ---------- Clear Cache ----------
clearCacheBtn.addEventListener('click', () => {
    cache.clear();
    stats.cacheHit = 0;
    updateStats();
    alert('Cache cleared!');
});

// ---------- Update Stats ----------
function updateStats() {
    creditUsedEl.textContent = stats.creditUsed;
    cacheHitEl.textContent = stats.cacheHit;
    totalTranslateEl.textContent = stats.totalTranslate;
}

// ---------- Generate Hash ----------
async function generateHash(buffer) {
    const data = new Uint8Array(buffer);
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash) + data[i];
        hash = hash & hash;
    }
    return hash.toString(36);
}

// ---------- Translate ----------
translateBtn.addEventListener('click', async () => {
    if (uploadedFiles.length === 0) return;

    const sourceLang = document.getElementById('sourceLang').value;
    const targetLang = document.getElementById('targetLang').value;
    const mode = document.getElementById('mode').value;

    resultContainer.classList.remove('hidden');
    resultContent.innerHTML = `
        <div class="loading" style="border:none;padding:20px;text-align:center;">
            <div class="spinner" style="width:32px;height:32px;border:3px solid var(--border);border-top:3px solid var(--primary);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto;"></div>
            <p style="margin-top:8px;color:var(--text-dim);">Memproses ${uploadedFiles.length} gambar...</p>
        </div>
    `;

    await new Promise(r => setTimeout(r, 1000));

    let results = [];
    for (const file of uploadedFiles) {
        const buffer = await file.arrayBuffer();
        const hash = await generateHash(buffer);
        const cacheKey = `${hash}:${targetLang}`;

        // Cek cache
        if (cache.has(cacheKey) && mode !== 'force') {
            results.push({
                name: file.name,
                status: '✅ CACHE HIT',
                text: cache.get(cacheKey),
                creditUsed: 0,
                cache: true
            });
            stats.cacheHit++;
            stats.totalTranslate++;
            continue;
        }

        // Translate
        try {
            const formData = new FormData();
            formData.append('image', file);
            formData.append('source', sourceLang);
            formData.append('target', targetLang);

            const res = await fetch('/api/debug', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            if (data.success) {
                // Simpan cache
                if (mode !== 'force') {
                    cache.set(cacheKey, data.text);
                }
                results.push({
                    name: file.name,
                    status: '✅ TRANSLATED',
                    text: data.text,
                    creditUsed: data.creditUsed || 0,
                    cache: false
                });
                stats.creditUsed += data.creditUsed || 0;
                stats.totalTranslate++;
            } else {
                results.push({
                    name: file.name,
                    status: '❌ ERROR',
                    text: data.message || 'Unknown error',
                    creditUsed: 0,
                    cache: false
                });
            }
        } catch (err) {
            results.push({
                name: file.name,
                status: '❌ ERROR',
                text: err.message,
                creditUsed: 0,
                cache: false
            });
        }
    }

    renderResults(results);
    updateStats();
});

// ---------- Render Results ----------
function renderResults(results) {
    let html = '';
    results.forEach((r, idx) => {
        html += `
            <div class="result-item">
                <div>
                    <div class="label">${r.name}</div>
                    <div class="value">${r.text}</div>
                    <div class="meta">
                        ${r.status} · Credit: ${r.creditUsed} · ${r.cache ? '🔒 Cache' : '🌐 API'}
                    </div>
                </div>
            </div>
        `;
    });
    resultContent.innerHTML = html;
}

// ---------- Copy All ----------
copyAllBtn.addEventListener('click', () => {
    const texts = resultContent.querySelectorAll('.value');
    const allText = Array.from(texts).map(el => el.textContent).join('\n\n');
    navigator.clipboard.writeText(allText).then(() => {
        alert('✅ Semua teks disalin!');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = allText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        alert('✅ Semua teks disalin!');
    });
});

// ---------- Export ----------
exportBtn.addEventListener('click', () => {
    const data = {
        timestamp: new Date().toISOString(),
        stats: stats,
        results: resultContent.querySelectorAll('.result-item').length
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-log_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

// ---------- Init ----------
updateStats();
console.log('🔧 Scan-Translator Debug loaded.');