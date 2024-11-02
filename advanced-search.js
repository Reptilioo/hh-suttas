// Ensure that if the matching element appears multiple times in the same text, all occurrences should be displayed consecutively
// Could be even more accurate in terms of the number of words it returns if we added other punctuation symbols to separate words
// Handle the case where the search term is over 100 words long, we should display only the search term as a passage.
// searchTerm should be curated by removing newlines and double spaces
// Re-indent the file
// See if we can optimize the code, particularly the findVerseRange() and findSearchTermPassage() functions
// Add no diacritics for pali search - DONE but still need to find a way to display pali with diacritics and with searchTerm highlighted

import db from "./js/dexie/dexie.js";
import { fetchAvailableSuttas } from "./js/utils/loadContent/fetchAvailableSuttas.js";

const availableSuttasJson = await fetchAvailableSuttas();

// Search function in the database
async function searchSuttas(searchTerm, options) {
  searchTerm = searchTerm.toLowerCase();
  const resultsDiv = document.querySelector('.results');
  resultsDiv.innerHTML = ''; // Clear previous results

  let suttasEn;
  let elmtsNb = 0;
  
  if (options['en']) {
    // Load sorted suttas with sortKey
	suttasEn = await getSuttas(db, options, 'en');
	elmtsNb = suttasEn.length;
  }
  
  let suttasPl;
  if (options['pali']) {
    // Load sorted suttas with sortKey
    suttasPl = await getSuttas(db, options, 'pl');
	if (elmtsNb < 1)
		elmtsNb = suttasPl.length;
  }
  
  let gotResults = false;
  
  for (let i = 0; i < elmtsNb; i++) {
	  
    let id;
    let idSet = false;
    
    if (options['en']) {
      const suttaEn = suttasEn[i];
      
      // Title and ID of the sutta from available_suttas.json
      let titleEn = availableSuttasJson[suttaEn.id]?.title || "Unknown Title";
	  const heading = availableSuttasJson[suttaEn.id]?.heading || null;
	  if (heading) titleEn = `${titleEn} (${heading})`
	  
      id = availableSuttasJson[suttaEn.id]?.id || suttaEn.id.toUpperCase();
      idSet = true;
      
	  // Search in translation
	  const extractedText = findSearchTermPassage(suttaEn.translation_en_anigha, searchTerm, true, options['strict']);
      if (extractedText){
		const range = findVerseRange(suttaEn.translation_en_anigha, searchTerm);
		if (range){
			const link = "https://suttas.hillsidehermitage.org/?q=" + suttaEn.id + "#" + range;
			addResultToDOM(id, titleEn, curateText(extractedText), link);
			gotResults = true;
		}
	  }
	  
	  // Search in comment
	  if (suttaEn.comment){
		  const extractedText = findSearchTermPassage(suttaEn.comment, searchTerm, false, options['strict']);
		  if (extractedText){
			const commentNb = findCommentNb(suttaEn.comment, searchTerm);
			if (commentNb){
				const link = "https://suttas.hillsidehermitage.org/?q=" + suttaEn.id + "#comment" + commentNb;
				addResultToDOM(id, titleEn + " - Comments", curateText(extractedText), link);
				gotResults = true;
			}
		  }
	  }
    }
    
    if (options['pali']) {
      const suttaPl = suttasPl[i];
      
      //Title and ID of the sutta from available_suttas.json
      const titlePl = availableSuttasJson[suttaPl.id]?.pali_title || "Unknown Title";
      if (!idSet) id = availableSuttasJson[suttaPl.id]?.id || suttaPl.id.toUpperCase();
      
      //Search in the Pali text (suttas_pl)
	  const extractedText = findSearchTermPassage(suttaPl.root_pli_ms, searchTerm, true, options['strict'], true);
      if (extractedText){
		const range = findVerseRange(suttaPl.root_pli_ms, searchTerm, true);
		if (range){
			const link = "https://suttas.hillsidehermitage.org/?q=" + suttaPl.id + "#" + range;
			addResultToDOM(id, titlePl, curateText(extractedText), link);
			gotResults = true;
		}
	  }
    }
  }
  
  // Display no results found
  if (!gotResults)
	  addResultToDOM("", "No results found", "No results were found with the expression '" + searchTerm + "'.", "none");
}

function findCommentNb(commentData, searchTerm) {
    const result = [];
    let line = 1;

    for (const [key, value] of Object.entries(commentData)) {
        if (value === "") {
            continue;  // Ignore empty lines
        }

        if (value.includes(searchTerm)) {
            result.push(line);
        }

        line++;
    }

    return result;
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
  const halfMaxWords = maxWords / 2;

  if (pali) searchTerm = removeDiacritics(searchTerm);
  
  // Remove diacritics from searchTerm if pali is true
  const lowerCaseSearchTerm = searchTerm.toLowerCase();
  const searchTermRegex = strict ? new RegExp(`\\b${lowerCaseSearchTerm}\\b`, "gi") : new RegExp(`(${lowerCaseSearchTerm})`, "gi");

  // Convert the verses into a list of entries [key, text]
  const verses = Object.entries(textData);

  // Step 2: Search for the term in each individual verse if multipleVerse is false
  if (!multipleVerse) {
    for (let [index, [key, verse]] of verses.entries()) {
      // Remove diacritics from the verse if pali is true
      const lowerCaseVerse = pali ? removeDiacritics(verse.toLowerCase()) : verse.toLowerCase();
      const searchIndex = lowerCaseVerse.search(searchTermRegex);
      
      // If the term is found in the current verse
      if (searchIndex !== -1) {
        const words = pali ? removeDiacritics(verse).split(" ") : verse.split(" "); // Original text to preserve casing
        const termWordIndex = lowerCaseVerse.slice(0, searchIndex).split(" ").length - 1;

        // Calculate start and end indices within the verse boundaries
        let startWordIndex = Math.max(0, termWordIndex - halfMaxWords);
        let endWordIndex = Math.min(words.length, termWordIndex + halfMaxWords);

        // Adjust indices to get exactly 100 words without exceeding the verse
        const totalWords = endWordIndex - startWordIndex;
        if (totalWords < maxWords) {
          const deficit = maxWords - totalWords;
          if (startWordIndex > 0) {
            startWordIndex = Math.max(0, startWordIndex - deficit);
          } else {
            endWordIndex = Math.min(words.length, endWordIndex + deficit);
          }
        }

        // Extract the adjusted words and re-form the text
        const adjustedWords = words.slice(startWordIndex, endWordIndex);
        let extractedText = adjustedWords.join(" ");

        // Highlight the search term using the original text
        const highlightRegex = strict ? new RegExp(`\\b${searchTerm}\\b`, "gi") : new RegExp(`(${searchTerm})`, "gi");
        extractedText = extractedText.replace(highlightRegex, `<b>$&</b>`);

        // Add "[...]" to the beginning if the passage doesn't start at the beginning of the verse
        if (startWordIndex > 0) {
          extractedText = "[...] " + extractedText;
        }
        // Add "[...]" to the end if the passage doesn't end at the end of the verse
        if (endWordIndex < words.length) {
          extractedText = extractedText + " [...]";
        }

        return extractedText;
      }
    }
    return null; // If the term is not found in any verse
  }

  // Multiple verse mode, concatenate all verses and perform the search
  const concatenatedText = verses.map(([, text]) => (pali ? removeDiacritics(text.toLowerCase()) : text.toLowerCase())).join("");
  
  const searchIndex = concatenatedText.search(searchTermRegex);
  if (searchIndex === -1) {
    return null; // Term not found
  }

  // Search around the term with a limit of 100 words in the concatenated text
  const allWords = verses.map(([, text]) => (pali ? removeDiacritics(text) : text)).join("").split(" ");
  const termWordIndex = concatenatedText.slice(0, searchIndex).split(" ").length - 1;

  let startWordIndex = Math.max(0, termWordIndex - halfMaxWords);
  let endWordIndex = Math.min(allWords.length, termWordIndex + halfMaxWords);

  const totalWords = endWordIndex - startWordIndex;
  if (totalWords < maxWords) {
    const deficit = maxWords - totalWords;
    if (startWordIndex > 0) {
      startWordIndex = Math.max(0, startWordIndex - deficit);
    } else {
      endWordIndex = Math.min(allWords.length, endWordIndex + deficit);
    }
  }

  const adjustedWords = allWords.slice(startWordIndex, startWordIndex + maxWords);
  let extractedText = adjustedWords.join(" ");

  // Highlight the search term in the original text
  const highlightRegex = strict ? new RegExp(`\\b${searchTerm}\\b`, "gi") : new RegExp(`(${searchTerm})`, "gi");

  extractedText = extractedText.replace(highlightRegex, `<b>$&</b>`);

  // Add "[...]" to the beginning if the passage doesn't start at the beginning of the first key-value pair
  if (startWordIndex > 0) {
    extractedText = "[...] " + extractedText;
  }
  // Add "[...]" to the end if the passage doesn't end at the end of the last key-value pair
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

	// Replace words or expressions surrounded by _ or * with <i></i> tags
    text = text.replace(/[_*]([^_*]+)[_*]/g, "<i>$1</i>");

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

function startSearch(){
	const query = document.querySelector('#searchInput').value;
    const options = getConfiguration();
    searchSuttas(query, options);
}

document.querySelector('#searchButton').addEventListener('click', () => {
    startSearch();
});

const searchInput = document.getElementById('searchInput');

// Enter key works on the entire page and not just when focused on the search box, so we can just change an option and restart the search without having to click in the search box
document.addEventListener('keydown', function(event) {
  if (event.key === 'Enter') {
    startSearch();
  }
});

window.onload = () => searchInput.focus();
