// The extracted text doesn't seem to start from the matching element
// Ensure that if the matching element appears multiple times in the same text, all occurrences should be displayed consecutively

import db from "./js/dexie/dexie.js";
import { fetchAvailableSuttas } from "./js/utils/loadContent/fetchAvailableSuttas.js";

const availableSuttasJson = await fetchAvailableSuttas();

// Search function in the database
async function searchSuttas(query, options) {
  query = query.toLowerCase();
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
      const titleEn = availableSuttasJson[suttaEn.id]?.title || "Unknown Title";
      id = availableSuttasJson[suttaEn.id]?.id || suttaEn.id.toUpperCase();
      idSet = true;
      
      // Search in the English text (suttas_en)
      const translationText = JSON.stringify(suttaEn.translation_en_anigha).toLowerCase();
      const commentText = JSON.stringify(suttaEn.comment).toLowerCase();

      let inTranslation = false;
      let inComment = false;
      
      if (translationText.includes(query)) inTranslation = true;
      
      if (commentText.includes(query)) inComment = true;
      
      if (inTranslation || inComment) {
        let snippetEn = translationText.includes(query)
          ? translationText.substring(translationText.indexOf(query), 100)
          : commentText.substring(commentText.indexOf(query), 100);
        addResultToDOM(id, titleEn, snippetEn);
      }
    }
    
    if (options['pali']) {
      const suttaPl = suttasPl[i];
      
      // Title and ID of the sutta from available_suttas.json
      const titlePl = availableSuttasJson[suttaPl.id]?.pali_title || "Unknown Title";
      if (!idSet) id = availableSuttasJson[suttaPl.id]?.id || suttaPl.id.toUpperCase();
      
      // Search in the Pali text (suttas_pl)
      const translationTextPl = JSON.stringify(suttaPl.root_pli_ms).toLowerCase();
      if (translationTextPl.includes(query)) {
        let snippetPl = translationTextPl.substring(translationTextPl.indexOf(query), 100);
        addResultToDOM(id, titlePl, snippetPl);
      }
    }
  }
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
function addResultToDOM(id, title, snippet) {
  const resultsDiv = document.querySelector('.results');
  const resultDiv = document.createElement('div');
  resultDiv.classList.add('result');

  const link = document.createElement('a');
  link.href = "#";
  link.classList.add('link');

  const titleElement = document.createElement('h3');
  titleElement.textContent = `${id} - ${title}`;

  const preview = document.createElement('p');
  preview.textContent = snippet;

  link.appendChild(titleElement);
  link.appendChild(preview);
  resultDiv.appendChild(link);
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
