// Highlight rules run outside the UI thread and only see newly added logs.
const HIGHLIGHT_DEFAULT = `function highlight(text, direction) {
    const m = text.match(/E (\\d+) A/);
    if (m) {
        return m[1];
    }
    return undefined;
}`;
let highlightWorker = null;
let highlightQueue = [];
let highlightPending = null;
let highlightTimer = null;
let highlightNextId = 0;
let highlightReady = false;

function setupHighlight() {
    const popup = document.getElementById('highlight-popup');
    const button = document.getElementById('highlight-btn');
    const editor = document.getElementById('highlight-code');
    const editTab = document.getElementById('highlight-edit-tab');
    const resultTab = document.getElementById('highlight-result-tab');
    function selectTab(showResult) {
        document.getElementById('highlight-editor').classList.toggle('hidden', showResult);
        document.getElementById('highlight-result-panel').classList.toggle('hidden', !showResult);
        editTab.classList.toggle('active', !showResult);
        resultTab.classList.toggle('active', showResult);
        editTab.setAttribute('aria-selected', String(!showResult));
        resultTab.setAttribute('aria-selected', String(showResult));
    }
    editTab.addEventListener('click', () => selectTab(false));
    resultTab.addEventListener('click', () => selectTab(true));
    editor.value = localStorage.getItem('highlightCode') || HIGHLIGHT_DEFAULT;
    function showPopup(show) {
        popup.classList.toggle('hidden', !show);
        button.setAttribute('aria-expanded', String(show));
        if (show) (resultTab.getAttribute('aria-selected') === 'true' ? resultTab : editor).focus();
        else button.focus();
    }
    button.addEventListener('click', () => showPopup(popup.classList.contains('hidden')));
    document.getElementById('highlight-close').addEventListener('click', () => showPopup(false));
    popup.addEventListener('keydown', event => { if (event.key === 'Escape') showPopup(false); });
    document.getElementById('highlight-disable').addEventListener('click', () => stopHighlight('비활성화됨'));
    document.getElementById('highlight-apply').addEventListener('click', () => {
        stopHighlight('함수 확인 중...');
        document.getElementById('highlight-result-meta').textContent = '새 로그를 기다리는 중';
        document.getElementById('highlight-result').textContent = '강조 결과가 여기에 표시됩니다.';
        try {
            const code = editor.value;
            const worker = new Worker('highlight-worker.js');
            worker.highlightCode = code;
            highlightWorker = worker;
            worker.onmessage = event => handleHighlightMessage(worker, event.data);
            worker.onerror = event => {
                event.preventDefault();
                if (worker === highlightWorker) stopHighlight('Worker 오류: ' + event.message, true);
            };
            worker.postMessage({ type: 'init', code });
            highlightTimer = setTimeout(() => stopHighlight('함수 준비 시간 초과', true), 1000);
        } catch (error) {
            stopHighlight('Worker 시작 실패: ' + error.message, true);
        }
    });
}

function stopHighlight(message, error = false) {
    if (highlightWorker) highlightWorker.terminate();
    highlightWorker = null;
    highlightReady = false;
    highlightQueue = [];
    highlightPending = null;
    clearTimeout(highlightTimer);
    highlightTimer = null;
    const status = document.getElementById('highlight-status');
    status.textContent = message;
    status.classList.toggle('error', error);
    document.getElementById('highlight-btn').classList.remove('active');
    setHighlightButtonState(false);
}

function setHighlightButtonState(enabled) {
    for (const [id, active] of [['highlight-apply', enabled], ['highlight-disable', !enabled]]) {
        const button = document.getElementById(id);
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    }
}

function handleHighlightMessage(worker, message) {
    if (worker !== highlightWorker) return;
    clearTimeout(highlightTimer);
    highlightTimer = null;
    if (message.type === 'error') return stopHighlight('함수 오류: ' + message.message, true);
    if (message.type === 'ready') {
        highlightReady = true;
        localStorage.setItem('highlightCode', worker.highlightCode);
        document.getElementById('highlight-status').textContent = '적용 중: 새 RX/TX 로그';
        document.getElementById('highlight-btn').classList.add('active');
        setHighlightButtonState(true);
        return;
    }
    if (message.type !== 'result' || !highlightPending || message.id !== highlightPending.id) return;
    const { log, text, mode } = highlightPending;
    const ranges = normalizeHighlightRanges(message.ranges, text.length);
    log.highlight = { mode, ranges };
    if (ranges.length) {
        const result = document.getElementById('highlight-result');
        result.replaceChildren();
        for (const range of ranges) {
            const mark = document.createElement('mark');
            mark.textContent = text.slice(range.start, range.end);
            result.append(mark);
        }
        document.getElementById('highlight-result-meta').textContent = `[${log.timestamp}] ${log.type.toUpperCase()} · ${mode.toUpperCase()}`;
    }
    if (log.renderedContent && log.renderedContent.isConnected && displayMode === mode) {
        renderHighlightContent(log.renderedContent, text, ranges);
    }
    highlightPending = null;
    runNextHighlight();
}

function queueHighlight(log) {
    if (!highlightReady) return;
    if (highlightQueue.length >= 500) return stopHighlight('처리 대기 로그가 너무 많아 비활성화되었습니다.', true);
    const mode = displayMode;
    const text = mode === 'ascii' ? bytesToAscii(log.data) : mode === 'hex' ? bytesToHex(log.data) : formatBoth(log.data);
    highlightQueue.push({ id: ++highlightNextId, log, text, mode });
    runNextHighlight();
}

function runNextHighlight() {
    if (!highlightReady || highlightPending || !highlightQueue.length) return;
    highlightPending = highlightQueue.shift();
    highlightWorker.postMessage({ type: 'run', id: highlightPending.id, text: highlightPending.text, direction: highlightPending.log.type });
    highlightTimer = setTimeout(() => stopHighlight('함수 실행 시간 초과 (1초)', true), 1000);
}

function normalizeHighlightRanges(ranges, length) {
    if (!Array.isArray(ranges)) return [];
    const valid = ranges.slice(0, 1000).filter(range => range && Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end > range.start && range.end <= length)
        .map(({ start, end }) => ({ start, end })).sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];
    for (const range of valid) {
        const last = merged[merged.length - 1];
        if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
        else merged.push(range);
    }
    return merged;
}

function renderHighlightContent(element, text, ranges) {
    element.replaceChildren();
    let position = 0;
    for (const range of ranges) {
        element.append(document.createTextNode(text.slice(position, range.start)));
        const mark = document.createElement('mark');
        mark.textContent = text.slice(range.start, range.end);
        element.append(mark);
        position = range.end;
    }
    element.append(document.createTextNode(text.slice(position)));
}
