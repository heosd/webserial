// App entry point

// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
    // Check Web Serial support
    if (!navigator.serial) {
        showWebSerialUnsupported();
    }

    // Load configurations from localStorage
    loadSettings();
    loadPresets();
    await initOpfsLog();
    
    // Register UI listeners
    setupEventListeners();
    setupHighlight();
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
