import db from "./js/dexie/dexie.js";
import suttasCount from './python/generated/suttas-count.js'
import { fetchAvailableSuttas } from "./js/utils/loadContent/fetchAvailableSuttas.js";

const availableSuttasJson = await fetchAvailableSuttas();

async function searchSuttas(query, options) {
    const resultsDiv = document.querySelector('.results');
    resultsDiv.innerHTML = ''; // Clear previous results

    // Load sorted suttas with sortKey
    const suttas = await db.suttas_en.orderBy('sortKey').toArray();

    suttas.forEach(sutta => {
        // Convert to string to search in translation_en_anigha and comment
        const translationText = JSON.stringify(sutta.translation_en_anigha).toLowerCase();
        const commentText = JSON.stringify(sutta.comment).toLowerCase();
    
        if (translationText.includes(query.toLowerCase()) || commentText.includes(query.toLowerCase())) {
            // Get the title from the JSON file
            const title = availableSuttasJson[sutta.id]?.title || "Unknown Title";
            const id = availableSuttasJson[sutta.id]?.id || sutta.id.toUpperCase();
    
            // Extract the first 100 characters of the occurrence
            let snippet = '';
            if (translationText.includes(query.toLowerCase())) {
                snippet = translationText.substring(translationText.indexOf(query.toLowerCase()), 100);
            } else if (commentText.includes(query.toLowerCase())) {
                snippet = commentText.substring(commentText.indexOf(query.toLowerCase()), 100);
            }

            // Create an HTML element for each result
            const resultDiv = document.createElement('div');
            resultDiv.classList.add('result');

            const link = document.createElement('a');
            link.href = "#";
            link.classList.add('link');

            const titleElement = document.createElement('h3');
            titleElement.textContent = `${id} - ${title}`;

            const preview = document.createElement('p');
            preview.textContent = snippet;

            // Add the HTML elements to the DOM
            link.appendChild(titleElement);
            link.appendChild(preview);
            resultDiv.appendChild(link);
            resultsDiv.appendChild(resultDiv);
        }
    });
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

document.querySelector('#search-button').addEventListener('click', () => {
    const query = document.querySelector('#search-input').value;
    const options = getConfiguration();
    console.log(options);
    searchSuttas(query, options);
});
