import { removeDiacritics } from './../misc/removeDiacritics.js';

export function checkSearchUrlParam() {
    const verseRange = window.location.hash.substring(1);
    if (!verseRange) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    let searchTerm = urlParams.get('search');
    if (!searchTerm) return;

    searchTerm = searchTerm.replace(/\+/g, ' ');
    let isPali = urlParams.get('isPali') === 'true';

    if (verseRange.startsWith('comment')) {
        handleCommentSearch(verseRange, searchTerm);
    } else {
        handleVerseSearch(verseRange, searchTerm, isPali);
    }
}

function processNode(node, textParts, currentText = '') {
    if (node.nodeType === 3) { // Text node
        const text = node.textContent;
        const startPos = currentText.length;
        currentText += text;
        textParts.push({
            type: 'text',
            text: text,
            start: startPos,
            length: text.length,
            parentTags: getParentTags(node)
        });
    } else if (node.nodeType === 1) { // Element node
        if (node.tagName === 'A' && node.textContent !== '←') {
            const text = node.textContent;
            const startPos = currentText.length;
            currentText += text;
            textParts.push({
                type: 'a',
                text: text,
                html: node.outerHTML,
                href: node.getAttribute('href'),
                start: startPos,
                length: text.length
            });
        } else {
            for (const child of node.childNodes) {
                currentText = processNode(child, textParts, currentText);
            }
        }
    }
    return currentText;
}

function getParentTags(node) {
    const tags = [];
    let current = node.parentElement;
    while (current && current.tagName !== 'SPAN') {
        tags.unshift({
            name: current.tagName.toLowerCase(),
            attributes: Array.from(current.attributes).reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
            }, {})
        });
        current = current.parentElement;
    }
    return tags;
}

function wrapWithTags(text, tags) {
    return tags.reduce((wrapped, tag) => {
        const attrs = Object.entries(tag.attributes)
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');
        return `<${tag.name}${attrs ? ' ' + attrs : ''}>${wrapped}</${tag.name}>`;
    }, text);
}

function handleCommentSearch(commentId, searchTerm) {
    const commentElement = document.getElementById(commentId);
    if (!commentElement) return;

    const normalizeText = text => removeDiacritics(text.toLowerCase());
    
    const workingElement = commentElement.cloneNode(true);
    
    // Remove end links before processing
    const endLinks = Array.from(workingElement.querySelectorAll('a'))
        .filter(a => a.textContent === '←')
        .map(a => a.outerHTML);
        
    endLinks.forEach(link => {
        workingElement.innerHTML = workingElement.innerHTML.replace(link, '');
    });
    
    const textParts = [];
    const currentText = processNode(workingElement, textParts);
    
    const normalizedSearchTerm = normalizeText(searchTerm);
    const normalizedText = normalizeText(currentText);
    
    // Create alternate search terms for different ellipsis characters
    const searchTerms = [normalizedSearchTerm];
    if (normalizedSearchTerm.includes('...')) {
        searchTerms.push(normalizedSearchTerm.replace(/\.\.\./g, '…'));
    } else if (normalizedSearchTerm.includes('…')) {
        searchTerms.push(normalizedSearchTerm.replace(/…/g, '...'));
    }
    
    // Find all matches without overlap for all search terms
    const matches = [];
    let lastEnd = 0;
    
    while (true) {
        let bestMatch = -1;
        let bestMatchTerm = null;
        
        // Find the earliest match among all search terms
        for (const term of searchTerms) {
            const matchIndex = normalizedText.indexOf(term, lastEnd);
            if (matchIndex !== -1 && (bestMatch === -1 || matchIndex < bestMatch)) {
                bestMatch = matchIndex;
                bestMatchTerm = term;
            }
        }
        
        if (bestMatch === -1) break;
        
        matches.push({
            start: bestMatch,
            end: bestMatch + bestMatchTerm.length
        });
        
        lastEnd = bestMatch + bestMatchTerm.length;
    }
    
    if (matches.length === 0) return;
    
    let result = '';
    let currentPos = 0;
    
    for (const part of textParts) {
        let partResult = '';
        let partStart = part.start;
        let partEnd = part.start + part.length;
        
        // Check if this part overlaps with any matches
        let hasMatch = false;
        for (const match of matches) {
            if (partEnd > match.start && partStart < match.end) {
                hasMatch = true;
                
                if (part.type === 'a') {
                    // Find the exact part that matches in the link
                    const linkText = part.text;
                    const matchStartInLink = Math.max(0, match.start - partStart);
                    const matchEndInLink = Math.min(part.length, match.end - partStart);
                    
                    // Split the link text into three parts: before, during, and after the match
                    const beforeMatch = linkText.substring(0, matchStartInLink);
                    const matchedText = linkText.substring(matchStartInLink, matchEndInLink);
                    const afterMatch = linkText.substring(matchEndInLink);
                    
                    // Build the link with only the matching part highlighted
                    partResult = `<a href="${part.href}">${beforeMatch}<span class="searchTerm">${matchedText}</span>${afterMatch}</a>`;
                } else {
                    // For text nodes, determine the exact overlap
                    const highlightStart = Math.max(0, match.start - partStart);
                    const highlightEnd = Math.min(part.length, match.end - partStart);
                    
                    let text = part.text;
                    if (highlightStart > 0) {
                        text = text.slice(0, highlightStart) +
                              '<span class="searchTerm">' +
                              text.slice(highlightStart, highlightEnd) +
                              '</span>' +
                              text.slice(highlightEnd);
                    } else {
                        text = '<span class="searchTerm">' +
                              text.slice(highlightStart, highlightEnd) +
                              '</span>' +
                              text.slice(highlightEnd);
                    }
                    
                    // Wrap with parent tags if any
                    if (part.parentTags && part.parentTags.length > 0) {
                        partResult = wrapWithTags(text, part.parentTags);
                    } else {
                        partResult = text;
                    }
                }
                break;
            }
        }
        
        if (!hasMatch) {
            // If no match, use original content with parent tags
            if (part.type === 'a') {
                partResult = part.html;
            } else if (part.parentTags && part.parentTags.length > 0) {
                partResult = wrapWithTags(part.text, part.parentTags);
            } else {
                partResult = part.text;
            }
        }
        
        result += partResult;
    }
    
    // Add back the end links
    result += '\n                ' + endLinks.join('\n                ') + '\n                ';
    
    commentElement.querySelector('span').innerHTML = result;
}

function normalizeText(text) {
    // Replace HTML spaces with regular spaces
    let normalized = text.replace(/&nbsp;/g, ' ')
                        // Remove multiple spaces
                        .replace(/\s+/g, ' ')
                        .toLowerCase();
    if (isPali) {
        normalized = removeDiacritics(normalized);
    }
    return normalized;
}

function handleVerseSearch(verseRange, searchTerm, isPali) {
    let segments;
    if (verseRange.includes('_')) {
        segments = getSegmentsBetweenVerses(verseRange);
    } else {
        const segment = document.querySelector(`.segment[id="${verseRange}"]`);
        segments = segment ? [segment] : [];
    }

    if (!segments.length) return;

    const langClass = isPali ? 'pli-lang' : 'eng-lang';
    
    // Filter out empty segments and prepare segment data
    const segmentsData = segments.map(segment => {
        const langSpan = segment.querySelector(`span.${langClass}`);
        if (!langSpan) return null;

        const originalHtml = langSpan.innerHTML;
        const tags = [];
        let workingHtml = originalHtml;
        
        // Find all <a> tags
        const linkRegex = /<a[^>]*>.*?<\/a>/g;
        let match;
        while ((match = linkRegex.exec(originalHtml)) !== null) {
            tags.push({
                start: match.index,
                end: match.index + match[0].length,
                tag: match[0]
            });
        }

        // Remove <a> tags and normalize HTML spaces
        const searchText = workingHtml.replace(linkRegex, '')
                                    .replace(/&nbsp;/g, ' ')
                                    .replace(/\s+/g, ' ');

        // Skip empty or whitespace-only segments
        if (!searchText.trim()) return null;

        return {
            element: langSpan,
            searchText,
            originalHtml,
            tags,
            id: segment.getAttribute('id')
        };
    }).filter(Boolean);

    // Combine non-empty segment text for searching
    let combinedText = '';
    const segmentBoundaries = [];

    segmentsData.forEach(data => {
        segmentBoundaries.push({
            start: combinedText.length,
            length: data.searchText.length,
            data
        });
        combinedText += data.searchText;
    });

	const normalizeText = text => {
        let normalized = text.toLowerCase();
        if (isPali) {
            normalized = removeDiacritics(normalized);
        }
        return normalized;
    };

    const normalizedSearchTerm = normalizeText(searchTerm);
    const normalizedText = normalizeText(combinedText);

    // Create alternate search terms for different ellipsis characters
    const searchTerms = [normalizedSearchTerm];
    if (normalizedSearchTerm.includes('...')) {
        searchTerms.push(normalizedSearchTerm.replace(/\.\.\./g, '…'));
    } else if (normalizedSearchTerm.includes('…')) {
        searchTerms.push(normalizedSearchTerm.replace(/…/g, '...'));
    }

    let lastMatchIndex = 0;
    const matches = [];

    while (true) {
        let bestMatch = -1;
        let bestMatchTerm = null;
        
        // Find the earliest match among all search terms
        for (const term of searchTerms) {
            const matchIndex = normalizedText.indexOf(term, lastMatchIndex);
            if (matchIndex !== -1 && (bestMatch === -1 || matchIndex < bestMatch)) {
                bestMatch = matchIndex;
                bestMatchTerm = term;
            }
        }
        
        if (bestMatch === -1) break;
        
        matches.push({
            start: bestMatch,
            end: bestMatch + bestMatchTerm.length
        });
        
        lastMatchIndex = bestMatch + bestMatchTerm.length;
    }

    if (!matches.length) return;

    // Process each match and update all affected segments
    matches.forEach(({ start, end }) => {
        // Find all segments that this match spans
        const affectedSegments = segmentBoundaries.filter(boundary => {
            const segmentStart = boundary.start;
            const segmentEnd = boundary.start + boundary.length;
            return (start < segmentEnd && end > segmentStart);
        });

        affectedSegments.forEach(boundary => {
            const { element, originalHtml, searchText, tags } = boundary.data;
            const segmentStart = boundary.start;
            
            // Calculate the portion of the match that falls within this segment
            const matchStartInSegment = Math.max(0, start - segmentStart);
            const matchEndInSegment = Math.min(boundary.length, end - segmentStart);

            let highlightedText = '';
            let currentPos = 0;
            let lastTagEnd = 0;

            // Sort tags by start position
            const sortedTags = [...tags].sort((a, b) => a.start - b.start);

            // Process text and tags in order
            sortedTags.forEach(tag => {
                // Add text before the tag if any
                if (tag.start > currentPos) {
                    const textBeforeTag = searchText.slice(currentPos, tag.start);
                    highlightedText += applyHighlight(textBeforeTag, 
                                                    matchStartInSegment - currentPos, 
                                                    matchEndInSegment - currentPos);
                }

                // Add the tag
                highlightedText += tag.tag;
                currentPos = tag.start;
                lastTagEnd = tag.end;
            });

            // Add remaining text after last tag
            if (currentPos < searchText.length) {
                const remainingText = searchText.slice(currentPos);
                highlightedText += applyHighlight(remainingText,
                                                matchStartInSegment - currentPos,
                                                matchEndInSegment - currentPos);
            }

            element.innerHTML = highlightedText;
        });
    });
}

// Helper function to apply highlight to a text segment
function applyHighlight(text, highlightStart, highlightEnd) {
    if (highlightStart >= text.length || highlightEnd <= 0) {
        return text;
    }

    highlightStart = Math.max(0, highlightStart);
    highlightEnd = Math.min(text.length, highlightEnd);

    if (highlightStart >= highlightEnd) {
        return text;
    }

    return text.slice(0, highlightStart) +
           '<span class="searchTerm">' +
           text.slice(highlightStart, highlightEnd) +
           '</span>' +
           text.slice(highlightEnd);
}

function getVerseNumber(verse) {
    // Handle cases like "mn28:29-30.1" for composite verses
    if (verse.includes('-')) {
        // For composite verses, take the first number
        verse = verse.split('-')[0];
    }
    
    const parts = verse.match(/(\d+)(?::(\d+))?(?:\.(\d+))?$/);
    if (!parts) return 0;
    
    return parseInt(parts[1]) * 10000 + 
           (parts[2] ? parseInt(parts[2]) * 100 : 0) + 
           (parts[3] ? parseInt(parts[3]) : 0);
}

function getVersePrefix(verse) {
    return verse.match(/^[a-z]+/i)[0];
}

function getSegmentsBetweenVerses(verseRange) {
    const [startVerse, endVerse] = verseRange.split('_');
    
    // Extract components of the start verse
    const startPrefix = getVersePrefix(startVerse);
    const startNum = getVerseNumber(startVerse);
    
    // Extract components of the end verse
    let endPrefix = startPrefix;  // Default to the same prefix
    let endVerseParts = endVerse.match(/^(?:([a-z]+):)?(.+)$/i);
    
    if (endVerseParts && endVerseParts[1]) {
        endPrefix = endVerseParts[1];  // If a prefix is specified
    }
    const endNum = getVerseNumber(endVerseParts ? endVerseParts[2] : endVerse);
    
    return Array.from(document.querySelectorAll('.segment'))
        .filter(segment => {
            const id = segment.getAttribute('id');
            if (!id) return false;
            
            // Check if the ID starts with one of the prefixes
            const prefix = getVersePrefix(id);
            if (prefix !== startPrefix && prefix !== endPrefix) return false;
            
            const verseNum = getVerseNumber(id);
            return verseNum >= startNum && verseNum <= endNum;
        });
}
