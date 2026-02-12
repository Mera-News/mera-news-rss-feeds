#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'database', 'news-feed-list-of-countries.json');

// Read the database
const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

const migrated = {};
let totalOld = 0;
let totalNew = 0;
let groupedCount = 0;
let deduplicatedCount = 0;
const warnings = [];

for (const [countryCode, entries] of Object.entries(data)) {
  const groupMap = new Map();

  for (const entry of entries) {
    totalOld++;
    const websiteUri = entry.publication_website_uri;

    // Build the URI object
    const uriObj = { uri: entry.publication_rss_feed_uri };
    if (entry.category) uriObj.category = entry.category;
    if (entry.bot_protection === true) uriObj.bot_protection = true;

    if (groupMap.has(websiteUri)) {
      const group = groupMap.get(websiteUri);

      // Track name conflicts for warnings
      if (group.publication_name !== entry.publication_name) {
        if (!group._nameConflicts) group._nameConflicts = new Set([group.publication_name]);
        group._nameConflicts.add(entry.publication_name);
      }

      // Deduplicate by RSS feed URI
      const isDuplicate = group.publication_rss_feed_uris.some(
        existing => existing.uri === uriObj.uri
      );

      if (isDuplicate) {
        deduplicatedCount++;
      } else {
        group.publication_rss_feed_uris.push(uriObj);
      }
    } else {
      groupMap.set(websiteUri, {
        publication_name: entry.publication_name,
        publication_website_uri: websiteUri,
        publication_rss_feed_uris: [uriObj]
      });
    }
  }

  // Collect warnings and clean up internal tracking fields
  const groupedEntries = [];
  for (const group of groupMap.values()) {
    if (group._nameConflicts) {
      const names = Array.from(group._nameConflicts);
      warnings.push(
        `WARNING: ${countryCode} | ${group.publication_website_uri} - ${names.length} different names: ${names.join(', ')}`
      );
      delete group._nameConflicts;
    }
    groupedEntries.push(group);
  }

  migrated[countryCode] = groupedEntries;
  totalNew += groupedEntries.length;

  for (const g of groupedEntries) {
    if (g.publication_rss_feed_uris.length > 1) groupedCount++;
  }
}

// Print warnings
if (warnings.length > 0) {
  console.log('\n--- Name conflict warnings (data quality) ---');
  warnings.forEach(w => console.log(w));
  console.log('----------------------------------------------\n');
}

// Write back
fs.writeFileSync(DB_PATH, JSON.stringify(migrated, null, 2) + '\n', 'utf8');

// Count total individual URIs in the migrated data
const totalUris = Object.values(migrated).reduce(
  (sum, pubs) => sum + pubs.reduce((s, p) => s + p.publication_rss_feed_uris.length, 0), 0
);

console.log('Migration complete.');
console.log(`  Old entries: ${totalOld}`);
console.log(`  New entries (publications): ${totalNew}`);
console.log(`  Total individual feed URIs: ${totalUris}`);
console.log(`  Groups with multiple feeds: ${groupedCount}`);
console.log(`  Duplicate URIs removed: ${deduplicatedCount}`);
