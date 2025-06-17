logger.info('Yummy! 内容脚本已加载。');

const EMOJI_LIKE = '😋'; // 想吃
const EMOJI_DISLIKE = '🤮'; // 想吐
const EMOJI_CLEAR = '🧹'; // 扫帚

function addRatingBar(element, groupElements = [element]) {
    if (element.dataset.yummyProcessed) {
        return;
    }
    element.dataset.yummyProcessed = 'true';
    if (groupElements.length > 1) {
        groupElements.forEach(el => el.dataset.yummyProcessed = 'true');
    }

    const container = document.createElement('div');
    container.className = 'yummy-paragraph-container';

    element.parentNode.insertBefore(container, element);
    container.appendChild(element);

    const ratingBar = document.createElement('div');
    ratingBar.className = 'yummy-rating-bar';

    // Dynamically calculate position based on the conversation turn container
    // This ensures all rating bars are aligned horizontally.
    const turnContainer = element.closest('.group\\/conversation-turn');
    if (turnContainer) {
        const elementRect = element.getBoundingClientRect();
        const turnRect = turnContainer.getBoundingClientRect();
        const top = elementRect.top - turnRect.top;
        ratingBar.style.top = `${top}px`;
        ratingBar.style.height = `${elementRect.height}px`;
    } else {
        logger.warn('Could not find .group/conversation-turn for alignment', element);
    }

    logger.debug('正在处理新元素：', element.textContent.substring(0, 30) + '...');

    const likeButton = document.createElement('span');
    likeButton.className = 'yummy-rating-button';
    likeButton.textContent = EMOJI_LIKE;
    likeButton.title = '想吃 (Like)';
    likeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        groupElements.forEach(el => {
            el.classList.remove('yummy-disliked');
            el.classList.add('yummy-liked');
        });
        logger.debug('已"想吃"元素组：', element.textContent.substring(0, 30) + '...');
    });

    const dislikeButton = document.createElement('span');
    dislikeButton.className = 'yummy-rating-button';
    dislikeButton.textContent = EMOJI_DISLIKE;
    dislikeButton.title = '想吐 (Dislike)';
    dislikeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        groupElements.forEach(el => {
            el.classList.remove('yummy-liked');
            el.classList.add('yummy-disliked');
        });
        logger.debug('已"想吐"元素组：', element.textContent.substring(0, 30) + '...');
    });

    const clearButton = document.createElement('span');
    clearButton.className = 'yummy-rating-button';
    clearButton.textContent = EMOJI_CLEAR;
    clearButton.title = '清除 (Clear)';
    clearButton.addEventListener('click', (e) => {
        e.stopPropagation();
        groupElements.forEach(el => {
            el.classList.remove('yummy-liked', 'yummy-disliked');
        });
        logger.debug('已清除元素组评价：', element.textContent.substring(0, 30) + '...');
    });

    ratingBar.appendChild(likeButton);
    ratingBar.appendChild(dislikeButton);
    ratingBar.appendChild(clearButton);
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
    document.querySelectorAll(CONTENT_ELEMENTS_SELECTOR).forEach(element => {
        if (!element.dataset.yummyProcessed) {
            addRatingBar(element);
        }
    });
}

const observer = new MutationObserver((mutations) => {
    // A simple and robust way: just re-scan for any unprocessed elements on any change.
    // This is less efficient than targeted checks, but far more reliable.
    processNewElements();
});

// Initial scan
logger.info('开始页面初始扫描...');
processNewElements();
logger.info('页面初始扫描完成。');

// Start observing the whole document body for changes.
observer.observe(document.body, {
    childList: true,
    subtree: true,
});
logger.info('变化观察器已启动。');