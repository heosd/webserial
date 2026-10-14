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

function getQuickCommandExportData() {
    return {
        type: 'webserial.quickCommands',
        version: 1,
        exportedAt: new Date().toISOString(),
        presetGroups: getPresetGroups()
    };
}

function getQuickCommandExportFilename() {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}_webserial_quickcommand.json`;
}

function exportQuickCommands() {
    const content = JSON.stringify(getQuickCommandExportData(), null, 2);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = getQuickCommandExportFilename();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Quick commands exported.');
}

function getUniquePresetGroupName(name, usedNames) {
    const baseName = String(name || 'Default');
    let nextName = baseName;
    let suffix = 1;

    while (usedNames.has(nextName)) {
        nextName = `${baseName}_${suffix}`;
        suffix += 1;
    }

    usedNames.add(nextName);
    return nextName;
}

function cloneImportedPresetGroups(groups, existingGroups = []) {
    const usedNames = new Set(existingGroups.map(group => group.name));

    return groups.map(group => ({
        id: createPresetId('group'),
        name: getUniquePresetGroupName(group.name, usedNames),
        collapsed: group.collapsed === true,
        items: group.items.map(item => ({
            id: createPresetId('preset'),
            name: item.name,
            cmd: item.cmd
        }))
    }));
}

function importQuickCommandsFromText(text, mode = 'load') {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        showToast('Invalid JSON file.', 5000);
        return false;
    }

    const groups = Array.isArray(parsed)
        ? parsed
        : (parsed.presetGroups || parsed.groups);

    if (!Array.isArray(groups)) {
        showToast('Quick command data was not found.', 5000);
        return false;
    }

    const importedGroups = normalizePresetGroups(groups);

    if (mode === 'import') {
        const existingGroups = getPresetGroups();
        savePresetGroups(existingGroups.concat(cloneImportedPresetGroups(importedGroups, existingGroups)));
    } else {
        savePresetGroups(cloneImportedPresetGroups(importedGroups));
    }

    loadPresets();
    showToast(mode === 'import' ? 'Quick commands imported.' : 'Quick commands loaded.');
    return true;
}

function handleQuickCommandImportFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener('load', () => {
        importQuickCommandsFromText(String(reader.result || ''), quickCommandImportMode);
    });
    reader.addEventListener('error', () => {
        showToast('Failed to read import file.', 5000);
    });
    reader.readAsText(file, 'utf-8');
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
        event.stopPropagation();
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
    hideQuickCommandContextMenu();
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

function showQuickCommandContextMenu(event) {
    if (event.target.closest('.preset-item, .preset-group-toggle, .preset-group-delete, .preset-group-drag-handle')) {
        return;
    }

    event.preventDefault();
    hidePresetContextMenu();
    quickCommandContextMenu.style.left = `${event.clientX}px`;
    quickCommandContextMenu.style.top = `${event.clientY}px`;
    quickCommandContextMenu.classList.remove('hidden');
}

function hideQuickCommandContextMenu() {
    quickCommandContextMenu.classList.add('hidden');
}

function handleQuickCommandContextAction(event) {
    const action = event.target.dataset.action;
    if (!action) return;

    event.stopPropagation();
    hideQuickCommandContextMenu();

    if (action === 'export') {
        exportQuickCommands();
    } else if (action === 'load') {
        quickCommandImportMode = 'load';
        quickCommandImportInput.click();
    } else if (action === 'import') {
        quickCommandImportMode = 'import';
        quickCommandImportInput.click();
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
