// --- Browser Private Log (OPFS) ---

function isOpfsSupported() {
    return !!(window.Worker && navigator.storage && navigator.storage.getDirectory);
}

async function initOpfsLog() {
    if (!isOpfsSupported()) {
        setOpfsLogControlsDisabled(true);
        renderOpfsLogList([]);
        return;
    }

    isOpfsLogEnabled = false;
    localStorage.setItem('opfsLogEnabled', 'false');
    updateOpfsLogButtons();

    try {
        await cleanupOldOpfsLogs();
        await refreshOpfsLogList();
    } catch (error) {
        console.error('Browser private log init failed:', error);
        showToast('Browser private log init failed: ' + error.message, 5000);
    }
}

function setOpfsLogControlsDisabled(disabled) {
    opfsLogOnBtn.disabled = disabled;
    opfsLogOffBtn.disabled = disabled;
    opfsLogClearAllBtn.disabled = disabled;
}

function updateOpfsLogButtons() {
    opfsLogOnBtn.classList.toggle('active', isOpfsLogEnabled);
    opfsLogOffBtn.classList.toggle('active', !isOpfsLogEnabled);
}

function getTodayOpfsLogFileName() {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `ws_${yyyy}${mm}${dd}.log`;
}

function parseOpfsLogDate(fileName) {
    const match = /^ws_(\d{4})(\d{2})(\d{2})\.log$/.exec(fileName);
    if (!match) return null;

    const [, yyyy, mm, dd] = match;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

async function getOpfsRootDirectory() {
    return navigator.storage.getDirectory();
}

async function getOpfsLogFileHandle(fileName, create = true) {
    const root = await getOpfsRootDirectory();
    return root.getFileHandle(fileName, { create });
}

async function listOpfsLogFiles() {
    const root = await getOpfsRootDirectory();
    const files = [];

    for await (const [name, handle] of root.entries()) {
        if (handle.kind !== 'file' || !/^ws_\d{8}\.log$/.test(name)) continue;

        const file = await handle.getFile();
        files.push({ name, size: file.size });
    }

    files.sort((a, b) => b.name.localeCompare(a.name));
    return files;
}

async function cleanupOldOpfsLogs() {
    const root = await getOpfsRootDirectory();
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - OPFS_LOG_RETENTION_DAYS);

    for await (const [name, handle] of root.entries()) {
        if (handle.kind !== 'file') continue;

        const logDate = parseOpfsLogDate(name);
        if (!logDate || logDate >= cutoff) continue;

        await root.removeEntry(name);
    }
}

async function refreshOpfsLogList() {
    renderOpfsLogList(await listOpfsLogFiles());
}

function renderOpfsLogList(files) {
    opfsLogList.innerHTML = '';

    if (!files.length) {
        const empty = document.createElement('div');
        empty.className = 'opfs-log-empty';
        empty.textContent = 'No logs';
        opfsLogList.appendChild(empty);
        return;
    }

    files.forEach(file => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'opfs-log-file';
        button.textContent = `${file.name} (${formatBytes(file.size)})`;
        button.title = 'Export';
        button.addEventListener('click', () => exportOpfsLogFile(file.name));
        opfsLogList.appendChild(button);
    });
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ensureOpfsLogWorker() {
    if (opfsLogWorker) return;

    opfsLogWorker = new Worker('opfs-log-worker.js');
    opfsLogWorker.addEventListener('message', handleOpfsLogWorkerMessage);
    opfsLogWorker.addEventListener('error', error => {
        handleOpfsLogError('Browser private log worker error', error);
    });
}

function handleOpfsLogWorkerMessage(event) {
    const message = event.data || {};

    if (message.type !== 'response') return;

    const pending = opfsLogPendingRequests.get(message.id);
    if (!pending) return;

    opfsLogPendingRequests.delete(message.id);

    if (message.ok) {
        pending.resolve(message.result);
    } else {
        pending.reject(new Error(message.error || 'OPFS worker request failed.'));
    }
}

function requestOpfsLogWorker(action, payload = {}) {
    ensureOpfsLogWorker();

    const id = ++opfsLogRequestId;
    const request = { id, action, ...payload };

    return new Promise((resolve, reject) => {
        opfsLogPendingRequests.set(id, { resolve, reject });
        opfsLogWorker.postMessage(request);
    });
}

async function startOpfsLogWorker(fileName = getTodayOpfsLogFileName()) {
    opfsLogCurrentFileName = fileName;
    await requestOpfsLogWorker('start', { fileName });
}

async function stopOpfsLogWorker() {
    if (!opfsLogWorker) return;

    try {
        await requestOpfsLogWorker('stop');
    } finally {
        opfsLogWorker.terminate();
        opfsLogWorker = null;
        opfsLogPendingRequests.clear();
    }
}

async function ensureTodayOpfsLogWorker() {
    const todayFileName = getTodayOpfsLogFileName();
    if (opfsLogWorker && opfsLogCurrentFileName === todayFileName) return;

    if (opfsLogWorker) {
        await stopOpfsLogWorker();
    }

    await startOpfsLogWorker(todayFileName);
}

async function enableOpfsLog() {
    if (!isOpfsSupported()) {
        showToast('Browser private log is not supported in this browser.', 5000);
        return;
    }

    if (isOpfsLogEnabled && opfsLogWorker) return;

    try {
        await ensureTodayOpfsLogWorker();
        isOpfsLogEnabled = true;
        updateOpfsLogButtons();
        addSystemLog('Browser private log enabled.');
        await refreshOpfsLogList();
    } catch (error) {
        handleOpfsLogError('Browser private log worker start failed', error);
    }
}

async function disableOpfsLog() {
    isOpfsLogEnabled = false;
    updateOpfsLogButtons();

    try {
        await stopOpfsLogWorker();
        await refreshOpfsLogList();
    } catch (error) {
        handleOpfsLogError('Browser private log worker stop failed', error, false);
    }

    addSystemLog('Browser private log disabled.');
}

async function appendLogToOpfs(log) {
    if (!isOpfsLogEnabled) return;

    const line = formatLogLine(log);
    if (line === '') return;

    try {
        await ensureTodayOpfsLogWorker();
        opfsLogWorker.postMessage({ action: 'append', text: line });
    } catch (error) {
        handleOpfsLogError('Browser private log append failed', error);
    }
}

async function exportOpfsLogFile(fileName) {
    if (!isOpfsSupported()) {
        showToast('Browser private log is not supported in this browser.', 5000);
        return;
    }

    const shouldResume = isOpfsLogEnabled;
    const activeFileName = opfsLogCurrentFileName;

    try {
        if (opfsLogWorker && fileName === activeFileName) {
            await stopOpfsLogWorker();
        }

        const fileHandle = await getOpfsLogFileHandle(fileName, false);
        const file = await fileHandle.getFile();
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');

        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast('Browser private log exported.');
    } catch (error) {
        if (error.name === 'NotFoundError') {
            showToast('No browser private log file to export.');
        } else {
            console.error('Browser private log export failed:', error);
            showToast('Browser private log export failed: ' + error.message, 5000);
        }
    } finally {
        if (shouldResume) {
            try {
                await startOpfsLogWorker(getTodayOpfsLogFileName());
            } catch (error) {
                handleOpfsLogError('Browser private log worker restart failed', error);
            }
        }
    }
}

async function clearAllOpfsLogs() {
    if (!isOpfsSupported()) {
        showToast('Browser private log is not supported in this browser.', 5000);
        return;
    }

    if (!confirm('Clear all browser private logs?')) return;

    const shouldResume = isOpfsLogEnabled;

    try {
        if (opfsLogWorker) {
            await stopOpfsLogWorker();
        }

        const root = await getOpfsRootDirectory();
        for await (const [name, handle] of root.entries()) {
            if (handle.kind === 'file' && /^ws_\d{8}\.log$/.test(name)) {
                await root.removeEntry(name);
            }
        }

        await refreshOpfsLogList();
        showToast('Browser private logs cleared.');
    } catch (error) {
        console.error('Browser private log clear failed:', error);
        showToast('Browser private log clear failed: ' + error.message, 5000);
    } finally {
        if (shouldResume) {
            try {
                await startOpfsLogWorker(getTodayOpfsLogFileName());
            } catch (error) {
                handleOpfsLogError('Browser private log worker restart failed', error);
            }
        }
    }
}

function handleOpfsLogError(prefix, error, disable = true) {
    if (disable) {
        isOpfsLogEnabled = false;
        updateOpfsLogButtons();

        if (opfsLogWorker) {
            opfsLogWorker.terminate();
            opfsLogWorker = null;
            opfsLogPendingRequests.clear();
        }
    }

    console.error(prefix + ':', error);
    addSystemLog(prefix + ': ' + error.message);
    showToast(prefix + ': ' + error.message, 5000);
}
