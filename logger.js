// Yummy! Logger V2.1 - Now with controlled initialization

(function () {
    let logContainer, logContentDiv;
    const logLevels = {
        DEBUG: 1,
        INFO: 2,
        WARN: 3,
        ERROR: 4,
        NONE: 5,
    };
    let currentLevel = logLevels.DEBUG;
    let groupIndent = 0;
    let isInitialized = false;
    let pendingLogs = [];

    function createLogContainer() {
        if (document.getElementById('yummy-log-container')) return;

        logContainer = document.createElement('div');
        logContainer.id = 'yummy-log-container';
        Object.assign(logContainer.style, {
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            width: '450px',
            height: '300px',
            backgroundColor: 'rgba(25, 25, 25, 0.95)',
            color: '#f0f0f0',
            border: '1px solid #444',
            borderRadius: '8px',
            fontFamily: `Consolas, 'Courier New', monospace`,
            fontSize: '13px',
            zIndex: '9999',
            resize: 'both',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 5px 15px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)',
        });

        const header = document.createElement('div');
        header.id = 'yummy-log-header';
        Object.assign(header.style, {
            padding: '8px 12px',
            cursor: 'move',
            backgroundColor: 'rgba(50, 50, 50, 0.9)',
            color: 'white',
            fontWeight: 'bold',
            borderBottom: '1px solid #444',
            userSelect: 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
        });

        const titleSpan = document.createElement('span');
        titleSpan.id = 'yummy-log-title';
        titleSpan.innerHTML = `<span>Yummy! 日志 (v2.1)</span><span style="font-weight:normal; font-size: 11px; margin-left: 10px;">(Level: ${Object.keys(logLevels).find(key => logLevels[key] === currentLevel)})</span>`;

        const buttonContainer = document.createElement('div');
        Object.assign(buttonContainer.style, {
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
        });

        const copyButton = document.createElement('span');
        copyButton.id = 'yummy-log-copy-btn';
        copyButton.textContent = '📋';
        copyButton.title = '复制所有日志';
        Object.assign(copyButton.style, {
            cursor: 'pointer',
            fontSize: '16px',
        });
        copyButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (logContentDiv) {
                navigator.clipboard.writeText(logContentDiv.innerText).then(() => {
                    copyButton.textContent = '✅';
                    setTimeout(() => { copyButton.textContent = '📋'; }, 1500);
                }).catch(err => {
                    logger.error('复制日志失败', err);
                });
            }
        });

        const closeButton = document.createElement('span');
        closeButton.id = 'yummy-log-close-btn';
        closeButton.textContent = '✖️';
        closeButton.title = '关闭日志面板';
        Object.assign(closeButton.style, {
            cursor: 'pointer',
            fontSize: '16px',
        });
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (logContainer) {
                logContainer.style.display = 'none';
            }
        });
        
        buttonContainer.appendChild(copyButton);
        buttonContainer.appendChild(closeButton);

        header.appendChild(titleSpan);
        header.appendChild(buttonContainer);

        logContentDiv = document.createElement('div');
        logContentDiv.id = 'yummy-log-content';
        Object.assign(logContentDiv.style, {
            flexGrow: '1',
            overflowY: 'auto',
            padding: '10px',
            color: '#e0e0e0',
        });

        logContainer.appendChild(header);
        logContainer.appendChild(logContentDiv);
        document.body.appendChild(logContainer);

        makeDraggable(logContainer, header);
        
        isInitialized = true;
        flushPendingLogs();
    }

    function makeDraggable(container, handle) {
        let isDragging = false;
        let offsetX, offsetY;

        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - container.offsetLeft;
            offsetY = e.clientY - container.offsetTop;
            e.preventDefault();
            handle.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            container.style.left = `${e.clientX - offsetX}px`;
            container.style.top = `${e.clientY - offsetY}px`;
            container.style.bottom = 'auto';
            container.style.right = 'auto';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            handle.style.cursor = 'move';
        });
    }

    function flushPendingLogs() {
        if (!logContentDiv) return;
        pendingLogs.forEach(logItem => appendLogEntry(logItem.level, logItem.message, logItem.args));
        pendingLogs = [];
    }

    function formatArgs(args) {
        if (args.length === 0) return '';
        return args.map(arg => {
            if (arg instanceof Element) {
                return `[Element: ${arg.tagName.toLowerCase()}${arg.id ? '#' + arg.id : ''}${arg.className ? '.' + arg.className.split(' ').join('.') : ''}]`;
            }
            try {
                // Use a replacer to handle circular references gracefully
                const cache = new Set();
                return JSON.stringify(arg, (key, value) => {
                    if (typeof value === 'object' && value !== null) {
                        if (cache.has(value)) return '[Circular]';
                        cache.add(value);
                    }
                    return value;
                }, 2);
            } catch (e) {
                return `[Unserializable Object]`;
            }
        }).join(' ');
    }

    function appendLogEntry(level, message, args) {
        const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false });
        const levelName = Object.keys(logLevels).find(key => logLevels[key] === level);

        const logEntry = document.createElement('div');
        const color = {
            [logLevels.DEBUG]: '#aaa',
            [logLevels.INFO]: '#87ceeb',
            [logLevels.WARN]: '#ffd700',
            [logLevels.ERROR]: '#ff6b6b',
        }[level];
        logEntry.style.color = color;
        logEntry.style.paddingLeft = `${groupIndent * 20}px`;
        logEntry.style.borderLeft = groupIndent > 0 ? '1px solid #444' : 'none';
        logEntry.style.marginBottom = '4px';

        const finalMessage = `[${timestamp} ${levelName}] ${message} ${formatArgs(args)}`;
        const textNode = document.createTextNode(finalMessage);
        logEntry.appendChild(textNode);
        
        logContentDiv.appendChild(logEntry);
        
        // 智能滚动：只有当用户已经滚动到底部时才自动跟随
        const isScrolledToBottom = logContentDiv.scrollHeight - logContentDiv.clientHeight <= logContentDiv.scrollTop + 1;
        if (isScrolledToBottom) {
            logContentDiv.scrollTop = logContentDiv.scrollHeight;
        }
    }


    function log(level, message, ...args) {
        if (level < currentLevel) return;

        if (!isInitialized) {
            pendingLogs.push({ level, message, args });
            // Keep a small buffer to prevent memory leaks if init is never called
            if (pendingLogs.length > 500) {
                pendingLogs.shift();
            }
            return;
        }
        
        appendLogEntry(level, message, args);
    }

    const logger = {
        debug: (message, ...args) => log(logLevels.DEBUG, message, ...args),
        info: (message, ...args) => log(logLevels.INFO, message, ...args),
        warn: (message, ...args) => log(logLevels.WARN, message, ...args),
        error: (message, ...args) => log(logLevels.ERROR, message, ...args),
        group: (label, ...args) => {
            log(logLevels.DEBUG, `▼ ${label}`, ...args);
            groupIndent++;
        },
        groupEnd: () => {
            groupIndent = Math.max(0, groupIndent - 1);
        },
        setLevel: (levelName) => {
            const newLevel = logLevels[levelName.toUpperCase()];
            if (newLevel) {
                currentLevel = newLevel;
                logger.info(`Log level set to ${levelName.toUpperCase()}`);
                const titleElement = document.getElementById('yummy-log-title');
                if (titleElement) {
                    titleElement.innerHTML = `<span>Yummy! 日志 (v2.1)</span><span style="font-weight:normal; font-size: 11px; margin-left: 10px;">(Level: ${levelName.toUpperCase()})</span>`;
                }
            } else {
                logger.warn(`Invalid log level: ${levelName}`);
            }
        },
        init: () => {
            if (isInitialized) return;
            // The actual UI creation is deferred until this init() is called.
            createLogContainer();
            // Default to a less noisy level, can be overridden in console.
            logger.setLevel('INFO'); 
        }
    };

    // Expose logger to the window for interactive control
    window.YummyLogger = logger;

    // Replace the old logger if it exists
    window.logger = logger;

    // Do not log here anymore, as the UI is not ready.
    // The main content script will log once everything is set up.
})();
