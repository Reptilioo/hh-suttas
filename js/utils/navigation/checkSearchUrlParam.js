import { removeDiacritics } from './../misc/removeDiacritics.js';

export function checkSearchUrlParam() {
    const verseRange = window.location.hash.substring(1);
    if (!verseRange) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    
    let searchTerm = urlParams.get('search');
    if (!searchTerm) return;
    searchTerm = searchTerm.replace("+", " ");
    
    let isPali = urlParams.get('pali') === "show";

    // Function to search and highlight in a comment
    const searchInComment = (commentId, searchTerm) => {
        const commentElement = document.getElementById(commentId);
        if (!commentElement) return;

        const commentSpan = commentElement.querySelector('span');
        if (!commentSpan) return;

        // Save the original HTML
        const originalHtml = commentSpan.innerHTML;
        const originalText = commentSpan.textContent;
        const searchableText = originalText.toLowerCase();
        const searchableSearchTerm = searchTerm.toLowerCase();

        const searchIndex = searchableText.indexOf(searchableSearchTerm);
        if (searchIndex === -1) return;

        // Extract the comment number and back link
        const commentNumber = originalText.substring(0, originalText.indexOf(':') + 1);
        const backLink = commentSpan.querySelector('a');
        const backLinkHtml = backLink ? backLink.outerHTML : '';

        // Function to get the actual position in the HTML for an index in the text
        const getHtmlIndex = (textIndex) => {
            let currentTextIndex = 0;
            let currentHtmlIndex = 0;
            
            while (currentTextIndex < textIndex && currentHtmlIndex < originalHtml.length) {
                if (originalHtml[currentHtmlIndex] === '<') {
                    // Skip the HTML tag
                    while (currentHtmlIndex < originalHtml.length && originalHtml[currentHtmlIndex] !== '>') {
                        currentHtmlIndex++;
                    }
                    currentHtmlIndex++;
                } else {
                    currentTextIndex++;
                    currentHtmlIndex++;
                }
            }
            return currentHtmlIndex;
        };

        // Get the positions in the HTML
        const htmlSearchIndex = getHtmlIndex(searchIndex);
        const htmlSearchEndIndex = getHtmlIndex(searchIndex + searchTerm.length);

        // Cut and rebuild the HTML while preserving the tags
        const before = originalHtml.substring(0, htmlSearchIndex);
        const highlighted = originalHtml.substring(htmlSearchIndex, htmlSearchEndIndex);
        let after = originalHtml.substring(htmlSearchEndIndex);

        // Remove the arrow and back link from 'after' because they are in backLinkHtml
        const linkIndex = after.indexOf('<a href=');
        if (linkIndex !== -1) {
            after = after.substring(0, linkIndex);
        }

        // Rebuild the HTML while preserving the tags and link
        commentSpan.innerHTML = before + 
            '<span class="searchTerm">' + highlighted + '</span>' + 
            after + 
            backLinkHtml;
    };

    // Check if it's a search in a comment
    if (verseRange.startsWith('comment')) {
        searchInComment(verseRange, searchTerm);
        return;
    }

    // The rest of the code for searching in verses remains unchanged
    const getVerseRange = (verseRange) => {
        const parts = verseRange.split('-');
        if (parts.length === 2) {
            return {
                start: parts[0],
                end: parts[1],
                isSingle: false
            };
        }
        return {
            start: verseRange,
            end: verseRange,
            isSingle: true
        };
    };

    const compareVerseIds = (id1, id2) => {
        const [prefix1, num1] = id1.split(':');
        const [prefix2, num2] = id2.split(':');
        
        if (prefix1 !== prefix2) return false;
        
        const nums1 = num1.split('.').map(Number);
        const nums2 = num2.split('.').map(Number);
        
        if (nums1[0] !== nums2[0]) return nums1[0] - nums2[0];
        return nums1[1] - nums2[1];
    };

    const isIdInRange = (id, range) => {
        const startCompare = compareVerseIds(id, range.start);
        const endCompare = compareVerseIds(id, range.end);
        
        return (startCompare >= 0 && endCompare <= 0) || range.isSingle && id === range.start;
    };

    const range = getVerseRange(verseRange);
    const langClass = isPali ? '.pli-lang' : '.eng-lang';
    
    const segments = document.querySelectorAll('.segment');
    let textsWithPositions = [];
    let totalLength = 0;

    segments.forEach(segment => {
        if (isIdInRange(segment.id, range)) {
            const langSpan = segment.querySelector(langClass);
            if (langSpan) {
                const originalText = langSpan.textContent;
                let searchableText = originalText.toLowerCase();
                if (isPali) {
                    searchableText = removeDiacritics(searchableText);
                }
                textsWithPositions.push({
                    span: langSpan,
                    originalText,
                    searchableText,
                    startPosition: totalLength
                });
                totalLength += originalText.length;
            }
        }
    });

    let searchableSearchTerm = searchTerm.toLowerCase();
    if (isPali) {
        searchableSearchTerm = removeDiacritics(searchableSearchTerm);
    }

    const fullSearchableText = textsWithPositions
        .map(item => item.searchableText)
        .join('');

    const searchIndex = fullSearchableText.indexOf(searchableSearchTerm);
    if (searchIndex === -1) return;

    let remainingSearchLength = searchTerm.length;
    let currentSearchPosition = searchIndex;

    for (const textItem of textsWithPositions) {
        const spanStartPosition = textItem.startPosition;
        const spanEndPosition = spanStartPosition + textItem.originalText.length;

        if (currentSearchPosition >= spanStartPosition && 
            currentSearchPosition < spanEndPosition) {
            
            const startInSpan = currentSearchPosition - spanStartPosition;
            const searchLengthInSpan = Math.min(
                remainingSearchLength,
                textItem.originalText.length - startInSpan
            );

            const before = textItem.originalText.substring(0, startInSpan);
            const highlighted = textItem.originalText.substring(
                startInSpan,
                startInSpan + searchLengthInSpan
            );
            const after = textItem.originalText.substring(startInSpan + searchLengthInSpan);

            textItem.span.innerHTML = before + '<span class="searchTerm">' + highlighted + '</span>' + after;

            remainingSearchLength -= searchLengthInSpan;
            currentSearchPosition += searchLengthInSpan;

            if (remainingSearchLength === 0) break;
        }
    }
}
