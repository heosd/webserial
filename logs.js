// --- Logging & Console Render Logic ---

function addLog(type, bytes) {
    const timestamp = getTimestamp();
    const logItem = { type, timestamp, data: bytes };
    
    logHistory.push(logItem);
    
    // Keep history capped to avoid performance lag
    if (logHistory.length > maxLogHistory) {
        logHistory.shift();
    }
    
    // Append dynamically to screen
    renderSingleLog(logItem);
    appendLogToStream(logItem);
}

function addSystemLog(message) {
    const timestamp = getTimestamp();
    const logItem = { type: 'sys', timestamp, text: message };
    
    logHistory.push(logItem);
    
    if (logHistory.length > maxLogHistory) {
        logHistory.shift();
    }
    
    renderSingleLog(logItem);
    appendLogToStream(logItem);
}

function renderSingleLog(log) {
    if (log.type === 'sys' && !showSystemCheckbox.checked) return;

    // Remove placeholder on first log insertion
    const firstChild = terminalConsole.firstElementChild;
    if (firstChild && firstChild.classList.contains('console-placeholder')) {
        firstChild.remove();
    }
    
    terminalConsole.appendChild(createLogRow(log));
    trimRenderedLogs();
    
    // Auto Scroll if checked
    if (autoscrollCheckbox.checked) {
        terminalConsole.scrollTop = terminalConsole.scrollHeight;
    }
}

function createLogRow(log) {
    const row = document.createElement('div');
    row.className = `log-row ${log.type}`;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = `[${log.timestamp}]`;
    
    const dirSpan = document.createElement('span');
    dirSpan.className = 'log-dir';
    
    const contentSpan = document.createElement('span');
    contentSpan.className = 'log-content';
    
    if (log.type === 'sys') {
        dirSpan.textContent = '[SYSTEM]';
        contentSpan.textContent = log.text;
    } else {
        const dir = log.type === 'tx' ? 'TX' : 'RX';
        dirSpan.textContent = `[${dir}]`;
        
        let contentText = '';
        if (displayMode === 'ascii') {
            contentText = bytesToAscii(log.data);
        } else if (displayMode === 'hex') {
            contentText = bytesToHex(log.data);
        } else {
            contentText = formatBoth(log.data);
        }
        
        contentSpan.textContent = contentText;
    }
    
    if (showTimeCheckbox.checked) {
        row.appendChild(timeSpan);
    }
    row.appendChild(dirSpan);
    row.appendChild(contentSpan);

    return row;
}

function trimRenderedLogs() {
    while (terminalConsole.childElementCount > maxLogHistory) {
        const firstLogRow = terminalConsole.querySelector('.log-row');
        if (!firstLogRow) return;
        firstLogRow.remove();
    }
}

function trimLogHistory() {
    if (logHistory.length > maxLogHistory) {
        logHistory.splice(0, logHistory.length - maxLogHistory);
    }
}

function normalizeMaxLogHistory(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_LOG_HISTORY;
}

function handleMaxLogHistoryChange() {
    maxLogHistory = normalizeMaxLogHistory(maxLogHistoryInput.value);
    maxLogHistoryInput.value = String(maxLogHistory);
    saveSettings();
    trimLogHistory();
    rebuildTerminalDOM();
}

function resetMaxLogHistoryToDefault(event) {
    event.preventDefault();
    maxLogHistoryInput.value = String(DEFAULT_MAX_LOG_HISTORY);
    handleMaxLogHistoryChange();
}

function setDisplayMode(mode) {
    if (displayMode === mode) return;
    
    displayMode = mode;
    
    // Update active UI tabs
    modeAscii.classList.toggle('active', mode === 'ascii');
    modeHex.classList.toggle('active', mode === 'hex');
    modeBoth.classList.toggle('active', mode === 'both');
    
    // Clear and redraw log pane
    rebuildTerminalDOM();
}

function rebuildTerminalDOM() {
    terminalConsole.innerHTML = '';
    
    if (logHistory.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'console-placeholder';
        placeholder.textContent = '포트를 선택하고 연결하여 통신을 시작하세요.';
        terminalConsole.appendChild(placeholder);
        return;
    }
    
    const fragment = document.createDocumentFragment();
    logHistory.forEach(log => {
        if (log.type === 'sys' && !showSystemCheckbox.checked) return;
        fragment.appendChild(createLogRow(log));
    });
    terminalConsole.appendChild(fragment);

    if (autoscrollCheckbox.checked) {
        terminalConsole.scrollTop = terminalConsole.scrollHeight;
    }
}

function clearLogs() {
    logHistory = [];
    rebuildTerminalDOM();
    showToast('터미널 로그가 비워졌습니다.');
}

function exportLogs() {
    if (logHistory.length === 0) {
        showToast('내보낼 로그가 없습니다.');
        return;
    }
    
    const content = logHistory.map(formatLogLine).join('');
    
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const fileTime = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').slice(0, 19);
    link.href = url;
    link.download = `web_serial_log_${fileTime}.txt`;
    
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('로그 파일이 성공적으로 다운로드되었습니다.');
}

function formatLogLine(log) {
    if (log.type === 'sys' && !showSystemCheckbox.checked) {
        return '';
    }

    const timePrefix = showTimeCheckbox.checked ? `[${log.timestamp}] ` : '';

    if (log.type === 'sys') {
        return `${timePrefix}[SYSTEM] ${log.text}\r\n`;
    }

    const direction = log.type.toUpperCase();
    let parsedVal = '';
    if (displayMode === 'ascii') {
        parsedVal = bytesToAscii(log.data);
    } else if (displayMode === 'hex') {
        parsedVal = bytesToHex(log.data);
    } else {
        parsedVal = formatBoth(log.data);
    }

    return `${timePrefix}[${direction}] ${parsedVal}\r\n`;
}

async function toggleStreamLog() {
    if (isStreamingLog) {
        await stopStreamLog();
        return;
    }

    await startStreamLog();
}

async function startStreamLog() {
    if (!window.showSaveFilePicker) {
        showToast('Stream log is not supported in this browser.', 5000);
        return;
    }

    try {
        const fileTime = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').slice(0, 19);
        streamLogFileHandle = await window.showSaveFilePicker({
            suggestedName: `web_serial_stream_${fileTime}.txt`,
            types: [{
                description: 'Text log file',
                accept: { 'text/plain': ['.txt', '.log'] }
            }]
        });

        isStreamingLog = true;
        streamLogWriteChain = Promise.resolve();
        streamLogBuffer = '';
        updateStreamLogButton();
        addSystemLog('Stream log started.');
        showToast('Stream log started.');
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Stream log start failed:', error);
            showToast('Stream log start failed: ' + error.message, 5000);
        }
    }
}

async function stopStreamLog() {
    isStreamingLog = false;
    clearStreamLogFlushTimer();
    updateStreamLogButton();

    try {
        await flushStreamLogBuffer();
        await streamLogWriteChain;
    } catch (error) {
        console.error('Stream log flush failed:', error);
    }

    streamLogFileHandle = null;
    addSystemLog('Stream log stopped.');
    showToast('Stream log stopped.');
}

function updateStreamLogButton() {
    streamLogBtn.classList.toggle('active', isStreamingLog);
    streamLogBtn.textContent = isStreamingLog ? 'Stop A' : 'log A';
}

function appendLogToStream(log) {
    if (!isStreamingLog || !streamLogFileHandle) return;

    const line = formatLogLine(log);
    if (line === '') return;

    streamLogBuffer += line;
    scheduleStreamLogFlush();
}

function scheduleStreamLogFlush() {
    if (streamLogFlushTimer) return;

    streamLogFlushTimer = setTimeout(() => {
        streamLogFlushTimer = null;
        flushStreamLogBuffer();
    }, STREAM_LOG_FLUSH_INTERVAL_MS);
}

function clearStreamLogFlushTimer() {
    if (!streamLogFlushTimer) return;

    clearTimeout(streamLogFlushTimer);
    streamLogFlushTimer = null;
}

async function flushStreamLogBuffer() {
    if (!streamLogBuffer) return;

    const text = streamLogBuffer;
    streamLogBuffer = '';

    streamLogWriteChain = streamLogWriteChain
        .catch(() => {})
        .then(() => appendTextToStreamFile(text));

    try {
        await streamLogWriteChain;
    } catch (error) {
        console.error('Stream log buffered flush failed:', error);
    }
}

async function appendTextToStreamFile(text) {
    if (!streamLogFileHandle) return;

    try {
        const file = await streamLogFileHandle.getFile();
        const writable = await streamLogFileHandle.createWritable({ keepExistingData: true });
        await writable.seek(file.size);
        await writable.write(text);
        await writable.close();
    } catch (error) {
        isStreamingLog = false;
        streamLogFileHandle = null;
        updateStreamLogButton();
        console.error('Stream log append failed:', error);
        addSystemLog('Stream log stopped because file append failed: ' + error.message);
        showToast('Stream log append failed: ' + error.message, 5000);
    }
}
