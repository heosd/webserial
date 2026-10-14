let fileHandle = null;
let accessHandle = null;
let offset = 0;
let fileName = 'webserial-opfs-test.log';
let encoder = new TextEncoder();
let appendCount = 0;
let flushTimer = null;
let commitPromise = null;
let pendingText = '';
const FLUSH_EVERY_APPENDS = 50;
const FLUSH_INTERVAL_MS = 1000;

self.onmessage = async event => {
    const message = event.data || {};

    try {
        if (message.action === 'start') {
            await startLog(message.fileName);
            respond(message.id, true);
        } else if (message.action === 'append') {
            appendLog(message.text || '');
        } else if (message.action === 'flush') {
            flushLog();
            respond(message.id, true);
        } else if (message.action === 'stop') {
            await stopLog();
            respond(message.id, true);
        }
    } catch (error) {
        respond(message.id, false, null, error);
    }
};

async function startLog(nextFileName) {
    if (commitPromise) {
        await commitPromise;
    }

    if (accessHandle) return;

    fileName = nextFileName || fileName;
    await openAccessHandle();
    appendPendingText();
    startFlushTimer();
}

async function openAccessHandle() {
    const root = await navigator.storage.getDirectory();
    fileHandle = await root.getFileHandle(fileName, { create: true });

    if (!fileHandle.createSyncAccessHandle) {
        throw new Error('OPFS SyncAccessHandle is not supported in this browser.');
    }

    accessHandle = await fileHandle.createSyncAccessHandle();
    offset = accessHandle.getSize();
    appendCount = 0;
}

function appendLog(text) {
    if (text === '') return;

    if (!accessHandle) {
        pendingText += text;
        return;
    }

    const bytes = encoder.encode(text);
    accessHandle.write(bytes, { at: offset });
    offset += bytes.byteLength;
    appendCount += 1;

    if (appendCount >= FLUSH_EVERY_APPENDS) {
        flushLog();
    }
}

function appendPendingText() {
    if (!pendingText || !accessHandle) return;

    const text = pendingText;
    pendingText = '';
    appendLog(text);
}

function flushLog() {
    if (!accessHandle) return;

    accessHandle.flush();
    appendCount = 0;
}

function startFlushTimer() {
    if (flushTimer) return;

    flushTimer = setInterval(() => {
        commitLog();
    }, FLUSH_INTERVAL_MS);
}

function stopFlushTimer() {
    if (!flushTimer) return;

    clearInterval(flushTimer);
    flushTimer = null;
}

async function stopLog() {
    stopFlushTimer();

    if (commitPromise) {
        await commitPromise;
    }

    appendPendingText();
    if (!accessHandle) return;

    flushLog();
    accessHandle.close();
    accessHandle = null;
    fileHandle = null;
}

function commitLog() {
    if (commitPromise || !accessHandle) return commitPromise;

    commitPromise = (async () => {
        flushLog();
        accessHandle.close();
        accessHandle = null;
        fileHandle = null;
        await openAccessHandle();
        appendPendingText();
    })().finally(() => {
        commitPromise = null;
    });

    return commitPromise;
}

function respond(id, ok, result = null, error = null) {
    if (id === undefined || id === null) return;

    self.postMessage({
        type: 'response',
        id,
        ok,
        result,
        error: error ? error.message : null
    });
}
