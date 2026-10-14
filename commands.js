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
