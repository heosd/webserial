// Global state variables
var port = null;
var reader = null;
var writer = null;
var keepReading = false;
var logHistory = []; // Array of { type: 'tx'|'rx'|'sys', timestamp: string, data: Uint8Array, text: string }
var displayMode = 'ascii'; // 'ascii', 'hex', or 'both'
var reconnectCancelled = false;
var commandHistory = [];
var historyIndex = -1;
var isLooping = false;
var stopLoopRequested = false;
var isStreamingLog = false;
var streamLogFileHandle = null;
var streamLogWriteChain = Promise.resolve();
var streamLogBuffer = '';
var streamLogFlushTimer = null;
var STREAM_LOG_FLUSH_INTERVAL_MS = 1000;
var isOpfsLogEnabled = false;
var opfsLogWorker = null;
var opfsLogRequestId = 0;
var opfsLogPendingRequests = new Map();
var opfsLogCurrentFileName = '';
var OPFS_LOG_RETENTION_DAYS = 7;
var DEFAULT_MAX_LOG_HISTORY = 1500;
var maxLogHistory = DEFAULT_MAX_LOG_HISTORY;

// DOM Helpers
var $id = id => document.getElementById(id);

// DOM Elements
var statusDot = $id('status-dot');
var statusText = $id('status-text');
var connectBtn = $id('connect-btn');
var baudrateSelect = $id('baudrate-select');
var customBaudrateInput = $id('custom-baudrate-input');
var autoReconnectCheckbox = $id('auto-reconnect-checkbox');

// Serial Options
var databitsSelect = $id('databits-select');
var stopbitsSelect = $id('stopbits-select');
var paritySelect = $id('parity-select');
var flowcontrolSelect = $id('flowcontrol-select');

// Device Info Elements
var deviceInfoName = $id('device-info-name');
var deviceInfoVid = $id('device-info-vid');
var deviceInfoPid = $id('device-info-pid');

// Terminal Elements
var terminalConsole = $id('terminal-console');
var maxLogHistoryInput = $id('max-log-history-input');
var autoscrollCheckbox = $id('autoscroll-checkbox');
var showTimeCheckbox = $id('show-time-checkbox');
var showSystemCheckbox = $id('show-system-checkbox');
var clearLogBtn = $id('clear-log-btn');
var exportLogBtn = $id('export-log-btn');
var streamLogBtn = $id('stream-log-btn');
var modeAscii = $id('mode-ascii');
var modeHex = $id('mode-hex');
var modeBoth = $id('mode-both');

// Command Input Elements
var crCheckbox = $id('cr-checkbox');
var lfCheckbox = $id('lf-checkbox');
var hexSendCheckbox = $id('hex-send-checkbox');
var cmdInput = $id('cmd-input');
var sendBtn = $id('send-btn');
var batchBtn = $id('batch-btn');
var loopBtn = $id('loop-btn');
var sendForm = $id('send-form');
var charCounter = $id('char-counter');

// Batch & Loop Config Elements
var delimiterInput = $id('delimiter-input');
var commandDelayInput = $id('command-delay-input');
var loopDelayInput = $id('loop-delay-input');

// Presets
var addPresetGroup = $id('add-preset-group');
var addPresetCmd = $id('add-preset-cmd');
var addPresetBtn = $id('add-preset-btn');
var dynamicPresetsContainer = $id('dynamic-presets');
var presetContextMenu = $id('preset-context-menu');
var quickCommandCard = document.querySelector('[data-collapse-key="quick-command-send"]');
var quickCommandContextMenu = $id('quick-command-context-menu');
var quickCommandImportInput = $id('quick-command-import-input');
var draggedPreset = null;
var draggedGroup = null;
var contextPreset = null;
var quickCommandImportMode = 'load';

// OPFS Log Test
var opfsLogOnBtn = $id('opfs-log-on-btn');
var opfsLogOffBtn = $id('opfs-log-off-btn');
var opfsLogClearAllBtn = $id('opfs-log-clear-all-btn');
var opfsLogList = $id('opfs-log-list');

// Overlay & Toast
var toast = $id('toast');
var reconnectOverlay = $id('reconnect-overlay');
var cancelReconnectBtn = $id('cancel-reconnect-btn');
