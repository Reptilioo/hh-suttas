// Refactor?
// Need to remove './python/generated/suttas-database-data-hash.txt'
// Voir dans les deux fichiers s'il n'y a pas des fonctions appelées que dans une fonction qu'on pourrait ajouté directement à la fonction

import db from "./js/dexie/dexie.js";
import { fetchAvailableSuttas } from "./js/utils/loadContent/fetchAvailableSuttas.js";
import { removeDiacritics } from './js/utils/misc/removeDiacritics.js';

//Search suttas by search term and language options.
async function searchSuttasWithStop(searchTerm, options) {
    const availableSuttasJson = await fetchAvailableSuttas();
	const originalSearch = searchTerm;
    searchTerm = cleanSearchTerm(searchTerm.toLowerCase());

    const resultsDiv = document.querySelector('.results');
    const loadingBar = document.getElementById('loadingBar');
    resultsDiv.innerHTML = ''; // Clear previous results
    loadingBar.style.width = '0%'; // Reset loading bar

    const [suttasEn, suttasPl] = await Promise.all([
        options['en'] ? getSuttas(db, options, 'en') : [],
        options['pali'] ? getSuttas(db, options, 'pl') : []
    ]);

    const totalIterations = suttasEn.length * 2 + suttasPl.length;
    let currentIteration = 0;
    let gotResults = false;

	// Clean and normalize search term
	function normalizeSearchTerm(term) {
		return term.toLowerCase().trim();
	}

	// Escape special characters for regex
	function escapeRegExp(string) {
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	// Helper function to get ID, title and heading
	function getIdAndTitle(sutta, availableSuttasJson, lang) {
		const availableSutta = availableSuttasJson[sutta.id] || {};
		return {
			id: availableSutta.id || sutta.id.toUpperCase(),
			title: lang === 'en' ? availableSutta.title : availableSutta.pali_title || "Unknown Title",
			heading: availableSutta.heading || ""
		};
	}

	// Check if text contains search term with punctuation handling
	function checkStrictMatch(text, searchTerm) {
		if (!text) return false;
		
		// Normalize both text and search term
		const normalizedText = normalizeSearchTerm(text);
		const normalizedSearchTerm = normalizeSearchTerm(searchTerm);
		
		// Create a regex pattern that matches the search term with optional punctuation
		const punctuation = '[\\s.,!?;"\'\\)\\]\\}\\-:/]*';
		const searchPattern = `(^|[\\s.,!?;"'\\(\\[\\{\\-:/]+)${escapeRegExp(normalizedSearchTerm)}(?=${punctuation}($|[\\s.,!?;"'\\(\\[\\{\\-:/]+))`;
		const regex = new RegExp(searchPattern, 'i');
		
		// Check both with and without diacritics
		return regex.test(normalizedText) || 
			   regex.test(removeDiacritics(normalizedText));
	}

	// Check title/heading matches
	function checkTitleMatch(text, searchTerm, strict) {
		if (!text) return false;
		
		if (strict) {
			return checkStrictMatch(text, searchTerm);
		} else {
			const normalizedText = normalizeSearchTerm(text);
			const normalizedSearchTerm = normalizeSearchTerm(searchTerm);
			return normalizedText.includes(normalizedSearchTerm) ||
				   removeDiacritics(normalizedText).includes(removeDiacritics(normalizedSearchTerm));
		}
	}

	// Highlight search term in text, preserving diacritics
	function highlightSearchTerm(text, searchTerm) {
		if (!text) return '';
		
		const normalizedSearchTerm = normalizeSearchTerm(searchTerm);
		let result = text;
		
		// Function to find and highlight matches while preserving original text
		const highlightMatches = (text, pattern) => {
			const matches = [...text.matchAll(pattern)];
			let highlighted = text;
			let offset = 0;
			
			matches.forEach(match => {
				const startPos = match.index + offset;
				const originalText = match[0];
				const highlightedText = `<b>${originalText}</b>`;
				highlighted = highlighted.slice(0, startPos) + highlightedText + highlighted.slice(startPos + originalText.length);
				offset += highlightedText.length - originalText.length;
			});
			
			return highlighted;
		};
		
		// Create patterns for both exact and diacritic-insensitive matching
		const exactPattern = new RegExp(`(${escapeRegExp(normalizedSearchTerm)})`, 'gi');
		const diacriticPattern = new RegExp(escapeRegExp(removeDiacritics(normalizedSearchTerm)), 'gi');
		
		// First try exact matches
		result = highlightMatches(result, exactPattern);
		
		// If no exact matches found, try matching without diacritics
		if (!exactPattern.test(text)) {
			const textWithoutDiacritics = removeDiacritics(text);
			const matches = [...textWithoutDiacritics.matchAll(diacriticPattern)];
			
			matches.forEach(match => {
				const startPos = match.index;
				const length = match[0].length;
				const originalText = text.slice(startPos, startPos + length);
				result = result.replace(originalText, `<b>${originalText}</b>`);
			});
		}
		
		return result;
	}
	
	function encodeStringForURL(str) {
	  // Replace special chars by their encoded equivalent
	  str = str.replace(/[^a-zA-Z0-9-_.~]/g, function(char) {
		return encodeURIComponent(char);
	  });

	  // Replace spaces by +
	  str = str.replace(/%20/g, '+');

	  return str;
	}
	
	const searchTermUrl = encodeStringForURL(searchTerm);

    const searchAndAddResults = async (suttas, lang) => {
        for (const sutta of suttas) {
            if (shouldStopSearch) {
                loadingBar.style.width = '0%';
                return;
            }

            const { id, title, heading } = getIdAndTitle(sutta, availableSuttasJson, lang);
            let titleMatch = false;
            let displayTitle = title;

            // Check title and heading matches with new matching logic
            if (lang === 'en') {
                if (checkTitleMatch(title, searchTerm, options['strict']) || 
                    checkTitleMatch(heading, searchTerm, options['strict'])) {
                    titleMatch = true;
                    displayTitle = highlightSearchTerm(title, searchTerm);
                    if (heading) {
                        displayTitle += ` (${highlightSearchTerm(heading, searchTerm)})`;
                    }
                }
            } else if (lang === 'pl') {
                if (checkTitleMatch(title, searchTerm, options['strict'])) {
                    titleMatch = true;
                    displayTitle = highlightSearchTerm(title, searchTerm);
                }
            }

            const searchInContent = async (content, isComments = false) => {
                const results = await searchSutta(
                    content, 
                    searchTerm, 
                    isComments, 
                    options['strict'], 
                    lang === 'pl', 
                    options['single']
                );

                return results;
            };

            if (lang === 'en') {
                // Search in main content and comments
                const mainResults = await searchInContent(sutta.translation_en_anigha);
                let commentResults = [];
                if (sutta.comment) {
                    commentResults = await searchInContent(sutta.comment, true);
                    currentIteration++;
                    loadingBar.style.width = `${(currentIteration / totalIterations) * 100}%`;
                }

                // If we found matches in content or comments
                if (mainResults.length > 0 || commentResults.length > 0) {
                    // Add main content results with highlighted title if there was a title match
                    for (const result of mainResults) {
					const link = `${window.location.origin}/?q=${sutta.id}&search=${searchTermUrl}&pali=hide#${result.verseRange}`;
                        await addResultToDOMAsync(id, titleMatch ? displayTitle : title, result.passage, link, { target: "_blank" });
                        gotResults = true;
                    }
                    // Add comment results
                    for (const result of commentResults) {
                        const link = `${window.location.origin}/?q=${sutta.id}&search=${searchTermUrl}#comment${result.commentNb}`;
                        await addResultToDOMAsync(id, `${titleMatch ? displayTitle : title} - Comments`, result.passage, link, { target: "_blank" });
                        gotResults = true;
                    }
                } 
                // If no content matches but title matches
                else if (titleMatch) {
                    const firstPassage = getFirstPassage(sutta.translation_en_anigha, 150);
                    const link = `${window.location.origin}/?q=${sutta.id}`;
                    await addResultToDOMAsync(id, displayTitle, firstPassage, link, { target: "_blank" });
                    gotResults = true;
                }
            } else if (lang === 'pl') {
                // Search in Pali content
                const results = await searchInContent(sutta.root_pli_ms);

                // If we found matches in content
                if (results.length > 0) {
                    // Add results with highlighted title if there was a title match
                    for (const result of results) {
                        const link = `${window.location.origin}/?q=${sutta.id}&search=${searchTermUrl}&pali=show#${result.verseRange}`;
                        await addResultToDOMAsync(id, titleMatch ? displayTitle : title, result.passage, link, { target: "_blank" });
                        gotResults = true;
                    }
                }
                // If no content matches but title matches
                else if (titleMatch) {
                    const firstPassage = getFirstPassage(sutta.root_pli_ms, 100);
                    const link = `${window.location.origin}/?q=${sutta.id}`;
                    await addResultToDOMAsync(id, displayTitle, firstPassage, link, { target: "_blank" });
                    gotResults = true;
                }
            }
            
            currentIteration++;
            loadingBar.style.width = `${(currentIteration / totalIterations) * 100}%`;
        }
    };

    await Promise.all([
        searchAndAddResults(suttasEn, 'en'),
        searchAndAddResults(suttasPl, 'pl')
    ]);

    if (!gotResults) {
        addResultToDOM("", "No results found", `No results were found with the expression: ${originalSearch}`, "none");
    }

    loadingBar.style.width = '0%';
}

// Helper function to get ID, title and heading
function getIdAndTitle(sutta, availableSuttasJson, lang) {
    const availableSutta = availableSuttasJson[sutta.id] || {};
    return {
        id: availableSutta.id || sutta.id.toUpperCase(),
        title: lang === 'en' ? availableSutta.title : availableSutta.pali_title || "Unknown Title",
        heading: availableSutta.heading || ""
    };
}


// Helper function to highlight search term in text
function highlightSearchTerm(text, searchTerm) {
    const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
    return text.replace(regex, '<b>$1</b>');
}


// Helper function to get first N words of content
function getFirstPassage(content, wordCount) {
    let text = '';
    let totalWords = 0;
    
    // Iterate through verses until we have enough words
    for (const verse of Object.values(content)) {
        const cleanedVerse = cleanVerse(verse);
        const words = cleanedVerse.split(/\s+/);
        
        if (totalWords + words.length <= wordCount) {
            text += cleanedVerse + ' ';
            totalWords += words.length;
        } else {
            // Add remaining words to reach exactly wordCount
            const remainingWords = wordCount - totalWords;
            text += words.slice(0, remainingWords).join(' ');
            text += ' [...]';
            break;
        }
    }
    
    return text.trim();
}

// Makes sure that the sentence has the correct format and fits on one line only
function cleanSearchTerm(inputText) {
	// Remove line breaks and extra spaces
	let cleanedText = inputText
		.replace(/\n/g, ' ') // Replace line breaks with spaces
		.replace(/\s+/g, ' ') // Replace multiple spaces with a single space
		.trim(); // Trim spaces at the start and end

	// Replace misplaced punctuation
	cleanedText = cleanedText
		.replace(/([,.!?])\s*(?=[A-Z])/g, '$1 ') // Add a space after punctuation if the next letter is uppercase
		.replace(/\s*([,.!?])/g, '$1') // Remove spaces before punctuation
		.replace(/(\s*-\s*)/g, '-') // Ensure no spaces around hyphens

	return cleanedText;
}

async function getSuttas(db, options, type) {
	let query;

	if (type.includes('en'))
		query = db.suttas_en;
	else
		query = db.suttas_pl;

	query = query.where("sortKey");

	//Get book ids from options object
	let ids = [];

	if (options.dn) ids.push("1dn");
	if (options.mn) ids.push("2mn");
	if (options.sn) ids.push("3sn");
	if (options.an) ids.push("4an");
	if (options.kn) ids.push("5dhp", "5iti", "5snp", "5thag", "5thig", "5ud");

	query = query.startsWithAnyOf(ids);

	//if SN and not SNP
	if (options['sn'] && !options['kn']) {
		const validIdRegex = /^(?!SNP)/i;
		query = query.and(sutta => validIdRegex.test(sutta.id));
	}

	return query.toArray();
}

function addResultToDOMAsync(id, title, snippet, link, options) {
	return new Promise((resolve) => {
		setTimeout(() => {
			addResultToDOM(id, title, snippet, link, options);
			resolve();
		}, 0);
	});
}

// Function to add a result to the DOM
function addResultToDOM(id, title, snippet, link, options = {}) {
	const resultsDiv = document.querySelector('.results');
	const resultDiv = document.createElement('div');
	resultDiv.classList.add('result');

	let anchor;
	if (link != "none") {
		anchor = document.createElement('a');
		anchor.href = link;
		anchor.target = options.target || '_self';
		anchor.classList.add('link');
	}

	const titleElement = document.createElement('h3');
	if (id)
		titleElement.innerHTML = `${id} - ${title}`;
	else
		titleElement.innerHTML = title;

	const preview = document.createElement('p');
	preview.innerHTML = snippet;

	if (link != "none") {
		anchor.appendChild(titleElement);
		anchor.appendChild(preview);
		resultDiv.appendChild(anchor);
	} else {
		resultDiv.appendChild(titleElement);
		resultDiv.appendChild(preview);
	}
	resultsDiv.appendChild(resultDiv);
}

const configurationDiv = document.getElementById('configuration');

function getConfiguration() {
	const configuration = {};
	const options = document.querySelectorAll('#configuration input[type="checkbox"]');

	options.forEach(option => {
		configuration[option.value] = option.checked;
	});

	return configuration;
}

let isSearching = false;
let shouldStopSearch = false;

async function startSearch() {
	if (isSearching) return; // Prevents simultaneous searches
	isSearching = true; // Marks the search as ongoing
	shouldStopSearch = false; // Resets the stop marker

	const searchButton = document.querySelector('#searchButton');
	searchButton.textContent = "Stop"; // Changes the button text
	searchButton.classList.add("red"); // Adds the "red" class

	const query = document.querySelector('#searchInput').value;
	const options = getConfiguration();

	// Executes the search with stop check
	await searchSuttasWithStop(query, options);

	// Restores the button to its initial state
	searchButton.textContent = "Search";
	searchButton.classList.remove("red");
	isSearching = false;
}

const normalizeSpaces = (text) => {
    return text.replace(/\u00A0/g, ' ')
              .replace(/&nbsp;/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
};

const processText = (text, pali) => {
    let processed = normalizeSpaces(text);
    if (pali) {
        processed = removeDiacritics(processed);
    }
    return processed;
};

const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const cleanVerse = (text) => {
    // Clean words or groups of words surrounded by _ or * (with diacritics support)
    text = text.replace(/[_*]([^_*]+)[_*]/g, '$1');
    // Clean markdown links
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    return text;
};

// Main search class for better data organization and caching
class SuttaSearch {
    constructor(textData, pali = false) {
        this.originalText = textData;
        this.pali = pali;
        this.verseKeys = Object.keys(textData);
        this.fullText = '';
        this.processedText = '';
        this.versePositions = new Map();
        this.commentNumbers = new Map();
        this.positionMap = new Map();
        this.cleanedVerses = new Map();
        this.initialize();
    }

    initialize() {
        let currentPosition = 0;
        this.fullText = '';
        let commentCount = 0;
        let lastCommentNumber = 0;

        // Pre-clean and store verses
        for (const key of this.verseKeys) {
            const verse = this.originalText[key];
            // Remove markdown formatting but keep original text with diacritics
            const cleanedVerse = this.cleanMarkdownOnly(verse);
            this.cleanedVerses.set(key, cleanedVerse);

            if (verse.trim() !== '') {
                commentCount++;
                lastCommentNumber = commentCount;
            }
            this.versePositions.set(currentPosition, key);
            this.commentNumbers.set(key, lastCommentNumber);
            this.fullText += this.cleanedVerses.get(key);
            currentPosition += this.cleanedVerses.get(key).length;
        }

        // Create normalized version of full text for searching
        this.processedText = this.normalizeText(this.fullText);
        
        // Map positions between original and normalized text
        let originalIndex = 0;
        let normalizedIndex = 0;
        const normalizedFullText = this.processedText;
        
        while (normalizedIndex < normalizedFullText.length) {
            while (originalIndex < this.fullText.length) {
                const originalChar = this.fullText[originalIndex];
                const normalizedChar = normalizedFullText[normalizedIndex];
                
                if (this.compareChars(originalChar, normalizedChar)) {
                    this.positionMap.set(normalizedIndex, originalIndex);
                    normalizedIndex++;
                    originalIndex++;
                    break;
                }
                originalIndex++;
            }
        }
    }

    // Compare characters accounting for diacritics
    compareChars(original, normalized) {
        return original === normalized || 
               removeDiacritics(original) === normalized ||
               normalized === ' ' && /[\s\u00A0]|&nbsp;/.test(original);
    }

    // Clean markdown formatting but preserve diacritics
    cleanMarkdownOnly(text) {
        // Remove markdown formatting
        text = text.replace(/[_*]([^_*]+)[_*]/g, '$1');
        // Clean markdown links
        text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        return text;
    }

    // Normalize text for searching (remove diacritics and clean spacing)
    normalizeText(text) {
        text = removeDiacritics(text);
        return text.replace(/\u00A0/g, ' ')
                  .replace(/&nbsp;/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
    }
	
	getCommentNumber(verse) {
        return this.commentNumbers.get(verse) || 0;
    }

    findVerseRange(startPos, endPos) {
        let startVerse = null;
        let endVerse = null;
        let lastPosition = -1;
        
        for (const [pos, key] of this.versePositions.entries()) {
            if (pos <= startPos) {
                startVerse = key;
            }
            if (pos <= endPos) {
                endVerse = key;
                lastPosition = pos;
            } else {
                break;
            }
        }
        
        // If endPos extends into the next verse after lastPosition
        if (lastPosition >= 0 && lastPosition + this.originalText[endVerse].length > endPos) {
            endVerse = this.verseKeys[this.verseKeys.indexOf(endVerse)];
        }
        
        return `${startVerse}_${endVerse}`;
    }

	findWordBoundary(text, position, direction = 'forward') {
		const wordBoundaryRegex = /[\s.,!?;"')\]}\-:/]+/;

		if (direction === 'forward') {
			// Find the next word boundary
			let pos = position;
			while (pos < text.length && !wordBoundaryRegex.test(text[pos])) {
				pos++;
			}
			return pos;
		} else {
			// Find the previous word boundary
			let pos = position - 1;
			while (pos >= 0 && !wordBoundaryRegex.test(text[pos])) {
				pos--;
			}
			return pos + 1;
		}
	}
	
    getPassage(startPos, endPos, matchStart, matchEnd, isComment = false) {
	    // Find initial word boundaries
	    let passageStart = this.findWordBoundary(this.fullText, startPos, 'backward');
	    let passageEnd = this.findWordBoundary(this.fullText, endPos, 'forward');
	
	    // For comments, ensure we stay within verse boundaries
	    if (isComment) {
	        // Find the verse that contains the start position
	        let currentVerseStart = 0;
	        let currentVerseKey = '';
	
	        for (const [pos, key] of this.versePositions.entries()) {
	            if (pos <= startPos) {
	                currentVerseStart = pos;
	                currentVerseKey = key;
	            } else {
	                break;
	            }
	        }
	
	        const currentVerseEnd = currentVerseStart + this.cleanedVerses.get(currentVerseKey).length;
	
	        // If the match crosses verse boundaries, adjust to stay within current verse
	        if (endPos > currentVerseEnd) {
	            passageEnd = currentVerseEnd;
	        }
	
	        // Ensure we include the full match
	        passageStart = Math.min(passageStart, matchStart);
	        passageEnd = Math.max(passageEnd, matchEnd);
	
	        // Then adjust to word boundaries within the verse
	        if (passageStart < currentVerseStart) {
	            passageStart = currentVerseStart;
	        }
	        if (passageEnd > currentVerseEnd) {
	            passageEnd = currentVerseEnd;
	        }
	    }
	
	    // Ensure we have valid passage boundaries
	    if (passageEnd <= passageStart) {
	        passageEnd = matchEnd + 1;  // Ensure we at least include the match
	    }
	
	    let passage = this.fullText.substring(passageStart, passageEnd);
	
	    // If passage is empty or only whitespace, expand it
	    if (!passage.trim()) {
	        passageStart = Math.max(0, matchStart - 50);  // Take 50 chars before match
	        passageEnd = Math.min(this.fullText.length, matchEnd + 50);  // and 50 after
	        passage = this.fullText.substring(passageStart, passageEnd);
	    }
	
	    // Handle ellipses
	    let prefix = '';
	    let suffix = '';
	
	    if (isComment) {
	        // Find verse boundaries for ellipsis determination
	        let currentVerseStart = 0;
	        let currentVerseKey = '';
	        
	        for (const [pos, key] of this.versePositions.entries()) {
	            if (pos <= passageStart) {
	                currentVerseStart = pos;
	                currentVerseKey = key;
	            } else {
	                break;
	            }
	        }
	        
	        const currentVerseEnd = currentVerseStart + this.cleanedVerses.get(currentVerseKey).length;
	
	        // Only add ellipses if there's actually text before/after in the verse
	        const textBefore = this.fullText.substring(currentVerseStart, passageStart).trim();
	        const textAfter = this.fullText.substring(passageEnd, currentVerseEnd).trim();
	        
	        prefix = passageStart > currentVerseStart && textBefore !== '' ? '[...] ' : '';
	        suffix = passageEnd < currentVerseEnd && textAfter !== '' ? ' [...]' : '';
	    } else {
	        prefix = passageStart > 0 ? '[...] ' : '';
	        suffix = passageEnd < this.fullText.length ? ' [...]' : '';
	    }
	
	    // Adjust match positions relative to passage
	    const relativeMatchStart = matchStart - passageStart;
	    const relativeMatchEnd = matchEnd - passageStart;
	
	    // Split passage into three parts and add highlighting
	    const beforeMatch = passage.substring(0, relativeMatchStart);
	    const match = passage.substring(relativeMatchStart, relativeMatchEnd);
	    const afterMatch = passage.substring(relativeMatchEnd);
	
	    passage = prefix + beforeMatch + '<b>' + match + '</b>' + afterMatch + suffix;
	
	    // Clean verse if in comment mode
	    if (isComment) {
	        passage = cleanVerse(passage);
	    }
	
	    return passage;
	}

    findWordBoundary(text, position, direction = 'forward') {
		// Define characters that can be attached to a word
		const attachedPunctuation = /[.,!?;"“”'`)\]}\-—_:/]/;
		const wordBoundaryRegex = /\s/;

		if (direction === 'forward') {
			// First, find the end of the word, including attached punctuation
			let pos = position;
			// Move forward until we find a whitespace
			while (pos < text.length && !wordBoundaryRegex.test(text[pos])) {
				pos++;
			}
			return pos;
		} else {
			// Find the beginning of the word, ignoring attached punctuation
			let pos = position;
			// Move backward while we are on punctuation
			while (pos > 0 && attachedPunctuation.test(text[pos - 1])) {
				pos--;
			}
			// Then move backward until a whitespace is found
			while (pos > 0 && !wordBoundaryRegex.test(text[pos - 1])) {
				pos--;
			}
			return pos;
		}
	}

	async findMatches(searchTerm, strict = false, isComment = false, singleResult = false, resultCallback) {
    const maxWords = (this.pali ? 100 : 150);
    const maxResults = (singleResult ? 1 : 10);
    
    // Normalize the search term
    const normalizedSearchTerm = this.normalizeText(searchTerm);
    const results = [];

    let searchPattern;
    if (strict) {
        // In strict mode, search for the exact term, possibly with attached punctuation
        // The hyphen should be at the end of the character class
        searchPattern = '(?<=^|\\s)' + escapeRegExp(normalizedSearchTerm.trim()) + '(?=$|\\s|[.,!?;"“”\'`()\\]}:/—_-])';
    } else {
        searchPattern = escapeRegExp(normalizedSearchTerm.trim());
    }

    const regex = new RegExp(searchPattern, 'gi');
    let match;

    while ((match = regex.exec(this.processedText)) !== null) {
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        const originalMatch = this.findOriginalTextMatch(matchStart, matchEnd);
        if (!originalMatch) continue;

            let result;
            if (isComment) {
                let verseKey = '';
                let verseStart = 0;

                for (const [pos, key] of this.versePositions.entries()) {
                    if (pos <= originalMatch.start) {
                        verseKey = key;
                        verseStart = pos;
                    }
                }

                const verseText = this.cleanedVerses.get(verseKey);
                const verseEnd = verseStart + verseText.length;

                if (verseText.split(/\s+/).length > maxWords) {
                    const verseOffset = originalMatch.start - verseStart;
                    const words = verseText.split(/\s+/);
                    const matchWordIndex = verseText.substring(0, verseOffset).split(/\s+/).length;

                    const targetWordsBeforeMatch = Math.floor((maxWords - searchTerm.split(/\s+/).length) / 2);
                    let startWord = Math.max(0, matchWordIndex - targetWordsBeforeMatch);
                    let endWord = Math.min(words.length, startWord + maxWords);

                    if (startWord + maxWords > words.length) {
                        startWord = Math.max(0, words.length - maxWords);
                        endWord = words.length;
                    }

                    const passageStart = verseStart + words.slice(0, startWord).join(' ').length + (startWord > 0 ? 1 : 0);
                    const passageEnd = verseStart + words.slice(0, endWord).join(' ').length;

                    result = {
                        passage: this.getPassage(passageStart, passageEnd, originalMatch.start, originalMatch.end, true),
                        commentNb: this.getCommentNumber(verseKey)
                    };
                } else {
                    result = {
                        passage: this.getPassage(verseStart, verseEnd, originalMatch.start, originalMatch.end, true),
                        commentNb: this.getCommentNumber(verseKey)
                    };
                }
            } else {
                const searchTermWords = normalizedSearchTerm.trim().split(/\s+/);
                const searchTermLength = searchTermWords.length;

                if (searchTermLength > maxWords) {
                    const passageStart = this.findWordBoundary(this.fullText, originalMatch.start, 'backward');
                    const passageEnd = this.findWordBoundary(this.fullText, originalMatch.end, 'forward');

                    result = {
                        passage: this.getPassage(passageStart, passageEnd, originalMatch.start, originalMatch.end),
                        verseRange: this.findVerseRange(passageStart, passageEnd)
                    };
                } else {
                    const words = this.fullText.split(/\s+/);
                    const totalWords = words.length;
                    const matchWordPosition = this.fullText.substring(0, originalMatch.start).split(/\s+/).length;
                    const matchLength = searchTermWords.length;

                    const targetWordsBeforeMatch = Math.floor((maxWords - matchLength) / 2);
                    let startWord = Math.max(0, matchWordPosition - targetWordsBeforeMatch);
                    let endWord = Math.min(totalWords, startWord + maxWords);

                    if (startWord + maxWords > totalWords) {
                        startWord = Math.max(0, totalWords - maxWords);
                        endWord = totalWords;
                    }
                    if (startWord < 0) {
                        startWord = 0;
                        endWord = Math.min(totalWords, maxWords);
                    }

                    const passageStart = words.slice(0, startWord).join(' ').length;
                    const passageEnd = words.slice(0, endWord).join(' ').length + 1;

                    result = {
                        passage: this.getPassage(passageStart, passageEnd, originalMatch.start, originalMatch.end),
                        verseRange: this.findVerseRange(passageStart, passageEnd)
                    };
                }
            }

            // Call the callback with the individual result
            if (resultCallback) {
                await resultCallback(result);
            }
            
            results.push(result);

            if (results.length >= maxResults) break;
        }

        return results;
    }

    findOriginalTextMatch(processedMatchStart, processedMatchEnd) {
		// Use the position map to find the original positions
		const originalStart = this.positionMap.get(processedMatchStart);
		let originalEnd = this.positionMap.get(processedMatchEnd);

		// If we don't have an exact match for the end, find the closest position
		if (originalEnd === undefined) {
			let i = processedMatchEnd;
			while (i >= processedMatchStart && originalEnd === undefined) {
				originalEnd = this.positionMap.get(i);
				i--;
			}
			// Adjust to the end of the word if necessary
			while (originalEnd < this.fullText.length &&
				   !/[\s\u00A0]|&nbsp;/.test(this.fullText[originalEnd])) {
				originalEnd++;
			}
		}

		return {
			start: originalStart,
			end: originalEnd
		};
	}
}

// Main search function
const searchSutta = async (textData, searchTerm, isComment = false, strict = false, pali = false, singleResult = false, resultCallback) => {
    if (!textData || !searchTerm || typeof searchTerm !== 'string') {
        return [];
    }
    
    const searcher = new SuttaSearch(textData, pali);
    return await searcher.findMatches(searchTerm, strict, isComment, singleResult, resultCallback);
};

export default searchSutta;

// Function to handle the search button click event
document.querySelector('#searchButton').addEventListener('click', () => {
	if (isSearching) {
		shouldStopSearch = true; // Triggers the search stop
	} else {
		startSearch(); // Starts the search if it's not ongoing
	}
});

const searchInput = document.getElementById('searchInput');

// Deactivate button if either search bar empty, no language selected or no books selected
window.addEventListener("load", function() {
	const searchInput = document.getElementById("searchInput");
	const searchButton = document.getElementById("searchButton");
	// Select the language input elements
	const langInputs = Array.from(document.querySelectorAll('input[name="lang"]'));
	// Select the book category input elements
	const categoryInputs = Array.from(document.querySelectorAll('input[name="book"]'));

	function checkInputs() {
		// Checks if #searchInput is not empty
		const isSearchInputNotEmpty = searchInput.value.trim() !== '';
		// Checks if at least one language input is checked
		const isLangChecked = langInputs.some(input => input.checked);
		// Checks if at least one category input is checked
		const isCategoryChecked = categoryInputs.some(input => input.checked);

		// Enables or disables the search button based on the checked inputs
		searchButton.disabled = !(isSearchInputNotEmpty && isLangChecked && isCategoryChecked);
	}

	// Adds event listeners to each input to check the state on every change
	[...langInputs, ...categoryInputs].forEach(input => {
		input.addEventListener("change", checkInputs);
	});

	searchInput.addEventListener("input", checkInputs);

	// Initial call to configure the button based on the current state of the inputs
	checkInputs();

	// Enter key works on the entire page and not just when focused on the search box, so we can just change an option and restart the search without having to click in the search box
	document.addEventListener('keydown', function(event) {
		if (event.key === 'Enter') {
			// Prevents starting search if searchButton disabled
			if (!searchButton.disabled) {
				startSearch();
			}
			event.preventDefault();
		}
	});
});

window.onload = () => searchInput.focus();
