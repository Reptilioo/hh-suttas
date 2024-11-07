export function checkSearchUrlParam() {
	const verseRange = window.location.hash.substring(1);
    if (!verseRange) return;
    
	const urlParams = new URLSearchParams(window.location.search);
	
    let searchTerm = urlParams.get('search');
    if (!searchTerm) return;
	searchTerm = searchTerm.replace("+", " ");
    
    let isPali = urlParams.get('pali') === "show";
    
    // Fonction pour obtenir la range des versets
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

    // Fonction pour comparer les IDs des versets
    const compareVerseIds = (id1, id2) => {
        const [prefix1, num1] = id1.split(':');
        const [prefix2, num2] = id2.split(':');
        
        if (prefix1 !== prefix2) return false;
        
        const nums1 = num1.split('.').map(Number);
        const nums2 = num2.split('.').map(Number);
        
        if (nums1[0] !== nums2[0]) return nums1[0] - nums2[0];
        return nums1[1] - nums2[1];
    };

    // Fonction pour vérifier si un ID est dans la range
    const isIdInRange = (id, range) => {
        const startCompare = compareVerseIds(id, range.start);
        const endCompare = compareVerseIds(id, range.end);
        
        return (startCompare >= 0 && endCompare <= 0) || range.isSingle && id === range.start;
    };

    const range = getVerseRange(verseRange);
    const langClass = isPali ? '.pli-lang' : '.eng-lang';
    
    // Récupérer tous les segments dans la range
    const segments = document.querySelectorAll('.segment');
	console.log(segments);
    let fullText = '';
    let relevantSpans = [];
    
    // Construire le texte complet et collecter les spans pertinents
    segments.forEach(segment => {
        if (isIdInRange(segment.id, range)) {
            const langSpan = segment.querySelector(langClass);
            if (langSpan) {
                fullText += langSpan.textContent;
                relevantSpans.push(langSpan);
            }
        }
    });

    // Rechercher le terme dans le texte complet
    const searchIndex = fullText.indexOf(searchTerm);
    if (searchIndex === -1) return;

    // Surligner le texte trouvé
    let currentPosition = 0;
    let remainingSearch = searchTerm;

    for (const span of relevantSpans) {
        const spanText = span.textContent;
        const spanLength = spanText.length;
        
        if (currentPosition + spanLength <= searchIndex) {
            currentPosition += spanLength;
            continue;
        }

        const startInSpan = Math.max(0, searchIndex - currentPosition);
        const searchLengthInSpan = Math.min(
            remainingSearch.length,
            spanLength - startInSpan
        );

        const before = spanText.substring(0, startInSpan);
        const highlighted = spanText.substring(startInSpan, startInSpan + searchLengthInSpan);
        const after = spanText.substring(startInSpan + searchLengthInSpan);

        span.innerHTML = before + '<span class="searchTerm">' + highlighted + '</span>' + after;

        remainingSearch = remainingSearch.substring(searchLengthInSpan);
        if (remainingSearch.length === 0) break;

        currentPosition += spanLength;
    }
}