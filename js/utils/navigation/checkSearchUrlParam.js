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
    let currentText = '';
    
    function processNode(node) {
        if (node.nodeType === 3) {
            const text = node.textContent;
            const startPos = currentText.length;
            currentText += text;
            textParts.push({
                type: 'text',
                text: text,
                start: startPos,
                length: text.length
            });
        } else if (node.nodeType === 1) {
            if (node.tagName === 'EM') {
                const text = node.textContent;
                const startPos = currentText.length;
                currentText += text;
                textParts.push({
                    type: 'em',
                    text: text,
                    html: node.outerHTML,
                    start: startPos,
                    length: text.length
                });
            } else if (node.tagName === 'A' && node.textContent !== '←') {
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
                    processNode(child);
                }
            }
        }
    }
    
    processNode(workingElement);
    
    const normalizedSearchTerm = normalizeText(searchTerm);
    const normalizedText = normalizeText(currentText);
    
    const matches = [];
    let searchIndex = 0;
    
    while (true) {
        const matchIndex = normalizedText.indexOf(normalizedSearchTerm, searchIndex);
        if (matchIndex === -1) break;
        
        matches.push({
            start: matchIndex,
            end: matchIndex + normalizedSearchTerm.length
        });
        
        searchIndex = matchIndex + 1;
    }
    
    if (matches.length === 0) return;
    
    let result = '';
    let currentPos = 0;
    
    for (const part of textParts) {
        let addedToHighlight = false;
        
        for (const match of matches) {
            const matchStart = match.start;
            const matchEnd = match.end;
            
            if (part.start + part.length > matchStart && part.start < matchEnd) {
                if (!addedToHighlight) {
                    if (part.type === 'a') {
                        // For links, we put the highlight inside
                        const linkStart = matchStart - part.start;
                        const linkEnd = Math.min(part.length, matchEnd - part.start);
                        
                        // If the match starts before the link
                        if (linkStart < 0) {
                            result = result.slice(0, result.length + linkStart);
                            result += '<span class="searchTerm">' + 
                                     currentText.slice(matchStart, part.start) + 
                                     '</span>';
                            result += `<a href="${part.href}"><span class="searchTerm">` +
                                     part.text +
                                     '</span></a>';
                        } else {
                            result += `<a href="${part.href}"><span class="searchTerm">` +
                                     part.text.slice(linkStart, linkEnd) +
                                     '</span></a>';
                        }
                    } else {
                        if (part.start <= matchStart) {
                            result += part.text.slice(0, matchStart - part.start);
                            result += '<span class="searchTerm">';
                        }
                        
                        if (part.type === 'text') {
                            result += part.text.slice(
                                Math.max(0, matchStart - part.start),
                                Math.min(part.length, matchEnd - part.start)
                            );
                        } else {
                            result += part.html;
                        }
                        
                        if (part.start + part.length >= matchEnd) {
                            result += '</span>';
                            result += part.text.slice(matchEnd - part.start);
                        }
                    }
                    
                    addedToHighlight = true;
                }
            }
        }
        
        if (!addedToHighlight) {
            if (part.type === 'text') {
                result += part.text;
            } else if (part.type === 'a') {
                result += `<a href="${part.href}">${part.text}</a>`;
            } else {
                result += part.html;
            }
        }
    }
    
    result += '\n                ' + endLinks.join('\n                ') + '\n                ';
    
    commentElement.querySelector('span').innerHTML = result;
}

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
    
    const segmentsData = segments.map(segment => {
        const langSpan = segment.querySelector(`span.${langClass}`);
        if (!langSpan) return null;

        // Extract <a> tags and their position
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

        // Completely remove <a> tags and their content for the search
        const searchText = workingHtml.replace(linkRegex, '');

        return {
            element: langSpan,
            searchText,
            originalHtml,
            tags
        };
    }).filter(Boolean);

    // Combine all segment text for searching
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

    // Find all matches
    let searchIndex = 0;
    while (true) {
        const matchIndex = normalizedText.indexOf(normalizedSearchTerm, searchIndex);
        if (matchIndex === -1) break;

        const matchEnd = matchIndex + normalizedSearchTerm.length;

        // For each affected segment
        segmentBoundaries.forEach(segment => {
            const segmentEnd = segment.start + segment.length;

            if (matchIndex < segmentEnd && matchEnd > segment.start) {
                const segmentMatchStart = Math.max(0, matchIndex - segment.start);
                const segmentMatchEnd = Math.min(segment.length, matchEnd - segment.start);

                let segmentText = segment.data.originalHtml;
                
                // Recalculate positions considering removed <a> tags
                let adjustedStart = segmentMatchStart;
                let adjustedEnd = segmentMatchEnd;

                segment.data.tags.forEach(tag => {
                    if (tag.start < segmentMatchStart) {
                        adjustedStart += tag.end - tag.start;
                    }
                    if (tag.start < segmentMatchEnd) {
                        adjustedEnd += tag.end - tag.start;
                    }
                });

                // Add highlight
                segmentText = 
                    segmentText.slice(0, adjustedStart) +
                    '<span class="searchTerm">' +
                    segmentText.slice(adjustedStart, adjustedEnd) +
                    '</span>' +
                    segmentText.slice(adjustedEnd);

                segment.data.element.innerHTML = segmentText;
            }
        });

        searchIndex = matchIndex + 1;
    }
}

function getSegmentsBetweenVerses(verseRange) {
    const [startVerse, endVerse] = verseRange.split('-');
    
    const getVerseNumber = (verse) => {
        const parts = verse.match(/(\d+)(?::(\d+))?(?:\.(\d+))?$/);
        if (!parts) return 0;
        return parseInt(parts[1]) * 10000 + 
               (parts[2] ? parseInt(parts[2]) * 100 : 0) + 
               (parts[3] ? parseInt(parts[3]) : 0);
    };
    
    const getVersePrefix = (verse) => {
        return verse.match(/^[a-z]+/i)[0];
    };
    
    const startNum = getVerseNumber(startVerse);
    const endNum = getVerseNumber(endVerse);
    const prefix = getVersePrefix(startVerse);
    
    return Array.from(document.querySelectorAll('.segment'))
        .filter(segment => {
            const id = segment.getAttribute('id');
            if (!id || !id.startsWith(prefix)) return false;
            
            const verseNum = getVerseNumber(id);
            return verseNum >= startNum && verseNum <= endNum;
        });
}
