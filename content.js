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


// --- 初始化与环境检查 ---

// 通过检查 `update_url` (一个只在发布版 manifest.json 中存在的字段) 来判断扩展是否处于本地解压的开发模式。
// 这是一个非常巧妙且无侵入性的环境判断方法。
const isDevMode = !('update_url' in chrome.runtime.getManifest());

if (!isDevMode) {
    // 如果是生产环境（例如从 Chrome 网上应用店安装），则用一个"空壳"对象替换全局的 logger。
    // 这个"空壳"对象拥有与真实 logger 完全相同的接口（方法名），但所有方法都是空函数，什么也不做。
    // 这样做的好处是：
    // 1.  **性能优化**：在生产环境中，所有日志记录相关的开销（包括创建日志面板的DOM操作）都被完全移除。
    // 2.  **代码整洁**：业务逻辑代码中无需遍布 `if (isDevMode)` 的检查，可以直接调用 logger 的方法，实现了开发与生产的无缝切换。
    window.logger = {
        log: () => { },
        info: () => { },
        warn: () => { },
        error: () => { },
        debug: () => { },
        group: () => { },
        groupEnd: () => { },
        init: () => { }
    };
}

logger.info('Yummy! 内容脚本已加载。');

const EMOJI_LIKE = '😋';
const EMOJI_DISLIKE = '🤮';

// --- 功能模块 1: 评价栏系统 ---

/**
 * 为目标元素及其所有后代文本节点应用"喜欢"或"不喜欢"的状态。
 * @param {HTMLElement} targetElement - 需要应用状态的顶层元素。
 * @param {'liked' | 'disliked' | 'none'} state - 需要应用的状态。
 */
function applyHierarchicalState(targetElement, state) {
    // 定义需要被统一应用状态的后代元素选择器。
    const descendantSelector = 'p, h1, h2, h3, h4, h5, h6, li';
    // 首先清理目标元素自身可能存在的旧状态。
    targetElement.classList.remove('yummy-liked', 'yummy-disliked');
    // 然后清理其所有后代元素可能存在的旧状态。
    const descendants = targetElement.querySelectorAll(descendantSelector);
    descendants.forEach(d => d.classList.remove('yummy-liked', 'yummy-disliked'));

    // 根据新状态，为目标元素及其所有后代添加对应的 CSS 类。
    if (state === 'liked') {
        targetElement.classList.add('yummy-liked');
        descendants.forEach(d => d.classList.add('yummy-liked'));
    } else if (state === 'disliked') {
        targetElement.classList.add('yummy-disliked');
        descendants.forEach(d => d.classList.add('yummy-disliked'));
    }
    logger.debug(`已将状态 '${state}' 应用到元素及其子项。`, targetElement);
}

/**
 * 为指定的页面元素动态创建并注入一个评价栏。
 * 这是整个评价功能的核心入口。
 * @param {HTMLElement} element - 需要添加评价栏的原始页面元素 (如 <p>, <h1>)。
 */
function addRatingBar(element) {
    // 防御性检查：通过在元素上设置一个自定义数据属性 `data-yummy-processed` 作为标记，
    // 防止同一个元素被重复处理，这在 MutationObserver 的回调中尤为重要。
    if (element.dataset.yummyProcessed) return;
    element.dataset.yummyProcessed = 'true';

    // **核心设计：包裹容器 (Wrapper Div)**
    // 创建一个 <div> 容器，并将原始的 `element` 包裹进去。
    // 这个容器是实现交互的关键，其目的在 style.css 中有详细解释。
    // v0.4.4 版本中，这个包裹逻辑是所有列表（<li>）排版问题的根源，因为它没有考虑到
    // <li> 元素的父子结构约束，即 <ul> 的直接子元素不能是 <div>。
    const container = document.createElement('div');
    container.className = 'yummy-paragraph-container';
    element.parentNode.insertBefore(container, element);
    container.appendChild(element);

    const ratingBar = document.createElement('div');
    ratingBar.className = 'yummy-rating-bar';

    // --- 新增：绝对水平对齐逻辑 (v0.4.6) ---
    // 为了解决列表缩进导致评价栏错位的问题，我们采用JS动态计算其绝对水平位置。
    // 1. 找到一个稳定的、所有评价栏共有的祖先容器作为基准（这里是'.group/conversation-turn'）。
    // 2. 计算当前元素容器（.yummy-paragraph-container）相对于基准容器的水平偏移量（即缩进量）。
    // 3. 从预设的左偏移（-85px）中减去这个缩进量，得到新的left值。
    // 这样，无论元素（如<li>）缩进了多少，其评价栏的最终绝对位置都会被校正到同一垂直线上，实现精准对齐。
    const turnContainer = element.closest('.group\\/conversation-turn');
    if (turnContainer) {
        const turnContainerRect = turnContainer.getBoundingClientRect();
        // `container` 就是 .yummy-paragraph-container
        const containerRect = container.getBoundingClientRect(); 
        const indentation = containerRect.left - turnContainerRect.left;
        const baseLeftOffset = -85; // 这个值必须与 style.css 中的 `padding-left` 和 `margin-left` 联动
        
        ratingBar.style.left = `${baseLeftOffset - indentation}px`;
    }

    const likeButton = document.createElement('span');
    likeButton.className = 'yummy-rating-button';
    likeButton.textContent = EMOJI_LIKE;
    likeButton.title = '想吃 (Like)';
    likeButton.addEventListener('click', (e) => {
        // 阻止事件冒泡，防止意外触发更上层元素的点击事件。
        e.stopPropagation();
        // 判断当前元素是否为标题（父级元素）。
        const isParent = /H[1-6]/.test(element.tagName);
        if (isParent) {
            // 如果是标题，则走复杂的分级评价逻辑。
            handleParentRating(element, 'liked');
        } else {
            // 如果是普通元素，则走简单的切换逻辑。
            const isAlreadyLiked = element.classList.contains('yummy-liked');
            applyHierarchicalState(element, isAlreadyLiked ? 'none' : 'liked');
        }
    });

    const dislikeButton = document.createElement('span');
    dislikeButton.className = 'yummy-rating-button';
    dislikeButton.textContent = EMOJI_DISLIKE;
    dislikeButton.title = '想吐 (Dislike)';
    dislikeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const isParent = /H[1-6]/.test(element.tagName);
        if (isParent) {
            handleParentRating(element, 'disliked');
        } else {
            const isAlreadyDisliked = element.classList.contains('yummy-disliked');
            applyHierarchicalState(element, isAlreadyDisliked ? 'none' : 'disliked');
        }
    });

    ratingBar.appendChild(likeButton);
    ratingBar.appendChild(dislikeButton);
    container.appendChild(ratingBar);
}

// 定义一个全局的选择器，用于匹配所有需要添加评价栏的目标元素。
const CONTENT_ELEMENTS_SELECTOR = `[data-message-author-role="assistant"] h1, [data-message-author-role="assistant"] h2, [data-message-author-role="assistant"] h3, [data-message-author-role="assistant"] h4, [data-message-author-role="assistant"] h5, [data-message-author-role="assistant"] h6, [data-message-author-role="assistant"] p, [data-message-author-role="assistant"] pre, [data-message-author-role="assistant"] li, [data-message-author-role="assistant"] table`;

/**
 * 扫描整个文档，为所有符合条件的新元素添加评价栏。
 */
function processNewElements() {
    document.querySelectorAll(CONTENT_ELEMENTS_SELECTOR).forEach(element => {
        // 利用 `data-yummy-processed` 标记来避免重复处理。
        if (!element.dataset.yummyProcessed) addRatingBar(element);
    });
}

// 使用 Map 数据结构来存储每个父级元素（标题）的评价状态。
// Key 是 HTMLElement 对象，Value 是一个记录了评价类型和点击等级的状态对象。
// 相比于在元素上直接附加属性，使用 Map 更干净、更安全，不会污染 DOM。
const parentClickState = new Map();

/**
 * 处理对父级元素（特指标题 h1-h6）的评价逻辑。
 * 这是一个有状态的、分两级的复杂交互。
 * @param {HTMLElement} parentElement - 被点击的标题元素。
 * @param {'liked' | 'disliked'} newRating - 本次点击的评价类型。
 */
function handleParentRating(parentElement, newRating) {
    // 获取或初始化当前标题的状态。
    const state = parentClickState.get(parentElement) || {
        rating: 'none', // 'none', 'liked', 'disliked'
        level: 0        // 0: 初始, 1: 仅评价父级, 2: 评价整个块
    };
    // 获取该标题下的所有后续内容块。
    const children = getSubsequentSiblings(parentElement);

    // 情况一：重复点击同一个评价按钮（例如，连续点两次"喜欢"）
    if (newRating === state.rating) {
        if (state.level === 1) {
            // **第二次点击：** 从"仅评价标题"升级为"评价整个块"。
            state.level = 2;
            children.forEach(child => applyHierarchicalState(child, newRating));
            logger.debug(`块状评价 (二次点击): ${newRating}`, parentElement);
        } else { // level is 2 or 0
            // **第三次点击（或从初始状态的第二次无效点击）：** 取消所有评价。
            state.rating = 'none';
            state.level = 0;
            applyHierarchicalState(parentElement, 'none');
            children.forEach(child => applyHierarchicalState(child, 'none'));
            logger.debug(`块状评价 (取消): none`, parentElement);
        }
    }
    // 情况二：点击了不同的评价按钮（例如，从"喜欢"切换到"不喜欢"）
    else {
        if (state.level === 2) {
            // 如果之前已经对整个块进行了评价，则直接"翻转"整个块的评价。
            state.rating = newRating;
            // level 保持为 2
            applyHierarchicalState(parentElement, newRating);
            children.forEach(child => applyHierarchicalState(child, newRating));
            logger.debug(`块状评价 (翻转): ${newRating}`, parentElement);
        }
        else {
            // **首次点击：**
            // 1. 设置新的评价类型和等级1。
            state.rating = newRating;
            state.level = 1;
            // 2. 清理所有旧状态，确保一个干净的开始。
            applyHierarchicalState(parentElement, 'none');
            children.forEach(child => applyHierarchicalState(child, 'none'));
            // 3. 应用新状态到父级元素。
            applyHierarchicalState(parentElement, newRating);
            // 4. "闪烁"所有子元素，提示用户它们是受影响的范围。
            children.forEach(child => flashElement(child));
            logger.debug(`块状评价 (首次点击): ${newRating}`, parentElement);
        }
    }

    // 更新该标题的状态到 Map 中。
    parentClickState.set(parentElement, state);
}

// --- 动态内容处理 ---

let debounceTimer = null;
/**
 * 一个简单的防抖（debounce）函数。
 * 目的是在短时间内页面发生大量变化时（如流式输出），不要过于频繁地执行 `processNewElements`，
 * 而是等待一个短暂的稳定期（500毫秒）后再执行，以提升性能。
 */
const debouncedProcessNewElements = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        processNewElements();
    }, 500);
};

// **核心的动态内容监听器**
// MutationObserver 是现代浏览器提供的、用于观察 DOM 树变化的强大接口。
// 它比过时的 MutationEvents 性能要好得多。
const observer = new MutationObserver(debouncedProcessNewElements);


// --- 功能模块 2 & 3: 选择、收集与提示词生成 (包裹在IIFE中以创建私有作用域) ---
(function () {
    // 'use strict'; 开启严格模式，是一种良好的编程实践。
    'use strict';

    // --- 状态变量 ---
    // 通过一系列的布尔值和对象引用来管理复杂UI的当前状态。
    let isSelectionModeActive = false; // "划词模式"是否激活
    let quickHighlightButton = null;   // 指向"快捷高亮"按钮的DOM引用
    let lastSelectionRange = null;     // 保存用户上一次的文本选区
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
    let activeContextMenu = null;

    // --- 工具函数 ---
    /**
     * 从一个元素中获取纯净的文本内容，自动移除所有由Yummy添加的UI组件。
     * 这是为了确保在后续处理（如生成提示词）时，不会把 "😋" 或 "📚" 这类UI文本也包含进去。
     * 这是一个非常重要的"数据清洗"步骤。
     * @param {HTMLElement} element The element to get text from.
     * @returns {string} The cleaned text content.
     */
    const getCleanText = (element) => {
        if (!element) return '';
        const clone = element.cloneNode(true);
        clone.querySelectorAll('.yummy-rating-bar, .yummy-selection-highlight, .yummy-control-panel, #yummy-quick-highlight-button, #yummy-collection-panel').forEach(ui => ui.remove());
        return clone.textContent.trim();
    };


    // --- Prompt Generation Logic ---
    function collectMarkedData(scopeElement = document.body) {
        const uniqueText = (selector, minLength = 0, maxLength = Infinity) => {
            const elements = scopeElement.querySelectorAll(selector);
            const texts = new Set();
            elements.forEach(el => {
                const text = getCleanText(el);
                if (text.length >= minLength && text.length <= maxLength) {
                    texts.add(text);
                }
            });
            return Array.from(texts).filter(Boolean);
        };

        const KEYWORD_MAX_LENGTH = 15; // A a threshold to separate keywords from sentences.

        // Likes are always full paragraphs/blocks
        const likedParagraphs = uniqueText('.yummy-liked');
        // All highlights
        const allHighlights = uniqueText('.yummy-selection-highlight');
        // Dislikes for avoidance
        const dislikes = uniqueText('.yummy-disliked');

        // Segregate highlights into sentences and keywords
        const highlightedSentences = allHighlights.filter(t => t.length > KEYWORD_MAX_LENGTH);
        const highlightedKeywords = allHighlights.filter(t => t.length <= KEYWORD_MAX_LENGTH);

        logger.info('收集到的数据:', {
            likedParagraphs,
            highlightedSentences,
            highlightedKeywords,
            dislikes
        });

        return {
            likedParagraphs,
            highlightedSentences,
            highlightedKeywords,
            dislikes
        };
    }

    function buildPrompt(mode, data) {
        const {
            likedParagraphs,
            highlightedSentences,
            highlightedKeywords,
            dislikes
        } = data;
        let prompt = '';

        if (mode === 'organize') {
            const coreParagraphsText = likedParagraphs.length > 0 ?
                `### 核心段落\n${likedParagraphs.join('\n\n')}` :
                '';

            const keySentencesText = highlightedSentences.length > 0 ?
                `### 关键句\n${highlightedSentences.join('\n')}` :
                '';

            const keywordsText = highlightedKeywords.length > 0 ?
                `### 关键词\n${highlightedKeywords.join('\n')}` :
                '';

            const materials = [coreParagraphsText, keySentencesText, keywordsText].filter(Boolean).join('\n\n');

            prompt = `你是一位专业的文书助理。你的任务是根据我提供的三类素材（核心段落、关键句、关键词），将它们重新整理成一份干净、结构化的文档。

**整理规则：**
1.  **核心段落处理**：将【核心段落】部分的内容**完全原封不动**地复制下来，保持它们之间的原有顺序和段落格式。
2.  **关键句处理**：将【关键句】部分的内容，以无序列表（即在每一句前加上 \`- \`）的形式一一列出。
3.  **关键词处理**：将【关键词】部分的所有词语，用逗号（\`， \`）连接，形成单行索引。
4.  **最终输出格式**：
    *   严格按照"核心段落"、"关键句"、"关键词"的顺序组合你的输出。
    *   如果同时存在多个部分，在不同部分之间用一个水平分割线 (\`---\`) 隔开。
    *   你的回答中**绝对不能出现**"### 核心段落"、"### 关键句"、"### 关键词"这些分类标题，也**绝对不能包含**任何我在这里给你的、在"整理规则"下的指示性文字。你的回答应该直接从第一个核心段落的内容开始，或者从第一条关键句开始。

---
**【素材】**

${materials}
---`;

        } else if (mode === 'diverge') {
            const inspiration = [...likedParagraphs, ...highlightedSentences, ...highlightedKeywords];
            const inspirationText = inspiration.length > 0 ?
                `- ${inspiration.join('\n- ')}` :
                '无';

            const avoidanceText = dislikes.length > 0 ?
                `- ${dislikes.join('\n- ')}` :
                '无';

            prompt = `请基于我标记为"喜欢"和"高亮"的内容，进行自由的发散创作，帮我探索一些新的可能性。

**灵感来源 (我喜欢的内容):**
---
${inspirationText}
---

**创作禁区 (我不喜欢的内容，请务必规避):**
---
${avoidanceText}
---

**关键要求：**
1. **主题相关**：你的创作可以天马行空，但必须与"灵感来源"的主题保持相关性。
2. **严格规避**：在任何情况下，都绝对不能在你的回答中提及、暗示或包含任何"创作禁区"里的内容。
3. **自由发挥**：请大胆地进行联想、引申和创造。`;
        }
        return prompt.trim();
    }

    function generateAndApplyPrompt(mode, event) {
        const isGlobal = event.shiftKey;
        const scope = isGlobal ?
            document.body :
            Array.from(document.querySelectorAll('[data-message-author-role="assistant"]')).pop()?.closest('div.group\\/conversation-turn');

        if (!scope) {
            alert('Yummy错误：\n找不到任何AI回复内容可供处理。');
            logger.error('找不到AI回复区块。');
            return;
        }

        const data = collectMarkedData(scope);

        if (data.likedParagraphs.length === 0 && data.highlightedSentences.length === 0 && data.highlightedKeywords.length === 0) {
            const message = isGlobal ?
                'Yummy提示：\n在整个页面中没有找到任何"喜欢"或高亮的内容。' :
                'Yummy提示：\n在最新的AI回复中没有找到任何"喜欢"或高亮的内容。\n\n（小技巧：按住Shift再点击，可以处理整个页面的内容）';
            alert(message);
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

    // --- UI与交互逻辑 ---
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
            copyToast.style.visibility = 'hidden';
        }, 1500);
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
            logger.debug('Selection outside of main content or inside UI, ignoring.');
            return;
        }

        try {
            const mergedRange = mergeWithExistingHighlights(effectiveRange);
            const allBlocks = Array.from(document.querySelectorAll(CONTENT_ELEMENTS_SELECTOR));
            const intersectingBlocks = allBlocks.filter(block =>
                mergedRange.intersectsNode(block) &&
                !block.classList.contains('yummy-selection-highlight')
            );

            if (intersectingBlocks.length === 0 && parentElement && mergedRange.intersectsNode(parentElement)) {
                const singleBlock = getContainingBlock(parentElement);
                if (singleBlock) intersectingBlocks.push(singleBlock);
            }

            for (const block of intersectingBlocks) {
                const blockRange = document.createRange();
                blockRange.selectNodeContents(block);

                const start = mergedRange.compareBoundaryPoints(Range.START_TO_START, blockRange) > 0 ? mergedRange.startContainer : blockRange.startContainer;
                const startOffset = mergedRange.compareBoundaryPoints(Range.START_TO_START, blockRange) > 0 ? mergedRange.startOffset : blockRange.startOffset;
                const end = mergedRange.compareBoundaryPoints(Range.END_TO_END, blockRange) < 0 ? mergedRange.endContainer : blockRange.endContainer;
                const endOffset = mergedRange.compareBoundaryPoints(Range.END_TO_END, blockRange) < 0 ? mergedRange.endOffset : blockRange.endOffset;

                const intersectionRange = document.createRange();
                intersectionRange.setStart(start, startOffset);
                intersectionRange.setEnd(end, endOffset);

                if (!intersectionRange.collapsed) {
                    const highlightSpan = document.createElement('span');
                    highlightSpan.className = 'yummy-selection-highlight';
                    highlightSpan.addEventListener('click', () => unhighlightElement(highlightSpan));

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
    }

    function mergeWithExistingHighlights(newRange) {
        const highlights = document.querySelectorAll('.yummy-selection-highlight');
        highlights.forEach(highlight => {
            const highlightRange = document.createRange();
            highlightRange.selectNodeContents(highlight);

            if (newRange.intersectsNode(highlight)) {
                if (newRange.compareBoundaryPoints(Range.START_TO_START, highlightRange) > 0) {
                    newRange.setStart(highlightRange.startContainer, highlightRange.startOffset);
                }
                if (newRange.compareBoundaryPoints(Range.END_TO_END, highlightRange) < 0) {
                    newRange.setEnd(highlightRange.endContainer, highlightRange.endOffset);
                }
                unhighlightElement(highlight);
            }
        });
        return newRange;
    }

    function unhighlightElement(element) {
        if (!element || !element.parentNode) return;
        const parent = element.parentNode;
        while (element.firstChild) {
            parent.insertBefore(element.firstChild, element);
        }
        parent.removeChild(element);
        parent.normalize(); // Merge adjacent text nodes
        logger.info('高亮已移除。');
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
        if (!parentElement.closest('main') || parentElement.closest('.yummy-control-panel, .yummy-rating-bar, #yummy-collection-panel, #yummy-quick-highlight-button')) {
            if (quickHighlightButton) quickHighlightButton.style.display = 'none';
            return;
        }

        lastSelectionRange = range.cloneRange();
        const rect = range.getBoundingClientRect();
        quickHighlightButton.style.display = 'flex';
        quickHighlightButton.style.left = `${rect.right + 5}px`;
        quickHighlightButton.style.top = `${rect.bottom + 5}px`;
    }

    function closeActiveContextMenu() {
        if (activeContextMenu) {
            activeContextMenu.remove();
            activeContextMenu = null;
        }
    }

    function showContextMenu(event, item) {
        event.preventDefault();
        closeActiveContextMenu();

        const menu = document.createElement('div');
        menu.className = 'yummy-context-menu';

        const performCopy = () => {
            const textToCopy = item.textContent || '';
            navigator.clipboard.writeText(textToCopy).then(() => {
                showToast('已复制!', event);
                item.classList.add('copied');
                setTimeout(() => item.classList.remove('copied'), 1000);
            }).catch(err => {
                logger.error('复制失败', err);
                showToast('复制失败!', event);
            });
        };

        const starOption = document.createElement('div');
        starOption.className = 'yummy-context-menu-item';
        const isStarred = item.classList.contains('starred');
        starOption.innerHTML = `<span>${isStarred ? '🌟' : '⭐'}</span> ${isStarred ? '取消星标' : '添加星标'}`;
        starOption.addEventListener('click', () => {
            item.classList.toggle('starred');
            closeActiveContextMenu();
        });
        menu.appendChild(starOption);

        const copyOption = document.createElement('div');
        copyOption.className = 'yummy-context-menu-item';
        copyOption.innerHTML = '<span>📋</span> 复制内容';
        copyOption.addEventListener('click', () => {
            performCopy();
            closeActiveContextMenu();
        });
        menu.appendChild(copyOption);

        const deleteOption = document.createElement('div');
        deleteOption.className = 'yummy-context-menu-item danger';
        deleteOption.innerHTML = '<span>🗑️</span> 删除条目';
        deleteOption.addEventListener('click', () => {
            item.remove();
            closeActiveContextMenu();
        });
        menu.appendChild(deleteOption);

        document.body.appendChild(menu);
        activeContextMenu = menu;

        const {
            clientX: mouseX,
            clientY: mouseY
        } = event;
        const {
            offsetWidth: menuWidth,
            offsetHeight: menuHeight
        } = menu;
        const {
            innerWidth: winWidth,
            innerHeight: winHeight
        } = window;

        let x = mouseX;
        let y = mouseY;
        if (mouseX + menuWidth > winWidth) {
            x = winWidth - menuWidth - 5;
        }
        if (mouseY + menuHeight > winHeight) {
            y = winHeight - menuHeight - 5;
        }
        menu.style.top = `${y}px`;
        menu.style.left = `${x}px`;
    }

    function collectHighlights() {
        if (!collectionContent) return;
        collectionContent.innerHTML = ''; // 清空现有列表

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

        if (uniqueContent.size > 0) {
            uniqueContent.forEach(text => {
                if (text) addItemToCollection(text);
            });
            logger.info(`${uniqueContent.size}个条目已收集。`);
            showToast(`${uniqueContent.size}个条目已收集`, {
                clientX: window.innerWidth - 250,
                clientY: 50
            });
        } else {
            logger.info('没有找到可供收集的内容。');
            showToast('未找到"喜欢"或高亮内容', {
                clientX: window.innerWidth - 250,
                clientY: 50
            });
        }
    }

    function addItemToCollection(text) {
        if (!collectionContent) return;
        const item = document.createElement('div');
        item.className = 'yummy-collection-item';
        item.textContent = text;
        item.title = '左键单击可复制，右键单击可打开菜单';

        item.addEventListener('click', (event) => {
            event.stopPropagation(); // 阻止事件冒泡，这很关键
            const textToCopy = item.textContent || '';
            navigator.clipboard.writeText(textToCopy).then(() => {
                showToast('已复制!', event);
                item.classList.add('copied');
                setTimeout(() => item.classList.remove('copied'), 1000);
            }).catch(err => {
                logger.error('复制失败', err);
                showToast('复制失败!', event);
            });
        });

        item.addEventListener('contextmenu', (e) => {
            showContextMenu(e, item);
        });

        collectionContent.appendChild(item);
        collectionContent.scrollTop = collectionContent.scrollHeight;
    }

    function quickExitSelectionMode(event) {
        if (isSelectionModeActive && (event.key === 'Escape' || event.keyCode === 27)) {
            const toggleButton = document.querySelector('.yummy-control-button.active');
            if (toggleButton) toggleButton.click();
        }
    }

    function createUiElements() {
        // --- Panels & Buttons ---
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

        const collectButton = document.createElement('button');
        collectButton.id = 'yummy-collect-button';
        collectButton.className = 'yummy-control-button';
        collectButton.innerHTML = '📥';
        collectButton.title = '收集所有"喜欢"和高亮的内容';

        const separator1 = document.createElement('hr');

        const organizeBtn = document.createElement('button');
        organizeBtn.className = 'yummy-control-button';
        organizeBtn.id = 'yummy-organize-btn';
        organizeBtn.textContent = '📝';
        organizeBtn.title = '整理模式 (单击: 最新, Shift+单击: 全部)';
        organizeBtn.addEventListener('click', (e) => generateAndApplyPrompt('organize', e));

        const divergeBtn = document.createElement('button');
        divergeBtn.className = 'yummy-control-button';
        divergeBtn.id = 'yummy-diverge-btn';
        divergeBtn.textContent = '💡';
        divergeBtn.title = '发散模式 (单击: 最新, Shift+单击: 全部)';
        divergeBtn.addEventListener('click', (e) => generateAndApplyPrompt('diverge', e));

        const separator2 = document.createElement('hr');

        const autoSendBtn = document.createElement('button');
        autoSendBtn.className = 'yummy-control-button active';
        autoSendBtn.id = 'yummy-autosend-btn';
        autoSendBtn.textContent = '🚀';
        autoSendBtn.title = '自动发送已开启，点击关闭';
        autoSendBtn.addEventListener('click', () => {
            isAutoSendActive = !isAutoSendActive;
            autoSendBtn.classList.toggle('active', isAutoSendActive);
            autoSendBtn.title = isAutoSendActive ? '自动发送已开启，点击关闭' : '自动发送已关闭，点击开启';
        });

        const separator3 = document.createElement('hr');

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
        controlPanel.appendChild(collectButton);
        controlPanel.appendChild(separator1);
        controlPanel.appendChild(organizeBtn);
        controlPanel.appendChild(divergeBtn);
        controlPanel.appendChild(separator2);
        controlPanel.appendChild(autoSendBtn);
        controlPanel.appendChild(separator3);
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
        collectionHeader.title = '点击复制所有收集到的内容';

        const collectionClearBtn = document.createElement('span');
        collectionClearBtn.id = 'yummy-collection-clear-btn';
        collectionClearBtn.textContent = '🚮';
        collectionClearBtn.title = '清空所有条目';

        collectionHeader.appendChild(collectionPinBtn);
        collectionHeader.appendChild(collectionHeaderText);
        collectionHeader.appendChild(collectionClearBtn);
        collectionPanel.appendChild(collectionHeader);

        collectionContent = document.createElement('div');
        collectionContent.id = 'yummy-collection-content';
        collectionPanel.appendChild(collectionContent);
        document.body.appendChild(collectionPanel);

        // --- Event Listeners ---
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

        collectButton.addEventListener('click', () => {
            collectHighlights();
            collectionPanel.classList.add('visible');
        });

        collectionPinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isCollectionPanelPinned = !isCollectionPanelPinned;
            collectionPinBtn.classList.toggle('pinned', isCollectionPanelPinned);
            collectionPinBtn.title = isCollectionPanelPinned ? '取消钉住' : '钉住面板';
        });

        collectionClearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (collectionContent) {
                if (collectionContent.innerHTML === '') {
                    showToast('面板已经空了', e);
                    return;
                }
                collectionContent.innerHTML = '';
                logger.info('收集面板已清空。');
                showToast('面板已清空', e);
            }
        });

        collectionHeader.addEventListener('click', (e) => {
            if (collectionPinBtn.contains(e.target) || collectionClearBtn.contains(e.target)) return;
            const allText = Array.from(collectionContent.children)
                .map(item => item.textContent)
                .join('\n\n---\n\n');
            if (!allText) {
                showToast('面板是空的', e);
                return;
            }
            navigator.clipboard.writeText(allText).then(() => {
                const originalText = collectionHeaderText.textContent;
                collectionHeaderText.textContent = '✅ 已全部复制!';
                setTimeout(() => {
                    collectionHeaderText.textContent = originalText;
                }, 1500);
            }).catch(err => {
                logger.error('一键复制全部失败', err);
                showToast('复制失败', e);
            });
        });

        // Auto-hide logic
        collectionPanel.addEventListener('mouseenter', () => {
            if (collectionHideTimer) {
                clearTimeout(collectionHideTimer);
                collectionHideTimer = null;
            }
        });

        collectionPanel.addEventListener('mouseleave', () => {
            // Check if context menu is active before hiding
            if (!isCollectionPanelPinned && !activeContextMenu) {
                collectionHideTimer = setTimeout(() => {
                    collectionPanel.classList.remove('visible');
                }, 1000);
            }
        });

        // Quick hide button
        quickHighlightButton = document.createElement('div');
        quickHighlightButton.id = 'yummy-quick-highlight-button';
        quickHighlightButton.textContent = EMOJI_LIKE;
        quickHighlightButton.title = '高亮选中内容';
        document.body.appendChild(quickHighlightButton);
        quickHighlightButton.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            highlightSelection(lastSelectionRange);
            quickHighlightButton.style.display = 'none';
        });

        // Cursor follower
        cursorFollower = document.createElement('div');
        cursorFollower.id = 'yummy-cursor-follower';
        cursorFollower.textContent = '✒️';
        document.body.appendChild(cursorFollower);

        // Copy Toast
        copyToast = document.createElement('div');
        copyToast.id = 'yummy-copy-toast';
        document.body.appendChild(copyToast);
    }

    /**
     * 初始化所有与选择、高亮、面板相关的特性。
     * 这个函数在IIFE的最后被调用。
     */
    function initializeFeatures() {
        // 1. 创建所有UI元素并添加到页面。
        createUiElements();
        // 2. 绑定全局事件监听器。
        document.addEventListener('mouseup', handleTextSelection);
        document.addEventListener('keydown', quickExitSelectionMode);
        document.addEventListener('mousemove', onMouseMove);

        document.addEventListener('click', (event) => {
            // 新增逻辑：当点击页面其他位置时，隐藏收集面板
            if (
                collectionPanel &&
                collectionPanel.classList.contains('visible') &&
                !isCollectionPanelPinned &&
                !collectionPanel.contains(event.target)
            ) {
                // 确保点击的不是打开面板的按钮，避免刚打开就关闭
                const controlPanel = document.querySelector('.yummy-control-panel');
                if (!controlPanel || !controlPanel.contains(event.target)) {
                    collectionPanel.classList.remove('visible');
                    logger.debug('Clicked outside, hiding collection panel.');
                }
            }
        });

        // 为一些需要全局清理的UI行为（如隐藏快捷按钮、关闭右键菜单）绑定事件。
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
    }

    initializeFeatures();

})();

/**
 * 启动 MutationObserver，开始监听整个页面的变化。
 */
function initializeYummy() {
    observer.observe(document.body, {
        childList: true, // 监听子节点的添加或删除
        subtree: true    // 监听所有后代节点
    });
    logger.info("Yummy 观察者已启动。");
}

// 在脚本加载的最后，启动监听器。
initializeYummy();

/**
 * 获取一个标题元素之后、直到下一个同级或更高级标题之前的所有内容块。
 * @param {HTMLElement} startElement - 开始的标题元素。
 * @returns {Array<HTMLElement>}
 */
function getSubsequentSiblings(startElement) {
    // ... 这是一个相对独立的工具函数，其内部逻辑是为了精确地界定一个"章节"的范围。
    // ...
    return results;
}

/**
 * 为一个元素添加闪烁效果的CSS类，并在动画结束后移除它。
 * @param {HTMLElement} element - 需要闪烁的元素。
 */
function flashElement(element) {
    element.classList.add('yummy-flash');
    setTimeout(() => {
        element.classList.remove('yummy-flash');
    }, 500); // 持续时间必须与 CSS 动画的持续时间相匹配。
}