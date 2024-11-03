// Ensure that if the matching element appears multiple times in the same text, all occurrences should be displayed consecutively
// Could be even more accurate in terms of the number of words it returns if we added other punctuation symbols to separate words
// Re-indent the file
// See if we can optimize the code, particularly the findVerseRange() and findSearchTermPassage() functions
// Cut in smaller functions?
// Add no diacritics for pali search - DONE but still need to find a way to display pali with diacritics and with searchTerm highlighted
// After X results, having a button next to stop button to load more?
// Find a better way to get the comment link??
// Remove searchSuttas() si searchSuttasWithStop() doesn't bug

import db from "./js/dexie/dexie.js";
import { fetchAvailableSuttas } from "./js/utils/loadContent/fetchAvailableSuttas.js";

const availableSuttasJson = await fetchAvailableSuttas();
 
//Search suttas by search term and language options.
async function searchSuttasWithStop(searchTerm, options) {
    const resultsDiv = document.querySelector('.results');
    const loadingBar = document.getElementById('loadingBar');
    resultsDiv.innerHTML = ''; // Clear previous results
    loadingBar.style.width = '0%'; // Reset loading bar

    let suttasEn = [];
    let suttasPl = [];
    let totalIterations = 0;

    // Load data based on language options
    if (options['en']) {
        suttasEn = await getSuttas(db, options, 'en');
        totalIterations += suttasEn.length * 2; // In English, we do two searches (translation and comment)
    }
    if (options['pali']) {
        suttasPl = await getSuttas(db, options, 'pl');
        totalIterations += suttasPl.length; // In Pali, one search
    }

    let currentIteration = 0;
    let gotResults = false;

    for (let i = 0; i < Math.max(suttasEn.length, suttasPl.length); i++) {
        if (shouldStopSearch){
			loadingBar.style.width = '0%';
			return; // Stop search if "Stop" button is clicked
		}

        // Search in English
        if (options['en'] && i < suttasEn.length) {
            const suttaEn = suttasEn[i];
            const titleEn = availableSuttasJson[suttaEn.id]?.title || "Unknown Title";
            let id = availableSuttasJson[suttaEn.id]?.id || suttaEn.id.toUpperCase();

            // Search in translation_en_anigha
            const extractedText = findSearchTermPassage(suttaEn.translation_en_anigha, searchTerm, true, options['strict']);
            if (extractedText) {
                const range = findVerseRange(suttaEn.translation_en_anigha, searchTerm);
                if (range) {
                    const link = `https://suttas.hillsidehermitage.org/?q=${suttaEn.id}#${range}`;
                    await addResultToDOMAsync(id, titleEn, extractedText, link);
                    gotResults = true;
                }
            }
            currentIteration++;
			setTimeout(() => {
				loadingBar.style.width = `${(currentIteration / totalIterations) * 100}%`; // Update loading bar
			}, 0);
            
            // Search in comments
            if (suttaEn.comment) {
                const extractedComment = findSearchTermPassage(suttaEn.comment, searchTerm, false, options['strict']);
                if (extractedComment) {
                    const commentNb = findCommentNb(suttaEn.comment, extractedComment);
                    if (commentNb) {
                        const link = `https://suttas.hillsidehermitage.org/?q=${suttaEn.id}#comment${commentNb}`;
                        await addResultToDOMAsync(id, titleEn + " - Comments", extractedComment, link);
                        gotResults = true;
                    }
                }
            }
            currentIteration++;
            loadingBar.style.width = `${(currentIteration / totalIterations) * 100}%`;
        }

        // Search in Pali
        if (options['pali'] && i < suttasPl.length) {
            const suttaPl = suttasPl[i];
            const titlePl = availableSuttasJson[suttaPl.id]?.pali_title || "Unknown Title";
            const id = availableSuttasJson[suttaPl.id]?.id || suttaPl.id.toUpperCase();

            const extractedText = findSearchTermPassage(suttaPl.root_pli_ms, searchTerm, true, options['strict'], true);
            if (extractedText) {
                const range = findVerseRange(suttaPl.root_pli_ms, searchTerm, true);
                if (range) {
                    const link = `https://suttas.hillsidehermitage.org/?q=${suttaPl.id}#${range}`;
                    await addResultToDOMAsync(id, titlePl, extractedText, link);
                    gotResults = true;
                }
            }
            currentIteration++;
            loadingBar.style.width = `${(currentIteration / totalIterations) * 100}%`;
        }
    }

    if (!gotResults) {
        addResultToDOM("", "No results found", `No results were found with the expression '${searchTerm}'.`, "none");
    }

    // Reset loading bar after search is complete
    loadingBar.style.width = '0%';
}

// Search extractedText (without the added <b></b> and [...]) in each comments to find the position of the matching comment
function findCommentNb(commentData, extractedText) {
	extractedText = extractedText.replace(/<b>/g, "").replace(/<\/b>/g, "") //replace "<b>" and "</b>"
					.replace(/ \[\.\.\.\]/g, "").replace(/\[\.\.\.\] /g, ""); //replace "[...] " and " [...]"
					
    const result = [];
    let line = 1;

    for (let [key, value] of Object.entries(commentData)) {
        if (value === "") {
            continue;  // Ignore empty lines
        }
		
		value = curateText(value);

        if (value.toLowerCase().includes(extractedText.toLowerCase())) {
            result.push(line);
        }

        line++;
    }
	
	if (result.length < 1) return null;
    return result;
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

function removeDiacritics(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function findVerseRange(textData, searchTerm, pali = false) {
  let verseKeys = Object.keys(textData);
  let currentText = "";
  let verseIndexMap = {};

  // If pali is true, remove diacritics from searchTerm
  if (pali)
    searchTerm = removeDiacritics(searchTerm);

  // Creates an accumulated text and records the positions of each verse
  for (let i = 0; i < verseKeys.length; i++) {
    const verse = verseKeys[i];
    let text = textData[verse];

    // If pali is true, remove diacritics from text as well
    if (pali) 
      text = removeDiacritics(text);

    // Records the starting and ending index of each verse in the accumulated text
    verseIndexMap[verse] = { start: currentText.length, end: currentText.length + text.length };
    currentText += text.toLowerCase();
  }

  // Searches for the starting and ending index of the searchTerm in the accumulated text
  const startIndex = currentText.indexOf(searchTerm);
  if (startIndex === -1) {
    return null;
  }
  const endIndex = startIndex + searchTerm.length;

  // Identifies the starting and ending verses
  let startVerse = null;
  let endVerse = null;

  for (let i = 0; i < verseKeys.length; i++) {
    const verse = verseKeys[i];
    const { start, end } = verseIndexMap[verse];

    // Finds the verse where the searchTerm starts
    if (start <= startIndex && startIndex < end) {
      startVerse = verse;
    }

    // Finds the verse where the searchTerm ends
    if (start < endIndex && endIndex <= end) {
      endVerse = verse;
      break; // Stops the loop once the endVerse is found
    }
  }

  return `${startVerse}-${endVerse}`;
}

/**
 * Finds a passage of text containing a search term within a set of data.
 * 
 * @param {Object} textData - An object containing text data, where each key is a verse and each value is the corresponding text.
 * @param {string} searchTerm - The term to search for within the text data.
 * @param {boolean} [multipleVerse=true] - Allow extractedText to show text from the previous/next verses.
 * @param {boolean} [strict=false] - Whether to perform a strict search (i.e., whole word only) or not.
 * @param {boolean} [pali=false] - If true, ignore diacritics in both searchTerm and textData.
 * @returns {string|null} The extracted passage of text containing the search term, or null if the term is not found.
 */
function findSearchTermPassage(textData, searchTerm, multipleVerse = true, strict = false, pali = false) {
  const maxWords = 150;

  if (pali) searchTerm = removeDiacritics(searchTerm);
  
  const lowerCaseSearchTerm = searchTerm.toLowerCase();
  const searchTermRegex = strict 
    ? new RegExp(`(^|\\s|[.,!?\\(\\)]|\\b)(${lowerCaseSearchTerm})(?=\\s|[.,!?\\(\\)]|$)`, "gi") 
    : new RegExp(`(${lowerCaseSearchTerm})`, "gi");

  const verses = Object.entries(textData).map(([key, verse]) => [key, curateText(verse)]);

  if (!multipleVerse) {
    for (let [index, [key, verse]] of verses.entries()) {
		
      const lowerCaseVerse = pali ? removeDiacritics(verse.toLowerCase()) : verse.toLowerCase();
      const searchIndex = lowerCaseVerse.search(searchTermRegex);
      
      if (searchIndex !== -1) {
        const words = pali ? removeDiacritics(verse).split(" ") : verse.split(" ");
        const termWordIndex = lowerCaseVerse.slice(0, searchIndex).split(" ").length - 1;
        const searchTermLengthInWords = lowerCaseSearchTerm.split(" ").length;

        if (searchTermLengthInWords > maxWords) {
          let extractedText = `<b>${searchTerm}</b>`;
          if (searchIndex > 0) {
            extractedText = "[...] " + extractedText;
          }
          if (searchIndex + searchTerm.length < lowerCaseVerse.length) {
            extractedText = extractedText + " [...]";
          }
          return extractedText;
        }

        let startWordIndex = Math.max(0, termWordIndex - Math.floor((maxWords - searchTermLengthInWords) / 2));
        let endWordIndex = Math.min(words.length, termWordIndex + searchTermLengthInWords + Math.ceil((maxWords - searchTermLengthInWords) / 2));

        // Adjust if we reach the beginning or end of the verse and not enough words are gathered
        if (endWordIndex - startWordIndex < maxWords) {
          if (startWordIndex === 0) {
            endWordIndex = Math.min(words.length, startWordIndex + maxWords);
          } else if (endWordIndex === words.length) {
            startWordIndex = Math.max(0, endWordIndex - maxWords);
          }
        }

        const adjustedWords = words.slice(startWordIndex, endWordIndex);
        let extractedText = adjustedWords.join(" ");

        const highlightRegex = strict 
          ? new RegExp(`(^|\\s|[.,!?\\(\\)]|\\b)(${lowerCaseSearchTerm})(?=\\s|[.,!?\\(\\)]|$)`, "gi") 
          : new RegExp(`(${lowerCaseSearchTerm})`, "gi");
		  
        extractedText = strict
          ? extractedText.replace(highlightRegex, `$1<b>$2</b>`)
          : extractedText.replace(highlightRegex, `<b>$1</b>`); 

        if (startWordIndex > 0) {
          extractedText = "[...] " + extractedText;
        }
        if (endWordIndex < words.length) {
          extractedText = extractedText + " [...]";
        }

        return extractedText;
      }
    }
    return null; 
  }

  const concatenatedText = verses.map(([, text]) => (pali ? removeDiacritics(text.toLowerCase()) : text.toLowerCase())).join("");
  
  const searchIndex = concatenatedText.search(searchTermRegex);
  if (searchIndex === -1) {
    return null; 
  }

  const searchTermLengthInWords = lowerCaseSearchTerm.split(" ").length;

  if (searchTermLengthInWords > maxWords) {
    let extractedText = `<b>${searchTerm}</b>`;
    if (searchIndex > 0) {
      extractedText = "[...] " + extractedText;
    }
    if (searchIndex + searchTerm.length < concatenatedText.length) {
      extractedText = extractedText + " [...]";
    }
    return extractedText;
  }

  const allWords = verses.map(([, text]) => (pali ? removeDiacritics(text) : text)).join("").split(" ");
  const termWordIndex = concatenatedText.slice(0, searchIndex).split(" ").length - 1;

  let startWordIndex = Math.max(0, termWordIndex - Math.floor((maxWords - searchTermLengthInWords) / 2));
  let endWordIndex = Math.min(allWords.length, termWordIndex + searchTermLengthInWords + Math.ceil((maxWords - searchTermLengthInWords) / 2));

  if (endWordIndex - startWordIndex < maxWords) {
    if (startWordIndex === 0) {
      endWordIndex = Math.min(allWords.length, startWordIndex + maxWords);
    } else if (endWordIndex === allWords.length) {
      startWordIndex = Math.max(0, endWordIndex - maxWords);
    }
  }

  const adjustedWords = allWords.slice(startWordIndex, endWordIndex);
  let extractedText = adjustedWords.join(" ");

  const highlightRegex = strict 
    ? new RegExp(`(^|\\s|[.,!?\\(\\)]|\\b)(${lowerCaseSearchTerm})(?=\\s|[.,!?\\(\\)]|$)`, "gi") 
    : new RegExp(`(${lowerCaseSearchTerm})`, "gi");
	
  extractedText = strict
    ? extractedText.replace(highlightRegex, `$1<b>$2</b>`)
    : extractedText.replace(highlightRegex, `<b>$1</b>`); 
  
  if (startWordIndex > 0) {
    extractedText = "[...] " + extractedText;
  }
  if (endWordIndex < allWords.length) {
    extractedText = extractedText + " [...]";
  }
  
  return extractedText;
}

function curateText(text) {
	// Replace every multiples <br> and variantes by only one tag
    text = text.replace(/<br\s*\/?>\s*(<br\s*\/?>\s*)+/gi, "<br/>");

	// Replace hyperlink [link_text](url) with only link_text
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  
	// Replace words or expressions surrounded by _ or * with only text, otherwise can cause issue with highlighting
    text = text.replace(/[_*]([^_*]+)[_*]/g, "$1");

    return text;
}

async function getSuttas(db, options, type){
	let query;
	
	if(type.includes('en'))
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
	if (options['sn'] && !options['kn']){
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
  if (link != "none"){
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

  if (link != "none"){
	  anchor.appendChild(titleElement);
	  anchor.appendChild(preview);
	  resultDiv.appendChild(anchor);
  }
  else{
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
		// Empêche de lancer la recherche si le bouton est désactivé
		if (!searchButton.disabled) {
			startSearch(); // Appelle la fonction pour démarrer la recherche
		}
		event.preventDefault(); // Empêche le comportement par défaut
	}
  });	
});

window.onload = () => searchInput.focus();
