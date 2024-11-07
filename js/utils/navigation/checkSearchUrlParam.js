import { removeDiacritics } from './../misc/removeDiacritics.js';

export function checkSearchUrlParam() {
    const verseRange = window.location.hash.substring(1);
    if (!verseRange) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    
    let searchTerm = urlParams.get('search');
    if (!searchTerm) return;
    searchTerm = searchTerm.replace("+", " ");
    
    let isPali = urlParams.get('pali') === "show";

    // Helper function to get text nodes within an element
    const getTextNodesAndPositions = (element) => {
        const textNodes = [];
        let totalLength = 0;

        const walk = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walk.nextNode()) {
            textNodes.push({
                node,
                start: totalLength,
                length: node.nodeValue.length
            });
            totalLength += node.nodeValue.length;
        }

        return { textNodes, totalLength };
    };

    // Function to search and highlight all occurrences in a comment
    const searchInComment = (commentId, searchTerm) => {
        const commentElement = document.getElementById(commentId);
        if (!commentElement) return;

        const commentSpan = commentElement.querySelector('span');
        if (!commentSpan) return;

        // Clone the original span to work with
        const workingSpan = commentSpan.cloneNode(true);
        
        // Get all text nodes and their positions
        const { textNodes, totalLength } = getTextNodesAndPositions(workingSpan);
        
        // Create searchable version of the full text
        const fullText = workingSpan.textContent;
        const searchableText = fullText.toLowerCase();
        const searchableTextWithoutDiacritics = removeDiacritics(searchableText);
        const searchableSearchTerm = searchTerm.toLowerCase();
        const searchableSearchTermWithoutDiacritics = removeDiacritics(searchableSearchTerm);

        // Find all occurrences
        let positions = [];
        let currentIndex = 0;
        
        // Try first with diacritics
        while (true) {
            const index = searchableText.indexOf(searchableSearchTerm, currentIndex);
            if (index === -1) break;
            positions.push({
                start: index,
                length: searchTerm.length,
                withDiacritics: true
            });
            currentIndex = index + 1;
        }

        // If no matches found, try without diacritics
        if (positions.length === 0) {
            currentIndex = 0;
            while (true) {
                const index = searchableTextWithoutDiacritics.indexOf(searchableSearchTermWithoutDiacritics, currentIndex);
                if (index === -1) break;
                positions.push({
                    start: index,
                    length: searchTerm.length,
                    withDiacritics: false
                });
                currentIndex = index + 1;
            }
        }

        if (positions.length === 0) return;

        // Sort positions in reverse order
        positions.sort((a, b) => b.start - a.start);

        // Process each match
        for (const position of positions) {
            let currentTextNodeIndex = 0;
            let remainingStart = position.start;
            let remainingLength = position.length;

            // Find the text node(s) containing this match
            while (currentTextNodeIndex < textNodes.length && remainingLength > 0) {
                const textNodeInfo = textNodes[currentTextNodeIndex];
                
                if (remainingStart < textNodeInfo.start + textNodeInfo.length) {
                    // This text node contains part of the match
                    const nodeStartOffset = Math.max(0, remainingStart - textNodeInfo.start);
                    const nodeEndOffset = Math.min(
                        textNodeInfo.length,
                        nodeStartOffset + remainingLength
                    );
                    const lengthInThisNode = nodeEndOffset - nodeStartOffset;

                    // Find the corresponding text node in our working span
                    const walker = document.createTreeWalker(
                        workingSpan,
                        NodeFilter.SHOW_TEXT,
                        null,
                        false
                    );
                    
                    let currentNode;
                    for (let i = 0; i <= currentTextNodeIndex; i++) {
                        currentNode = walker.nextNode();
                    }

                    if (currentNode) {
                        const before = currentNode.nodeValue.substring(0, nodeStartOffset);
                        const highlighted = currentNode.nodeValue.substring(nodeStartOffset, nodeEndOffset);
                        const after = currentNode.nodeValue.substring(nodeEndOffset);

                        const span = document.createElement('span');
                        span.className = 'searchTerm';
                        span.textContent = highlighted;

                        const fragment = document.createDocumentFragment();
                        if (before) fragment.appendChild(document.createTextNode(before));
                        fragment.appendChild(span);
                        if (after) fragment.appendChild(document.createTextNode(after));

                        currentNode.parentNode.replaceChild(fragment, currentNode);
                    }

                    remainingLength -= lengthInThisNode;
                    remainingStart += lengthInThisNode;
                }
                
                currentTextNodeIndex++;
            }
        }

        // Now we have our modified content in workingSpan
        commentSpan.innerHTML = workingSpan.innerHTML;
    };

    // Function to highlight content in verse segments while preserving HTML
    const highlightInVerseSegment = (langSpan, searchTerm, isPali) => {
        // Clone the original span to work with
        const workingSpan = langSpan.cloneNode(true);
        
        const { textNodes, totalLength } = getTextNodesAndPositions(workingSpan);
        
        // Create searchable version of the full text
        const fullText = workingSpan.textContent;
        let searchableText = fullText.toLowerCase();
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
            positions.push({
                start: index,
                length: searchTerm.length
            });
            currentIndex = index + 1;
        }

        if (positions.length === 0) return;

        // Sort positions in reverse order
        positions.sort((a, b) => b.start - a.start);

        // Process each match
        for (const position of positions) {
            let currentTextNodeIndex = 0;
            let remainingStart = position.start;
            let remainingLength = position.length;

            // Find the text node(s) containing this match
            while (currentTextNodeIndex < textNodes.length && remainingLength > 0) {
                const textNodeInfo = textNodes[currentTextNodeIndex];
                
                if (remainingStart < textNodeInfo.start + textNodeInfo.length) {
                    // This text node contains part of the match
                    const nodeStartOffset = Math.max(0, remainingStart - textNodeInfo.start);
                    const nodeEndOffset = Math.min(
                        textNodeInfo.length,
                        nodeStartOffset + remainingLength
                    );
                    const lengthInThisNode = nodeEndOffset - nodeStartOffset;

                    // Find the corresponding text node in our working span
                    const walker = document.createTreeWalker(
                        workingSpan,
                        NodeFilter.SHOW_TEXT,
                        null,
                        false
                    );
                    
                    let currentNode;
                    for (let i = 0; i <= currentTextNodeIndex; i++) {
                        currentNode = walker.nextNode();
                    }

                    if (currentNode) {
                        const before = currentNode.nodeValue.substring(0, nodeStartOffset);
                        const highlighted = currentNode.nodeValue.substring(nodeStartOffset, nodeEndOffset);
                        const after = currentNode.nodeValue.substring(nodeEndOffset);

                        const span = document.createElement('span');
                        span.className = 'searchTerm';
                        span.textContent = highlighted;

                        const fragment = document.createDocumentFragment();
                        if (before) fragment.appendChild(document.createTextNode(before));
                        fragment.appendChild(span);
                        if (after) fragment.appendChild(document.createTextNode(after));

                        currentNode.parentNode.replaceChild(fragment, currentNode);
                    }

                    remainingLength -= lengthInThisNode;
                    remainingStart += lengthInThisNode;
                }
                
                currentTextNodeIndex++;
            }
        }

        // Update the original span with our modified content
        langSpan.innerHTML = workingSpan.innerHTML;
    };

    // Check if it's a search in a comment
    if (verseRange.startsWith('comment')) {
        searchInComment(verseRange, searchTerm);
        return;
    }

    // Process verse segments
    const range = getVerseRange(verseRange);
    const langClass = isPali ? '.pli-lang' : '.eng-lang';
    
    const segments = document.querySelectorAll('.segment');
    segments.forEach(segment => {
        if (isIdInRange(segment.id, range)) {
            const langSpan = segment.querySelector(langClass);
            if (langSpan) {
                highlightInVerseSegment(langSpan, searchTerm, isPali);
            }
        }
    });
}

function getVerseRange(verseRange) {
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
}

function compareVerseIds(id1, id2) {
    const [prefix1, num1] = id1.split(':');
    const [prefix2, num2] = id2.split(':');
    
    if (prefix1 !== prefix2) return false;
    
    const nums1 = num1.split('.').map(Number);
    const nums2 = num2.split('.').map(Number);
    
    if (nums1[0] !== nums2[0]) return nums1[0] - nums2[0];
    return nums1[1] - nums2[1];
}

function isIdInRange(id, range) {
    const startCompare = compareVerseIds(id, range.start);
    const endCompare = compareVerseIds(id, range.end);
    
    return (startCompare >= 0 && endCompare <= 0) || range.isSingle && id === range.start;
}
