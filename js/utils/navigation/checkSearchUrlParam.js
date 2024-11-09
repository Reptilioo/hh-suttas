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
    
    // Find all matches without overlap
    const matches = [];
    let lastEnd = 0;
    
    while (true) {
        const matchIndex = normalizedText.indexOf(normalizedSearchTerm, lastEnd);
        if (matchIndex === -1) break;
        
        matches.push({
            start: matchIndex,
            end: matchIndex + normalizedSearchTerm.length
        });
        
        lastEnd = matchIndex + normalizedSearchTerm.length;
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

// ... other functions remain the same ...

function handleVerseSearch(verseRange, searchTerm, isPali) {
    let segments;
    if (verseRange.includes('-')) {
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
    }).filter(Boolean); // Remove null entries

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

    let lastMatchIndex = 0;
    const matches = [];

    while (true) {
        const matchIndex = normalizedText.indexOf(normalizedSearchTerm, lastMatchIndex);
        if (matchIndex === -1) break;
        matches.push({
            start: matchIndex,
            end: matchIndex + normalizedSearchTerm.length
        });
        lastMatchIndex = matchIndex + normalizedSearchTerm.length;
    }

    if (!matches.length) return;

    matches.forEach(({ start, end }) => {
        const boundary = segmentBoundaries.find(boundary => {
            return start >= boundary.start &&
                   start < boundary.start + boundary.length;
        });

        if (!boundary) return;

        const { element, originalHtml, searchText, tags } = boundary.data;

        const matchedText = searchText.slice(start - boundary.start, end - boundary.start);
        const beforeMatch = searchText.slice(0, start - boundary.start);
        const afterMatch = searchText.slice(end - boundary.start);

        let highlightedText = beforeMatch +
                              '<span class="searchTerm">' +
                              matchedText +
                              '</span>' +
                              afterMatch;

        tags.reverse().forEach(tag => {
            const tagStart = tag.start - boundary.start;
            const tagEnd = tag.end - boundary.start;

            highlightedText = highlightedText.slice(0, tagStart) +
                              tag.tag +
                              highlightedText.slice(tagStart);
        });

        element.innerHTML = highlightedText;
    });
}
