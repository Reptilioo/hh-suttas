import { removeDiacritics } from './../misc/removeDiacritics.js';

export function checkSearchUrlParam() {
    const verseRange = window.location.hash.substring(1);
    if (!verseRange) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    
    let searchTerm = urlParams.get('search');
    if (!searchTerm) return;
    searchTerm = searchTerm.replace("+", " ");
    
    let isPali = urlParams.get('pali') === "show";

    // Function to get the verse range
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

    // Function to compare verse IDs
    const compareVerseIds = (id1, id2) => {
        const [prefix1, num1] = id1.split(':');
        const [prefix2, num2] = id2.split(':');
        
        if (prefix1 !== prefix2) return false;
        
        const nums1 = num1.split('.').map(Number);
        const nums2 = num2.split('.').map(Number);
        
        if (nums1[0] !== nums2[0]) return nums1[0] - nums2[0];
        return nums1[1] - nums2[1];
    };

    // Function to check if an ID is within a range
    const isIdInRange = (id, range) => {
        const startCompare = compareVerseIds(id, range.start);
        const endCompare = compareVerseIds(id, range.end);
        
        return (startCompare >= 0 && endCompare <= 0) || range.isSingle && id === range.start;
    };

    const range = getVerseRange(verseRange);
    const langClass = isPali ? '.pli-lang' : '.eng-lang';
    
    // Get all segments within the range
    const segments = document.querySelectorAll('.segment');
    let textsWithPositions = [];
    let totalLength = 0;

    // Collect texts and their positions
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

    // Prepare the search term
    let searchableSearchTerm = searchTerm.toLowerCase();
    if (isPali) {
        searchableSearchTerm = removeDiacritics(searchableSearchTerm);
    }

    // Build the complete searchable text
    const fullSearchableText = textsWithPositions
        .map(item => item.searchableText)
        .join('');

    // Search for the term in the searchable text
    const searchIndex = fullSearchableText.indexOf(searchableSearchTerm);
    if (searchIndex === -1) return;

    // Highlight the found text
    let remainingSearchLength = searchTerm.length;
    let currentSearchPosition = searchIndex;

    for (const textItem of textsWithPositions) {
        const spanStartPosition = textItem.startPosition;
        const spanEndPosition = spanStartPosition + textItem.originalText.length;

        // Check if this span contains part of the searched text
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
