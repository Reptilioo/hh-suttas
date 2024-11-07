import { removeDiacritics } from './../misc/removeDiacritics.js';

export function checkSearchUrlParam() {
    const verseRange = window.location.hash.substring(1);
    if (!verseRange) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    
    let searchTerm = urlParams.get('search');
    if (!searchTerm) return;
    searchTerm = searchTerm.replace("+", " ");
    
    let isPali = urlParams.get('pali') === "show";

    // Function to search and highlight all occurrences in a comment
    const searchInComment = (commentId, searchTerm) => {
        const commentElement = document.getElementById(commentId);
        if (!commentElement) return;

        const commentSpan = commentElement.querySelector('span');
        if (!commentSpan) return;

        // Save the original HTML
        const originalHtml = commentSpan.innerHTML;
        const originalText = commentSpan.textContent;
        
        // Create searchable versions of the text
        const searchableText = originalText.toLowerCase();
        const searchableTextWithoutDiacritics = removeDiacritics(searchableText);
        const searchableSearchTerm = searchTerm.toLowerCase();
        const searchableSearchTermWithoutDiacritics = removeDiacritics(searchableSearchTerm);

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

        // Find all occurrences of the search term
        let positions = [];
        let currentIndex = 0;
        
        // Try first with diacritics
        while (true) {
            const index = searchableText.indexOf(searchableSearchTerm, currentIndex);
            if (index === -1) break;
            positions.push({ start: index, length: searchTerm.length });
            currentIndex = index + 1;
        }

        // If no matches found, try without diacritics
        if (positions.length === 0) {
            currentIndex = 0;
            while (true) {
                const index = searchableTextWithoutDiacritics.indexOf(searchableSearchTermWithoutDiacritics, currentIndex);
                if (index === -1) break;
                positions.push({ start: index, length: searchTerm.length });
                currentIndex = index + 1;
            }
        }

        if (positions.length === 0) return;

        // Sort positions in reverse order to maintain correct indices when inserting spans
        positions.sort((a, b) => b.start - a.start);

        // Create modified HTML with all occurrences highlighted
        let modifiedHtml = originalHtml;
        
        for (const position of positions) {
            const htmlStartIndex = getHtmlIndex(position.start);
            const htmlEndIndex = getHtmlIndex(position.start + position.length);
            
            const before = modifiedHtml.substring(0, htmlStartIndex);
            const highlighted = modifiedHtml.substring(htmlStartIndex, htmlEndIndex);
            const after = modifiedHtml.substring(htmlEndIndex);
            
            modifiedHtml = before + '<span class="searchTerm">' + highlighted + '</span>' + after;
        }

        // Remove the arrow and back link because they are in backLinkHtml
        const linkIndex = modifiedHtml.indexOf('<a href=');
        if (linkIndex !== -1) {
            modifiedHtml = modifiedHtml.substring(0, linkIndex);
        }

        // Set the final HTML with preserved back link
        commentSpan.innerHTML = modifiedHtml + backLinkHtml;
    };

    // Check if it's a search in a comment
    if (verseRange.startsWith('comment')) {
        searchInComment(verseRange, searchTerm);
        return;
    }

    // Modified verse search implementation to highlight all occurrences
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
    
    // Highlight all occurrences in each matching segment individually
    segments.forEach(segment => {
        if (isIdInRange(segment.id, range)) {
            const langSpan = segment.querySelector(langClass);
            if (!langSpan) return;

            const originalText = langSpan.textContent;
            let searchableText = originalText.toLowerCase();
            let searchableSearchTerm = searchTerm.toLowerCase();
            
            if (isPali || !searchableText.includes(searchableSearchTerm)) {
                // For Pali or when exact match not found, try without diacritics
                searchableText = removeDiacritics(searchableText);
                searchableSearchTerm = removeDiacritics(searchableSearchTerm);
            }

            // Find all occurrences
            let positions = [];
            let currentIndex = 0;
            
            while (true) {
                const index = searchableText.indexOf(searchableSearchTerm, currentIndex);
                if (index === -1) break;
                positions.push({ start: index, length: searchTerm.length });
                currentIndex = index + 1;
            }

            if (positions.length === 0) return;

            // Sort positions in reverse order
            positions.sort((a, b) => b.start - a.start);

            // Create modified text with all occurrences highlighted
            let modifiedText = originalText;
            for (const position of positions) {
                const before = modifiedText.substring(0, position.start);
                const highlighted = modifiedText.substring(position.start, position.start + position.length);
                const after = modifiedText.substring(position.start + position.length);
                
                modifiedText = before + '<span class="searchTerm">' + highlighted + '</span>' + after;
            }

            langSpan.innerHTML = modifiedText;
        }
    });
}
