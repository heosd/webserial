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
