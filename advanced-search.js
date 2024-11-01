// The extracted text doesn't seem to start from the matching element
// Ensure that if the matching element appears multiple times in the same text, all occurrences should be displayed consecutively
// Pourrait être encore plus précis au niveau du nombre de mots qu'il renvoit si on ajoutait les autres symboles de ponctuation pour séparer les mots
// Gérer le cas où le searchTerm fait plus de 100 mots de longueur, il faudra afficher que le searchTerm en tant que passage
// Ajouter un placeholder aux results et un message si rien trouvé
// Reindenter le fichier
// Les balises <b></b> sont pas prises en compte comme html
// Renvoyer commentaire si texte contenu dans commentaire
// Utiliser le code existant pour renvoyer le passage pali si texte contenu dans pali
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
  
  // Loop through each sutta and alternate searches between English and Pali
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
      
      // Search in the comments
      const commentText = JSON.stringify(suttaEn.comment).toLowerCase();
      let inComment = false;
      if (commentText.includes(searchTerm)) inComment = true;
      
	  const extractedText = findSearchTermPassage(suttaEn.translation_en_anigha, searchTerm);
      if (extractedText){
		const range = findVerseRange(suttaEn.translation_en_anigha, searchTerm);
		if (range){
			const link = "https://suttas.hillsidehermitage.org/?q=" + suttaEn.id + "#" + range;
			console.log(link);
			addResultToDOM(id, titleEn, extractedText, link);
		}
	  }
	  
	  // if (inComment) {
        // let snippetEn = translationText.includes(searchTerm)
          // ? translationText.substring(translationText.indexOf(searchTerm), 100)
          // : commentText.substring(commentText.indexOf(searchTerm), 100);
        // addResultToDOM(id, titleEn, snippetEn, link);
      // }
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

function findSearchTermPassage(translationData, searchTerm) {
  // Step 1: Concatenates all verse values into lowercase without spaces between verses
  const verses = Object.entries(translationData);
  const concatenatedText = verses.map(([, text]) => text).join("").toLowerCase();

  // Also converts the searchTerm to lowercase for case-insensitive search
  const lowerCaseSearchTerm = searchTerm.toLowerCase();

  // Step 2: Finds the index of the search term in the concatenated text
  const searchIndex = concatenatedText.indexOf(lowerCaseSearchTerm);
  if (searchIndex === -1) {
    return null; // Term not found
  }

  // Step 3: Builds a passage of 100 words around the search term
  const words = concatenatedText.split(" ");
  const termWordIndex = concatenatedText.slice(0, searchIndex).split(" ").length - 1;

  // Determines the starting and ending indices for 100 words
  let startWordIndex = Math.max(0, termWordIndex - 50);
  let endWordIndex = Math.min(words.length, termWordIndex + 50);

  // Adjusts the indices to ensure there are 100 words
  const totalWords = endWordIndex - startWordIndex;
  if (totalWords < 100) {
    const deficit = 100 - totalWords;
    if (startWordIndex > 0) {
      // If we have a deficit, try to increase the beginning
      startWordIndex = Math.max(0, startWordIndex - deficit);
    } else {
      // If we can't go further at the beginning, adjust the end
      endWordIndex = Math.min(words.length, endWordIndex + deficit);
    }
  }

  // Ensures the passage is exactly 100 words
  const adjustedWords = words.slice(startWordIndex, startWordIndex + 100);
  let extractedText = adjustedWords.join(" ");

  // Step 4: Surrounds the search term with <b></b> tags
  const highlightedText = new RegExp(`(${lowerCaseSearchTerm})`, "gi");
  extractedText = extractedText.replace(highlightedText, `<b>${searchTerm}</b>`);

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
