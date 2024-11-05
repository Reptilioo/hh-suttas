// Refactor?
// Add keypress to stop search
// Small issue: still adds ellipses at the end of a comment that doesn't have further text (it counts the first word of the next comment as being in the current comment)

import db from "./js/dexie/dexie.js";
import { fetchAvailableSuttas } from "./js/utils/loadContent/fetchAvailableSuttas.js";

//Search suttas by search term and language options.
async function searchSuttasWithStop(searchTerm, options) {
    const availableSuttasJson = await fetchAvailableSuttas();
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

    const searchAndAddResults = async (suttas, lang) => {
        for (const sutta of suttas) {
            if (shouldStopSearch) {
                loadingBar.style.width = '0%';
                return;
            }

            const { id, title } = getIdAndTitle(sutta, availableSuttasJson, lang);

            const searchInContent = async (content, displayTitle, isPali = false) => {
                const resultCallback = async (result) => {
                    if (result) {
                        const link = `https://suttas.hillsidehermitage.org/?q=${sutta.id}#${result.commentNb ? `comment${result.commentNb}` : result.verseRange}`;
                        await addResultToDOMAsync(id, displayTitle, result.passage, link);
                        gotResults = true;
                    }
                };

                await searchSutta(
                    content, 
                    searchTerm, 
                    lang === 'en' && displayTitle.includes('Comments'), 
                    options['strict'], 
                    isPali, 
                    options['single'],
                    resultCallback
                );
            };

            if (lang === 'en') {
                await searchInContent(sutta.translation_en_anigha, title);
                if (sutta.comment) {
                    await searchInContent(sutta.comment, `${title} - Comments`);
                    currentIteration++;
                    loadingBar.style.width = `${(currentIteration / totalIterations) * 100}%`;
                }
            } else if (lang === 'pl') {
                await searchInContent(sutta.root_pli_ms, title, true);
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
        addResultToDOM("", "No results found", `No results were found with the expression '${searchTerm}'.`, "none");
    }

    loadingBar.style.width = '0%';
}

// Helper function to get ID and title
function getIdAndTitle(sutta, availableSuttasJson, lang) {
  const availableSutta = availableSuttasJson[sutta.id] || {};
  return {
    id: availableSutta.id || sutta.id.toUpperCase(),
    title: lang === 'en' ? availableSutta.title : availableSutta.pali_title || "Unknown Title"
  };
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

function addResultToDOMAsync(id, title, snippet, link) {
	return new Promise((resolve) => {
		setTimeout(() => {
			addResultToDOM(id, title, snippet, link);
			resolve();
		}, 0);
	});
}

// Function to add a result to the DOM
function addResultToDOM(id, title, snippet, link) {
	const resultsDiv = document.querySelector('.results');
	const resultDiv = document.createElement('div');
	resultDiv.classList.add('result');

	let anchor;
	if (link != "none") {
		anchor = document.createElement('a');
		anchor.href = link;
		anchor.classList.add('link');
	}

	const titleElement = document.createElement('h3');
	if (id)
		titleElement.textContent = `${id} - ${title}`;
	else
		titleElement.textContent = title;

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




// Utility functions for text processing
const removeDiacritics = (text) => {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

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
        // Map to store cleaned verses
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
            const cleanedVerse = cleanVerse(verse);
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

        // Create the correspondence between the positions of the processed and original text
        const normalizedText = processText(this.fullText, this.pali);
        let originalIndex = 0;
        let normalizedIndex = 0;

        while (normalizedIndex < normalizedText.length) {
            while (originalIndex < this.fullText.length) {
                const originalChar = this.fullText[originalIndex];
                const normalizedChar = normalizedText[normalizedIndex];

                if (originalChar === normalizedChar ||
                    (this.pali && removeDiacritics(originalChar) === normalizedChar) ||
                    (normalizedChar === ' ' && /[\s\u00A0]|&nbsp;/.test(originalChar))) {
                    this.positionMap.set(normalizedIndex, originalIndex);
                    normalizedIndex++;
                    originalIndex++;
                    break;
                }
                originalIndex++;
            }
        }

        this.processedText = normalizedText;
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
        
        return `${startVerse}-${endVerse}`;
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
		let passageStart = this.findWordBoundary(this.fullText, startPos, 'backward');
		let passageEnd = this.findWordBoundary(this.fullText, endPos, 'forward');

		// For comments, ensure we stay within verse boundaries
		if (isComment) {
			// Find verse boundaries
			let verseStart = 0;
			let verseEnd = 0;

			for (const [pos, key] of this.versePositions.entries()) {
				if (pos <= passageStart) {
					verseStart = pos;
					verseEnd = pos + this.originalText[key].length;
				}
			}

			// Ensure passageEnd doesn't exceed the verse end
			passageEnd = Math.min(passageEnd, verseEnd);
			// Adjust again to avoid cutting a word if we had to reduce passageEnd
			passageEnd = this.findWordBoundary(this.fullText.slice(0, passageEnd), passageEnd, 'backward');
		}

		let passage = this.fullText.substring(passageStart, passageEnd);

		// Handle ellipses
		let prefix = '';
		let suffix = '';

		if (isComment) {
			let verseStart = 0;
			let verseEnd = 0;

			for (const [pos, key] of this.versePositions.entries()) {
				if (pos <= passageStart) {
					verseStart = pos;
					verseEnd = pos + this.originalText[key].length;
				}
			}

			prefix = passageStart > verseStart ? '[...] ' : '';
			suffix = passageEnd < verseEnd ? ' [...]' : '';
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

	async findMatches(searchTerm, strict = false, isComment = false, singleResult = false, resultCallback) {
        const maxWords = (this.pali ? 100 : 150); //EN passages are 150 words long, Pali passages are 100 words long because words are generally longer
		const maxResults = (singleResult ? 1 : 10); //Displays 10 results maximum for a given sutta
		
        const processedSearchTerm = processText(searchTerm, this.pali);
        const results = [];

        // Create search regex for processed text
        let searchPattern = escapeRegExp(processedSearchTerm.trim());
        if (strict) {
            searchPattern = '\\b' + searchPattern + '\\b';
        }

        const regex = new RegExp(searchPattern, 'gi');

        let match;
        while ((match = regex.exec(this.processedText)) !== null) {
            // Check if it's a full word in strict mode
            if (strict) {
                const wordBoundaryRegex = /[\s.,!?;"')\]}\-:/]+/;
                const textBeforeMatch = this.processedText.slice(0, match.index);
                const textAfterMatch = this.processedText.slice(match.index + match[0].length);

                const isStartOfWord = match.index === 0 || wordBoundaryRegex.test(textBeforeMatch.slice(-1));
                const isEndOfWord = match.index + match[0].length === this.processedText.length ||
                                     wordBoundaryRegex.test(textAfterMatch[0]);

                if (!isStartOfWord || !isEndOfWord) {
                    continue;
                }
            }

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
                const searchTermWords = processedSearchTerm.trim().split(/\s+/);
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
