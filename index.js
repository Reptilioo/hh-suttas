import { scrollToHash, showNotification, changeAcronymNumber } from './js/utils.js'
const suttaArea = document.getElementById("sutta");
const homeButton = document.getElementById("home-button");
const themeButton = document.getElementById("theme-button");
const bodyTag = document.querySelector("body");
const previous = document.getElementById("previous");
const next = document.getElementById("next");

// functions

async function getAvailableSuttas({ mergedTitle = true } = {}) {
  try {
    const response = await fetch('available_suttas.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (mergedTitle) {
      return data.available_suttas.map(sutta => `${sutta.id}: ${sutta.title.trim()}${sutta.author ? `: ${sutta.author}` : ''}`)
    }
    else {
      return data
    }
  } catch (error) {
    console.error('Error fetching available suttas:', error);
    return [];
  }
}

function searchSuttas(pattern) {
  if (!fuse) { pattern = "" }; // if Fuse isn't initialized, return empty array
  pattern = pattern.replace(/([a-zA-Z]{2})(\d+)/, '$1 $2');
  let results = fuse.search(pattern).map(result => result.item);
  // join up the id with the titles to be displayed
  return results.map(sutta => `${sutta.id}: ${sutta.title.trim()}`);
}

function getSuttaTitleById(id) {
  // TODO this is inefficient
  // change the structure of available_suttas.json to be able to look up by id
  const sutta = availableSuttasJson['available_suttas'].find(sutta => sutta.id === id);
  return sutta ? sutta.title.trim() : "";
}

function displaySuttas(suttas) {
  suttaArea.innerHTML = `<ul>${suttas.map(sutta => {
    const parts = sutta.split(':');
    // TODO review this logic once MN series is finished.
    const id = parts[0].trim().replace(/\s+/g, '');
    const title = parts[1].trim();
    if (parts[2]){
      const author = parts[2].trim()
      return `<li><a href="/?q=${id.toLowerCase()}">${id}: ${title} (<em>by ${author}</em>)</a></li>`;
    }
    return `<li><a href="/?q=${id.toLowerCase()}">${id}: ${title}</a></li>`;
  }).join('')}</ul>`;
  suttaArea.innerHTML += `<p style="font-size: 14px;"><i>Bhikkhu Sujato's copyright-free English translations at SuttaCentral have been modified for use on this site.</i></p>`;

  //Add listener for download button
  document.getElementById('cacheButton').addEventListener('click', () => {
    // Check if service worker is supported by the browser
    if ('serviceWorker' in navigator) {
      // Send message to service worker to trigger caching
      try {
        showNotification("Downloading...")
        navigator.serviceWorker.controller.postMessage({ action: 'cacheResources' });
      } catch (error) {
        console.log(error);
        // TODO maybe a red colour box here?
        showNotification("An error occurred while attempting to download. Please refresh the page, wait a few seconds, and retry");
      }
    }
  });

  infoButton.addEventListener("click", function (event) {
    event.stopPropagation(); // Prevent click from immediately propagating to document
    let notificationBox = document.querySelector('.info-notification-box')
    if (!notificationBox) {
      notificationBox = document.createElement('div');
      notificationBox.classList.add('info-notification-box');
      document.body.appendChild(notificationBox);
    }

    if (notificationBox.style.display == 'block') {
      notificationBox.style.display = 'none';
    } else {
      notificationBox.textContent = "The ‘Download’ button makes the site available offline on the current web browser at the same URL (suttas.hillsidehermitage.org).\n\nThe site can also be installed as an application on mobile phones, by tapping ‘Install’ at the menu on the top right corner. Note that hitting the download button is still necessary to make it available offline through the app.\n\nIf downloading again (e.g., when new Suttas become available), make sure to first clear the site's data on your browser/app and reload the page.";
      notificationBox.style.display = 'block';
    }
  });
  // Add event listener to document to hide notificationBox when clicking outside
  document.addEventListener("click", function (event) {
    let notificationBox = document.querySelector('.info-notification-box');
    if (notificationBox && notificationBox.style.display == 'block') {
      // Check if the click is outside the notificationBox and not on the infoButton
      if (!notificationBox.contains(event.target) && event.target !== infoButton) {
        notificationBox.style.display = 'none';
      }
    }
  });

  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data && event.data.action === 'cachingSuccess') {
      showNotification("Download successful - site available offline.")
    }
    if (event.data && event.data.action === 'cachingError') {
      // TODO again maybe a different colour box
      showNotification("Caching error. Please clear site data, refresh the page, and try again.");
    }
  });

}

function toggleThePali() {
  const hideButton = document.getElementById("hide-pali");

  // initial state
  if (localStorage.paliToggle) {
    if (localStorage.paliToggle === "hide") {
      suttaArea.classList.add("hide-pali");
    }
  } else {
    localStorage.paliToggle = "show";
  }

  hideButton.addEventListener("click", () => {
    const previousScrollPosition = window.scrollY;
    if (localStorage.paliToggle === "show") {
      suttaArea.classList.add("hide-pali");
      localStorage.paliToggle = "hide";
      document.querySelector("body").classList.remove("side-by-side");
    } else {
      suttaArea.classList.remove("hide-pali");
      localStorage.paliToggle = "show";
    }
    setTimeout(() => {
      const currentScrollPosition = window.scrollY;
      window.scrollTo(0, currentScrollPosition - (previousScrollPosition - currentScrollPosition));
    }, 0);
  });
}

async function createFuseSearch() {
  const availableSuttas = await getAvailableSuttas({ mergedTitle: false });
  fuse = new Fuse(availableSuttas['available_suttas'], fuseOptions);
  return fuse
}


// Event listeners

// Toggle side-by-side mode
document.onkeyup = function (e) {
  const paliHidden = document.getElementById("sutta").classList.contains("hide-pali");
  if (!paliHidden && e.target.id != "citation" && e.key == "s") {
    if (localStorage.sideBySide === "true") {
      bodyTag.classList.remove("side-by-side");
      localStorage.sideBySide = "false";
    } else {
      bodyTag.classList.add("side-by-side");
      localStorage.sideBySide = "true";
    }
  }
};

let fuseOptions = {
  includeScore: true,
  keys: ['id', 'title'], // Id then title in terms of priority
};


homeButton.addEventListener("click", () => {
  window.location.href = '/';

});

var converter = new showdown.Converter()

const availableSuttasJson = await getAvailableSuttas({ mergedTitle: false })
const availableSuttasArray = await getAvailableSuttas();

// initialize
if (localStorage.sideBySide) {
  if (localStorage.sideBySide == "true") {
    bodyTag.classList.add("side-by-side");
  }
} else {
  bodyTag.classList.remove("side-by-side");
}
// Function to toggle theme
function toggleTheme(useDarkTheme) {
  bodyTag.classList.remove(useDarkTheme ? "light" : "dark");
  bodyTag.classList.add(useDarkTheme ? "dark" : "light");
  localStorage.theme = useDarkTheme ? "dark" : "light";
}

// Set initial theme
const initialUseDarkTheme = localStorage.theme === "dark";
toggleTheme(initialUseDarkTheme);

// Event listener for theme toggle
themeButton.addEventListener("click", () => {
  const currentThemeIsDark = localStorage.theme === "dark";
  toggleTheme(!currentThemeIsDark);
});

let fuse = createFuseSearch(); // holds our search engine

const citation = document.getElementById("citation");
citation.focus();

citation.addEventListener("input", e => {
  const searchQuery = e.target.value.trim();
  if (searchQuery) {
    const searchResults = searchSuttas(searchQuery);
    displaySuttas(searchResults);
  }
  else {
    displaySuttas(availableSuttasArray);
  }
});

document.getElementById("form").addEventListener("submit", e => {
  e.preventDefault();
  const citationValue = document.getElementById("citation").value.trim().replace(/\s/g, "");
  if (citationValue) {
    buildSutta(citationValue);
    history.pushState({ page: citationValue }, "", `?q=${citationValue}`);
  }
});


citation.value = document.location.search.replace("?q=", "").replace(/%20/g, "").replace(/\s/g, "");
function buildSutta(slug) {
  let translator = "Bhikkhu Anīgha";
  slug = slug.toLowerCase();
  let html = `<div class="button-area"><button id="hide-pali" class="hide-button">Toggle Pali</button></div>`;
  let subDir;

  if (slug.slice(0, 2) !== "mn" && slug.slice(0, 2) !== "an" && slug.slice(0, 2) !== "dn" && !/^sn\d/i.test(slug)) {
    const matchIndex = slug.search(/\d/);
    let firstSection, secondSection, vagga;

    if (matchIndex !== -1) {
      firstSection = slug.substring(0, matchIndex);
      secondSection = slug.substring(matchIndex);

      if (firstSection === "snp" || firstSection === "ud" || firstSection === "iti") {
        vagga = secondSection.split('.')[0]; // Get the vagga number before the "."
        subDir = `kn/${firstSection}/vagga${vagga}`;
      } else {
        subDir = `kn/${firstSection}`;
      }
    } else {
      subDir = `kn/${firstSection}`;
    }
  } else if (/^(sn|an)\d/i.test(slug)) {
    let nikaya = slug.slice(0, 2);
    let sectionNumber = slug.match(/\d+/)[0];
    let chapter = slug.split('.')[0].substring(2); // Get the chapter number before the "."
    subDir = `${nikaya}/${nikaya}${chapter}`;
  } else {
    subDir = slug.substring(0, slug.search(/\d/));
  }

  const rootResponse = fetch(`suttas/root/${subDir}/${slug}_root-pli-ms.json`).then(response => response.json());
  const translationResponse = fetch(`suttas/translation_en/${subDir}/${slug}_translation-en-anigha.json`).then(response => response.json());
  const htmlResponse = fetch(`suttas/html/${subDir}/${slug}_html.json`).then(response => response.json());
  const commentResponse = fetch(`suttas/comment/${subDir}/${slug}_comment-en-anigha.json`)
    .then(response => {
      if (!response.ok) throw new Error(`Comment file not found for ${slug}`);
      return response.json();
    })
    .catch(error => {
      console.warn(error.message);
      return {}; // Return an empty object if the comment file is not found
    });

  let alt_translator;
  const authors = fetch(`authors.json`).then(response => response.json());
  //   alt_translator = authors[slug];
  //   if (alt_translator) translator = alt_translator;
    
  // });
  // Get root, translation and html jsons from folder
  Promise.all([htmlResponse, rootResponse, translationResponse, commentResponse, authors])
    .then(responses => {
      const [html_text, root_text, translation_text, comment_text, authors_text] = responses;
      const keys_order = Object.keys(html_text)
      keys_order.forEach(segment => {

        if (translation_text[segment] === undefined) {
          translation_text[segment] = "";
        }
        let [openHtml, closeHtml] = html_text[segment].split(/{}/);
        // openHtml = openHtml.replace(/^<span class='verse-line'>/, "<br><span class='verse-line'>");

        if (window.addBreaks === true) {
          openHtml = openHtml.replace(/^<span class='verse-line'>/, "<br><span class='verse-line'>");
        }

        html += `${openHtml}<span class="segment" id="${segment}">` +
          `<span class="pli-lang" lang="pi">${root_text[segment] || ""}</span>` +
          `<span class="eng-lang" lang="en">${translation_text[segment]}` +
          `${comment_text[segment] ? `<span class="comment">*<span class="comment-text" style="display: none;">${converter.makeHtml(comment_text[segment]).replace(/^<p>(.*)<\/p>$/, '$1')}</span></span>` : ""}` +
          `</span></span>${closeHtml}\n\n`;
      });
      //console.log(html);
      
      if (authors_text[slug]) translator = authors_text[slug];
      const translatorByline = `<div class="byline"><p>Translated by ${translator}</p></div>`;
      suttaArea.innerHTML = `<p class="sc-link"></p>` + html + translatorByline;
      

      let acronym = slug.replace(/([a-zA-Z]{2})(\d+)/, '$1 $2')
      if (subDir.slice(0,2) !== 'kn') {
        acronym = acronym.toUpperCase();
      }
      else {
        acronym = acronym.charAt(0).toUpperCase() + acronym.slice(1);
      }

      // TODO fix the way these pages are rendered
      if (slug.toLowerCase().includes("sn") || slug.toLowerCase().includes("an")) 
        document.title = `${acronym} ${root_text[`${slug}:0.3`]}: ${translation_text[`${slug}:0.3`]}`;
      else 
        document.title = `${acronym} ${root_text[`${slug}:0.2`]}: ${translation_text[`${slug}:0.2`]}`;
      toggleThePali();

      let incrementedAcronym = changeAcronymNumber(acronym, 1);
      let decrementedAcronym = changeAcronymNumber(acronym, -1);

      const previousSuttaTitle = getSuttaTitleById(decrementedAcronym);
      const nextSuttaTitle = getSuttaTitleById(incrementedAcronym);
      next.innerHTML = nextSuttaTitle ? `<a href="?q=${incrementedAcronym.toLowerCase()}">${nextSuttaTitle}<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" id="body_1" width="15" height="11">

        <g transform="matrix(0.021484375 0 0 0.021484375 2 -0)">
          <g>
                <path d="M202.1 450C 196.03278 449.9987 190.56381 446.34256 188.24348 440.73654C 185.92316 435.13055 187.20845 428.67883 191.5 424.39L191.5 424.39L365.79 250.1L191.5 75.81C 185.81535 69.92433 185.89662 60.568687 191.68266 54.782654C 197.46869 48.996624 206.82434 48.91536 212.71 54.6L212.71 54.6L397.61 239.5C 403.4657 245.3575 403.4657 254.8525 397.61 260.71L397.61 260.71L212.70999 445.61C 209.89557 448.4226 206.07895 450.0018 202.1 450z" stroke="none" fill="#8f8f8f" fill-rule="nonzero" />
          </g>
        </g>
        </svg></a>`
        : "";
      previous.innerHTML = previousSuttaTitle ? `<a href="?q=${decrementedAcronym.toLowerCase()}"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" id="body_1" width="15" height="11">

        <g transform="matrix(0.021484375 0 0 0.021484375 2 -0)">
          <g>
                <path d="M353 450C 349.02106 450.0018 345.20444 448.4226 342.39 445.61L342.39 445.61L157.5 260.71C 151.64429 254.8525 151.64429 245.3575 157.5 239.5L157.5 239.5L342.39 54.6C 346.1788 50.809414 351.70206 49.328068 356.8792 50.713974C 362.05634 52.099876 366.10086 56.14248 367.4892 61.318974C 368.87753 66.49547 367.3988 72.01941 363.61002 75.81L363.61002 75.81L189.32 250.1L363.61 424.39C 367.90283 428.6801 369.18747 435.13425 366.8646 440.74118C 364.5417 446.34808 359.06903 450.00275 353 450z" stroke="none" fill="#8f8f8f" fill-rule="nonzero" />
          </g>
        </g>
        </svg>${previousSuttaTitle}</a>`
        : "";
      // render comments
      const commentElements = document.querySelectorAll('.comment');
      let currentlyOpenTooltip = null; // Track the currently open tooltip
      commentElements.forEach(element => {
        let commentTextSpan = element.querySelector('.comment-text')

        // Event listeners for showing/hiding the tooltip
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          if (currentlyOpenTooltip && currentlyOpenTooltip !== commentTextSpan) {
            currentlyOpenTooltip.style.display = 'none'; // Hide the previously shown tooltip
          }
          commentTextSpan.style.display = 'block';
          currentlyOpenTooltip = commentTextSpan; // Update the currently open tooltip
        });

        document.addEventListener('click', (event) => {
          if (!commentTextSpan.contains(event.target)) {
            commentTextSpan.style.display = 'none';
            if (currentlyOpenTooltip === commentTextSpan) {
              currentlyOpenTooltip = null; // Reset the tracker if the current tooltip is being hidden
            }
          }
        });

      });

      // remove download and info button
      const cacheButton = document.getElementById('cacheButton');
      const infoButton = document.getElementById('infoButton');
      if (cacheButton) cacheButton.style.display = 'none';
      if (infoButton) infoButton.style.display = 'none';
      // scroll to the quote in the url if present
      scrollToHash();
    })
    .catch(error => {
      suttaArea.innerHTML = `<p>Sorry, "${decodeURIComponent(slug)}" is not a valid sutta citation.

    <br><br>Note: Make sure the citation code is correct. Otherwise try finding the sutta from the home page.<br>`;
    });
}

// initialize the whole app
if (document.location.search) {
  //console.log(document.location.search);
  buildSutta(document.location.search.replace("?q=", "").replace(/\s/g, "").replace(/%20/g, ""));
} else {
  displaySuttas(availableSuttasArray);
}


window.addEventListener('hashchange', function () {
  scrollToHash();
});

