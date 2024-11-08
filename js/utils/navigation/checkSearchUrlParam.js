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

        // Pour chaque segment affecté
        segmentBoundaries.forEach(segment => {
            const segmentEnd = segment.start + segment.length;

            if (matchIndex < segmentEnd && matchEnd > segment.start) {
                const segmentMatchStart = Math.max(0, matchIndex - segment.start);
                const segmentMatchEnd = Math.min(segment.length, matchEnd - segment.start);

                let segmentText = segment.data.originalHtml;
                
                // Recalculer les positions en tenant compte des balises <a> supprimées
                let adjustedStart = segmentMatchStart;
                let adjustedEnd = segmentMatchEnd;

                // Ajuster les positions pour préserver l'intégrité des mots
                const words = segmentText.split(/(\s+)/);
                let currentPos = 0;
                let finalStart = 0;
                let finalEnd = segmentText.length;

                for (let i = 0; i < words.length; i++) {
                    const word = words[i];
                    const nextPos = currentPos + word.length;

                    if (currentPos <= adjustedStart && nextPos > adjustedStart) {
                        finalStart = currentPos;
                    }
                    if (currentPos < adjustedEnd && nextPos >= adjustedEnd) {
                        finalEnd = nextPos;
                    }

                    currentPos = nextPos;
                }

                segment.data.tags.forEach(tag => {
                    if (tag.start < finalStart) {
                        finalStart += tag.end - tag.start;
                    }
                    if (tag.start < finalEnd) {
                        finalEnd += tag.end - tag.start;
                    }
                });

                // Ajouter la mise en surbrillance
                segmentText = 
                    segmentText.slice(0, finalStart) +
                    '<span class="searchTerm">' +
                    segmentText.slice(finalStart, finalEnd) +
                    '</span>' +
                    segmentText.slice(finalEnd);

                segment.data.element.innerHTML = segmentText;
            }
        });

        searchIndex = matchIndex + 1;
    }
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
    const [startVerse, endVerse] = verseRange.split('-');
    
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
