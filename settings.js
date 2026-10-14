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
