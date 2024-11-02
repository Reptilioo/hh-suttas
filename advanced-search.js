// Ensure that if the matching element appears multiple times in the same text, all occurrences should be displayed consecutively
// Could be even more accurate in terms of the number of words it returns if we added other punctuation symbols to separate words
// Handle the case where the search term is over 100 words long, we should display only the search term as a passage
// Add a placeholder to the results and a message if nothing is found
// Re-indent the file
// See if we can optimize the code, particularly the findVerseRange() and findSearchTermPassage() functions
// Replace <br><br> or <br/><br/> or any other variants with a single <br> (we find this in comments, for example)

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
			addResultToDOM(id, titleEn, extractedText, link);
		}
	  }
	  
	  // Search in comment
	  if (suttaEn.comment){
		  const extractedText = findSearchTermPassage(suttaEn.comment, searchTerm, false, options['strict']);
		  if (extractedText){
			const commentNb = findCommentNb(suttaEn.comment, searchTerm);
			if (commentNb){
				const link = "https://suttas.hillsidehermitage.org/?q=" + suttaEn.id + "#comment" + commentNb;
				addResultToDOM(id, titleEn + " - Comments", extractedText, link);
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
	  const extractedText = findSearchTermPassage(suttaPl.root_pli_ms, searchTerm, true, options['strict']);
      if (extractedText){
		const range = findVerseRange(suttaPl.root_pli_ms, searchTerm);
		if (range){
			const link = "https://suttas.hillsidehermitage.org/?q=" + suttaPl.id + "#" + range;
			addResultToDOM(id, titlePl, extractedText, link);
		}
	  }
    }
  }
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


function findVerseRange(translations, searchTerm) {
  let verseKeys = Object.keys(translations);
  let currentText = "";
  let verseIndexMap = {};

  // Creates an accumulated text and records the positions of each verse
  for (let i = 0; i < verseKeys.length; i++) {
    const verse = verseKeys[i];
    const text = translations[verse];

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


// multipleVerse: allow the passage to show text from the previous/next verses. We want it false for comment so it only displays the content in the matching commment.
// strict: allow to return only perfect matching results (e.g. not when "restraining" matches with searchTerm "training")
function findSearchTermPassage(translationData, searchTerm, multipleVerse = true, strict = false) {
  const lowerCaseSearchTerm = searchTerm.toLowerCase();
  const searchTermRegex = strict ? new RegExp(`\\b${lowerCaseSearchTerm}\\b`, "gi") : new RegExp(`(${lowerCaseSearchTerm})`, "gi");

  // Convert translation data into a list of [key, text] entries
  const verses = Object.entries(translationData);

  // Step 2: Search for the term in each individual verse if multipleVerse is false
  if (!multipleVerse) {
    for (let [index, [key, verse]] of verses.entries()) {
      const lowerCaseVerse = verse.toLowerCase();
      const searchIndex = lowerCaseVerse.search(searchTermRegex);
      
      // If the term is found in the current verse
      if (searchIndex !== -1) {
        const words = verse.split(" "); // Original text to preserve casing
        const termWordIndex = lowerCaseVerse.slice(0, searchIndex).split(" ").length - 1;

        // Calculate start and end indices within the verse boundaries
        let startWordIndex = Math.max(0, termWordIndex - 50);
        let endWordIndex = Math.min(words.length, termWordIndex + 50);

        // Adjust indices to have exactly 100 words without exceeding the verse
        const totalWords = endWordIndex - startWordIndex;
        if (totalWords < 100) {
          const deficit = 100 - totalWords;
          if (startWordIndex > 0) {
            startWordIndex = Math.max(0, startWordIndex - deficit);
          } else {
            endWordIndex = Math.min(words.length, endWordIndex + deficit);
          }
        }

        // Extract adjusted words and re-form the text
        const adjustedWords = words.slice(startWordIndex, endWordIndex);
        let extractedText = adjustedWords.join(" ");

        // Highlight the searched term using the original text
        const highlightRegex = strict ? new RegExp(`\\b${searchTerm}\\b`, "gi") : new RegExp(`(${searchTerm})`, "gi");
        extractedText = extractedText.replace(highlightRegex, `<b>$&</b>`);

        // Add "[...] " if the passage does not start at the beginning of the first key-value pair
        if (index > 0 || startWordIndex > 0) {
          extractedText = "[...] " + extractedText;
        }
        // Add " [...]" if the passage does not end at the end of the last key-value pair
        if (index < verses.length - 1 || endWordIndex < words.length) {
          extractedText = extractedText + " [...]";
        }

        return extractedText;
      }
    }
    return null; // If the term is not found in any verse
  }

  // MultipleVerse mode, concatenate all verses and perform the search
  const concatenatedText = verses.map(([, text]) => text.toLowerCase()).join("");
  const searchIndex = concatenatedText.search(searchTermRegex);
  if (searchIndex === -1) {
    return null; // Term not found
  }

  // Search around the term with a limit of 100 words in the concatenated text
  const words = verses.map(([, text]) => text).join("").split(" ");
  const termWordIndex = concatenatedText.slice(0, searchIndex).split(" ").length - 1;

  let startWordIndex = Math.max(0, termWordIndex - 50);
  let endWordIndex = Math.min(words.length, termWordIndex + 50);

  const totalWords = endWordIndex - startWordIndex;
  if (totalWords < 100) {
    const deficit = 100 - totalWords;
    if (startWordIndex > 0) {
      startWordIndex = Math.max(0, startWordIndex - deficit);
    } else {
      endWordIndex = Math.min(words.length, endWordIndex + deficit);
    }
  }

  const adjustedWords = words.slice(startWordIndex, startWordIndex + 100);
  let extractedText = adjustedWords.join(" ");

  // Highlight the searched term in the original text
  const highlightRegex = strict ? new RegExp(`\\b${searchTerm}\\b`, "gi") : new RegExp(`(${searchTerm})`, "gi");
  extractedText = extractedText.replace(highlightRegex, `<b>$&</b>`);

  // Add "[...] " at the beginning if the passage does not start at the beginning of the first key-value pair
  if (startWordIndex > 0) {
    extractedText = "[...] " + extractedText;
  }
  // Add " [...]" at the end if the passage does not end at the end of the last key-value pair
  if (endWordIndex < words.length) {
    extractedText = extractedText + " [...]";
  }

  return extractedText;
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

  const anchor = document.createElement('a');
  anchor.href = link;
  anchor.classList.add('link');

  const titleElement = document.createElement('h3');
  titleElement.textContent = `${id} - ${title}`;

  const preview = document.createElement('p');
  preview.innerHTML = snippet;

  anchor.appendChild(titleElement);
  anchor.appendChild(preview);
  resultDiv.appendChild(anchor);
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

document.querySelector('#searchButton').addEventListener('click', () => {
    const query = document.querySelector('#searchInput').value;
    const options = getConfiguration();
    searchSuttas(query, options);
});
