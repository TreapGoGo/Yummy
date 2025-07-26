/*
  Yummy! 内容脚本 (v0.4.4)

  这是 Yummy! 扩展的核心脚本，负责向 ChatGPT 页面注入所有交互功能。
  其主要功能模块包括：
  1.  **评价栏注入**：为 AI 回复的每个内容块（段落、标题、列表项等）动态添加"喜欢/不喜欢"的评价工具。
  2.  **分级评价系统**：为标题（父级元素）实现一种复杂的、两级的评价逻辑。
  3.  **划词高亮系统**：提供一个独立的"划词模式"，并支持在普通模式下通过快捷按钮进行高亮。
  4.  **UI面板与交互**：创建并管理右侧的控制面板和左侧的收集面板。
  5.  **提示词生成**：根据用户标记的内容，智能地生成可用于后续提问的提示词。

  此脚本通过 MutationObserver 监听页面的动态变化，确保功能对流式输出的内容同样有效。
*/

(function() {
    'use strict';

    const STORAGE_KEY_PREFIX = 'yummy_conversation_';
    let currentConversationId = null;
    let currentConversationState = {};
    let messageElementsCache = new Map();


    // 通过检查 `update_url` (一个只在发布版 manifest.json 中存在的字段) 来判断扩展是否处于本地解压的开发模式。
    const isDevMode = !('update_url' in chrome.runtime.getManifest());

    if (!isDevMode) {
        window.logger = {
            log: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
            debug: () => {},
            group: () => {},
            groupEnd: () => {},
            init: () => {}
        };
    }

    logger.info('Yummy! 内容脚本已加载。');

    const EMOJI_LIKE = '😋';
    const EMOJI_DISLIKE = '🤮';

    let syncCollectionPanelWithDOM = () => logger.warn('syncCollectionPanelWithDOM not implemented yet');

    function getConversationId() {
        const match = window.location.pathname.match(/\/c\/([a-zA-Z0-9-]+)/);
        return match ? match[1] : null;
    }
    
    function getStableElementId(element) {
        const assistantMessages = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
        const messageIndex = assistantMessages.findIndex(msg => msg.contains(element));
        
        if (messageIndex === -1) return null;
    
        const key = `message-${messageIndex}`;
        let elementsInMessage;
    
        if (messageElementsCache.has(key)) {
            elementsInMessage = messageElementsCache.get(key);
        } else {
            elementsInMessage = Array.from(assistantMessages[messageIndex].querySelectorAll(CONTENT_ELEMENTS_SELECTOR));
            messageElementsCache.set(key, elementsInMessage);
        }
    
        const elementIndex = elementsInMessage.findIndex(el => el === element);
        
        return elementIndex > -1 ? `yummy-m${messageIndex}-e${elementIndex}` : null;
    }
    
    async function saveData(elementId, data) {
        if (!currentConversationId || !elementId) return;
    
        // Update local state first
        if (data) {
            currentConversationState[elementId] = { ...currentConversationState[elementId], ...data };
        } else {
            delete currentConversationState[elementId]; // Handles removal of markings
        }
    
        // Clean up empty objects
        if (currentConversationState[elementId] && Object.keys(currentConversationState[elementId]).length === 0) {
            delete currentConversationState[elementId];
        }
    
        try {
            const storageKey = `${STORAGE_KEY_PREFIX}${currentConversationId}`;
            if (Object.keys(currentConversationState).length > 0) {
                await chrome.storage.local.set({ [storageKey]: currentConversationState });
                logger.debug(`Data saved for ${elementId}`, currentConversationState[elementId]);
            } else {
                // If the last marking is removed, clean up the entire entry from storage
                await chrome.storage.local.remove(storageKey);
                logger.debug(`Conversation ${currentConversationId} has no markings, removed from storage.`);
            }
        } catch (error) {
            logger.error('Failed to save data to chrome.storage.local:', error);
        }
    }


    async function applyHierarchicalState(targetElement, state) {
        const elementId = getStableElementId(targetElement);
        const descendantSelector = 'p, h1, h2, h3, h4, h5, h6, li';
        
        targetElement.classList.remove('yummy-liked', 'yummy-disliked');
        const descendants = targetElement.querySelectorAll(descendantSelector);
        descendants.forEach(d => d.classList.remove('yummy-liked', 'yummy-disliked'));

        if (state === 'liked') {
            targetElement.classList.add('yummy-liked');
            descendants.forEach(d => d.classList.add('yummy-liked'));
            if(elementId) await saveData(elementId, { rating: 'liked' });
        } else if (state === 'disliked') {
            targetElement.classList.add('yummy-disliked');
            descendants.forEach(d => d.classList.add('yummy-disliked'));
            if(elementId) await saveData(elementId, { rating: 'disliked' });
        } else { // state === 'none'
             if(elementId) await saveData(elementId, { rating: null });
        }
        logger.debug(`已将状态 '${state}' 应用到元素及其子项。`, targetElement);
        syncCollectionPanelWithDOM();
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

        const turnContainer = element.closest('.group\\/turn-messages');
        if (turnContainer) {
            const turnContainerRect = turnContainer.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const indentation = containerRect.left - turnContainerRect.left;
            const baseLeftOffset = -85;
            ratingBar.style.left = `${baseLeftOffset - indentation}px`;
        } else {
            // Fallback for elements not inside a turn container, though less likely.
            ratingBar.style.left = '-85px';
        }

        const likeButton = document.createElement('span');
        likeButton.className = 'yummy-rating-button';
        likeButton.textContent = EMOJI_LIKE;
        likeButton.title = '想吃 (Like)';
        likeButton.addEventListener('click', async (e) => {
            e.stopPropagation();

            // Sugar Rush Easter Egg Logic
            const now = Date.now();
            const tracker = likeClickTracker.get(element) || { count: 0, lastClickTime: 0 };
            if (now - tracker.lastClickTime < 3000) {
                tracker.count++;
            } else {
                tracker.count = 1;
            }
            tracker.lastClickTime = now;
            likeClickTracker.set(element, tracker);

            if (tracker.count >= 7) {
                triggerSugarRush();
                likeClickTracker.delete(element); // Reset after triggering
            }

            const isParent = /H[1-6]/.test(element.tagName);
            if (isParent) {
                await handleParentRating(element, 'liked');
            } else {
                const isAlreadyLiked = element.classList.contains('yummy-liked');
                await applyHierarchicalState(element, isAlreadyLiked ? 'none' : 'liked');
            }
        });

        const dislikeButton = document.createElement('span');
        dislikeButton.className = 'yummy-rating-button';
        dislikeButton.textContent = EMOJI_DISLIKE;
        dislikeButton.title = '想吐 (Dislike)';
        dislikeButton.addEventListener('click', async (e) => {
            e.stopPropagation();
            const isParent = /H[1-6]/.test(element.tagName);
            if (isParent) {
                await handleParentRating(element, 'disliked');
            } else {
                const isAlreadyDisliked = element.classList.contains('yummy-disliked');
                await applyHierarchicalState(element, isAlreadyDisliked ? 'none' : 'disliked');
            }
        });

        ratingBar.appendChild(likeButton);
        ratingBar.appendChild(dislikeButton);
        container.appendChild(ratingBar);
    }

    const CONTENT_ELEMENTS_SELECTOR = `[data-message-author-role="assistant"] h1, [data-message-author-role="assistant"] h2, [data-message-author-role="assistant"] h3, [data-message-author-role="assistant"] h4, [data-message-author-role="assistant"] h5, [data-message-author-role="assistant"] h6, [data-message-author-role="assistant"] p, [data-message-author-role="assistant"] pre, [data-message-author-role="assistant"] li, [data-message-author-role="assistant"] table`;

    async function processNewElements() {
        const elementsToProcess = document.querySelectorAll(CONTENT_ELEMENTS_SELECTOR);
    
        for (const element of elementsToProcess) {
            const elementId = getStableElementId(element);
    
            // Always try to restore state first from the central state object.
            if (elementId && currentConversationState[elementId]) {
                const savedData = currentConversationState[elementId];
    
                // BUGFIX: More robust check. Only restore highlight if it's in storage 
                // AND not already present in the DOM for this element. This prevents
                // re-running the destructive innerHTML operation on subsequent updates.
                if (savedData.highlightHTML && !element.querySelector('.yummy-selection-highlight')) {
                    restoreHighlight(element, savedData.highlightHTML);
                }
    
                element.classList.remove('yummy-liked', 'yummy-disliked');
                if (savedData.rating === 'liked') {
                    element.classList.add('yummy-liked');
                } else if (savedData.rating === 'disliked') {
                    element.classList.add('yummy-disliked');
                }
            }
    
            if (!element.dataset.yummyProcessed) {
                addRatingBar(element);
            }
        }
        syncCollectionPanelWithDOM();
    }

    const parentClickState = new Map();

    function getSubsequentSiblings(startElement) {
        const results = [];
        if (!startElement) return results;
    
        const container = startElement.closest('.yummy-paragraph-container');
        if (!container) return results;
    
        let nextSibling = container.nextElementSibling;
        const startTag = startElement.tagName;
        const startLevel = parseInt(startTag.substring(1), 10);
    
        while (nextSibling) {
            const elementsInSibling = [];
            
            // Check if the sibling itself is a processable element
            if (nextSibling.matches(CONTENT_ELEMENTS_SELECTOR)) {
                elementsInSibling.push(nextSibling);
            }
            // And also find all processable descendants within it.
            // This is key to finding all <li>s inside a <ul>.
            elementsInSibling.push(...Array.from(nextSibling.querySelectorAll(CONTENT_ELEMENTS_SELECTOR)));
    
            // Remove duplicates that might arise from the above two steps
            const uniqueElements = [...new Set(elementsInSibling)];
    
            if (uniqueElements.length > 0) {
                const firstContentEl = uniqueElements[0];
    
                // Check if the first element marks a new section, which should stop us.
                if (firstContentEl.tagName.match(/^H[1-6]$/)) {
                    const nextLevel = parseInt(firstContentEl.tagName.substring(1), 10);
                    if (nextLevel <= startLevel) {
                        break; // Stop before this new section.
                    }
                }
                results.push(...uniqueElements);
            }
    
            nextSibling = nextSibling.nextElementSibling;
        }
        return results;
    }

    async function handleParentRating(parentElement, newRating) {
        const state = parentClickState.get(parentElement) || { rating: 'none', level: 0 };
        const children = getSubsequentSiblings(parentElement);
        let changedElements = new Map(); // Collect elements and their new state

        const applyState = async (el, ratingState) => {
            el.classList.remove('yummy-liked', 'yummy-disliked');
            if (ratingState === 'liked') el.classList.add('yummy-liked');
            else if (ratingState === 'disliked') el.classList.add('yummy-disliked');
            const elId = getStableElementId(el);
            if (elId) changedElements.set(elId, { rating: ratingState === 'none' ? null : ratingState });
        };

        if (newRating === state.rating) {
            if (state.level === 1) { // Second click -> rate all children
                state.level = 2;
                for (const child of children) { await applyState(child, newRating); }
                logger.debug(`块状评价 (二次点击): ${newRating}`, parentElement);
            } else { // Third click -> un-rate all
                state.rating = 'none';
                state.level = 0;
                await applyState(parentElement, 'none');
                for (const child of children) { await applyState(child, 'none'); }
                logger.debug(`块状评价 (取消): none`, parentElement);
            }
        } else {
            if (state.level === 2) { // Was level 2, now flipping color
                state.rating = newRating;
                await applyState(parentElement, newRating);
                for (const child of children) { await applyState(child, newRating); }
                logger.debug(`块状评价 (翻转): ${newRating}`, parentElement);
            } else { // First click, or was level 1 and flipping
                state.rating = newRating;
                state.level = 1;
                await applyState(parentElement, 'none'); // Clear visual state first
                for (const child of children) { await applyState(child, 'none'); }
                await applyState(parentElement, newRating); // Then apply new state to parent only
                children.forEach(child => flashElement(child));
                logger.debug(`块状评价 (首次点击): ${newRating}`, parentElement);
            }
        }
        parentClickState.set(parentElement, state);

        // Batch save all changes at the end
        for (const [id, data] of changedElements.entries()) {
            await saveData(id, data);
        }
        syncCollectionPanelWithDOM();
    }

    let debounceTimer = null;
    const debouncedProcessNewElements = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            messageElementsCache.clear(); // Clear cache before processing
            await processNewElements();
        }, 500);
    };

    const observer = new MutationObserver(debouncedProcessNewElements);

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
    let isAutoSendActive = false;
    let activeContextMenu = null;
    let previewTooltip = null;
    let isPanelAnimating = false;
    let collectionItemStates = new Map();
    let isMarkdownMode = false; // 新增状态，控制面板显示模式
    let turndownService; // 用于转换 HTML 到 Markdown

    // --- Easter Egg State ---
    const likeClickTracker = new Map();
    let emptyCopyClickCount = 0;
    let emptyCopyClickTimer = null;

    let globalAlert = null;
    // vNext: 指令菜单所需的状态变量
    let instructionMenu = null;
    let isInstructionMenuVisible = false;
    let currentInstructionIndex = -1;
    let aggregatedContentCache = ''; // 用于缓存聚合后的内容

    // vNext: 预设指令集
    const INSTRUCTIONS = [
        { label: '举一反三', instruction: '请基于我喜欢的部分，再多提供几个类似的例子或观点。', emoji: '1️⃣' },
        { label: '综合优化', instruction: '请综合我的偏好，优化你刚才的回答。', emoji: '2️⃣' },
        { label: '批判性思考', instruction: '请针对我喜欢的内容，提出一些挑战性的问题或反方观点。', emoji: '3️⃣' },
        { label: '融合成文', instruction: '请将我标记为喜欢的所有内容，无缝地整合成一段连贯的文字。', emoji: '4️⃣' },
        { label: '提炼要点', instruction: '请从我喜欢的内容中，提炼出核心要点，并以列表形式呈现。', emoji: '5️⃣' },
        { label: '风格迁移', instruction: '请模仿我喜欢的语句风格，改写我不喜欢的部分。', emoji: '6️⃣' }
    ];

    function flashElement(element) {
        element.classList.add('yummy-flash');
        setTimeout(() => {
            element.classList.remove('yummy-flash');
        }, 500);
    }

    const getCleanText = (element) => {
        if (!element) return '';
        const clone = element.cloneNode(true);
        clone.querySelectorAll('.yummy-rating-bar, .yummy-selection-highlight, .yummy-control-panel, #yummy-quick-highlight-button, #yummy-collection-panel').forEach(ui => ui.remove());
        return clone.textContent.trim();
    };

    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash |= 0;
        }
        return `yummy-id-${Math.abs(hash)}`;
    }

    const getTextWithHighlight = (element) => {
        if (!element) return '';
        const clone = element.cloneNode(true);
        clone.querySelectorAll('.yummy-rating-bar, .yummy-control-panel, #yummy-quick-highlight-button, #yummy-collection-panel').forEach(ui => ui.remove());
        return clone.textContent.trim();
    };

    function generateAggregatePrompt(scopeElement) {
        const likedItems = new Set();
        scopeElement.querySelectorAll('.yummy-liked').forEach(el => {
            const text = getTextWithHighlight(el);
            if (text) likedItems.add(text);
        });

        const dislikedItems = new Set();
        scopeElement.querySelectorAll('.yummy-disliked').forEach(el => {
            const text = getTextWithHighlight(el);
            if (text) dislikedItems.add(text);
        });

        const highlightedItems = new Set();
        scopeElement.querySelectorAll('.yummy-selection-highlight').forEach(el => {
            const text = getCleanText(el);
            if(text) highlightedItems.add(text);
        });

        let prompt = '';
        const likedText = Array.from(likedItems).join('\n');
        const dislikedText = Array.from(dislikedItems).join('\n');
        const highlightedText = Array.from(highlightedItems).join('\n');

        if (likedText) {
            prompt += `在我刚刚生成的内容中，我喜欢的语句有：\n${likedText}`;
        }

        if (dislikedText) {
            if (prompt) prompt += '\n\n';
            prompt += `我不喜欢的语句有：\n${dislikedText}`;
        }

        if (highlightedText) {
            if (prompt) prompt += '\n\n';
            prompt += `我划线高亮的重点有：\n${highlightedText}`;
        }

        return prompt ? prompt : null;
    }

    function injectAndSendPrompt(promptText) {
        const inputBox = document.querySelector('div#prompt-textarea');
        if (!inputBox) {
            showToast('Yummy错误：\n找不到输入框！');
            return;
        }

        let p = inputBox.querySelector('p');
        if (!p) {
            p = document.createElement('p');
            inputBox.innerHTML = '';
            inputBox.appendChild(p);
        }
        p.innerText = promptText;

        if (p.classList.contains('placeholder')) {
            p.classList.remove('placeholder');
        }

        inputBox.dispatchEvent(new Event('input', { bubbles: true }));

        setTimeout(() => {
            const sendButton = document.querySelector('button[data-testid*="send"]:not(:disabled)');
            if (sendButton) {
                sendButton.click();
            } else {
                logger.warn('自动发送失败：找不到发送按钮。');
            }
        }, 200);
    }

    function openInstructionMenuWithContent(aggregatedContent) {
        const inputBox = document.querySelector('div#prompt-textarea');
        if (!inputBox) {
            showToast('Yummy错误：\n找不到输入框！');
            return;
        }

        let existingText = Array.from(inputBox.querySelectorAll('p')).map(p => p.innerText).join('\n');

        const instructionParts = INSTRUCTIONS.map(i => i.instruction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const instructionRegex = new RegExp(`\\n\\n(?:${instructionParts.join('|')})$`);
        
        let baseText = existingText.replace(instructionRegex, '').trim();

        let newBaseText = baseText;
        if (!baseText.includes(aggregatedContent)) {
            newBaseText += (baseText ? '\n\n' : '') + aggregatedContent;
        }
        
        aggregatedContentCache = newBaseText;
        
        showInstructionMenu();
    }

    function stableScrollToBottom(scrollContainer) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            });
        });
    }

    function updateInputBoxWithInstruction(instructionText = '', isCustom = false) {
        const inputBox = document.querySelector('div#prompt-textarea');
        if (!inputBox) return;

        let p = inputBox.querySelector('p');
        if (!p) {
            p = document.createElement('p');
            inputBox.innerHTML = '';
            inputBox.appendChild(p);
        }

        const baseContent = aggregatedContentCache;
        let fullText;

        if (isCustom) {
            // 修复BUG：在末尾添加一个"零宽度空格"，以强制浏览器正确渲染两个换行符，并为光标提供可靠的定位锚点。
            fullText = `${baseContent}\n\n\u200B`;
        } else {
            // 预设指令的情况保持不变。
            fullText = instructionText ? `${baseContent}\n\n${instructionText}` : baseContent;
        }
        
        p.innerText = fullText;
        inputBox.dispatchEvent(new Event('input', { bubbles: true }));
        inputBox.focus();

        // 修复BUG：使用 requestAnimationFrame 替代 setTimeout，确保光标定位和滚动在DOM完全更新后执行。
        requestAnimationFrame(() => {
            const selection = window.getSelection();
            if (!selection) return;
            const paragraph = inputBox.querySelector('p');
            if (!paragraph || !paragraph.lastChild) return;

            const lastTextNode = paragraph.lastChild;
            const textContent = lastTextNode.textContent || '';
            const range = document.createRange();

            if (!isCustom && instructionText) {
                const selectionStart = textContent.length - instructionText.length;
                if (selectionStart >= 0) {
                    range.setStart(lastTextNode, selectionStart);
                    range.setEnd(lastTextNode, textContent.length);
                }
            } else {
                // 对于自定义情况，将光标定位在段落的末尾。
                range.selectNodeContents(paragraph);
                range.collapse(false);
            }

            selection.removeAllRanges();
            selection.addRange(range);

            // 确保在光标定位后，滚动条稳定地滚动到底部。
            const scrollContainer = inputBox.closest('[class*="overflow-auto"]');
            if (scrollContainer) {
                stableScrollToBottom(scrollContainer);
            }
        });
    }


    let toastTimer = null;
    function showToast(message, event = null, anchorToFooter = false) {
        if (!copyToast) return;

        if (toastTimer) {
            clearTimeout(toastTimer);
        }

        copyToast.classList.remove('yummy-toast-panel-mode', 'yummy-toast-cursor-mode', 'yummy-toast-footer-mode', 'visible');
        void copyToast.offsetWidth;

        copyToast.firstElementChild.textContent = message;

        if (anchorToFooter) {
            copyToast.classList.add('yummy-toast-footer-mode');
            copyToast.style.left = '';
            copyToast.style.top = '';
        } else if (event) {
            copyToast.classList.add('yummy-toast-cursor-mode');
            const toastWidth = copyToast.offsetWidth;
            let left = event.clientX + 10;
            if (left + toastWidth > window.innerWidth) {
                left = event.clientX - toastWidth - 10;
            }
            copyToast.style.left = `${left}px`;
            copyToast.style.top = `${event.clientY + 10}px`;
        } else {
            copyToast.classList.add('yummy-toast-panel-mode');
            copyToast.style.left = '50%';
            copyToast.style.top = '';
        }
        
        copyToast.classList.add('visible');

        toastTimer = setTimeout(() => {
            copyToast.classList.remove('visible');
            toastTimer = null;
        }, 2000);
    }

    function updateFollower() {
        if (cursorFollower) {
            cursorFollower.style.transform = `translate(${latestMouseX}px, ${latestMouseY}px)`;
        }
        isTicking = false;
    }

    function onMouseMove(e) {
        latestMouseX = e.clientX;
        latestMouseY = e.clientY;
        if (!isTicking) {
            window.requestAnimationFrame(updateFollower);
            isTicking = true;
        }
    }

    function getContainingBlock(node) {
        if (!node) return null;
        if (node.nodeType !== Node.ELEMENT_NODE) {
            node = node.parentElement;
        }
        if (!node) return null;
        return node.closest(CONTENT_ELEMENTS_SELECTOR);
    }

    function cleanFragment(fragment) {
        fragment.querySelectorAll('.yummy-rating-bar').forEach(el => el.remove());
        return fragment;
    }

    async function highlightSelection(range) {
        const selection = window.getSelection();
        const effectiveRange = range || (selection.rangeCount > 0 ? selection.getRangeAt(0) : null);

        if (!effectiveRange || effectiveRange.collapsed) {
            if (selection.rangeCount > 0) selection.removeAllRanges();
            return;
        }

        const parentElement = effectiveRange.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? effectiveRange.commonAncestorContainer : effectiveRange.commonAncestorContainer.parentElement;
        const isInMainContent = parentElement.closest('main');
        const isInsideYummyUI = parentElement.closest('.yummy-control-panel, .yummy-rating-bar, #yummy-collection-panel');

        if (!isInMainContent || isInsideYummyUI) {
            if (selection.rangeCount > 0) selection.removeAllRanges();
            logger.debug('Selection outside of main content or inside UI, ignoring.');
            return;
        }

        try {
            const mergedRange = await mergeWithExistingHighlights(effectiveRange);
            const allBlocks = Array.from(document.querySelectorAll(CONTENT_ELEMENTS_SELECTOR));
            const intersectingBlocks = new Set();
            allBlocks.forEach(block => {
                if (mergedRange.intersectsNode(block)) {
                    intersectingBlocks.add(getContainingBlock(block) || block);
                }
            });

            if (intersectingBlocks.size === 0 && parentElement && mergedRange.intersectsNode(parentElement)) {
                const singleBlock = getContainingBlock(parentElement);
                if (singleBlock) intersectingBlocks.add(singleBlock);
            }

            for (const block of intersectingBlocks) {
                const blockRange = document.createRange();
                blockRange.selectNodeContents(block);
                
                const start = mergedRange.compareBoundaryPoints(Range.START_TO_START, blockRange) > 0 ? mergedRange.startContainer : blockRange.startContainer;
                const startOffset = mergedRange.compareBoundaryPoints(Range.START_TO_START, blockRange) > 0 ? mergedRange.startOffset : blockRange.startOffset;
                const end = mergedRange.compareBoundaryPoints(Range.END_TO_END, blockRange) < 0 ? mergedRange.endContainer : blockRange.endContainer;
                const endOffset = mergedRange.compareBoundaryPoints(Range.END_TO_END, blockRange) < 0 ? mergedRange.endOffset : blockRange.endOffset;
                
                const intersectionRange = document.createRange();
                try {
                    intersectionRange.setStart(start, startOffset);
                    intersectionRange.setEnd(end, endOffset);
                } catch (rangeError) {
                    logger.warn("Error setting intersection range, skipping block.", rangeError);
                    continue; // Skip this block if range is invalid
                }

                if (!intersectionRange.collapsed) {
                    const highlightSpan = document.createElement('span');
                    highlightSpan.className = 'yummy-selection-highlight';
                    highlightSpan.addEventListener('click', async () => await unhighlightElement(highlightSpan));

                    const selectedContents = intersectionRange.extractContents();
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

        // After highlighting, save the state of all affected blocks
        document.querySelectorAll('.yummy-selection-highlight').forEach(async (highlight) => {
            const parentBlock = getContainingBlock(highlight);
            if(parentBlock) {
                const elementId = getStableElementId(parentBlock);
                if(elementId) {
                    await saveData(elementId, { highlightHTML: parentBlock.innerHTML });
                }
            }
        });

        syncCollectionPanelWithDOM();
    }

    async function mergeWithExistingHighlights(newRange) {
        const highlights = document.querySelectorAll('.yummy-selection-highlight');
        for (const highlight of highlights) {
            const highlightRange = document.createRange();
            highlightRange.selectNodeContents(highlight);

            if (newRange.intersectsNode(highlight)) {
                if (newRange.compareBoundaryPoints(Range.START_TO_START, highlightRange) > 0) {
                    newRange.setStart(highlightRange.startContainer, highlightRange.startOffset);
                }
                if (newRange.compareBoundaryPoints(Range.END_TO_END, highlightRange) < 0) {
                    newRange.setEnd(highlightRange.endContainer, highlightRange.endOffset);
                }
                await unhighlightElement(highlight);
            }
        }
        return newRange;
    }

    async function unhighlightElement(element) {
        if (!element || !element.parentNode) return;
        
        const parentBlock = getContainingBlock(element);
        const parent = element.parentNode;
        
        while (element.firstChild) {
            parent.insertBefore(element.firstChild, element);
        }
        parent.removeChild(element);
        parent.normalize();
    
        // After un-highlighting, save the new state of the parent block
        if (parentBlock) {
            const elementId = getStableElementId(parentBlock);
            if (elementId) {
                // If there are no more highlights in the block, remove the highlight data.
                const remainingHighlights = parentBlock.querySelector('.yummy-selection-highlight');
                await saveData(elementId, { highlightHTML: remainingHighlights ? parentBlock.innerHTML : null });
            }
        }
        
        logger.info('高亮已移除。');
        syncCollectionPanelWithDOM();
    }

    function handleTextSelection(event) {
        if (isSelectionModeActive) {
            highlightSelection();
            return;
        }

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            if (quickHighlightButton) quickHighlightButton.style.display = 'none';
            return;
        }

        const range = selection.getRangeAt(0);
        const parentElement = range.commonAncestorContainer.parentElement;
        
        // 核心逻辑修改：确保选中的内容必须位于AI助手的回复内，才显示高亮按钮。
        const isInsideAssistantMessage = parentElement.closest('[data-message-author-role="assistant"]');
        const isInsideYummyUI = parentElement.closest('.yummy-control-panel, .yummy-rating-bar, #yummy-collection-panel, #yummy-quick-highlight-button');

        if (!isInsideAssistantMessage || isInsideYummyUI) {
            if (quickHighlightButton) quickHighlightButton.style.display = 'none';
            return;
        }

        lastSelectionRange = range.cloneRange();
        quickHighlightButton.style.display = 'flex';
        quickHighlightButton.style.left = `${event.clientX + 5}px`;
        quickHighlightButton.style.top = `${event.clientY + 5}px`;
    }

    function closeActiveContextMenu() {
        if (activeContextMenu) {
            activeContextMenu.remove();
            activeContextMenu = null;
        }
    }

    syncCollectionPanelWithDOM = function() {
        if (!collectionContent) return;

        // BUGFIX: Preserve the temporary easter egg item if it exists.
        const eggElement = collectionContent.querySelector('.yummy-collection-item-temp-egg');

        let collectedItems = [];
        const processedElements = new Set();

        const addItem = (el, type, customTextExtractor = getCleanText) => {
            if (processedElements.has(el)) return;

            const text = customTextExtractor(el);
            if (text) {
                const id = simpleHash(text + type);
                const rect = el.getBoundingClientRect();
                collectedItems.push({
                    id,
                    text,
                    type,
                    position: rect.top + window.scrollY,
                    element: el
                });
                processedElements.add(el);
            }
        };

        document.querySelectorAll('.yummy-liked:not(.yummy-selection-highlight)').forEach(el => {
            if (!el.parentElement.closest('.yummy-liked')) {
                 addItem(el, 'liked', getTextWithHighlight);
            }
        });

        document.querySelectorAll('.yummy-selection-highlight').forEach(el => {
            addItem(el, 'highlight');
        });

        collectedItems.sort((a, b) => {
            const position = a.element.compareDocumentPosition(b.element);
            if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
                return -1;
            } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
                return 1;
            } else {
                return 0;
            }
        });

        const newIds = collectedItems.map(item => item.id);
        const currentIds = Array.from(collectionContent.querySelectorAll('.yummy-collection-item')).map(item => item.dataset.yummyItemId);

        let typeChanged = false;
        if (newIds.length === currentIds.length && newIds.every((id, index) => id === currentIds[index])) {
            const currentItems = Array.from(collectionContent.querySelectorAll('.yummy-collection-item'));
            for(let i=0; i<currentItems.length; i++){
                const currentTypeClass = Array.from(currentItems[i].classList).find(c => c.startsWith('type-'));
                if (currentTypeClass !== `type-${collectedItems[i].type}`) {
                    typeChanged = true;
                    break;
                }
            }
            if (!typeChanged) return;
        }

        const existingIds = new Set(newIds);
        for (const id of collectionItemStates.keys()) {
            if (!existingIds.has(id)) {
                collectionItemStates.delete(id);
            }
        }
        
        collectionContent.innerHTML = '';

        // If the egg element was found, put it back at the top.
        if (eggElement) {
            collectionContent.prepend(eggElement);
        }

        if (collectedItems.length > 0) {
            collectedItems.forEach(item => {
                 addItemToCollection(item);
            });
        }
        
        updateCategoryCheckboxStates();

        logger.info(`收集面板已自动同步，共 ${collectedItems.length} 个条目。`);
    }

    function addItemToCollection(itemData) {
        if (!collectionContent) return;

        const { id, text, type } = itemData;

        const item = document.createElement('div');
        item.className = `yummy-collection-item type-${type}`;
        item.dataset.yummyItemId = id;
        
        const isSelected = collectionItemStates.get(id) ?? true;
        if (isSelected) {
            item.classList.add('selected');
        }

        const statusBar = document.createElement('div');
        statusBar.className = 'yummy-item-status-bar';

        const textContentDiv = document.createElement('div');
        textContentDiv.className = 'yummy-item-text-content';
        const plainText = text;
        const markdownText = turndownService.turndown(itemData.element.innerHTML);
        textContentDiv.dataset.plainText = plainText;
        textContentDiv.dataset.markdownText = markdownText;
        textContentDiv.textContent = isMarkdownMode ? markdownText : plainText;
        
        item.appendChild(statusBar);
        item.appendChild(textContentDiv);

        statusBar.addEventListener('click', (event) => {
            event.stopPropagation();
            const newState = !item.classList.contains('selected');
            item.classList.toggle('selected', newState);
            collectionItemStates.set(id, newState);
            updateCategoryCheckboxStates();
        });
        
        item.addEventListener('click', (event) => {
            // 确保点击的不是状态栏
            if (event.target.closest('.yummy-item-status-bar')) {
                return;
            }
            const textToCopy = isMarkdownMode ? textContentDiv.dataset.markdownText : textContentDiv.dataset.plainText;
            navigator.clipboard.writeText(textToCopy).then(() => {
                showToast('已复制!', event);
                item.classList.add('copied-flash');
                setTimeout(() => item.classList.remove('copied-flash'), 700);
            }).catch(err => {
                logger.error('复制失败', err);
                showToast('复制失败!', event);
            });
        });

        item.addEventListener('mouseenter', () => {
            if (isPanelAnimating) return;
            
            const textElement = item.querySelector('.yummy-item-text-content');
            if (textElement && textElement.scrollHeight > textElement.clientHeight) {
                if (previewTooltip) {
                    previewTooltip.textContent = text;
                    previewTooltip.style.visibility = 'visible';
                    previewTooltip.style.opacity = '0';

                    const itemRect = item.getBoundingClientRect();
                    const tooltipRect = previewTooltip.getBoundingClientRect();

                    let left = itemRect.left - tooltipRect.width - 10;
                    if (left < 0) {
                        left = 10;
                    }

                    let top = itemRect.top + (itemRect.height / 2) - (tooltipRect.height / 2);
                    if (top < 0) {
                        top = 10;
                    } else if (top + tooltipRect.height > window.innerHeight) {
                        top = window.innerHeight - tooltipRect.height - 10;
                    }

                    previewTooltip.style.left = `${left}px`;
                    previewTooltip.style.top = `${top}px`;
                    previewTooltip.style.opacity = '1';
                }
            }
        });

        item.addEventListener('mouseleave', () => {
            if (previewTooltip) {
                previewTooltip.style.visibility = 'hidden';
                previewTooltip.style.opacity = '0';
            }
        });

        collectionContent.appendChild(item);

        setTimeout(() => {
            if (textContentDiv.scrollHeight > textContentDiv.clientHeight) {
                textContentDiv.classList.add('is-overflowing');
            } else {
                textContentDiv.classList.remove('is-overflowing');
            }
        }, 0);
    }

    function updateCategoryCheckboxStates() {
        const updateStateForType = (type) => {
            const controlArea = document.getElementById(`yummy-footer-select-${type}-area`);
            const checkbox = document.getElementById(`yummy-collection-select-${type}`);
            if (!controlArea || !checkbox) return;
            
            const allItemsOfType = collectionContent.querySelectorAll(`.yummy-collection-item.type-${type}`);
            const total = allItemsOfType.length;
            
            if (total === 0) {
                checkbox.checked = false;
                checkbox.indeterminate = false;
                controlArea.classList.remove('checked', 'indeterminate');
                controlArea.style.display = 'none';
                return;
            }
            
            controlArea.style.display = 'flex';
            const checkedCount = Array.from(allItemsOfType).filter(item => item.classList.contains('selected')).length;

            if (checkedCount === 0) {
                checkbox.checked = false;
                checkbox.indeterminate = false;
                controlArea.classList.remove('checked', 'indeterminate');
            } else if (checkedCount === total) {
                checkbox.checked = true;
                checkbox.indeterminate = false;
                controlArea.classList.add('checked');
                controlArea.classList.remove('indeterminate');
            } else {
                checkbox.checked = false;
                checkbox.indeterminate = true;
                controlArea.classList.add('indeterminate');
                controlArea.classList.remove('checked');
            }
        };
        
        updateStateForType('liked');
        updateStateForType('highlight');
    }

    function quickExitSelectionMode(event) {
        if (isSelectionModeActive && (event.key === 'Escape' || event.keyCode === 27)) {
            const toggleButton = document.querySelector('.yummy-control-button.active');
            if (toggleButton) toggleButton.click();
        }
    }

    function createUiElements() {
        const controlPanel = document.createElement('div');
        controlPanel.className = 'yummy-control-panel';

        const selectionModeButton = document.createElement('button');
        selectionModeButton.id = 'yummy-selection-mode-toggle';
        selectionModeButton.className = 'yummy-control-button';
        selectionModeButton.innerHTML = EMOJI_LIKE;
        selectionModeButton.title = '开启/关闭划词模式 (按Esc可快速退出)';

        const collectionToggleButton = document.createElement('button');
        collectionToggleButton.id = 'yummy-collection-toggle';
        collectionToggleButton.className = 'yummy-control-button';
        collectionToggleButton.innerHTML = '📚';
        collectionToggleButton.title = '打开/关闭收集面板';

        const aggregateBtn = document.createElement('button');
        aggregateBtn.className = 'yummy-control-button';
        aggregateBtn.id = 'yummy-aggregate-btn';
        aggregateBtn.textContent = '✨';
        aggregateBtn.title = '聚合评价 (单击: 最新, Shift+单击: 全部)';
        aggregateBtn.addEventListener('click', (e) => {
            const isGlobal = e.shiftKey;
            const scope = isGlobal ?
                document.body :
                Array.from(document.querySelectorAll('[data-message-author-role="assistant"]')).pop()?.closest('.group\\/turn-messages');

            if (!scope) {
                showGlobalAlert({
                    title: 'Yummy错误',
                    message: '找不到任何AI回复内容可供处理。'
                });
                return;
            }

            const aggregatedContent = generateAggregatePrompt(scope);

            if (!aggregatedContent) {
                const message = '在最新一轮的AI回复中没有找到任何"喜欢"、"不喜欢"或"高亮"的内容。';
                const details = '（小技巧：按住Shift再点击按钮，可以处理整个会话历史的标记内容）';
                showGlobalAlert({
                    title: 'Yummy提示',
                    message: message,
                    details: isGlobal ? '' : details
                });
                return;
            }

            if (isAutoSendActive) {
                const defaultInstruction = INSTRUCTIONS[0].instruction;
                const finalPrompt = `${aggregatedContent}\n\n${defaultInstruction}`;
                injectAndSendPrompt(finalPrompt);
            } else {
                if (isInstructionMenuVisible) {
                    hideInstructionMenu();
                } else {
                    openInstructionMenuWithContent(aggregatedContent);
                }
            }
         });

        const autoSendBtn = document.createElement('button');
        autoSendBtn.className = 'yummy-control-button';
        autoSendBtn.id = 'yummy-autosend-btn';
        autoSendBtn.textContent = '🚀';
        autoSendBtn.title = '自动发送已关闭，点击开启';
        autoSendBtn.addEventListener('click', () => {
            isAutoSendActive = !isAutoSendActive;
            autoSendBtn.classList.toggle('active', isAutoSendActive);
            autoSendBtn.title = isAutoSendActive ? '自动发送已开启，点击关闭' : '自动发送已关闭，点击开启';
        });

        const autoSendTooltip = document.createElement('div');
        autoSendTooltip.id = 'yummy-autosend-tooltip';
        autoSendTooltip.innerHTML = `点击可开启自动发送<br>为您节省一步操作！<span class="yummy-tooltip-dismiss-link">不再提示</span>`;
        autoSendBtn.appendChild(autoSendTooltip);

        const dismissLink = autoSendTooltip.querySelector('.yummy-tooltip-dismiss-link');

        if (localStorage.getItem('yummyAutoSendTooltipDismissed') !== 'true') {
            setTimeout(() => {
                autoSendTooltip.classList.add('visible');
            }, 1000); 
        }

        autoSendTooltip.addEventListener('click', (e) => {
            e.stopPropagation();
            autoSendTooltip.classList.remove('visible');
        });

        dismissLink.addEventListener('click', (e) => {
            e.stopPropagation();
            autoSendTooltip.classList.remove('visible');
            localStorage.setItem('yummyAutoSendTooltipDismissed', 'true');
        });

        const collapseBtn = document.createElement('button');
        collapseBtn.className = 'yummy-control-button';
        collapseBtn.id = 'yummy-collapse-toggle';
        collapseBtn.textContent = '▶️';
        collapseBtn.title = '收起/展开面板';
        collapseBtn.addEventListener('click', () => {
            const isCollapsed = controlPanel.classList.toggle('collapsed');
            collapseBtn.textContent = isCollapsed ? '◀️' : '▶️';
        });


        controlPanel.appendChild(selectionModeButton);
        controlPanel.appendChild(collectionToggleButton);
        controlPanel.appendChild(aggregateBtn);
        controlPanel.appendChild(autoSendBtn);
        controlPanel.appendChild(collapseBtn);
        document.body.appendChild(controlPanel);

        collectionPanel = document.createElement('div');
        collectionPanel.id = 'yummy-collection-panel';

        const collectionHeader = document.createElement('div');
        collectionHeader.id = 'yummy-collection-header';

        const collectionPinBtn = document.createElement('span');
        collectionPinBtn.id = 'yummy-collection-pin-btn';
        collectionPinBtn.textContent = '📌';
        collectionPinBtn.title = '钉住面板';

        const collectionHeaderText = document.createElement('span');
        collectionHeaderText.textContent = '📋 Yummy 收集面板';
        collectionHeader.title = '点击可钉住/取消钉住面板';

        collectionHeader.appendChild(collectionPinBtn);
        collectionHeader.appendChild(collectionHeaderText);
        collectionPanel.appendChild(collectionHeader);

        collectionContent = document.createElement('div');
        collectionContent.id = 'yummy-collection-content';
        collectionPanel.appendChild(collectionContent);

        const collectionFooter = document.createElement('div');
        collectionFooter.id = 'yummy-collection-footer';

        const createCategorySelector = (type, title) => {
            const area = document.createElement('div');
            area.id = `yummy-footer-select-${type}-area`;
            area.className = 'yummy-footer-control-area';
            area.title = title;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `yummy-collection-select-${type}`;
            checkbox.checked = true;
            checkbox.style.display = 'none';
            
            area.appendChild(checkbox);

            area.addEventListener('click', () => {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            });
            
            checkbox.addEventListener('change', () => {
                const isChecked = checkbox.checked;
                const itemsToToggle = collectionContent.querySelectorAll(`.yummy-collection-item.type-${type}`);
                itemsToToggle.forEach(item => {
                    const itemId = item.dataset.yummyItemId;
                    if (itemId) {
                        item.classList.toggle('selected', isChecked);
                        collectionItemStates.set(itemId, isChecked);
                    }
                });
                updateCategoryCheckboxStates();
            });

            return area;
        };

        const selectLikedArea = createCategorySelector('liked', '全选/全不选段落');
        const selectHighlightArea = createCategorySelector('highlight', '全选/全不选语句');

        const copySelectedBtn = document.createElement('button');
        copySelectedBtn.id = 'yummy-collection-copy-selected-btn';
        copySelectedBtn.textContent = '复制选中内容';
        
        collectionFooter.appendChild(selectLikedArea);
        collectionFooter.appendChild(selectHighlightArea);
        collectionFooter.appendChild(copySelectedBtn);
        collectionPanel.appendChild(collectionFooter);

        document.body.appendChild(collectionPanel);

        // --- Event Listeners for UI Elements ---

        selectionModeButton.addEventListener('click', () => {
            isSelectionModeActive = !isSelectionModeActive;
            selectionModeButton.classList.toggle('active', isSelectionModeActive);
            document.body.classList.toggle('yummy-selection-mode-active', isSelectionModeActive);
            cursorFollower.style.display = isSelectionModeActive ? 'block' : 'none';
            logger.info('划词模式已' + (isSelectionModeActive ? '开启' : '关闭'));
        });

        collectionToggleButton.addEventListener('click', () => {
            collectionPanel.classList.toggle('visible');
        });

        collectionPinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isCollectionPanelPinned = !isCollectionPanelPinned;
            collectionPinBtn.classList.toggle('pinned', isCollectionPanelPinned);
            collectionPinBtn.title = isCollectionPanelPinned ? '取消钉住' : '钉住面板';
        });

        // Clear All Markings Easter Egg
        collectionHeader.addEventListener('dblclick', (e) => {
            // 确保双击的不是功能性按钮
            const isFunctionalButton = e.target.closest('#yummy-collection-pin-btn, #yummy-collection-mode-toggle');
            if (!isFunctionalButton) {
                promptToClearAllMarkings();
            }
        });
        
        collectionPanel.addEventListener('mouseenter', () => {
            if (collectionHideTimer) {
                clearTimeout(collectionHideTimer);
                collectionHideTimer = null;
            }
        });

        collectionPanel.addEventListener('mouseleave', () => {
            if (!isCollectionPanelPinned && !activeContextMenu) {
                collectionHideTimer = setTimeout(() => {
                    collectionPanel.classList.remove('visible');
                }, 1000);
            }
        });

        copySelectedBtn.addEventListener('click', (e) => {
            const selectedItems = collectionContent.querySelectorAll('.yummy-collection-item.selected:not(.yummy-collection-item-temp-egg)');
            if (selectedItems.length === 0) {
                showToast('没有选中的内容', null, true);

                // Empty Collection Copy Easter Egg Logic
                clearTimeout(emptyCopyClickTimer);
                emptyCopyClickCount++;
                emptyCopyClickTimer = setTimeout(() => { emptyCopyClickCount = 0; }, 2000); // Reset after 2 seconds

                if (emptyCopyClickCount >= 5) {
                    triggerEmptyCopyEgg();
                    emptyCopyClickCount = 0;
                    clearTimeout(emptyCopyClickTimer);
                }
                return;
            }

            const allText = Array.from(selectedItems)
                .map(item => {
                    const textDiv = item.querySelector('.yummy-item-text-content');
                    return isMarkdownMode ? textDiv.dataset.markdownText : textDiv.dataset.plainText;
                })
                .join('\n\n---\n\n');

            navigator.clipboard.writeText(allText).then(() => {
                 showToast(`已复制 ${selectedItems.length} 个条目`, null, true);
            }).catch(err => {
                logger.error('复制选中内容失败', err);
                showToast('复制失败', null, true);
            });
        });

        quickHighlightButton = document.createElement('div');
        quickHighlightButton.id = 'yummy-quick-highlight-button';
        quickHighlightButton.textContent = EMOJI_LIKE;
        quickHighlightButton.title = '高亮选中内容';
        document.body.appendChild(quickHighlightButton);
        quickHighlightButton.addEventListener('mousedown', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await highlightSelection(lastSelectionRange);
            quickHighlightButton.style.display = 'none';
        });

        cursorFollower = document.createElement('div');
        cursorFollower.id = 'yummy-cursor-follower';
        cursorFollower.textContent = '✒️';
        document.body.appendChild(cursorFollower);

        copyToast = document.createElement('div');
        copyToast.id = 'yummy-copy-toast';
        const toastText = document.createElement('span');
        copyToast.appendChild(toastText);
        collectionPanel.appendChild(copyToast); // 移动到 collectionPanel 内部

        collectionPanel.addEventListener('transitionstart', (event) => {
            if (event.propertyName === 'right') {
                isPanelAnimating = true;
            }
        });
        collectionPanel.addEventListener('transitionend', (event) => {
            if (event.propertyName === 'right') {
                isPanelAnimating = false;
            }
        });

        previewTooltip = document.createElement('div');
        previewTooltip.id = 'yummy-preview-tooltip';
        document.body.appendChild(previewTooltip);

        // Symmetric to pin button, on the right
        const collectionModeToggle = document.createElement('span');
        collectionModeToggle.id = 'yummy-collection-mode-toggle';
        collectionModeToggle.title = '切换显示模式: 纯文本 / Markdown';
        
        collectionModeToggle.addEventListener('click', () => {
            isMarkdownMode = !isMarkdownMode;
            collectionModeToggle.classList.toggle('markdown-mode', isMarkdownMode);
            
            // 遍历所有已有的收集项，切换它们的显示内容
            const allItems = collectionContent.querySelectorAll('.yummy-collection-item');
            allItems.forEach(item => {
                const textDiv = item.querySelector('.yummy-item-text-content');
                if (textDiv) {
                    textDiv.textContent = isMarkdownMode ? textDiv.dataset.markdownText : textDiv.dataset.plainText;
                }
            });
        });
        collectionHeader.appendChild(collectionModeToggle);
    }

    function createGlobalAlert() {
        if (globalAlert) return;
        globalAlert = document.createElement('div');
        globalAlert.className = 'yummy-global-alert-overlay';
        globalAlert.innerHTML = `
            <div class="yummy-global-alert-box">
                <h3 class="yummy-global-alert-title"></h3>
                <p class="yummy-global-alert-message"></p>
                <p class="yummy-global-alert-details"></p>
                <div class="yummy-global-alert-footer"></div>
            </div>
        `;
        document.body.appendChild(globalAlert);

        globalAlert.addEventListener('click', (e) => {
            // For simple alerts with default button, clicking overlay also hides it.
            // For alerts with multiple buttons, this should not happen.
            const footer = globalAlert.querySelector('.yummy-global-alert-footer');
            if (e.target === globalAlert && footer.childElementCount <= 1) {
                hideGlobalAlert();
            }
        });
    }

    function showGlobalAlert({ title, message, details = '', buttons = [] }) {
        if (!globalAlert) createGlobalAlert();
        globalAlert.querySelector('.yummy-global-alert-title').textContent = title;
        globalAlert.querySelector('.yummy-global-alert-message').textContent = message;
        
        const detailsEl = globalAlert.querySelector('.yummy-global-alert-details');
        detailsEl.textContent = details;
        detailsEl.style.display = details ? 'block' : 'none';

        const footer = globalAlert.querySelector('.yummy-global-alert-footer');
        footer.innerHTML = ''; // Clear previous buttons

        if (buttons.length === 0) {
            // Default button for simple alerts
            buttons.push({ text: '明白啦！', class: 'yummy-alert-btn-primary', onClick: hideGlobalAlert });
        }

        buttons.forEach(btnData => {
            const button = document.createElement('button');
            button.textContent = btnData.text;
            button.className = 'yummy-global-alert-button';
            if (btnData.class) {
                button.classList.add(btnData.class);
            }
            button.addEventListener('click', () => {
                // The button's own action might hide the alert.
                // It's safer to let the onClick handler do it.
                btnData.onClick();
            });
            footer.appendChild(button);
        });

        globalAlert.classList.add('visible');
    }

    function hideGlobalAlert() {
        if (globalAlert) {
            globalAlert.classList.remove('visible');
        }
    }

    function createInstructionMenu() {
        if (instructionMenu) return;

        instructionMenu = document.createElement('div');
        instructionMenu.id = 'yummy-instruction-menu';
        
        const header = document.createElement('div');
        header.className = 'yummy-instruction-header';
        
        const title = document.createElement('h3');
        title.innerHTML = `选择指令 <span class="yummy-hint-text">(↑↓键切换)</span>`;
        
        const closeBtn = document.createElement('span');
        closeBtn.className = 'yummy-instruction-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.title = '关闭 (Esc)';
        closeBtn.addEventListener('click', hideInstructionMenu);
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        
        const list = document.createElement('ul');
        list.className = 'yummy-instruction-list';

        INSTRUCTIONS.forEach((instr, index) => {
            const item = document.createElement('li');
            item.className = 'yummy-instruction-item';
            item.dataset.index = index;
            item.innerHTML = `<span><span class="emoji">${instr.emoji}</span> ${instr.label}</span>`;
            
            item.addEventListener('mouseenter', () => {
                updateInstructionSelection(index);
            });
            item.addEventListener('click', () => {
                confirmInstructionSelection();
            });

            list.appendChild(item);
        });

        const separator = document.createElement('div');
        separator.className = 'yummy-instruction-item yummy-separator';
        list.appendChild(separator);

        const customItem = document.createElement('li');
        customItem.className = 'yummy-instruction-item';
        customItem.dataset.index = INSTRUCTIONS.length;
        customItem.innerHTML = `<span><span class="emoji">✏️</span> 自定义指令...</span> <span class="yummy-hint-text">(Backspace)</span>`;
        customItem.addEventListener('mouseenter', () => {
            updateInstructionSelection(INSTRUCTIONS.length);
        });
        customItem.addEventListener('click', () => {
            confirmInstructionSelection();
        });
        list.appendChild(customItem);
        
        instructionMenu.appendChild(header);
        instructionMenu.appendChild(list);
        document.body.appendChild(instructionMenu);
    }

    function showInstructionMenu() {
        if (!instructionMenu) createInstructionMenu();
        
        const inputBox = document.querySelector('div#prompt-textarea');
        if (!inputBox) {
            logger.error("Yummy! 定位错误: 找不到输入框 #prompt-textarea");
            return;
        }

        const anchorElement = inputBox.closest('form');
        if (!anchorElement) {
            logger.error("Yummy! 定位错误: 找不到作为锚点的 <form> 元素。");
            return;
        }

        const rect = anchorElement.getBoundingClientRect();
        instructionMenu.style.top = `${rect.bottom - instructionMenu.offsetHeight}px`;
        instructionMenu.style.left = `${rect.left - instructionMenu.offsetWidth - 15}px`;
        
        instructionMenu.classList.add('visible');
        isInstructionMenuVisible = true;
        
        document.addEventListener('keydown', handleInstructionMenuKeys, true);
        
        updateInstructionSelection(0);
    }

    function hideInstructionMenu() {
        if (instructionMenu) {
            instructionMenu.classList.remove('visible');
        }
        isInstructionMenuVisible = false;
        currentInstructionIndex = -1;
        aggregatedContentCache = '';
        document.removeEventListener('keydown', handleInstructionMenuKeys, true);
    }

    function updateInstructionSelection(index) {
        if (!isInstructionMenuVisible) return;
        
        currentInstructionIndex = index;
        
        const items = instructionMenu.querySelectorAll('.yummy-instruction-item:not(.yummy-separator)');
        items.forEach((item, i) => {
            item.classList.toggle('selected', i === index);
        });
        
        if (index >= 0 && index < INSTRUCTIONS.length) {
            updateInputBoxWithInstruction(INSTRUCTIONS[index].instruction);
        } else if (index === INSTRUCTIONS.length) { // 自定义
            updateInputBoxWithInstruction('', true);
        }
    }

    function confirmInstructionSelection() {
        // 最终确认选择，此时输入框内容已经是正确的，只需要关闭菜单
        hideInstructionMenu();
    }

    function handleInstructionMenuKeys(e) {
        if (!isInstructionMenuVisible) return;

        const totalItems = INSTRUCTIONS.length + 1; // +1 for custom
        let newIndex = currentInstructionIndex;

        switch(e.key) {
            case 'ArrowUp':
                e.preventDefault();
                e.stopImmediatePropagation();
                newIndex = (currentInstructionIndex - 1 + totalItems) % totalItems;
                break;
            case 'ArrowDown':
                e.preventDefault();
                e.stopImmediatePropagation();
                newIndex = (currentInstructionIndex + 1) % totalItems;
                break;
            case 'Enter':
                e.preventDefault();
                e.stopImmediatePropagation();
                confirmInstructionSelection();
                return; 
            case 'Escape':
                e.preventDefault();
                e.stopImmediatePropagation();
                hideInstructionMenu();
                return;
            case 'Backspace':
                e.preventDefault();
                e.stopImmediatePropagation();
                // 切换到"自定义指令"模式，这会清除输入框中的预设指令
                updateInstructionSelection(INSTRUCTIONS.length);
                // 延迟关闭菜单，为用户提供视觉反馈
                setTimeout(() => {
                    hideInstructionMenu();
                }, 300);
                return;
            default:
                // 数字快捷键
                const num = parseInt(e.key, 10);
                if (!isNaN(num) && num >= 1 && num <= INSTRUCTIONS.length) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    newIndex = num - 1;
                } else {
                    return; // 不是我们的快捷键，不处理
                }
        }
        
        if (newIndex !== currentInstructionIndex) {
            updateInstructionSelection(newIndex);
        }
    }

    // --- Easter Egg Functions ---

    function triggerSugarRush() {
        const candies = ['🍬', '🍭', '🍰', '🍩', '🍪', '🍫', '🍦'];
        const container = document.createElement('div');
        container.className = 'yummy-sugar-rush-container';
        document.body.appendChild(container);
    
        for (let i = 0; i < 30; i++) { // Spawn 30 candies
            setTimeout(() => {
                const candy = document.createElement('span');
                candy.className = 'yummy-candy-emoji';
                candy.textContent = candies[Math.floor(Math.random() * candies.length)];
                candy.style.left = `${Math.random() * 100}vw`;
                candy.style.animationDuration = `${Math.random() * 2 + 3}s`; // 3-5s duration
                container.appendChild(candy);
            }, i * 50); // Stagger the creation for a nicer effect
        }
    
        setTimeout(() => {
            container.remove();
        }, 5000); // Remove the container after all animations are well and truly over
    }

    async function clearAllMarkings() {
        if (!currentConversationId) return;
        const storageKey = `${STORAGE_KEY_PREFIX}${currentConversationId}`;
        try {
            // 1. Clear from storage
            await chrome.storage.local.remove(storageKey);
            
            // 2. Clear in-memory state
            currentConversationState = {};
            
            // 3. Clear all visual markings from the DOM without causing side-effects
            document.querySelectorAll('.yummy-liked, .yummy-disliked').forEach(el => {
                el.classList.remove('yummy-liked', 'yummy-disliked');
            });

            const highlights = document.querySelectorAll('.yummy-selection-highlight');
            highlights.forEach(el => {
                const parent = el.parentNode;
                if (parent) {
                    while (el.firstChild) {
                        parent.insertBefore(el.firstChild, el);
                    }
                    parent.removeChild(el);
                    parent.normalize();
                }
            });
            
            // 4. Update the UI panels
            syncCollectionPanelWithDOM();
            hideGlobalAlert();
            
            logger.info(`All markings for conversation ${currentConversationId} have been cleared.`);
        } catch (error) {
            logger.error('Failed to clear all markings:', error);
        }
    }

    function promptToClearAllMarkings() {
        if (!currentConversationId) {
            showGlobalAlert({ title: '提示', message: '当前没有在一个有效的会话中。'});
            return;
        }
        
        showGlobalAlert({
            title: '清除确认',
            message: '您确定要清除本会话的所有标记吗？',
            details: '此操作不可恢复！',
            buttons: [
                {
                    text: '残忍清除',
                    class: 'yummy-alert-btn-danger',
                    onClick: async () => {
                        await clearAllMarkings();
                    }
                },
                {
                    text: '我再想想',
                    class: 'yummy-alert-btn-secondary',
                    onClick: hideGlobalAlert
                }
            ]
        });
    }

    function triggerEmptyCopyEgg() {
        if (!collectionContent || collectionContent.querySelector('.yummy-collection-item-temp-egg')) {
            return; // Don't add if one is already present
        }
    
        const lyric = '城市的花园没有花，广播里的声音嘶哑……';
        const item = document.createElement('div');
        item.className = 'yummy-collection-item yummy-collection-item-temp-egg';
        
        const textContentDiv = document.createElement('div');
        textContentDiv.className = 'yummy-item-text-content';
        textContentDiv.textContent = lyric;
        item.appendChild(textContentDiv);
        
        collectionContent.prepend(item);
        
        setTimeout(() => {
            item.style.opacity = '0';
            item.style.maxHeight = '0';
            item.style.paddingTop = '0';
            item.style.paddingBottom = '0';
            item.style.marginTop = '0';
            item.style.marginBottom = '0';
            item.style.borderWidth = '0';
            setTimeout(() => {
                if (item.parentNode) {
                    item.remove();
                }
            }, 500); // Remove from DOM after transition
        }, 30000); // 30 seconds
    }

    function restoreHighlight(element, highlightHTML) {
        // Create a temporary div to parse the saved HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = highlightHTML;
    
        const newNodes = [];
        // Find all text nodes and highlighted spans in the saved HTML
        tempDiv.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                newNodes.push(document.createTextNode(node.textContent));
            } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'SPAN' && node.classList.contains('yummy-selection-highlight')) {
                const span = document.createElement('span');
                span.className = 'yummy-selection-highlight';
                span.textContent = node.textContent;
                span.addEventListener('click', () => unhighlightElement(span));
                newNodes.push(span);
            } else {
                // For other nodes (like <b>, <i>), clone them
                newNodes.push(node.cloneNode(true));
            }
        });
    
        // Replace the element's content with the new nodes
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
        newNodes.forEach(node => {
            element.appendChild(node);
        });
    }


    function initializeFeatures() {
        try {
            // Initialize Turndown service
            turndownService = new TurndownService({ 
                headingStyle: 'atx', 
                codeBlockStyle: 'fenced' 
            });

            // Initialize the logger's UI first, so it's ready for any subsequent logs.
            if (window.logger && typeof window.logger.init === 'function') {
                window.logger.init();
            }

            createUiElements();
            createGlobalAlert();
            createInstructionMenu(); // vNext: 提前创建好菜单DOM
            document.addEventListener('mouseup', handleTextSelection);
            document.addEventListener('keydown', quickExitSelectionMode);
            document.addEventListener('mousemove', onMouseMove);

            document.addEventListener('click', (event) => {
                if (
                    collectionPanel &&
                    collectionPanel.classList.contains('visible') &&
                    !isCollectionPanelPinned &&
                    !collectionPanel.contains(event.target)
                ) {
                    const controlPanel = document.querySelector('.yummy-control-panel');
                    if (!controlPanel || !controlPanel.contains(event.target)) {
                        collectionPanel.classList.remove('visible');
                        logger.debug('Clicked outside, hiding collection panel.');
                    }
                }

                // vNext: 点击菜单外部时关闭菜单
                if (isInstructionMenuVisible && instructionMenu && !instructionMenu.contains(event.target)) {
                    const aggregateBtn = document.getElementById('yummy-aggregate-btn');
                    if (aggregateBtn && aggregateBtn.contains(event.target)) {
                        // 点击聚合按钮本身由其自己的监听器处理，此处不作操作。
                        return;
                    }
                    
                    // 只有当输入框内容为空时，点击外部才关闭菜单，以防止误触。
                    const inputBox = document.querySelector('div#prompt-textarea');
                    if (!inputBox || inputBox.innerText.trim() === '') {
                       hideInstructionMenu();
                    }
                }
            });

            document.addEventListener('mousedown', (e) => {
                if (quickHighlightButton && e.target !== quickHighlightButton) {
                    quickHighlightButton.style.display = 'none';
                }
                if (activeContextMenu && !activeContextMenu.contains(e.target)) {
                    closeActiveContextMenu();
                }
            });
            document.addEventListener('scroll', () => {
                if (quickHighlightButton) quickHighlightButton.style.display = 'none';
            });
        } catch (e) {
            console.error("Yummy! fatal error during UI initialization:", e);
            const errorDiv = document.createElement('div');
            errorDiv.textContent = `Yummy! A critical error occurred: ${e.message}. Some features might not work. Please try reloading the page.`;
            errorDiv.style.position = 'fixed';
            errorDiv.style.top = '10px';
            errorDiv.style.right = '10px';
            errorDiv.style.backgroundColor = 'red';
            errorDiv.style.color = 'white';
            errorDiv.style.padding = '10px';
            errorDiv.style.zIndex = '10000';
            errorDiv.style.borderRadius = '5px';
            document.body.appendChild(errorDiv);
        }
    }

    async function loadDataForConversation(conversationId) {
        if (!conversationId) {
            currentConversationState = {};
            return;
        }
        try {
            const storageKey = `${STORAGE_KEY_PREFIX}${conversationId}`;
            const result = await chrome.storage.local.get(storageKey);
            currentConversationState = result[storageKey] || {};
            logger.info(`Loaded data for conversation ${conversationId}:`, currentConversationState);
            // After loading, re-process elements to apply the loaded state
            messageElementsCache.clear();
            await processNewElements();
        } catch (error) {
            logger.error('Failed to load data from chrome.storage.local:', error);
            currentConversationState = {};
        }
    }
    
    let lastUrl = window.location.href;
    
    async function handleUrlChange() {
        const newUrl = window.location.href;
        if (newUrl !== lastUrl) {
            lastUrl = newUrl;
            messageElementsCache.clear(); // Clear cache on URL change
            const newConversationId = getConversationId();
            if (newConversationId !== currentConversationId) {
                logger.info(`Conversation changed from ${currentConversationId} to ${newConversationId}`);
                currentConversationId = newConversationId;
                await loadDataForConversation(currentConversationId);
            }
        }
    }
    
    async function initializePersistence() {
        currentConversationId = getConversationId();
        await loadDataForConversation(currentConversationId);
    
        // Listen for URL changes to handle SPA navigation
        new MutationObserver(handleUrlChange).observe(document.body, { childList: true, subtree: true });
        // Also check on popstate (browser back/forward buttons)
        window.addEventListener('popstate', handleUrlChange);
    }
    

    function initializeYummy() {
        try {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            logger.info("Yummy 观察者已启动。");
        } catch (e) {
            console.error("Yummy! failed to start observer:", e);
        }
    }

    function runWhenStable() {
        let stabilityTimer = null;
        let isInitialized = false;

        const stabilityObserver = new MutationObserver(() => {
            if (isInitialized) return;
            clearTimeout(stabilityTimer);
            stabilityTimer = setTimeout(() => {
                // DOM is stable now for a longer period.
                // Double requestAnimationFrame to wait for next paint cycle.
                requestAnimationFrame(() => {
                    requestAnimationFrame(async () => {
                        if (isInitialized) return;
                        isInitialized = true;
                        
                        stabilityObserver.disconnect();
                        logger.debug("DOM 已稳定，Yummy! 正式启动。");
                        
                        // Now, safely initialize all features.
                        try {
                            initializeFeatures();
                            await initializePersistence(); // Initialize persistence logic
                            initializeYummy(); // This sets up the main, long-term observer
                            logger.info("Yummy! 插件已成功初始化。");
                        } catch (e) {
                            logger.error("Yummy! 插件初始化时发生致命错误: ", e);
                            const errorDiv = document.createElement('div');
                            errorDiv.textContent = `Yummy! 插件启动失败，请尝试刷新页面或联系开发者。错误: ${e.message}`;
                            errorDiv.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background-color:red;color:white;padding:10px;border-radius:5px;z-index:9999;font-size:14px;';
                            document.body.appendChild(errorDiv);
                        }
                    });
                });
            }, 1500); // Increased stability wait time to 1.5 seconds.
        });

        stabilityObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    runWhenStable();

})();