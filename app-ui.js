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
    document.addEventListener('click', hideQuickCommandContextMenu);
    presetContextMenu.addEventListener('click', handlePresetContextAction);
    quickCommandCard.addEventListener('contextmenu', showQuickCommandContextMenu);
    quickCommandContextMenu.addEventListener('click', handleQuickCommandContextAction);
    quickCommandImportInput.addEventListener('change', handleQuickCommandImportFile);
    
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
