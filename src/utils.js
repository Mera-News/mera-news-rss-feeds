import Parser from 'rss-parser';
import { detectLanguage } from './language-detection.js';

const langNames = new Intl.DisplayNames(['en'], { type: 'language' });

function resolveLanguage(feed) {
  let code = null;
  if (feed.language) {
    code = feed.language.split('-')[0].toLowerCase();
  } else {
    const sample = [
      feed.title,
      feed.description,
      ...(feed.items?.slice(0, 5).map(i => i.title ?? i.contentSnippet ?? '') ?? []),
    ].filter(Boolean).join(' ').slice(0, 1000);
    code = detectLanguage(sample);
  }
  if (!code) return { language_code: null, language_name: null };
  let name = null;
  try { name = langNames.of(code) ?? null; } catch { /* unsupported code */ }
  return { language_code: code, language_name: name };
}

// RSS Parser configuration
const parser = new Parser({
  timeout: 5000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; RSS Feed Validator/1.0)',
  },
});

// Constants
export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
export const PARALLEL_WORKERS = 5;

/**
 * Validates if a feed exists and has been updated within the last 24 hours
 * @param {string} feedUrl - The RSS feed URL to validate
 * @param {string} publicationName - The name of the publication for logging
 * @param {boolean} silent - If true, suppress console output
 * @returns {Promise<boolean>} - True if feed is valid and recent, false otherwise
 */
export async function validateFeed(feedUrl, publicationName, silent = false) {
  const invalid = { isValid: false, language_code: null, language_name: null };
  try {
    const feed = await parser.parseURL(feedUrl);

    // Some publishers (notably Xinhua) publish RSS items with very old or
    // inconsistent timestamps even when the feed itself is live. For those,
    // we trust successful parsing over the freshness heuristic.
    const isTimestampUnreliableFeed =
      /xinhuanet\.com|english\.news\.cn/i.test(feedUrl) ||
      /^xinhua/i.test(publicationName);

    const { language_code, language_name } = resolveLanguage(feed);

    const lastBuildDate = feed.lastBuildDate || feed.pubDate || (feed.items[0] && feed.items[0].pubDate);

    if (!lastBuildDate) {
      if (isTimestampUnreliableFeed) {
        if (!silent) console.log(`✅ [${publicationName}] Valid feed (timestamp unavailable, parse succeeded): ${feedUrl}`);
        return { isValid: true, language_code, language_name };
      }
      if (!silent) console.error(`❌ [${publicationName}] No lastBuildDate found in feed: ${feedUrl}`);
      return invalid;
    }

    const lastUpdate = new Date(lastBuildDate);
    const now = new Date();
    const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);

    if (now - lastUpdate > TWENTY_FOUR_HOURS_MS) {
      if (isTimestampUnreliableFeed) {
        if (!silent) console.log(`✅ [${publicationName}] Valid feed (timestamps stale, parse succeeded): ${feedUrl}`);
        return { isValid: true, language_code, language_name };
      }
      if (!silent) console.error(`❌ [${publicationName}] Feed outdated (${hoursSinceUpdate.toFixed(1)} hours old): ${feedUrl}`);
      return invalid;
    }

    if (!silent) console.log(`✅ [${publicationName}] Valid feed (updated ${hoursSinceUpdate.toFixed(1)} hours ago)`);
    return { isValid: true, language_code, language_name };

  } catch (error) {
    if (!silent) {
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        console.error(`❌ [${publicationName}] Feed URL not reachable: ${feedUrl}`);
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        console.error(`❌ [${publicationName}] Feed request timeout: ${feedUrl}`);
      } else {
        console.error(`❌ [${publicationName}] Error validating feed: ${feedUrl} - ${error.message}`);
      }
    }
    return invalid;
  }
}

/**
 * Generates statistics block for the README
 * @param {number} countriesWithValidFeeds - Number of countries with at least one valid feed
 * @param {number} totalFeeds - Total number of publications parsed
 * @param {number} validFeeds - Number of valid feeds
 * @returns {string} - The statistics markdown block
 */
export function generateStatisticsBlock(countriesWithValidFeeds, totalFeeds, validFeeds) {
  const invalidFeeds = totalFeeds - validFeeds;
  const successRate = ((validFeeds / totalFeeds) * 100).toFixed(1);

  return `## Statistics

\`\`\`
Countries with valid feeds: ${countriesWithValidFeeds}
Total publications parsed: ${totalFeeds}
Valid feeds (✅): ${validFeeds}
Invalid/Outdated feeds (❌): ${invalidFeeds}
Success rate: ${successRate}%
\`\`\`
`;
}

