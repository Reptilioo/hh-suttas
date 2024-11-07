import { removeDiacritics } from './../misc/removeDiacritics.js';

export function checkSearchUrlParam() {
    const verseRange = window.location.hash.substring(1);
    if (!verseRange) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    
    let searchTerm = urlParams.get('search');
    if (!searchTerm) return;
    searchTerm = searchTerm.replace("+", " ");
    
    let isPali = urlParams.get('pali') === "show";

    // Fonction pour chercher et surligner dans un commentaire
	const searchInComment = (commentId, searchTerm) => {
		const commentElement = document.getElementById(commentId);
		if (!commentElement) return;

		const commentSpan = commentElement.querySelector('span');
		if (!commentSpan) return;

		// Sauvegarder le HTML original
		const originalHtml = commentSpan.innerHTML;
		const originalText = commentSpan.textContent;
		const searchableText = originalText.toLowerCase();
		const searchableSearchTerm = searchTerm.toLowerCase();

		const searchIndex = searchableText.indexOf(searchableSearchTerm);
		if (searchIndex === -1) return;

		// Extraire le numéro et le lien du commentaire
		const commentNumber = originalText.substring(0, originalText.indexOf(':') + 1);
		const backLink = commentSpan.querySelector('a');
		const backLinkHtml = backLink ? backLink.outerHTML : '';

		// Fonction pour obtenir la position réelle dans le HTML pour un index dans le texte
		const getHtmlIndex = (textIndex) => {
			let currentTextIndex = 0;
			let currentHtmlIndex = 0;
			
			while (currentTextIndex < textIndex && currentHtmlIndex < originalHtml.length) {
				if (originalHtml[currentHtmlIndex] === '<') {
					// Sauter la balise HTML
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

		// Obtenir les positions dans le HTML
		const htmlSearchIndex = getHtmlIndex(searchIndex);
		const htmlSearchEndIndex = getHtmlIndex(searchIndex + searchTerm.length);

		// Découper et reconstruire le HTML en préservant les balises
		const before = originalHtml.substring(0, htmlSearchIndex);
		const highlighted = originalHtml.substring(htmlSearchIndex, htmlSearchEndIndex);
		let after = originalHtml.substring(htmlSearchEndIndex);

		// Retirer la flèche et le lien de retour de 'after' car ils sont dans backLinkHtml
		const linkIndex = after.indexOf('<a href=');
		if (linkIndex !== -1) {
			after = after.substring(0, linkIndex);
		}

		// Reconstruire le HTML en préservant les balises et le lien
		commentSpan.innerHTML = before + 
			'<span class="searchTerm">' + highlighted + '</span>' + 
			after + 
			backLinkHtml;
	};

    // Vérifier si c'est une recherche dans un commentaire
    if (verseRange.startsWith('comment')) {
        searchInComment(verseRange, searchTerm);
        return;
    }

    // Le reste du code pour la recherche dans les versets reste inchangé
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
    let textsWithPositions = [];
    let totalLength = 0;

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

    let searchableSearchTerm = searchTerm.toLowerCase();
    if (isPali) {
        searchableSearchTerm = removeDiacritics(searchableSearchTerm);
    }

    const fullSearchableText = textsWithPositions
        .map(item => item.searchableText)
        .join('');

    const searchIndex = fullSearchableText.indexOf(searchableSearchTerm);
    if (searchIndex === -1) return;

    let remainingSearchLength = searchTerm.length;
    let currentSearchPosition = searchIndex;

    for (const textItem of textsWithPositions) {
        const spanStartPosition = textItem.startPosition;
        const spanEndPosition = spanStartPosition + textItem.originalText.length;

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
