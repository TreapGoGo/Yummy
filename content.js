logger.info('Yummy! 内容脚本已加载。');

const EMOJI_LIKE = '😋';
const EMOJI_DISLIKE = '🤮';

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
    if (element.dataset.yummyProcessed) return;
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

const CONTENT_ELEMENTS_SELECTOR = `[data-message-author-role="assistant"] h1, [data-message-author-role="assistant"] h2, [data-message-author-role="assistant"] h3, [data-message-author-role="assistant"] h4, [data-message-author-role="assistant"] h5, [data-message-author-role="assistant"] h6, [data-message-author-role="assistant"] p, [data-message-author-role="assistant"] pre, [data-message-author-role="assistant"] li`;

function processNewElements() {
    document.querySelectorAll(CONTENT_ELEMENTS_SELECTOR).forEach(element => {
        if (!element.dataset.yummyProcessed) addRatingBar(element);
    });
}

let debounceTimer = null;
const debouncedProcessNewElements = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        processNewElements();
    }, 500);
};
const observer = new MutationObserver(debouncedProcessNewElements);

// --- Features 2 & 3: Selection, Collection & Prompt Generation (IIFE) ---
(function () {
    'use strict';

    // --- State Variables ---
    let isSelectionModeActive = false;
    let quickHighlightButton = null;
    let lastSelectionRange = null;
    let cursorFollower = null;
    let latestMouseX = 0,
        latestMouseY = 0;
    let isTicking = false;
    let collectionPanel = null;
    let collectionContent = null;
    let collectionHideTimer = null;
    let copyToast = null;
    let isCollectionPanelPinned = false;
    let isAutoSendActive = true;

    // --- UTILITY ---
    /**
     * Gets clean text from an element, excluding any known UI components.
     * This is the single source of truth for getting text from user-marked content.
     * @param {HTMLElement} element The element to get text from.
     * @returns {string} The cleaned text content.
     */
    const getCleanText = (element) => {
        const clone = element.cloneNode(true);
        clone.querySelectorAll('.yummy-rating-bar').forEach(ui => ui.remove());
        return clone.textContent.trim();
    };


    // --- Prompt Generation Logic ---
    function collectMarkedData() {
        const uniqueText = (selector) => {
            const elements = document.querySelectorAll(selector);
            const texts = new Set();
            elements.forEach(el => texts.add(getCleanText(el)));
            return Array.from(texts).filter(Boolean); // Filter out any potential empty strings
        };
        const likes = uniqueText('.yummy-liked');
        const dislikes = uniqueText('.yummy-disliked');
        const highlights = uniqueText('.yummy-selection-highlight');
        logger.info('收集到的数据:', {
            likes,
            dislikes,
            highlights
        });
        return {
            likes,
            dislikes,
            highlights
        };
    }

    function buildPrompt(mode, data) {
        const {
            likes,
            dislikes,
            highlights
        } = data;
        let prompt = '';

        if (mode === 'organize') {
            const likesToOrganize = likes.length > 0 ? `### 需要整理的“喜欢”内容\n- ${likes.join('\n- ')}\n` : '';
            const highlightsToOrganize = highlights.length > 0 ? `### 需要整理的“高亮”内容\n- ${highlights.join('\n- ')}\n` : '';
            const dislikesToAvoid = dislikes.length > 0 ? `### 必须规避的“不喜欢”内容\n- ${dislikes.join('\n- ')}\n` : '';
            const materials = [likesToOrganize, highlightsToOrganize, dislikesToAvoid].filter(Boolean).join('\n');

            prompt = `你是一个严谨的内容整理助手。
你的任务是根据我提供的“喜欢”和“高亮”内容，原封不动地进行整理。

---
${materials}
---

请严格按照以下要求开始整理：
1.  只输出整理后的内容本身，保持原始表述，不要删改或扩写。
2.  不要添加任何开场白、标题、总结、解释或结束语。
3.  绝对不要提及或包含任何“不喜欢”列表中的内容。`;

        } else if (mode === 'diverge') {
            const likesForInspiration = likes.length > 0 ? `### 创作的主要依据 (我喜欢的内容)\n- ${likes.join('\n- ')}\n` : '';
            const highlightsForInspiration = highlights.length > 0 ? `### 创作的补充灵感 (我划线强调的内容)\n- ${highlights.join('\n- ')}\n` : '';
            const dislikesToAvoid = dislikes.length > 0 ? `### 绝对要避免的主题 (我不喜欢的内容)\n- ${dislikes.join('\n- ')}\n` : '';
            const materials = [likesForInspiration, highlightsForInspiration, dislikesToAvoid].filter(Boolean).join('\n');

            prompt = `你是一个富有创意的灵感激发助手。
请根据我“喜欢”和“高亮”的内容进行自由发散创作，但要确保内容与主题相关。

---
${materials}
---

请开始你的创作。请注意：
1.  你的创作应该富有想象力，但不能偏离主题。
2.  在任何情况下，都绝对不能在你的回答中提及、暗示或包含任何“不喜欢”列表中的内容。`;
        }
        return prompt.trim();
    }

    function generateAndApplyPrompt(mode) {
        const data = collectMarkedData();
        if (data.likes.length === 0 && data.highlights.length === 0) {
            alert('Yummy提示：\n请先标记一些"喜欢"的内容或划线一些内容，才能生成提示词哦！');
            return;
        }
        const prompt = buildPrompt(mode, data);
        const inputBox = document.querySelector('#prompt-textarea');

        if (!inputBox) {
            alert('Yummy错误：\n找不到输入框！无法粘贴提示词。');
            logger.error('找不到输入框 (#prompt-textarea)');
            return;
        }

        inputBox.focus();
        let p = inputBox.querySelector('p');

        if (!p) {
            p = document.createElement('p');
            inputBox.innerHTML = '';
            inputBox.appendChild(p);
        }

        p.innerText = prompt;

        if (p.classList.contains('placeholder')) {
            p.classList.remove('placeholder');
        }
        if (p.hasAttribute('data-placeholder')) {
            p.removeAttribute('data-placeholder');
        }

        inputBox.dispatchEvent(new Event('input', {
            bubbles: true
        }));

        if (isAutoSendActive) {
            setTimeout(() => {
                let sendButton = inputBox.closest('form')?.querySelector('button:not(:disabled)[data-testid*="send"], button:not(:disabled)[class*="send"]');

                if (!sendButton) {
                    sendButton = document.querySelector('button[data-testid="send-button"]:not(:disabled)');
                }

                if (sendButton) {
                    sendButton.click();
                    logger.info('已自动发送提示词。');
                } else {
                    alert('Yummy警告：\n已粘贴提示词，但找不到发送按钮或按钮不可用，请手动发送。');
                    logger.warn('找不到发送按钮或按钮被禁用。');
                }
            }, 200);
        } else {
            logger.info('已粘贴提示词，未自动发送。');
        }
    }

    // --- UI & Interaction Logic ---
    function showToast(message, event) {
        if (!copyToast) return;
        copyToast.textContent = message;
        copyToast.style.visibility = 'hidden';
        copyToast.style.display = 'block';
        const toastWidth = copyToast.offsetWidth;
        let left = event.clientX + 15;
        if (left + toastWidth > window.innerWidth) {
            left = event.clientX - toastWidth - 15;
        }
        copyToast.style.left = `${left}px`;
        copyToast.style.top = `${event.clientY}px`;
        copyToast.style.visibility = 'visible';
        setTimeout(() => {
            copyToast.style.display = 'none';
            copyToast.style.visibility = 'visible';
        }, 1200);
    }

    function updateFollower() {
        if (cursorFollower) {
            cursorFollower.style.transform = `translate(${latestMouseX}px, ${latestMouseY}px)`;
        }
        isTicking = false;
    }

    function onMouseMove(e) {
        if (!isSelectionModeActive) return;
        latestMouseX = e.pageX + 8;
        latestMouseY = e.pageY + 8;
        if (cursorFollower.style.display !== 'block') {
            cursorFollower.style.display = 'block';
        }
        if (!isTicking) {
            requestAnimationFrame(updateFollower);
            isTicking = true;
        }
    }

    // Helper function to find the nearest block-level ancestor
    function getContainingBlock(node) {
        // Traverses up to find the closest non-inline container.
        // This helps identify the main 'block' an element belongs to.
        while (node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const display = window.getComputedStyle(node).display;
                if (display !== 'inline' && display !== 'inline-block') {
                    return node;
                }
            }
            // Stop at the body to prevent infinite loops on detached nodes.
            if (node.nodeName === 'BODY') {
                return node;
            }
            node = node.parentNode;
        }
        return document.body; // Fallback
    }

    /**
     * Cleans a DocumentFragment by removing any known Yummy UI elements.
     * This prevents UI components like rating bars from being included in highlights.
     * @param {DocumentFragment} fragment The fragment to clean.
     */
    function cleanFragment(fragment) {
        fragment.querySelectorAll('.yummy-rating-bar, .yummy-control-panel, #yummy-quick-highlight-button, #yummy-collection-panel').forEach(el => el.remove());
    }

    function highlightSelection(range) {
        const selection = window.getSelection();
        const effectiveRange = range || (selection.rangeCount > 0 ? selection.getRangeAt(0) : null);

        if (!effectiveRange || effectiveRange.collapsed) {
            if (selection.rangeCount > 0) selection.removeAllRanges();
            return;
        }

        const parentElement = effectiveRange.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? effectiveRange.commonAncestorContainer : effectiveRange.commonAncestorContainer.parentElement;
        const isInMainContent = parentElement.closest('main');
        const isInsideYummyUI = parentElement.closest('.yummy-control-panel, .yummy-rating-bar, #yummy-quick-highlight-button, #yummy-collection-panel');

        if (!isInMainContent || isInsideYummyUI) {
            if (selection.rangeCount > 0) selection.removeAllRanges();
            return;
        }

        try {
            // First, merge with any existing, intersecting highlights to create a single, expanded range.
            const mergedRange = mergeWithExistingHighlights(effectiveRange);

            // Find all content blocks that intersect with our final range.
            const allBlocks = Array.from(document.querySelectorAll(CONTENT_ELEMENTS_SELECTOR));
            const intersectingBlocks = allBlocks.filter(block =>
                mergedRange.intersectsNode(block) &&
                !block.classList.contains('yummy-selection-highlight') // Don't process highlights themselves
            );

            // If the selection is inside a single element that is not a designated content block
            // (e.g. a plain div), we treat the containing block as the single element to process.
            if (intersectingBlocks.length === 0 && parentElement && mergedRange.intersectsNode(parentElement)) {
                const singleBlock = getContainingBlock(parentElement);
                if (singleBlock) intersectingBlocks.push(singleBlock);
            }

            // Process each intersecting block individually.
            for (const block of intersectingBlocks) {
                const blockRange = document.createRange();
                blockRange.selectNodeContents(block);

                // Create a new range that is the intersection of the mergedRange and the current block.
                const intersectionRange = document.createRange();
                const start = mergedRange.compareBoundaryPoints(Range.START_TO_START, blockRange) > 0 ? mergedRange.startContainer : blockRange.startContainer;
                const startOffset = mergedRange.compareBoundaryPoints(Range.START_TO_START, blockRange) > 0 ? mergedRange.startOffset : blockRange.startOffset;
                const end = mergedRange.compareBoundaryPoints(Range.END_TO_END, blockRange) < 0 ? mergedRange.endContainer : blockRange.endContainer;
                const endOffset = mergedRange.compareBoundaryPoints(Range.END_TO_END, blockRange) < 0 ? mergedRange.endOffset : blockRange.endOffset;

                intersectionRange.setStart(start, startOffset);
                intersectionRange.setEnd(end, endOffset);

                // If the intersection is not collapsed, highlight it.
                if (!intersectionRange.collapsed) {
                    const highlightSpan = document.createElement('span');
                    highlightSpan.className = 'yummy-selection-highlight';

                    const selectedContents = intersectionRange.extractContents();

                    // CRITICAL: Clean the fragment before appending to prevent UI inclusion.
                    cleanFragment(selectedContents);

                    highlightSpan.appendChild(selectedContents);
                    intersectionRange.insertNode(highlightSpan);
                }
            }

        } catch (e) {
            logger.warn('无法包裹所选内容。这可能是由于复杂的页面结构造成的。', e);
        } finally {
            if (selection.rangeCount > 0) selection.removeAllRanges();
        }
    }

    function mergeWithExistingHighlights(newRange) {
        const highlights = document.querySelectorAll('.yummy-selection-highlight');
        const intersectingHighlights = Array.from(highlights).filter(h => newRange.intersectsNode(h) && h.parentNode);
        if (intersectingHighlights.length === 0) return newRange;
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
            const parentElement = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
            const isInMainContent = parentElement.closest('main');
            const isInsideYummyUI = parentElement.closest('.yummy-control-panel, .yummy-rating-bar, #yummy-quick-highlight-button, #yummy-collection-panel');
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

    function collectHighlights() {
        if (!collectionContent) return;
        collectionContent.innerHTML = ''; // Clear previous

        const uniqueContent = new Set();

        const likedItems = document.querySelectorAll('.yummy-liked');
        const highlightedItems = document.querySelectorAll('.yummy-selection-highlight');

        likedItems.forEach(item => {
            const text = getCleanText(item);
            if (text) uniqueContent.add(text);
        });
        highlightedItems.forEach(item => {
            const text = getCleanText(item);
            if (text) uniqueContent.add(text);
        });

        uniqueContent.forEach(text => {
            if (text) addItemToCollection(text);
        });
    }

    function addItemToCollection(text) {
        if (!collectionContent) return;
        const item = document.createElement('div');
        item.className = 'yummy-collection-item';
        item.textContent = text;
        item.dataset.rawText = text;
        const copyIcon = document.createElement('span');
        copyIcon.className = 'yummy-collection-item-copy-icon';
        copyIcon.textContent = '📋';
        copyIcon.title = '复制此项';
        item.appendChild(copyIcon);
        const performCopy = (event) => {
            event.stopPropagation();
            navigator.clipboard.writeText(text).then(() => {
                showToast('已复制!', event);
                item.classList.add('copied');
                setTimeout(() => item.classList.remove('copied'), 300);
            }).catch(err => logger.error('复制失败', err));
        };
        item.addEventListener('click', performCopy);
        collectionContent.appendChild(item);
    }

    function quickExitSelectionMode(event) {
        if (isSelectionModeActive && (event.key === 'Escape' || event.keyCode === 27)) {
            const toggleButton = document.querySelector('.yummy-control-button.active');
            if (toggleButton) toggleButton.click();
        }
    }

    function showCollectionPanel(visible) {
        if (!collectionPanel) return;
        if (visible) {
            collectionPanel.classList.add('visible');
        } else if (!isCollectionPanelPinned) {
            collectionPanel.classList.remove('visible');
        }
    }

    // --- UI Creation ---
    function createUiElements() {
        // Control Panel
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
            if (!isSelectionModeActive && cursorFollower) cursorFollower.style.display = 'none';
        });

        const collectButton = document.createElement('div');
        collectButton.className = 'yummy-control-button';
        collectButton.title = '收集精华内容';
        collectButton.textContent = '📥';
        collectButton.addEventListener('click', () => {
            collectHighlights();
            showCollectionPanel(true);
        });

        const organizeBtn = document.createElement('div');
        organizeBtn.className = 'yummy-control-button';
        organizeBtn.id = 'yummy-organize-btn';
        organizeBtn.textContent = '📝';
        organizeBtn.title = '整理模式: 严谨地整理您标记的内容，不进行任何扩写。';
        organizeBtn.addEventListener('click', () => generateAndApplyPrompt('organize'));

        const divergeBtn = document.createElement('div');
        divergeBtn.className = 'yummy-control-button';
        divergeBtn.id = 'yummy-diverge-btn';
        divergeBtn.textContent = '✨';
        divergeBtn.title = '发散模式: 基于您标记的内容进行创意发挥。';
        divergeBtn.addEventListener('click', () => generateAndApplyPrompt('diverge'));

        const autoSendBtn = document.createElement('div');
        autoSendBtn.className = 'yummy-control-button active';
        autoSendBtn.id = 'yummy-autosend-btn';
        autoSendBtn.textContent = '🚀';
        autoSendBtn.title = '自动发送已开启，点击关闭';
        autoSendBtn.addEventListener('click', () => {
            isAutoSendActive = !isAutoSendActive;
            autoSendBtn.classList.toggle('active', isAutoSendActive);
            autoSendBtn.title = isAutoSendActive ? '自动发送已开启，点击关闭' : '自动发送已关闭，点击开启';
        });

        panel.appendChild(toggleButton);
        panel.appendChild(collectButton);
        panel.appendChild(document.createElement('hr'));
        panel.appendChild(organizeBtn);
        panel.appendChild(divergeBtn);
        panel.appendChild(autoSendBtn);
        document.body.appendChild(panel);

        // Cursor Follower
        if (!document.getElementById('yummy-cursor-follower')) {
            cursorFollower = document.createElement('div');
            cursorFollower.id = 'yummy-cursor-follower';
            cursorFollower.textContent = '😋';
            document.body.appendChild(cursorFollower);
        }
        // Quick Highlight Button
        if (!document.getElementById('yummy-quick-highlight-button')) {
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
        // Copy Toast
        if (!document.getElementById('yummy-copy-toast')) {
            copyToast = document.createElement('div');
            copyToast.id = 'yummy-copy-toast';
            document.body.appendChild(copyToast);
        }
        // Collection Panel
        if (!document.getElementById('yummy-collection-panel')) {
            collectionPanel = document.createElement('div');
            collectionPanel.id = 'yummy-collection-panel';
            const header = document.createElement('div');
            header.id = 'yummy-collection-header';

            const pinBtn = document.createElement('span');
            pinBtn.id = 'yummy-collection-pin-btn';
            pinBtn.textContent = '📌';
            pinBtn.title = '钉住面板';
            pinBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                isCollectionPanelPinned = !isCollectionPanelPinned;
                pinBtn.classList.toggle('pinned', isCollectionPanelPinned);
                pinBtn.title = isCollectionPanelPinned ? '取消钉住' : '钉住面板';
            });

            const headerText = document.createElement('span');
            headerText.textContent = '复制全部';
            header.title = '复制所有收集到的内容';

            header.appendChild(pinBtn);
            header.appendChild(headerText);

            header.addEventListener('click', (e) => {
                if (e.target === pinBtn || pinBtn.contains(e.target)) return;
                const allText = Array.from(collectionContent.children)
                    .map(item => item.dataset.rawText)
                    .join('\n\n---\n\n');
                if (!allText) return;
                navigator.clipboard.writeText(allText).then(() => {
                    // showToast('已复制全部内容!', e); // Per user request, toast is removed.
                    const originalText = headerText.textContent;
                    headerText.textContent = '✅ 已复制!';
                    setTimeout(() => {
                        headerText.textContent = originalText;
                    }, 1500);
                });
            });

            collectionContent = document.createElement('div');
            collectionContent.id = 'yummy-collection-content';
            collectionPanel.appendChild(header);
            collectionPanel.appendChild(collectionContent);
            document.body.appendChild(collectionPanel);

            // Hide logic
            collectionPanel.addEventListener('mouseenter', () => clearTimeout(collectionHideTimer));
            collectionPanel.addEventListener('mouseleave', () => {
                if (isCollectionPanelPinned) return;
                collectionHideTimer = setTimeout(() => showCollectionPanel(false), 1000);
            });
        }
    }

    // --- Initialization ---
    function initializeFeatures() {
        createUiElements();
        document.addEventListener('mouseup', handleTextSelection);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('keydown', quickExitSelectionMode);

        // Global click listener for un-highlighting and hiding panel
        document.addEventListener('click', (e) => {
            // Logic to un-highlight when a highlight is clicked
            const highlight = e.target.closest('.yummy-selection-highlight');
            if (highlight) {
                e.preventDefault();
                e.stopPropagation();
                unhighlightElement(highlight);
                return; // Stop further processing to avoid side-effects
            }

            // Logic to hide collection panel on outside click
            if (isCollectionPanelPinned) return;
            if (collectionPanel && collectionPanel.classList.contains('visible') && !collectionPanel.contains(e.target) && !e.target.closest('.yummy-control-panel')) {
                showCollectionPanel(false);
            }
        }, true); // Use capturing phase to catch the click early

        logger.info('选择模式、收集器和提示词生成器已初始化。');
    }

    initializeFeatures();

})();


function initializeYummy() {
    logger.info('Yummy! 初始化...');
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    processNewElements(); // Initial run
    logger.info('Yummy! 初始化完成。');
}

initializeYummy();