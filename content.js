logger.info('Yummy! 内容脚本已加载。');

const EMOJI_LIKE = '😋'; // 想吃
const EMOJI_DISLIKE = '🤮'; // 想吐
// const EMOJI_CLEAR = '🧹'; // 扫帚 (注释掉，暂不使用)

// --- Feature 1: Rating Bars ---

function applyHierarchicalState(targetElement, state) {
    const descendantSelector = 'p, h1, h2, h3, h4, h5, h6, li';
    targetElement.classList.remove('yummy-liked', 'yummy-disliked');
    const descendants = targetElement.querySelectorAll(descendantSelector);
    descendants.forEach(d => d.classList.remove('yummy-liked', 'yummy-disliked'));

    if (state === 'liked') {
        targetElement.classList.add('yummy-liked');
        descendants.forEach(d => d.classList.add('yummy-liked'));
    } else if (state === 'disliked') {
        targetElement.classList.add('yummy-disliked');
        descendants.forEach(d => d.classList.add('yummy-disliked'));
    }
    logger.debug(`已将状态 '${state}' 应用到元素及其子项。`, targetElement);
}

function addRatingBar(element) {
    if (element.dataset.yummyProcessed) {
        return;
    }
    element.dataset.yummyProcessed = 'true';

    const container = document.createElement('div');
    container.className = 'yummy-paragraph-container';
    element.parentNode.insertBefore(container, element);
    container.appendChild(element);

    const ratingBar = document.createElement('div');
    ratingBar.className = 'yummy-rating-bar';

    const turnContainer = element.closest('.group\\/conversation-turn');
    if (turnContainer) {
        const elementRect = element.getBoundingClientRect();
        const turnRect = turnContainer.getBoundingClientRect();
        const top = elementRect.top - turnRect.top;
        ratingBar.style.top = `${top}px`;
    }

    const likeButton = document.createElement('span');
    likeButton.className = 'yummy-rating-button';
    likeButton.textContent = EMOJI_LIKE;
    likeButton.title = '想吃 (Like)';
    likeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const isAlreadyLiked = element.classList.contains('yummy-liked');
        applyHierarchicalState(element, isAlreadyLiked ? 'none' : 'liked');
    });

    const dislikeButton = document.createElement('span');
    dislikeButton.className = 'yummy-rating-button';
    dislikeButton.textContent = EMOJI_DISLIKE;
    dislikeButton.title = '想吐 (Dislike)';
    dislikeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const isAlreadyDisliked = element.classList.contains('yummy-disliked');
        applyHierarchicalState(element, isAlreadyDisliked ? 'none' : 'disliked');
    });

    ratingBar.appendChild(likeButton);
    ratingBar.appendChild(dislikeButton);
    container.appendChild(ratingBar);
}

const CONTENT_ELEMENTS_SELECTOR = `
    [data-message-author-role="assistant"] h1,
    [data-message-author-role="assistant"] h2,
    [data-message-author-role="assistant"] h3,
    [data-message-author-role="assistant"] h4,
    [data-message-author-role="assistant"] h5,
    [data-message-author-role="assistant"] h6,
    [data-message-author-role="assistant"] p,
    [data-message-author-role="assistant"] pre,
    [data-message-author-role="assistant"] li
`;

function processNewElements() {
    const elements = document.querySelectorAll(CONTENT_ELEMENTS_SELECTOR);
    elements.forEach(element => {
        if (!element.dataset.yummyProcessed) {
            addRatingBar(element);
        }
    });
}

// --- DEBOUNCE LOGIC FOR MUTATION OBSERVER ---
let debounceTimer = null;
const debouncedProcessNewElements = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        // logger.debug("Debounce timer expired, processing elements now.");
        processNewElements();
    }, 500);
};

const observer = new MutationObserver(debouncedProcessNewElements);


// --- Feature 2: Selection Mode ---

(function () {
    'use strict';

    let isSelectionModeActive = false;
    let quickHighlightButton = null;
    let lastSelectionRange = null;
    let cursorFollower = null;

    // --- NEW: High-performance animation variables ---
    let latestMouseX = 0;
    let latestMouseY = 0;
    let isTicking = false; // Flag to ensure we only have one rAF queued at a time

    /**
     * The actual DOM update function. It's only called inside a
     * requestAnimationFrame callback, ensuring it's highly performant.
     */
    function updateFollower() {
        if (cursorFollower) {
            cursorFollower.style.transform = `translate(${latestMouseX}px, ${latestMouseY}px)`;
        }
        // Reset the flag so that the next mousemove event can queue a new frame.
        isTicking = false;
    }

    /**
     * The lightweight mousemove event listener.
     * It does nothing but update coordinates and queue an animation frame.
     * @param {MouseEvent} e
     */
    function onMouseMove(e) {
        if (!isSelectionModeActive) return;

        latestMouseX = e.pageX + 8;
        latestMouseY = e.pageY + 8;

        if (cursorFollower.style.display !== 'block') {
            cursorFollower.style.display = 'block';
        }

        if (!isTicking) {
            requestAnimationFrame(updateFollower);
            isTicking = true; // Set the flag to true
        }
    }


    function createCursorFollower() {
        if (document.getElementById('yummy-cursor-follower')) return;
        cursorFollower = document.createElement('div');
        cursorFollower.id = 'yummy-cursor-follower';
        cursorFollower.textContent = '😋';
        document.body.appendChild(cursorFollower);
    }

    function createQuickHighlightButton() {
        if (document.getElementById('yummy-quick-highlight-button')) return;
        quickHighlightButton = document.createElement('div');
        quickHighlightButton.id = 'yummy-quick-highlight-button';
        quickHighlightButton.textContent = '😋';
        quickHighlightButton.title = '高亮选中内容';
        quickHighlightButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (lastSelectionRange) {
                highlightSelection(lastSelectionRange);
                lastSelectionRange = null;
            }
            quickHighlightButton.style.display = 'none';
        });
        document.body.appendChild(quickHighlightButton);
    }

    function highlightSelection(range) {
        const selection = window.getSelection();
        const effectiveRange = range || (selection.rangeCount > 0 ? selection.getRangeAt(0) : null);
        if (!effectiveRange || effectiveRange.collapsed) {
            if (selection.rangeCount > 0) selection.removeAllRanges();
            return;
        }
        const commonAncestor = effectiveRange.commonAncestorContainer;
        const parentElement = commonAncestor.nodeType === Node.ELEMENT_NODE ? commonAncestor : commonAncestor.parentElement;
        const isInMainContent = parentElement.closest('main');
        const isInsideYummyUI = parentElement.closest('.yummy-control-panel, .yummy-rating-bar, .yummy-log-container, #yummy-quick-highlight-button');
        if (!isInMainContent || isInsideYummyUI) {
            logger.debug('选区位于无效区域，已取消高亮。');
            if (selection.rangeCount > 0) selection.removeAllRanges();
            return;
        }
        logger.debug('高亮选中文本。');
        const highlightSpan = document.createElement('span');
        highlightSpan.className = 'yummy-selection-highlight';
        try {
            const mergedRange = mergeWithExistingHighlights(effectiveRange);
            mergedRange.surroundContents(highlightSpan);
        } catch (e) {
            logger.warn('无法包裹所选内容，可能由于跨元素选择。', e);
        } finally {
            if (selection.rangeCount > 0) selection.removeAllRanges();
        }
    }

    function mergeWithExistingHighlights(newRange) {
        const highlights = document.querySelectorAll('.yummy-selection-highlight');
        const intersectingHighlights = Array.from(highlights).filter(h => newRange.intersectsNode(h) && h.parentNode);
        if (intersectingHighlights.length === 0) return newRange;
        logger.debug(`发现 ${intersectingHighlights.length} 个重叠的高亮区域，正在合并...`);
        const mergedRange = newRange.cloneRange();
        intersectingHighlights.forEach(highlight => {
            const highlightRange = document.createRange();
            highlightRange.selectNode(highlight);
            if (highlightRange.compareBoundaryPoints(Range.START_TO_START, mergedRange) < 0) {
                mergedRange.setStart(highlightRange.startContainer, highlightRange.startOffset);
            }
            if (highlightRange.compareBoundaryPoints(Range.END_TO_END, mergedRange) > 0) {
                mergedRange.setEnd(highlightRange.endContainer, highlightRange.endOffset);
            }
        });
        intersectingHighlights.forEach(unhighlightElement);
        return mergedRange;
    }

    function unhighlightElement(element) {
        if (!element || !element.parentNode) return;
        const parent = element.parentNode;
        while (element.firstChild) {
            parent.insertBefore(element.firstChild, element);
        }
        parent.removeChild(element);
        parent.normalize();
        logger.debug('一个旧的高亮区域已被取消以便合并。');
    }

    function handleTextSelection(event) {
        if (isSelectionModeActive) {
            highlightSelection();
            return;
        }
        setTimeout(() => {
            const selection = window.getSelection();
            if (selection.isCollapsed || !quickHighlightButton) {
                quickHighlightButton.style.display = 'none';
                lastSelectionRange = null;
                return;
            }
            const range = selection.getRangeAt(0);
            const commonAncestor = range.commonAncestorContainer;
            const parentElement = commonAncestor.nodeType === Node.ELEMENT_NODE ? commonAncestor : commonAncestor.parentElement;
            const isInMainContent = parentElement.closest('main');
            const isInsideYummyUI = parentElement.closest('.yummy-control-panel, .yummy-rating-bar, .yummy-log-container, #yummy-quick-highlight-button');
            if (!isInMainContent || isInsideYummyUI) {
                quickHighlightButton.style.display = 'none';
                lastSelectionRange = null;
                return;
            }
            lastSelectionRange = range;
            quickHighlightButton.style.display = 'flex';
            quickHighlightButton.style.left = `${event.pageX + 5}px`;
            quickHighlightButton.style.top = `${event.pageY + 5}px`;
        }, 10);
    }

    function createControlPanel() {
        const panel = document.createElement('div');
        panel.className = 'yummy-control-panel';
        const toggleButton = document.createElement('div');
        toggleButton.className = 'yummy-control-button';
        toggleButton.title = '切换划词高亮模式';
        toggleButton.textContent = '😋';
        toggleButton.addEventListener('click', () => {
            isSelectionModeActive = !isSelectionModeActive;
            toggleButton.classList.toggle('active', isSelectionModeActive);
            document.body.classList.toggle('yummy-selection-mode-active', isSelectionModeActive);

            if (!isSelectionModeActive && cursorFollower) {
                cursorFollower.style.display = 'none';
            }
            logger.info(`划词模式已 ${isSelectionModeActive ? '开启' : '关闭'}`);
        });
        panel.appendChild(toggleButton);
        document.body.appendChild(panel);
    }

    function quickExitSelectionMode(event) {
        if (event.detail === 2 && isSelectionModeActive) {
            const toggleButton = document.querySelector('.yummy-control-button');
            isSelectionModeActive = false;
            toggleButton.classList.remove('active');
            document.body.classList.remove('yummy-selection-mode-active');
            if (cursorFollower) {
                cursorFollower.style.display = 'none';
            }
            logger.info('通过双击退出划词模式。');
        }
    }

    function initializeSelectionMode() {
        createControlPanel();
        createQuickHighlightButton();
        createCursorFollower();

        // Add the high-performance mousemove listener once.
        document.addEventListener('mousemove', onMouseMove);

        document.body.addEventListener('mouseleave', () => {
            if (cursorFollower) {
                cursorFollower.style.display = 'none';
            }
        });

        document.addEventListener('mouseup', handleTextSelection);
        document.addEventListener('mousedown', (e) => {
            if (quickHighlightButton && e.target !== quickHighlightButton) {
                quickHighlightButton.style.display = 'none';
            }
        });
        document.addEventListener('click', quickExitSelectionMode);
        document.addEventListener('click', (e) => {
            const highlight = e.target.closest('.yummy-selection-highlight');
            if (highlight) {
                e.stopPropagation();
                logger.debug('单击取消高亮。');
                unhighlightElement(highlight);
            }
        }, true);
        logger.info('划词模式功能已完全初始化。');
    }

    initializeSelectionMode();
})();

// --- Main Initialization ---
function initializeYummy() {
    logger.info('Yummy 插件初始化...');
    const targetNode = document.body;
    if (targetNode) {
        observer.observe(targetNode, {
            childList: true,
            subtree: true
        });
        processNewElements(); // Initial run
        logger.info('MutationObserver 已启动。');
    } else {
        logger.error('未找到用于 MutationObserver 的目标节点。');
    }
}

initializeYummy();