// ============ STATE ============
let uploadedFiles = [];
const stats = { creditUsed: 0, cacheHit: 0, totalTranslate: 0 };

// ============ DOM REFS ============
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const previewGrid = document.getElementById('previewGrid');
const actionBar = document.getElementById('actionBar');
const translateBtn = document.getElementById('translateBtn');
const clearBtn = document.getElementById('clearBtn');
const exportBtn = document.getElementById('exportBtn');
const clearCacheBtn = document.getElementById('clearCacheBtn');
const resultContainer = document.getElementById('resultContainer');
const resultContent = document.getElementById('resultContent');
const copyAllBtn = document.getElementById('copyAllBtn');

// ============ UPLOAD: click + file picker ============
dropzone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    addFiles(Array.from(e.target.files));
    fileInput.value = ''; // allow re-selecting same file
});

// ============ UPLOAD: drag & drop ============
['dragenter', 'dragover'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
    });
});

['dragleave', 'dragend', 'drop'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
    });
});

dropzone.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    addFiles(files);
});

function addFiles(files) {
    if (!files.length) return;
    uploadedFiles = uploadedFiles.concat(files);
    renderPreview();
}

// ============ PREVIEW ============
function renderPreview() {
    previewGrid.innerHTML = '';

    uploadedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'preview-item';

        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.alt = file.name;
        item.appendChild(img);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'preview-item__remove';
        removeBtn.innerHTML = '<i class="fas fa-xmark"></i>';
        removeBtn.setAttribute('aria-label', `Hapus ${file.name}`);
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            uploadedFiles.splice(index, 1);
            renderPreview();
        });
        item.appendChild(removeBtn);

        previewGrid.appendChild(item);
    });

    actionBar.classList.toggle('hidden', uploadedFiles.length === 0);
}

// ============ TRANSLATE ============
translateBtn.addEventListener('click', async () => {
    if (uploadedFiles.length === 0) return;

    const sourceLang = document.getElementById('sourceLang').value;
    const targetLang = document.getElementById('targetLang').value;
    const mode = document.getElementById('mode').value;

    dropzone.classList.add('is-scanning');
    resultContainer.classList.remove('hidden');
    resultContent.innerHTML = `<div class="loading"><div class="spinner"></div><p>Debugging scan-translator.com...</p></div>`;

    const results = [];

    for (const file of uploadedFiles) {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('source', sourceLang);
        formData.append('target', targetLang);
        formData.append('mode', mode);

        try {
            const res = await fetch('/api/debug', { method: 'POST', body: formData });
            const data = await res.json();

            if (data.success) {
                results.push({
                    name: file.name,
                    status: data.cacheHit ? 'CACHE HIT' : 'TRANSLATED',
                    kind: data.cacheHit ? 'cache' : 'ok',
                    text: data.text,
                });
                if (data.cacheHit) stats.cacheHit++;
                else stats.creditUsed += data.creditUsed || 0;
                stats.totalTranslate++;
            } else {
                results.push({ name: file.name, status: 'ERROR', kind: 'error', text: data.message || 'Gagal' });
            }
        } catch (err) {
            results.push({ name: file.name, status: 'ERROR', kind: 'error', text: err.message });
        }
    }

    dropzone.classList.remove('is-scanning');
    renderResults(results);
    updateStats();
});

// ============ RENDER RESULTS ============
function renderResults(results) {
    resultContent.innerHTML = results.map(r => `
        <div class="log-row">
            <div class="log-row__head">
                <span>${escapeHtml(r.name)}</span>
                <span class="log-row__status--${r.kind}">${r.status}</span>
            </div>
            <div class="log-row__text">${escapeHtml(r.text || '')}</div>
        </div>
    `).join('');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============ STATS ============
function updateStats() {
    document.getElementById('creditUsed').textContent = stats.creditUsed;
    document.getElementById('cacheHit').textContent = stats.cacheHit;
    document.getElementById('totalTranslate').textContent = stats.totalTranslate;
}

// ============ CLEAR ============
clearBtn.addEventListener('click', () => {
    uploadedFiles = [];
    renderPreview();
    resultContainer.classList.add('hidden');
    resultContent.innerHTML = '';
});

// ============ EXPORT LOG ============
exportBtn.addEventListener('click', () => {
    const rows = Array.from(resultContent.querySelectorAll('.log-row')).map(row => {
        const name = row.querySelector('.log-row__head span')?.textContent || '';
        const status = row.querySelector('[class^="log-row__status"]')?.textContent || '';
        const text = row.querySelector('.log-row__text')?.textContent || '';
        return `[${status}] ${name}\n${text}\n`;
    });

    if (!rows.length) return;

    const blob = new Blob([rows.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan-debug-log-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
});

// ============ CLEAR CACHE ============
clearCacheBtn.addEventListener('click', () => {
    stats.cacheHit = 0;
    updateStats();
    clearCacheBtn.innerHTML = '<i class="fas fa-check"></i> Cache Cleared';
    setTimeout(() => {
        clearCacheBtn.innerHTML = '<i class="fas fa-database"></i> Clear Cache';
    }, 1500);
});

// ============ COPY ALL ============
copyAllBtn.addEventListener('click', async () => {
    const text = resultContent.innerText;
    try {
        await navigator.clipboard.writeText(text);
        copyAllBtn.innerHTML = '<i class="fas fa-check"></i> Copied';
        setTimeout(() => {
            copyAllBtn.innerHTML = '<i class="fas fa-copy"></i> Copy All';
        }, 1500);
    } catch (err) {
        console.error('Copy failed:', err);
    }
});
