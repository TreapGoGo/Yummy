// Yummy! Logger V2 - Advanced, Controllable, and Groupable

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
        header.innerHTML = `<span>Yummy! 日志 (v2)</span><span style="font-weight:normal; font-size: 11px; margin-left: 10px;">(Level: ${Object.keys(logLevels).find(key => logLevels[key] === currentLevel)})</span>`;
        Object.assign(header.style, {
            padding: '8px 12px',
            cursor: 'move',
            backgroundColor: 'rgba(50, 50, 50, 0.9)',
            color: 'white',
            textAlign: 'center',
            fontWeight: 'bold',
            borderBottom: '1px solid #444',
            userSelect: 'none',
        });


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


    function log(level, message, ...args) {
        if (level < currentLevel) return;

        const timestamp = new Date().toLocaleTimeString();
        const levelName = Object.keys(logLevels).find(key => logLevels[key] === level);

        if (!logContentDiv) createLogContainer();

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

        const finalMessage = `[${levelName}] ${message} ${formatArgs(args)}`;
        logEntry.textContent = finalMessage;
        logContentDiv.appendChild(logEntry);
        logContentDiv.scrollTop = logContentDiv.scrollHeight;
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
                const header = document.getElementById('yummy-log-header');
                if (header) {
                    header.innerHTML = `<span>Yummy! 日志 (v2)</span><span style="font-weight:normal; font-size: 11px; margin-left: 10px;">(Level: ${levelName.toUpperCase()})</span>`;
                }
            } else {
                logger.warn(`Invalid log level: ${levelName}`);
            }
        },
    };

    // Expose logger to the window for interactive control
    window.YummyLogger = logger;

    // Replace the old logger if it exists
    window.logger = logger;

    logger.info('新版日志系统已初始化 (仅悬浮窗模式)。');
})();
