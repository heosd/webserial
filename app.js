// Global state variables
let port = null;
let reader = null;
let writer = null;
let keepReading = false;
let logHistory = []; // Array of { type: 'tx'|'rx'|'sys', timestamp: string, data: Uint8Array, text: string }
let displayMode = 'ascii'; // 'ascii', 'hex', or 'both'
let reconnectCancelled = false;
let commandHistory = [];
let historyIndex = -1;
let isLooping = false;
let stopLoopRequested = false;
let isStreamingLog = false;
let streamLogFileHandle = null;
let streamLogWriteChain = Promise.resolve();
const DEFAULT_MAX_LOG_HISTORY = 1500;
let maxLogHistory = DEFAULT_MAX_LOG_HISTORY;

// DOM Elements
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const connectBtn = document.getElementById('connect-btn');
const baudrateSelect = document.getElementById('baudrate-select');
const customBaudrateInput = document.getElementById('custom-baudrate-input');
const toggleAdvancedBtn = document.getElementById('toggle-advanced-btn');
const advancedSettingsPanel = document.getElementById('advanced-settings');
const autoReconnectCheckbox = document.getElementById('auto-reconnect-checkbox');

// Serial Options
const databitsSelect = document.getElementById('databits-select');
const stopbitsSelect = document.getElementById('stopbits-select');
const paritySelect = document.getElementById('parity-select');
const flowcontrolSelect = document.getElementById('flowcontrol-select');

// Device Info Elements
const deviceInfoName = document.getElementById('device-info-name');
const deviceInfoVid = document.getElementById('device-info-vid');
const deviceInfoPid = document.getElementById('device-info-pid');

// Terminal Elements
const terminalConsole = document.getElementById('terminal-console');
const maxLogHistoryInput = document.getElementById('max-log-history-input');
const autoscrollCheckbox = document.getElementById('autoscroll-checkbox');
const showTimeCheckbox = document.getElementById('show-time-checkbox');
const showSystemCheckbox = document.getElementById('show-system-checkbox');
const clearLogBtn = document.getElementById('clear-log-btn');
const exportLogBtn = document.getElementById('export-log-btn');
const streamLogBtn = document.getElementById('stream-log-btn');
const modeAscii = document.getElementById('mode-ascii');
const modeHex = document.getElementById('mode-hex');
const modeBoth = document.getElementById('mode-both');

// Command Input Elements
const crCheckbox = document.getElementById('cr-checkbox');
const lfCheckbox = document.getElementById('lf-checkbox');
const hexSendCheckbox = document.getElementById('hex-send-checkbox');
const cmdInput = document.getElementById('cmd-input');
const sendBtn = document.getElementById('send-btn');
const batchBtn = document.getElementById('batch-btn');
const loopBtn = document.getElementById('loop-btn');
const sendForm = document.getElementById('send-form');
const charCounter = document.getElementById('char-counter');

// Batch & Loop Config Elements
const delimiterInput = document.getElementById('delimiter-input');
const commandDelayInput = document.getElementById('command-delay-input');
const loopDelayInput = document.getElementById('loop-delay-input');

// Presets
const addPresetGroup = document.getElementById('add-preset-group');
const addPresetCmd = document.getElementById('add-preset-cmd');
const addPresetBtn = document.getElementById('add-preset-btn');
const dynamicPresetsContainer = document.getElementById('dynamic-presets');
const presetContextMenu = document.getElementById('preset-context-menu');
let draggedPreset = null;
let draggedGroup = null;
let contextPreset = null;

// Overlay & Toast
const toast = document.getElementById('toast');
const reconnectOverlay = document.getElementById('reconnect-overlay');
const cancelReconnectBtn = document.getElementById('cancel-reconnect-btn');

// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
    // Check Web Serial support
    if (!navigator.serial) {
        showWebSerialUnsupported();
    }

    // Load configurations from localStorage
    loadSettings();
    loadPresets();
    
    // Register UI listeners
    setupEventListeners();
    setupCollapsibleCards();

    if (navigator.serial) {
        // Attempt Auto-reconnect
        await tryAutoReconnect();
    }
});

// Display critical unsupported error if browser doesn't have Web Serial API
function showWebSerialUnsupported() {
    connectBtn.disabled = true;
    connectBtn.textContent = 'Web Serial 미지원 브라우저';
    cmdInput.placeholder = 'Web Serial API를 지원하지 않는 브라우저입니다.';
    cmdInput.disabled = false;
    sendBtn.disabled = false;
    batchBtn.disabled = false;
    loopBtn.disabled = false;
    
    terminalConsole.innerHTML = `
        <div class="console-placeholder" style="color: var(--color-danger); text-align: center; flex-direction: column; gap: 15px; padding: 20px;">
            <span style="font-size: 3rem;">⚠️</span>
            <div style="font-size: 1.1rem; font-weight: bold;">Web Serial API 지원 안 됨</div>
            <div style="font-size: 0.9rem; line-height: 1.6; max-width: 500px;">
                현재 브라우저에서는 Web Serial API를 지원하지 않습니다. 
                이 서비스는 기기의 시리얼 포트와 통신하기 위해 Chromium 기반 브라우저가 필요합니다.
                <br><br>
                <strong>권장 브라우저:</strong> Chrome, Edge, Opera, Whale 등 최신 버전
            </div>
        </div>
    `;
    
    showToast('Web Serial API를 지원하지 않는 브라우저입니다.', 5000);
}

// --- Event Listeners Setup ---

function setupEventListeners() {
    // Baudrate Change
    baudrateSelect.addEventListener('change', () => {
        if (baudrateSelect.value === 'custom') {
            customBaudrateInput.classList.remove('hidden');
            customBaudrateInput.focus();
        } else {
            customBaudrateInput.classList.add('hidden');
        }
        saveSettings();
    });
    
    customBaudrateInput.addEventListener('input', saveSettings);
    autoReconnectCheckbox.addEventListener('change', saveSettings);
    
    // Toggle Advanced Settings
    toggleAdvancedBtn.addEventListener('click', () => {
        if (advancedSettingsPanel.classList.contains('hidden')) {
            advancedSettingsPanel.classList.remove('hidden');
            toggleAdvancedBtn.textContent = '▲ 고급 설정 숨기기';
        } else {
            advancedSettingsPanel.classList.add('hidden');
            toggleAdvancedBtn.textContent = '▼ 고급 설정 표시';
        }
    });
    
    // Connect Button
    connectBtn.addEventListener('click', handleManualConnect);
    
    // Display Mode Buttons (ASCII, HEX, BOTH)
    modeAscii.addEventListener('click', () => setDisplayMode('ascii'));
    modeHex.addEventListener('click', () => setDisplayMode('hex'));
    modeBoth.addEventListener('click', () => setDisplayMode('both'));
    
    // Log controls
    maxLogHistoryInput.addEventListener('change', handleMaxLogHistoryChange);
    maxLogHistoryInput.addEventListener('blur', handleMaxLogHistoryChange);
    maxLogHistoryInput.addEventListener('contextmenu', resetMaxLogHistoryToDefault);
    showTimeCheckbox.addEventListener('change', () => {
        saveSettings();
        rebuildTerminalDOM();
    });
    showSystemCheckbox.addEventListener('change', () => {
        saveSettings();
        rebuildTerminalDOM();
    });
    clearLogBtn.addEventListener('click', clearLogs);
    exportLogBtn.addEventListener('click', exportLogs);
    streamLogBtn.addEventListener('click', toggleStreamLog);
    
    // Command sending form
    sendForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendCommand();
    });
    
    // Command History (Up/Down arrow keys) and Character Counter
    cmdInput.addEventListener('keydown', handleInputKeydown);
    cmdInput.addEventListener('input', updateCharCounter);
    
    // Custom Preset addition
    addPresetBtn.addEventListener('click', addCustomPreset);
    addPresetCmd.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        addCustomPreset();
    });
    document.addEventListener('click', hidePresetContextMenu);
    presetContextMenu.addEventListener('click', handlePresetContextAction);
    
    // Batch & Loop button events
    batchBtn.addEventListener('click', handleBatchSend);
    loopBtn.addEventListener('click', handleLoopToggle);

    // Batch & Loop Config input events
    delimiterInput.addEventListener('input', saveSettings);
    commandDelayInput.addEventListener('input', saveSettings);
    loopDelayInput.addEventListener('input', saveSettings);
    
    // Cancel Reconnect
    cancelReconnectBtn.addEventListener('click', () => {
        reconnectCancelled = true;
        reconnectOverlay.classList.add('hidden');
        showToast('자동 재연결이 취소되었습니다.');
    });
    
    // Listen for device connect/disconnect events
    if (navigator.serial) {
        navigator.serial.addEventListener('connect', (e) => {
            showToast('새로운 시리얼 장치가 감지되었습니다.');
            addSystemLog('시리얼 장치가 포트에 연결되었습니다.');
            
            // If auto reconnect is enabled, check if this is the one
            if (autoReconnectCheckbox.checked && !port) {
                tryAutoReconnect();
            }
        });
        
        navigator.serial.addEventListener('disconnect', (e) => {
            showToast('시리얼 장치 연결이 해제되었습니다.');
            addSystemLog('시리얼 장치 연결이 해제되었습니다.');
            
            // If the active port is disconnected, close it gracefully
            if (port && e.target === port) {
                handleDisconnect();
            }
        });
    }
}

function setupCollapsibleCards() {
    document.querySelectorAll('.sidebar-panel .card[data-collapse-key]').forEach(card => {
        const title = card.querySelector('.card-title');
        if (!title) return;

        if (card.dataset.collapseKey === 'quick-command-send') {
            setupQuickCommandCardToggle(card, title);
            return;
        }

        const storageKey = `cardCollapsed:${card.dataset.collapseKey}`;
        const isCollapsed = localStorage.getItem(storageKey) === 'true';

        title.setAttribute('role', 'button');
        title.setAttribute('tabindex', '0');
        title.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        card.classList.toggle('collapsed', isCollapsed);

        const toggleCard = () => {
            const nextCollapsed = !card.classList.contains('collapsed');
            card.classList.toggle('collapsed', nextCollapsed);
            title.setAttribute('aria-expanded', nextCollapsed ? 'false' : 'true');
            localStorage.setItem(storageKey, nextCollapsed ? 'true' : 'false');
        };

        title.addEventListener('click', toggleCard);
        title.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;

            event.preventDefault();
            toggleCard();
        });
    });
}

function setupQuickCommandCardToggle(card, title) {
    const storageKey = 'cardCollapsed:quick-command-send';
    const legacyCollapsed = localStorage.getItem('cardCollapsed:quick-command-send') === 'true';
    const savedState = localStorage.getItem('cardState:quick-command-send');
    let isCollapsed = savedState ? savedState === 'collapsed' : legacyCollapsed;

    const applyState = collapsed => {
        card.classList.toggle('collapsed', collapsed);
        card.classList.toggle('quick-expanded', !collapsed);
        title.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        localStorage.setItem(storageKey, collapsed ? 'true' : 'false');
        localStorage.removeItem('cardState:quick-command-send');
    };

    title.setAttribute('role', 'button');
    title.setAttribute('tabindex', '0');
    applyState(isCollapsed);

    const toggleCard = () => {
        isCollapsed = !isCollapsed;
        applyState(isCollapsed);
    };

    title.addEventListener('click', toggleCard);
    title.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;

        event.preventDefault();
        toggleCard();
    });
}

// --- Serial Connection Logic ---

async function handleManualConnect() {
    if (port) {
        // Active port exists, so click means Disconnect
        await handleDisconnect();
        return;
    }
    
    // Ask user to pick a port
    try {
        const selectedPort = await navigator.serial.requestPort();
        const baudRate = getSelectedBaudRate();
        
        await connectToPort(selectedPort, baudRate);
        showToast('장치에 성공적으로 연결되었습니다.');
    } catch (error) {
        console.error('Connection request failed:', error);
        if (error.name !== 'NotFoundError') {
            showToast('연결 오류: ' + error.message);
            addSystemLog('포트 연결 실패: ' + error.message);
        }
    }
}

async function connectToPort(selectedPort, baudRate) {
    // Disable inputs during connection transition
    connectBtn.disabled = true;
    connectBtn.textContent = '연결 중...';
    
    try {
        const options = {
            baudRate: baudRate,
            dataBits: parseInt(databitsSelect.value, 10),
            stopBits: parseInt(stopbitsSelect.value, 10),
            parity: paritySelect.value,
            flowControl: flowcontrolSelect.value
        };
        
        // Open port
        await selectedPort.open(options);
        
        port = selectedPort;
        keepReading = true;
        
        // Save successfully connected port credentials
        const info = port.getInfo();
        localStorage.setItem('lastUsbVendorId', info.usbVendorId || '');
        localStorage.setItem('lastUsbProductId', info.usbProductId || '');
        localStorage.setItem('lastBaudRate', baudRate);
        
        // Update connection status details in UI
        updateUIConnected();
        
        // Read loop in background
        readLoop();
        
        addSystemLog(`연결 성공! 포트 열림 (속도: ${baudRate} bps, ${options.dataBits}-${options.parity}-${options.stopBits})`);
        
    } catch (error) {
        // Set everything back to disconnected status
        port = null;
        updateUIDisconnected();
        throw error;
    }
}

async function handleDisconnect() {
    keepReading = false;
    
    // Cancel any active read streams
    if (reader) {
        try {
            await reader.cancel();
        } catch (e) {
            console.error('Error cancelling reader:', e);
        }
    }
    
    if (port) {
        try {
            await port.close();
        } catch (error) {
            console.error('Error closing port:', error);
            addSystemLog('포트 닫기 오류: ' + error.message);
        }
    }
    
    port = null;
    reader = null;
    writer = null;
    
    updateUIDisconnected();
    addSystemLog('시리얼 포트 연결이 해제되었습니다.');
    showToast('연결이 해제되었습니다.');
}

async function tryAutoReconnect() {
    if (!navigator.serial) return;
    
    const autoReconnect = autoReconnectCheckbox.checked;
    if (!autoReconnect) return;
    
    const lastVid = localStorage.getItem('lastUsbVendorId');
    const lastPid = localStorage.getItem('lastUsbProductId');
    const lastBaud = localStorage.getItem('lastBaudRate') || '9600';
    
    let ports = [];
    try {
        ports = await navigator.serial.getPorts();
    } catch (e) {
        console.error('Error fetching authorized ports:', e);
        return;
    }
    
    if (ports.length === 0) return;
    
    let targetPort = null;
    
    // Find matching authorized port
    if (lastVid || lastPid) {
        targetPort = ports.find(p => {
            const info = p.getInfo();
            return String(info.usbVendorId) === lastVid && String(info.usbProductId) === lastPid;
        });
    }
    
    // Fallback: if there's only 1 authorized port, try that
    if (!targetPort && ports.length > 0) {
        // If last USB credentials match nothing but we only have 1 approved port, auto-connect to it
        targetPort = ports[0];
    }
    
    if (targetPort) {
        reconnectCancelled = false;
        reconnectOverlay.classList.remove('hidden');
        
        // Small delay to allow UI refresh
        await new Promise(resolve => setTimeout(resolve, 600));
        
        if (reconnectCancelled) return;
        
        try {
            await connectToPort(targetPort, parseInt(lastBaud, 10));
            showToast('장치에 자동으로 재연결되었습니다.');
        } catch (error) {
            console.error('Auto-reconnect failed:', error);
            showToast('자동 재연결 실패');
            addSystemLog('자동 재연결 실패: ' + error.message);
        } finally {
            reconnectOverlay.classList.add('hidden');
        }
    }
}

// --- Data Reading Loop ---

async function readLoop() {
    let packetBuffer = [];
    let packetTimer = null;
    
    function flushPacket() {
        if (packetBuffer.length === 0) return;
        const data = new Uint8Array(packetBuffer);
        packetBuffer = [];
        addLog('rx', data);
    }
    
    try {
        while (port && port.readable && keepReading) {
            reader = port.readable.getReader();
            try {
                while (keepReading) {
                    const { value, done } = await reader.read();
                    if (done) {
                        break;
                    }
                    if (value && value.length > 0) {
                        if (packetTimer) {
                            clearTimeout(packetTimer);
                        }
                        
                        // Buffer bytes
                        for (let i = 0; i < value.length; i++) {
                            packetBuffer.push(value[i]);
                        }
                        
                        // Check for natural terminations to flush instantly, otherwise timeout bundle
                        const lastByte = value[value.length - 1];
                        if (lastByte === 10) { // Newline (\n)
                            flushPacket();
                        } else {
                            // Wait 40ms of silence before flushing (groups serial packets beautifully)
                            packetTimer = setTimeout(() => {
                                flushPacket();
                            }, 40);
                        }
                    }
                }
            } catch (error) {
                console.error('Read buffer error:', error);
                if (keepReading) {
                    addSystemLog('데이터 수신 오류: ' + error.message);
                }
            } finally {
                reader.releaseLock();
            }
        }
    } catch (error) {
        console.error('Reader loop critical error:', error);
    } finally {
        flushPacket();
    }
}

// --- Data Writing Logic ---

async function sendCommand() {
    const rawVal = cmdInput.value;
    if (rawVal === '') return;
    
    // Add to history
    commandHistory.push(rawVal);
    // Limit history length to 50
    if (commandHistory.length > 50) {
        commandHistory.shift();
    }
    historyIndex = commandHistory.length;
    
    let bytesToSend;
    
    try {
        if (hexSendCheckbox.checked) {
            // Hex send mode - parse space-separated bytes
            bytesToSend = parseHexString(rawVal);
        } else {
            // Text send mode - encode as UTF-8
            bytesToSend = new TextEncoder().encode(rawVal);
        }
        
        // Append \r and/or \n if checked
        const additions = [];
        if (crCheckbox.checked) additions.push(13); // \r (CR)
        if (lfCheckbox.checked) additions.push(10); // \n (LF)
        
        if (additions.length > 0) {
            const combined = new Uint8Array(bytesToSend.length + additions.length);
            combined.set(bytesToSend);
            combined.set(new Uint8Array(additions), bytesToSend.length);
            bytesToSend = combined;
        }
        
        if (port && port.writable) {
            // Write to port
            writer = port.writable.getWriter();
            await writer.write(bytesToSend);
            writer.releaseLock();
            writer = null;
        } else {
            addSystemLog('Test mode: no serial port connected, TX logged only.');
        }
        
        // Add send log
        addLog('tx', bytesToSend);
        
        // Reset command input
        cmdInput.value = '';
        updateCharCounter();
        
    } catch (error) {
        console.error('Send error:', error);
        showToast('전송 실패: ' + error.message);
        addSystemLog('데이터 전송 실패: ' + error.message);
        
        if (writer) {
            writer.releaseLock();
            writer = null;
        }
    }
}

async function sendRawCommandString(cmdString) {
    try {
        let bytes = new TextEncoder().encode(cmdString);
        
        const additions = [];
        if (crCheckbox.checked) additions.push(13);
        if (lfCheckbox.checked) additions.push(10);
        
        if (additions.length > 0) {
            const combined = new Uint8Array(bytes.length + additions.length);
            combined.set(bytes);
            combined.set(new Uint8Array(additions), bytes.length);
            bytes = combined;
        }
        
        if (port && port.writable) {
            writer = port.writable.getWriter();
            await writer.write(bytes);
            writer.releaseLock();
            writer = null;
        } else {
            addSystemLog('Test mode: no serial port connected, TX logged only.');
        }
        
        addLog('tx', bytes);
    } catch (error) {
        console.error('Quick send error:', error);
        showToast('전송 실패: ' + error.message);
        
        if (writer) {
            writer.releaseLock();
            writer = null;
        }
    }
}

// --- Batch & Loop Command Logic ---

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function setCommandControlsDisabled(disabled) {
    cmdInput.disabled = disabled;
    sendBtn.disabled = disabled;
    batchBtn.disabled = disabled;
    
    // During loop mode, loopBtn must stay enabled so the user can click "Stop"
    if (!isLooping) {
        loopBtn.disabled = disabled;
    }
}

async function executeBatch(commandText) {
    if (commandText.trim() === '') return false;
    
    const delim = delimiterInput.value || ',';
    const commands = commandText.split(delim);
    const cmdDelay = parseInt(commandDelayInput.value, 10) || 0;
    
    for (let i = 0; i < commands.length; i++) {
        if (stopLoopRequested) {
            break;
        }
        
        const cmd = commands[i].trim();
        if (cmd === '') continue;
        
        let bytesToSend;
        try {
            if (hexSendCheckbox.checked) {
                bytesToSend = parseHexString(cmd);
            } else {
                bytesToSend = new TextEncoder().encode(cmd);
            }
            
            // Append \r and/or \n if checked
            const additions = [];
            if (crCheckbox.checked) additions.push(13); // \r (CR)
            if (lfCheckbox.checked) additions.push(10); // \n (LF)
            
            if (additions.length > 0) {
                const combined = new Uint8Array(bytesToSend.length + additions.length);
                combined.set(bytesToSend);
                combined.set(new Uint8Array(additions), bytesToSend.length);
                bytesToSend = combined;
            }
            
            if (port && port.writable) {
                // Write to port
                writer = port.writable.getWriter();
                await writer.write(bytesToSend);
                writer.releaseLock();
                writer = null;
            } else {
                addSystemLog('Test mode: no serial port connected, TX logged only.');
            }
            
            // Add send log
            addLog('tx', bytesToSend);
            
        } catch (error) {
            console.error('Batch send item error:', error);
            showToast('전송 실패: ' + error.message);
            addSystemLog('배치 전송 중 실패: ' + error.message);
            if (writer) {
                writer.releaseLock();
                writer = null;
            }
            return false;
        }
        
        // Delay between commands (except after the last one)
        if (i < commands.length - 1 && cmdDelay > 0) {
            // Sleep in small increments to allow rapid cancel response
            const sleepChunks = Math.ceil(cmdDelay / 20);
            for (let chunk = 0; chunk < sleepChunks; chunk++) {
                if (stopLoopRequested) break;
                await sleep(Math.min(20, cmdDelay - (chunk * 20)));
            }
        }
    }
    
    return true;
}

async function handleBatchSend() {
    const rawVal = cmdInput.value;
    if (rawVal === '') return;
    
    // Add to history
    commandHistory.push(rawVal);
    if (commandHistory.length > 50) commandHistory.shift();
    historyIndex = commandHistory.length;
    
    // Disable inputs during batch run to prevent double-sends
    setCommandControlsDisabled(true);
    stopLoopRequested = false;
    
    addSystemLog('배치 전송 시작...');
    const success = await executeBatch(rawVal);
    
    if (success) {
        addSystemLog('배치 전송 완료.');
        cmdInput.value = '';
        updateCharCounter();
    } else {
        addSystemLog('배치 전송이 중단되었습니다.');
    }
    
    setCommandControlsDisabled(false);
}

function handleLoopToggle() {
    if (isLooping) {
        // Stop Loop
        stopLoopRequested = true;
        isLooping = false;
        loopBtn.textContent = 'Loop';
        loopBtn.className = 'btn btn-secondary';
        addSystemLog('루프 정지 요청됨. 현재 배치 전송이 끝나면 중지됩니다.');
        showToast('루프 정지 요청됨');
    } else {
        // Start Loop
        const rawVal = cmdInput.value;
        if (rawVal === '') {
            showToast('전송할 명령어를 입력하세요.');
            return;
        }
        
        // Add to history
        commandHistory.push(rawVal);
        if (commandHistory.length > 50) commandHistory.shift();
        historyIndex = commandHistory.length;
        
        isLooping = true;
        stopLoopRequested = false;
        
        loopBtn.textContent = 'Stop';
        loopBtn.className = 'btn btn-danger';
        
        setCommandControlsDisabled(true);
        addSystemLog('루프 전송 시작...');
        
        runLoopSequence(rawVal);
    }
}

async function runLoopSequence(commandText) {
    const loopDelay = parseInt(loopDelayInput.value, 10) || 1000;
    
    while (isLooping && !stopLoopRequested) {
        const success = await executeBatch(commandText);
        if (!success || stopLoopRequested) {
            break;
        }
        
        // Wait for loop delay before next run
        if (loopDelay > 0) {
            const sleepChunks = Math.ceil(loopDelay / 50);
            for (let chunk = 0; chunk < sleepChunks; chunk++) {
                if (stopLoopRequested) break;
                await sleep(Math.min(50, loopDelay - (chunk * 50)));
            }
        }
    }
    
    // Loop ended
    stopLoop();
}

function stopLoop() {
    isLooping = false;
    stopLoopRequested = false;
    
    loopBtn.textContent = 'Loop';
    loopBtn.className = 'btn btn-secondary';
    
    setCommandControlsDisabled(false);
    addSystemLog('루프 전송이 중지되었습니다.');
    showToast('루프 전송 정지 완료');
}

// --- Text Utility & Conversions ---

function parseHexString(hexString) {
    // Strip space/commas and standard hex formatting prefixes (like 0x)
    const cleaned = hexString.replace(/\s+/g, '').replace(/0x/gi, '').replace(/,/g, '');
    
    if (cleaned.length % 2 !== 0) {
        throw new Error('올바르지 않은 HEX 바이트 쌍 개수입니다. (홀수 문자 수)');
    }
    
    if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
        throw new Error('HEX 문자열은 0-9, a-f 문자만 포함할 수 있습니다.');
    }
    
    const bytes = new Uint8Array(cleaned.length / 2);
    for (let i = 0; i < cleaned.length; i += 2) {
        bytes[i / 2] = parseInt(cleaned.substr(i, 2), 16);
    }
    return bytes;
}

function bytesToHex(bytes) {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
}

function bytesToAscii(bytes) {
    try {
        const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        return decoded;
    } catch (e) {
        // Fallback to manual byte mappings for safety
        return Array.from(bytes)
            .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
            .join('');
    }
}

function formatBoth(bytes) {
    const hex = bytesToHex(bytes);
    
    // Render clean ASCII representation of control/binary chars
    let ascii = '';
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b >= 32 && b <= 126) {
            ascii += String.fromCharCode(b);
        } else if (b === 13) {
            ascii += '\\r';
        } else if (b === 10) {
            ascii += '\\n';
        } else if (b === 9) {
            ascii += '\\t';
        } else {
            ascii += '.'; // Non-printable marker
        }
    }
    return `${hex.padEnd(24, ' ')}  [${ascii}]`;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

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
    updateStreamLogButton();

    try {
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
    streamLogBtn.textContent = isStreamingLog ? 'Stop stream' : 'Stream log';
}

function appendLogToStream(log) {
    if (!isStreamingLog || !streamLogFileHandle) return;

    const line = formatLogLine(log);
    if (line === '') return;

    streamLogWriteChain = streamLogWriteChain
        .catch(() => {})
        .then(() => appendTextToStreamFile(line));
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

// --- UI State Management Utilities ---

function getTimestamp() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss}.${ms}`;
}

function getSelectedBaudRate() {
    if (baudrateSelect.value === 'custom') {
        const val = parseInt(customBaudrateInput.value, 10);
        return isNaN(val) || val <= 0 ? 9600 : val;
    }
    return parseInt(baudrateSelect.value, 10);
}

function updateUIConnected() {
    // Dot Status
    statusDot.className = 'status-dot connected';
    statusText.textContent = '연결 완료';
    
    // Connect button
    connectBtn.className = 'btn btn-primary btn-block';
    connectBtn.textContent = '장치 연결 끊기';
    connectBtn.disabled = false;
    
    // Command inputs enabled
    cmdInput.disabled = false;
    sendBtn.disabled = false;
    batchBtn.disabled = false;
    loopBtn.disabled = false;
    cmdInput.placeholder = '전송할 명령어를 입력하세요...';
    cmdInput.focus();
    
    // Parse device details
    const info = port.getInfo();
    deviceInfoName.textContent = getUSBFriendlyName(info);
    deviceInfoVid.textContent = info.usbVendorId ? `0x${info.usbVendorId.toString(16).toUpperCase()}` : 'N/A';
    deviceInfoPid.textContent = info.usbProductId ? `0x${info.usbProductId.toString(16).toUpperCase()}` : 'N/A';
}

function updateUIDisconnected() {
    // Reset loop state if connected was lost
    if (isLooping) {
        isLooping = false;
        stopLoopRequested = true;
        loopBtn.textContent = 'Loop';
        loopBtn.className = 'btn btn-secondary';
    }

    // Dot Status
    statusDot.className = 'status-dot disconnected';
    statusText.textContent = '연결 없음';
    
    // Connect button
    connectBtn.className = 'btn btn-primary btn-block';
    connectBtn.textContent = '포트 연결하기';
    connectBtn.disabled = false;
    
    // Command inputs stay enabled so commands can be tested without a serial port
    cmdInput.disabled = false;
    sendBtn.disabled = false;
    batchBtn.disabled = false;
    loopBtn.disabled = false;
    cmdInput.placeholder = '전송할 명령어를 입력하세요...';
    
    // Reset device fields
    deviceInfoName.textContent = '-';
    deviceInfoVid.textContent = '-';
    deviceInfoPid.textContent = '-';
}

function getUSBFriendlyName(info) {
    if (!info.usbVendorId) return '가상/알 수 없는 포트';
    
    // Basic lookup for friendly developers
    const vids = {
        0x2341: 'Arduino LLC',
        0x10C4: 'Silicon Labs (CP210x)',
        0x0403: 'FTDI',
        0x1A86: 'Qinheng (CH340/341)',
        0x239A: 'Adafruit',
        0x0525: 'NXP/Freescale',
        0x0483: 'STMicroelectronics'
    };
    
    const manufacturer = vids[info.usbVendorId] || 'USB 시리얼 장치';
    return `${manufacturer}`;
}

function handleInputKeydown(e) {
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (historyIndex > 0) {
            historyIndex--;
            cmdInput.value = commandHistory[historyIndex];
            updateCharCounter();
        }
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex < commandHistory.length - 1) {
            historyIndex++;
            cmdInput.value = commandHistory[historyIndex];
            updateCharCounter();
        } else if (historyIndex === commandHistory.length - 1) {
            historyIndex = commandHistory.length;
            cmdInput.value = '';
            updateCharCounter();
        }
    }
}

function updateCharCounter() {
    const chars = cmdInput.value.length;
    charCounter.textContent = `${chars}자`;
}

function showToast(message, duration = 3000) {
    toast.textContent = message;
    toast.classList.add('show');
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 200);
    }, duration);
}

// --- Local Storage Configurations Persistence ---

function saveSettings() {
    localStorage.setItem('baudRate', baudrateSelect.value);
    localStorage.setItem('customBaudRate', customBaudrateInput.value);
    localStorage.setItem('autoReconnect', autoReconnectCheckbox.checked ? 'true' : 'false');
    localStorage.setItem('dataBits', databitsSelect.value);
    localStorage.setItem('stopBits', stopbitsSelect.value);
    localStorage.setItem('parity', paritySelect.value);
    localStorage.setItem('flowControl', flowcontrolSelect.value);
    localStorage.setItem('crChecked', crCheckbox.checked ? 'true' : 'false');
    localStorage.setItem('lfChecked', lfCheckbox.checked ? 'true' : 'false');
    localStorage.setItem('hexSend', hexSendCheckbox.checked ? 'true' : 'false');
    localStorage.setItem('showTime', showTimeCheckbox.checked ? 'true' : 'false');
    localStorage.setItem('showSystem', showSystemCheckbox.checked ? 'true' : 'false');
    localStorage.setItem('maxLogHistory', String(maxLogHistory));
    localStorage.setItem('delimiter', delimiterInput.value);
    localStorage.setItem('commandDelay', commandDelayInput.value);
    localStorage.setItem('loopDelay', loopDelayInput.value);
}

function loadSettings() {
    const savedBaud = localStorage.getItem('baudRate');
    if (savedBaud) {
        baudrateSelect.value = savedBaud;
        if (savedBaud === 'custom') {
            customBaudrateInput.classList.remove('hidden');
        }
    }
    
    const savedCustomBaud = localStorage.getItem('customBaudRate');
    if (savedCustomBaud) customBaudrateInput.value = savedCustomBaud;
    
    const savedAuto = localStorage.getItem('autoReconnect');
    if (savedAuto) autoReconnectCheckbox.checked = savedAuto === 'true';
    
    const savedData = localStorage.getItem('dataBits');
    if (savedData) databitsSelect.value = savedData;
    
    const savedStop = localStorage.getItem('stopBits');
    if (savedStop) stopbitsSelect.value = savedStop;
    
    const savedParity = localStorage.getItem('parity');
    if (savedParity) paritySelect.value = savedParity;
    
    const savedFlow = localStorage.getItem('flowControl');
    if (savedFlow) flowcontrolSelect.value = savedFlow;
    
    const savedCr = localStorage.getItem('crChecked');
    if (savedCr) crCheckbox.checked = savedCr === 'true';
    
    const savedLf = localStorage.getItem('lfChecked');
    if (savedLf) lfCheckbox.checked = savedLf === 'true';
    
    const savedHexSend = localStorage.getItem('hexSend');
    if (savedHexSend) hexSendCheckbox.checked = savedHexSend === 'true';

    const savedShowTime = localStorage.getItem('showTime');
    if (savedShowTime) showTimeCheckbox.checked = savedShowTime === 'true';

    const savedShowSystem = localStorage.getItem('showSystem');
    if (savedShowSystem) showSystemCheckbox.checked = savedShowSystem === 'true';

    const savedMaxLogHistory = localStorage.getItem('maxLogHistory');
    maxLogHistory = normalizeMaxLogHistory(savedMaxLogHistory || DEFAULT_MAX_LOG_HISTORY);
    maxLogHistoryInput.value = String(maxLogHistory);

    const savedDelim = localStorage.getItem('delimiter');
    if (savedDelim !== null) delimiterInput.value = savedDelim;
    
    const savedCmdDelay = localStorage.getItem('commandDelay');
    if (savedCmdDelay !== null) commandDelayInput.value = savedCmdDelay;
    
    const savedLoopDelay = localStorage.getItem('loopDelay');
    if (savedLoopDelay !== null) loopDelayInput.value = savedLoopDelay;
}

// --- Presets Manager ---

function loadPresets() {
    dynamicPresetsContainer.innerHTML = '';

    getPresetGroups().forEach(group => {
        createPresetGroupUI(group);
    });
}

function getPresetGroups() {
    const savedGroups = parseStoredJson('presetGroups', null);
    if (Array.isArray(savedGroups)) {
        return normalizePresetGroups(savedGroups);
    }

    const oldPresets = parseStoredJson('customPresets', []);
    if (!Array.isArray(oldPresets) || oldPresets.length === 0) {
        return [];
    }

    const migratedGroups = [{
        id: createPresetId('group'),
        name: 'Default',
        collapsed: false,
        items: oldPresets
            .filter(preset => preset && preset.name && preset.cmd)
            .map(preset => ({
                id: createPresetId('preset'),
                name: preset.name,
                cmd: preset.cmd
            }))
    }];

    savePresetGroups(migratedGroups);
    return migratedGroups;
}

function normalizePresetGroups(groups) {
    return groups
        .filter(group => group && typeof group === 'object')
        .map(group => ({
            id: group.id || createPresetId('group'),
            name: String(group.name || 'Default'),
            collapsed: group.collapsed === true,
            items: Array.isArray(group.items)
                ? group.items
                    .filter(item => item && item.name && item.cmd)
                    .map(item => ({
                        id: item.id || createPresetId('preset'),
                        name: String(item.name),
                        cmd: String(item.cmd)
                    }))
                : []
        }));
}

function parseStoredJson(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (error) {
        console.warn(`Failed to parse ${key}:`, error);
        return fallback;
    }
}

function savePresetGroups(groups) {
    localStorage.setItem('presetGroups', JSON.stringify(groups));
}

function createPresetId(prefix) {
    if (window.crypto && crypto.randomUUID) {
        return `${prefix}-${crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function addCustomPreset() {
    const groupName = (addPresetGroup.value.trim() || 'Default');
    const cmd = addPresetCmd.value.trim();
    
    if (cmd === '') {
        showToast('Command is required.');
        return;
    }
    
    const groups = getPresetGroups();
    let group = groups.find(item => item.name === groupName);

    if (!group) {
        group = {
            id: createPresetId('group'),
            name: groupName,
            collapsed: false,
            items: []
        };
        groups.push(group);
    }

    group.items.push({
        id: createPresetId('preset'),
        name: cmd,
        cmd
    });

    savePresetGroups(groups);
    loadPresets();
    
    addPresetGroup.value = groupName;
    addPresetCmd.value = '';
    
    showToast('Preset added.');
}

function createPresetGroupUI(group) {
    const groupEl = document.createElement('div');
    groupEl.className = 'preset-group';
    groupEl.dataset.groupId = group.id;
    groupEl.classList.toggle('collapsed', group.collapsed);

    groupEl.addEventListener('dragover', event => {
        if (!draggedGroup) return;
        event.preventDefault();
        groupEl.classList.add('drag-over');
    });

    groupEl.addEventListener('dragleave', event => {
        if (!groupEl.contains(event.relatedTarget)) {
            groupEl.classList.remove('drag-over');
        }
    });

    groupEl.addEventListener('drop', event => {
        if (!draggedGroup) return;
        event.preventDefault();
        groupEl.classList.remove('drag-over');

        const rect = groupEl.getBoundingClientRect();
        const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        movePresetGroup(draggedGroup.groupId, group.id, position);
    });

    const header = document.createElement('div');
    header.className = 'preset-group-header';

    const dragHandle = document.createElement('span');
    dragHandle.className = 'preset-group-drag-handle';
    dragHandle.draggable = true;
    dragHandle.textContent = '||';
    dragHandle.title = 'Drag group';
    dragHandle.addEventListener('dragstart', event => {
        event.stopPropagation();
        draggedGroup = { groupId: group.id };
        groupEl.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', group.id);
    });
    dragHandle.addEventListener('dragend', event => {
        event.stopPropagation();
        draggedGroup = null;
        groupEl.classList.remove('dragging');
        document.querySelectorAll('.preset-group.drag-over').forEach(item => {
            item.classList.remove('drag-over');
        });
    });

    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'preset-group-toggle';
    collapseBtn.textContent = `${group.name} (${group.items.length})`;
    collapseBtn.setAttribute('aria-expanded', group.collapsed ? 'false' : 'true');
    collapseBtn.addEventListener('click', () => togglePresetGroup(group.id));
    collapseBtn.addEventListener('contextmenu', event => {
        event.preventDefault();
        event.stopPropagation();
        renamePresetGroup(group.id);
    });

    const deleteGroupBtn = document.createElement('button');
    deleteGroupBtn.type = 'button';
    deleteGroupBtn.className = 'preset-group-delete';
    deleteGroupBtn.textContent = 'x';
    deleteGroupBtn.title = 'Delete group';
    deleteGroupBtn.addEventListener('click', event => {
        event.stopPropagation();
        deletePresetGroup(group.id);
    });

    header.addEventListener('dragover', event => {
        event.preventDefault();
        groupEl.classList.add('drag-over');
    });
    header.addEventListener('drop', event => {
        event.preventDefault();
        event.stopPropagation();
        groupEl.classList.remove('drag-over');
        if (draggedGroup) {
            const rect = groupEl.getBoundingClientRect();
            const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
            movePresetGroup(draggedGroup.groupId, group.id, position);
        } else if (draggedPreset) {
            movePresetItem(draggedPreset.groupId, draggedPreset.itemId, group.id);
        }
    });

    const body = document.createElement('div');
    body.className = 'preset-group-body';

    body.addEventListener('dragover', event => {
        if (!draggedPreset) return;
        event.preventDefault();
        event.stopPropagation();
        groupEl.classList.add('drag-over');
    });

    body.addEventListener('dragleave', event => {
        if (!groupEl.contains(event.relatedTarget)) {
            groupEl.classList.remove('drag-over');
        }
    });

    body.addEventListener('drop', event => {
        if (!draggedPreset) return;
        event.preventDefault();
        event.stopPropagation();
        groupEl.classList.remove('drag-over');
        movePresetItem(draggedPreset.groupId, draggedPreset.itemId, group.id);
    });

    group.items.forEach(item => {
        body.appendChild(createPresetItemUI(group.id, item));
    });

    header.appendChild(dragHandle);
    header.appendChild(collapseBtn);
    header.appendChild(deleteGroupBtn);
    groupEl.appendChild(header);
    groupEl.appendChild(body);
    dynamicPresetsContainer.appendChild(groupEl);
}

function createPresetItemUI(groupId, item) {
    const wrapper = document.createElement('div');
    wrapper.className = 'input-inline preset-item';
    wrapper.draggable = true;
    wrapper.dataset.groupId = groupId;
    wrapper.dataset.itemId = item.id;

    wrapper.addEventListener('dragstart', event => {
        event.stopPropagation();
        draggedPreset = { groupId, itemId: item.id };
        wrapper.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', item.id);
    });

    wrapper.addEventListener('dragend', event => {
        event.stopPropagation();
        draggedPreset = null;
        wrapper.classList.remove('dragging');
        document.querySelectorAll('.preset-group.drag-over').forEach(group => {
            group.classList.remove('drag-over');
        });
    });

    wrapper.addEventListener('dragover', event => {
        event.preventDefault();
        event.stopPropagation();
    });

    wrapper.addEventListener('drop', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!draggedPreset) return;

        const rect = wrapper.getBoundingClientRect();
        const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        movePresetItem(draggedPreset.groupId, draggedPreset.itemId, groupId, item.id, position);
    });
    wrapper.addEventListener('contextmenu', event => {
        event.preventDefault();
        showPresetContextMenu(event, groupId, item.id);
    });
    
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary preset-btn';
    btn.textContent = item.name;
    btn.title = `Command: ${item.cmd}`;
    btn.addEventListener('click', () => {
        sendRawCommandString(item.cmd);
    });

    wrapper.appendChild(btn);
    
    return wrapper;
}

function togglePresetGroup(groupId) {
    const groups = getPresetGroups();
    const group = groups.find(item => item.id === groupId);
    if (!group) return;

    group.collapsed = !group.collapsed;
    savePresetGroups(groups);
    loadPresets();
}

function movePresetItem(sourceGroupId, itemId, targetGroupId, targetItemId = null, position = 'after') {
    const groups = getPresetGroups();
    const sourceGroup = groups.find(group => group.id === sourceGroupId);
    const targetGroup = groups.find(group => group.id === targetGroupId);
    if (!sourceGroup || !targetGroup) return;

    const sourceIndex = sourceGroup.items.findIndex(item => item.id === itemId);
    if (sourceIndex === -1) return;

    const [movedItem] = sourceGroup.items.splice(sourceIndex, 1);

    let targetIndex = targetItemId
        ? targetGroup.items.findIndex(item => item.id === targetItemId)
        : targetGroup.items.length;

    if (targetIndex === -1) {
        targetIndex = targetGroup.items.length;
    } else if (position === 'after') {
        targetIndex += 1;
    }

    targetGroup.items.splice(targetIndex, 0, movedItem);
    savePresetGroups(groups);
    loadPresets();
}

function movePresetGroup(sourceGroupId, targetGroupId, position = 'after') {
    if (sourceGroupId === targetGroupId) return;

    const groups = getPresetGroups();
    const sourceIndex = groups.findIndex(group => group.id === sourceGroupId);
    if (sourceIndex === -1) return;

    const [movedGroup] = groups.splice(sourceIndex, 1);
    let targetIndex = groups.findIndex(group => group.id === targetGroupId);

    if (targetIndex === -1) {
        targetIndex = groups.length;
    } else if (position === 'after') {
        targetIndex += 1;
    }

    groups.splice(targetIndex, 0, movedGroup);
    savePresetGroups(groups);
    loadPresets();
}

function deletePresetGroup(groupId) {
    let groups = getPresetGroups();
    const group = groups.find(item => item.id === groupId);
    if (!group) return;

    if (group.items.length > 0) {
        if (!confirm(`"${group.name}" group의 명령어 ${group.items.length}개를 모두 삭제할까요?`)) {
            return;
        }

        group.items = [];
    } else {
        if (!confirm(`"${group.name}" group을 삭제할까요?`)) {
            return;
        }

        groups = groups.filter(item => item.id !== groupId);
    }

    savePresetGroups(groups);
    loadPresets();
    showToast('Group updated.');
}

function renamePresetGroup(groupId) {
    const groups = getPresetGroups();
    const group = groups.find(item => item.id === groupId);
    if (!group) return;

    const nextName = prompt('새 그룹 이름을 입력하세요.', group.name);
    if (nextName === null) return;

    const trimmedName = nextName.trim();
    if (trimmedName === '') {
        showToast('Group name cannot be empty.');
        return;
    }

    group.name = trimmedName;
    savePresetGroups(groups);
    loadPresets();
    showToast('Group name updated.');
}

function showPresetContextMenu(event, groupId, itemId) {
    contextPreset = { groupId, itemId };
    presetContextMenu.style.left = `${event.clientX}px`;
    presetContextMenu.style.top = `${event.clientY}px`;
    presetContextMenu.classList.remove('hidden');
}

function hidePresetContextMenu() {
    presetContextMenu.classList.add('hidden');
}

function handlePresetContextAction(event) {
    const action = event.target.dataset.action;
    if (!action || !contextPreset) return;

    event.stopPropagation();
    hidePresetContextMenu();

    if (action === 'rename') {
        renamePresetItem(contextPreset.groupId, contextPreset.itemId);
    } else if (action === 'edit-command') {
        editPresetCommand(contextPreset.groupId, contextPreset.itemId);
    } else if (action === 'delete') {
        deletePresetItem(contextPreset.groupId, contextPreset.itemId);
    }
}

function findPresetItem(groups, groupId, itemId) {
    const group = groups.find(item => item.id === groupId);
    if (!group) return null;

    const item = group.items.find(preset => preset.id === itemId);
    if (!item) return null;

    return { group, item };
}

function renamePresetItem(groupId, itemId) {
    const groups = getPresetGroups();
    const found = findPresetItem(groups, groupId, itemId);
    if (!found) return;

    const nextName = prompt('새 이름을 입력하세요.', found.item.name);
    if (nextName === null) return;

    const trimmedName = nextName.trim();
    if (trimmedName === '') {
        showToast('Name cannot be empty.');
        return;
    }

    found.item.name = trimmedName;
    savePresetGroups(groups);
    loadPresets();
    showToast('Preset name updated.');
}

function editPresetCommand(groupId, itemId) {
    const groups = getPresetGroups();
    const found = findPresetItem(groups, groupId, itemId);
    if (!found) return;

    const nextCommand = prompt('새 명령어를 입력하세요.', found.item.cmd);
    if (nextCommand === null) return;

    const trimmedCommand = nextCommand.trim();
    if (trimmedCommand === '') {
        showToast('Command cannot be empty.');
        return;
    }

    found.item.cmd = trimmedCommand;
    savePresetGroups(groups);
    loadPresets();
    showToast('Preset command updated.');
}

function deletePresetItem(groupId, itemId) {
    const groups = getPresetGroups();
    const found = findPresetItem(groups, groupId, itemId);
    if (!found) return;

    if (!confirm(`"${found.item.name}" preset을 삭제할까요?`)) {
        return;
    }

    found.group.items = found.group.items.filter(item => item.id !== itemId);
    savePresetGroups(groups);
    loadPresets();
    showToast('Preset deleted.');
}
