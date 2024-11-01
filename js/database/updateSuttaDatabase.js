import db from "../dexie/dexie.js";
import suttasCount from '../../python/generated/suttas-count.js'

export default function updateSuttaDatabase()
{
  db.suttas_en.count().then((count) => {
    const isEmpty = count === 0;
    const isDataMissing = suttasCount > count;

    if (isEmpty || isDataMissing) {
      function generateSortKey(id) {
        return id.match(/\d+|\D+/g)
          .map(chunk => isNaN(chunk) ? chunk : chunk.padStart(4, '0')) // Zero-padding for numeric order
          .join('');
      }
      
      fetch("../../python/generated/suttas-database-data.json")
        .then((response) => response.json())
        .then((suttas) => {
          let suttasData = suttas;
      
          const dataEn = [];
          const dataPl = [];
      
          Object.entries(suttasData).forEach(([key, value]) => {
            const enEntry = {
              id: key,
              translation_en_anigha: value.translation_en_anigha || null,
              heading: value.heading || null,
              comment: value.comment || null,
              sortKey: generateSortKey(key),  // Add sort key
            };
      
            const plEntry = {
              id: key,
              root_pli_ms: value.root_pli_ms || null,
              sortKey: generateSortKey(key),  // Add sort key
            };
      
            dataEn.push(enEntry);
            dataPl.push(plEntry);
          });
      
          // Insert data in tables 
          db.suttas_en.bulkPut(dataEn);
          db.suttas_pl.bulkPut(dataPl);
        })
        .catch((error) => {
          console.error("[ERROR] Failed to load suttas data:", error);
        });

    } else {
      console.log("[INFO] Database is up to date. Skipped import.");
    }
  }).catch((error) => {
    console.error("[ERROR] Failed to check data count:", error);
  });
}
