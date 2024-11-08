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
    
    // Extraire et supprimer les liens de fin
    const endLinks = Array.from(workingElement.querySelectorAll('a'))
        .filter(a => a.textContent === '←')
        .map(a => a.outerHTML);
    endLinks.forEach(link => {
        workingElement.innerHTML = workingElement.innerHTML.replace(link, '');
    });
    
    // Stocker les parties du texte avec leur type et position
    const textParts = [];
    let currentText = '';
    
    function processNode(node) {
        if (node.nodeType === 3) { // Nœud texte
            const text = node.textContent;
            const startPos = currentText.length;
            currentText += text;
            textParts.push({
                type: 'text',
                text: text,
                start: startPos,
                length: text.length
            });
        } else if (node.nodeType === 1) { // Élément
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
                    processNode(child);
                }
            }
        }
    }
    
    processNode(workingElement);
    
    // Trouver les correspondances
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
    
    // Reconstruire le texte avec le highlighting
    let result = '';
    let currentHighlight = null;
    
    for (const part of textParts) {
        let partContent = '';
        
        for (let i = 0; i < part.length; i++) {
            const pos = part.start + i;
            const inMatch = matches.some(m => pos >= m.start && pos < m.end);
            
            if (inMatch && currentHighlight === null) {
                currentHighlight = true;
                partContent += '<span class="searchTerm">';
            } else if (!inMatch && currentHighlight === true) {
                currentHighlight = null;
                partContent += '</span>';
            }
            
            if (part.type === 'text') {
                partContent += part.text[i];
            } else if (part.type === 'a' && i === 0) {
                if (currentHighlight) {
                    partContent = part.html.replace('>', '><span class="searchTerm">') + '</span>';
                } else {
                    partContent = part.html;
                }
                break;
            }
        }
        
        result += partContent;
    }
    
    if (currentHighlight) {
        result += '</span>';
    }
    
    // Ajouter les liens de fin
    result += '\n                ' + endLinks.join('\n                ') + '\n                ';
    
    // Mettre à jour le contenu
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
                
                // Calculer les positions en tenant compte des balises HTML
                let adjustedStart = segmentMatchStart;
                let adjustedEnd = segmentMatchEnd;
                let nbspOffset = 0;

                // Compter les &nbsp; avant la position de début
                const nbspBeforeStart = (segmentText.slice(0, adjustedStart).match(/&nbsp;/g) || []).length;
                const nbspInMatch = (segmentText.slice(adjustedStart, adjustedEnd).match(/&nbsp;/g) || []).length;

                // Ajuster les positions en fonction des &nbsp;
                adjustedStart += nbspBeforeStart * 5; // 5 est la différence entre "&nbsp;" (6 caractères) et " " (1 caractère)
                adjustedEnd += (nbspBeforeStart + nbspInMatch) * 5;

                // Ajuster pour les balises <a>
                segment.data.tags.forEach(tag => {
                    if (tag.start < adjustedStart) {
                        adjustedStart += tag.end - tag.start;
                    }
                    if (tag.start < adjustedEnd) {
                        adjustedEnd += tag.end - tag.start;
                    }
                });

                // Ajouter le highlighting
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
