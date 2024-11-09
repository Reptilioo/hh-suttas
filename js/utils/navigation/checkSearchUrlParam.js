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

// Nouvelle fonction pour générer les variantes de recherche
function generateSearchVariants(searchTerm) {
    const variants = [searchTerm];
    
    // Gestion des apostrophes
    if (searchTerm.includes('’')) {
        variants.push(searchTerm.replace(/'/g, '\''));
    }
    if (searchTerm.includes('\'')) {
        variants.push(searchTerm.replace(/'/g, '’'));
    }
    
    // Gestion des points de suspension
    variants.forEach(variant => {
        if (variant.includes('...')) {
            variants.push(variant.replace(/\.\.\./g, '…'));
        } else if (variant.includes('…')) {
            variants.push(variant.replace(/…/g, '...'));
        }
    });
    
    return [...new Set(variants)]; // Éliminer les doublons
}

function handleCommentSearch(commentId, searchTerm) {
    const commentElement = document.getElementById(commentId);
    if (!commentElement) return;

    const normalizeText = text => removeDiacritics(text.toLowerCase());
    
    const workingElement = commentElement.cloneNode(true);
    
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
    
    // Utiliser la nouvelle fonction pour générer les variantes
    const searchTerms = generateSearchVariants(normalizedSearchTerm);
    
    const matches = [];
    let lastEnd = 0;
    
    while (true) {
        let bestMatch = -1;
        let bestMatchTerm = null;
        
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

// Helper function to ensure space before closing spans
function ensureSpaceBeforeClosing(element) {
    const langSpans = element.querySelectorAll('span.eng-lang, span.pli-lang');
    
    langSpans.forEach(span => {
        let html = span.innerHTML;
        const lastLink = span.querySelector('a:last-child');
        
        if (lastLink) {
            // Case with last anchor tag
            const beforeLink = html.slice(0, html.lastIndexOf(lastLink.outerHTML)).trim();
            if (!beforeLink.endsWith(' ')) {
                html = beforeLink + ' ' + lastLink.outerHTML;
                span.innerHTML = html;
            }
        } else {
            // Case without anchor tag
            if (!html.trim().endsWith(' ')) {
                html = html.trimEnd() + ' ';
                span.innerHTML = html;
            }
        }
    });
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

    segments.forEach(segment => {
        ensureSpaceBeforeClosing(segment);
    });

    const langClass = isPali ? 'pli-lang' : 'eng-lang';
    
    // Filter out empty segments and prepare segment data
    const segmentsData = segments.map(segment => {
        const langSpan = segment.querySelector(`span.${langClass}`);
        if (!langSpan) return null;

        const originalHtml = langSpan.innerHTML;
        const textAndTags = extractTextAndTags(originalHtml);
        
        // Skip empty or whitespace-only segments
        if (!textAndTags.plainText.trim()) return null;

        return {
            element: langSpan,
            ...textAndTags,
            id: segment.getAttribute('id')
        };
    }).filter(Boolean);

    // Combine non-empty segment text for searching
    let combinedText = '';
    const segmentBoundaries = [];

    segmentsData.forEach(data => {
        segmentBoundaries.push({
            start: combinedText.length,
            length: data.plainText.length,
            data
        });
        combinedText += data.plainText;
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

    // Utiliser la nouvelle fonction pour générer les variantes
    const searchTerms = generateSearchVariants(normalizedSearchTerm);

    const matches = findAllMatches(normalizedText, searchTerms);

    if (!matches.length) return;

    // Process each match and update all affected segments
    matches.forEach(({ start, end }) => {
        const affectedSegments = segmentBoundaries.filter(boundary => {
            const segmentStart = boundary.start;
            const segmentEnd = boundary.start + boundary.length;
            return (start < segmentEnd && end > segmentStart);
        });

        affectedSegments.forEach(boundary => {
            const { element, plainText, tags } = boundary.data;
            const segmentStart = boundary.start;
            
            // Calculate match position within this segment
            const matchStartInSegment = Math.max(0, start - segmentStart);
            const matchEndInSegment = Math.min(boundary.length, end - segmentStart);

            element.innerHTML = reconstructHtmlWithHighlight(
                plainText,
                tags,
                matchStartInSegment,
                matchEndInSegment
            );
        });
    });
}

function extractTextAndTags(html) {
    const tags = [];
    const emTags = [];
    let plainText = html;
    let offset = 0;

    // First extract <a> tags
    const linkRegex = /<a[^>]*>.*?<\/a>/g;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
        tags.push({
            type: 'a',
            start: match.index - offset,
            end: match.index + match[0].length - offset,
            tag: match[0]
        });
        offset += match[0].length;
    }

    // Then extract <em> tags content and position
    const emRegex = /<em>(.*?)<\/em>/g;
    plainText = plainText.replace(linkRegex, '');
    offset = 0;
    
    while ((match = emRegex.exec(plainText)) !== null) {
        const content = match[1];
        emTags.push({
            type: 'em',
            start: match.index - offset,
            end: match.index + content.length - offset,
            content: content
        });
        offset += match[0].length - content.length;
    }

    // Remove all HTML tags for plain text
    plainText = plainText.replace(/<[^>]*>/g, '');

    return {
        plainText,
        tags: [...tags, ...emTags].sort((a, b) => a.start - b.start)
    };
}

function findAllMatches(normalizedText, searchTerms) {
    const matches = [];
    let lastMatchIndex = 0;

    while (true) {
        let bestMatch = -1;
        let bestMatchTerm = null;
        
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

    return matches;
}

function reconstructHtmlWithHighlight(text, tags, highlightStart, highlightEnd) {
    let result = '';
    let currentPos = 0;

    tags.forEach(tag => {
        // Add text before the tag
        if (tag.start > currentPos) {
            result += applyHighlight(
                text.slice(currentPos, tag.start),
                Math.max(0, highlightStart - currentPos),
                Math.min(tag.start - currentPos, highlightEnd - currentPos)
            );
        }

        // Handle the tag based on its type
        if (tag.type === 'a') {
            result += tag.tag;
        } else if (tag.type === 'em') {
            // For em tags, we need to check if their content needs highlighting
            const emContent = text.slice(tag.start, tag.end);
            const emHighlightStart = Math.max(0, highlightStart - tag.start);
            const emHighlightEnd = Math.min(tag.end - tag.start, highlightEnd - tag.start);
            
            if (emHighlightStart < emContent.length && emHighlightEnd > 0) {
                result += '<em>' + applyHighlight(
                    emContent,
                    emHighlightStart,
                    emHighlightEnd
                ) + '</em>';
            } else {
                result += '<em>' + emContent + '</em>';
            }
        }

        currentPos = tag.end;
    });

    // Add remaining text after last tag
    if (currentPos < text.length) {
        result += applyHighlight(
            text.slice(currentPos),
            Math.max(0, highlightStart - currentPos),
            Math.min(text.length - currentPos, highlightEnd - currentPos)
        );
    }

    return result;
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
