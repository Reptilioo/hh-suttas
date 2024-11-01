// Ensure that if the matching element appears multiple times in the same text, all occurrences should be displayed consecutively
// Pourrait être encore plus précis au niveau du nombre de mots qu'il renvoit si on ajoutait les autres symboles de ponctuation pour séparer les mots
// Gérer le cas où le searchTerm fait plus de 100 mots de longueur, il faudra afficher que le searchTerm en tant que passage
// Ajouter un placeholder aux results et un message si rien trouvé
// Reindenter le fichier
// Les balises <b></b> sont pas prises en compte comme html
// Utiliser le code existant pour renvoyer le passage pali si texte contenu dans pali. Faire une recherche sans diacritics (dans le searchTerm et dans les passages)
// Voir si on peut optimiser le code, notamment findVerseRange() et findSearchTermPassage()

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
      
	  const extractedText = findSearchTermPassage(suttaEn.translation_en_anigha, searchTerm);
      if (extractedText){
		const range = findVerseRange(suttaEn.translation_en_anigha, searchTerm);
		if (range){
			const link = "https://suttas.hillsidehermitage.org/?q=" + suttaEn.id + "#" + range;
			addResultToDOM(id, titleEn, extractedText, link);
		}
	  }
	  
	  // Search in comment
	  if (suttaEn.comment){
		  const extractedText = findSearchTermPassage(suttaEn.comment, searchTerm, false);
		  if (extractedText){
			const commentNb = findCommentNb(suttaEn.comment, searchTerm);
			if (commentNb){
				const link = "https://suttas.hillsidehermitage.org/?q=" + suttaEn.id + "#comment" + commentNb;
				addResultToDOM(id, titleEn + " - Comments", extractedText, link);
			}
		  }
	  }
    }
    
    // if (options['pali']) {
      // const suttaPl = suttasPl[i];
      
      ////Title and ID of the sutta from available_suttas.json
      // const titlePl = availableSuttasJson[suttaPl.id]?.pali_title || "Unknown Title";
      // if (!idSet) id = availableSuttasJson[suttaPl.id]?.id || suttaPl.id.toUpperCase();
      
      ////Search in the Pali text (suttas_pl)
      // const translationTextPl = JSON.stringify(suttaPl.root_pli_ms).toLowerCase();
      // if (translationTextPl.includes(searchTerm)) {
        // let snippetPl = translationTextPl.substring(translationTextPl.indexOf(searchTerm), 100);
        // addResultToDOM(id, titlePl, snippetPl);
      // }
    // }
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


// multipleVerse: allow the passage to show text from the previous/next verses
// we want it false for comment so it only displays the content in the matching commment
function findSearchTermPassage(translationData, searchTerm, multipleVerse = true) {
  const lowerCaseSearchTerm = searchTerm.toLowerCase();

  // Converts verses into a list of key-value pairs (key: verse number, value: verse text)
  const verses = Object.entries(translationData);

  // Step 2: Search for the term in each verse individually if multipleVerse is false
  if (!multipleVerse) {
    for (let [key, verse] of verses) {
      const lowerCaseVerse = verse.toLowerCase();
      const searchIndex = lowerCaseVerse.indexOf(lowerCaseSearchTerm);

      // If the term is found in the current verse
      if (searchIndex !== -1) {
        const words = verse.split(" "); // Use original text to preserve casing
        const termWordIndex = lowerCaseVerse.slice(0, searchIndex).split(" ").length - 1;

        // Calculates starting and ending indices within the verse boundaries
        let startWordIndex = Math.max(0, termWordIndex - 50);
        let endWordIndex = Math.min(words.length, termWordIndex + 50);

        // Adjusts indices to have exactly 100 words without exceeding the verse
        const totalWords = endWordIndex - startWordIndex;
        if (totalWords < 100) {
          const deficit = 100 - totalWords;
          if (startWordIndex > 0) {
            startWordIndex = Math.max(0, startWordIndex - deficit);
          } else {
            endWordIndex = Math.min(words.length, endWordIndex + deficit);
          }
        }

        // Extracts the adjusted words and reforms the text
        const adjustedWords = words.slice(startWordIndex, endWordIndex);
        let extractedText = adjustedWords.join(" ");

        // Highlights the search term in the original text (case-insensitive)
        const highlightedText = new RegExp(`\\b(${searchTerm})\\b`, "gi"); // Uses \\b for whole word match
        extractedText = extractedText.replace(highlightedText, `<b>$1</b>`);

        return extractedText;
      }
    }
    return null; // If the term is not found in any verse
  }

  // Multiple verse mode, concatenates all verses and performs the search
  const concatenatedText = verses.map(([, text]) => text.toLowerCase()).join("");
  const searchIndex = concatenatedText.indexOf(lowerCaseSearchTerm);
  if (searchIndex === -1) {
    return null; // Term not found
  }

  // Search around the term with a 100-word limit in the concatenated text
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

  // Highlights the search term in the original text (case-insensitive)
  const highlightedText = new RegExp(`\\b(${searchTerm})\\b`, "gi"); // Uses \\b for whole word match
  extractedText = extractedText.replace(highlightedText, `<b>$1</b>`);

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
  preview.textContent = snippet;

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
