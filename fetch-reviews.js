const fs = require('fs');
const https = require('https');

const API_KEY = process.env.SEARCHAPI_KEY;
const PLACE_ID = 'ChIJMVlUlSP2xksR4KIdsNGjCZg';

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse response')); }
      });
    }).on('error', reject);
  });
}

async function fetchAllReviews() {
  const allReviews = [];
  let nextToken = null;

  // Max 20 per page (API max). Paginate only when needed.
  for (let page = 0; page < 10; page++) {
    let url = `https://www.searchapi.io/api/v1/search?engine=google_maps_reviews&api_key=${API_KEY}&place_id=${PLACE_ID}&num=20`;
    if (nextToken) {
      url += `&next_page_token=${encodeURIComponent(nextToken)}`;
    }

    console.log(`Fetching page ${page + 1}...`);
    const data = await fetch(url);

    if (data.error) {
      console.error('API error:', data.error);
      break;
    }

    const reviews = data.reviews || [];
    if (reviews.length === 0) break;

    for (const r of reviews) {
      if (r.rating !== 5) continue;

      const fullName = (r.user && r.user.name) || 'Unknown';
      const firstName = fullName.split(/\s+/)[0];
      // Capitalize first letter
      const name = firstName.charAt(0).toUpperCase() + firstName.slice(1);

      const nameParts = fullName.split(/\s+/);
      const lastInitial = nameParts.length > 1 ? nameParts[nameParts.length - 1].charAt(0).toUpperCase() : '';

      allReviews.push({
        name,
        lastInitial,
        rating: r.rating,
        text: (r.snippet || r.text || r.body || '').replace(/<br\s*\/?>/g, ' '),
        date: r.date || '',
        thumbnail: (r.user && r.user.thumbnail) || ''
      });
    }

    nextToken = data.pagination && data.pagination.next_page_token;
    if (!nextToken) break;

    // Small delay between pages
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`Fetched ${allReviews.length} five-star reviews`);
  return allReviews;
}

async function main() {
  try {
    const reviews = await fetchAllReviews();
    if (reviews.length === 0) {
      console.error('No reviews fetched - keeping existing file');
      process.exit(1);
    }
    fs.writeFileSync('reviews.json', JSON.stringify(reviews, null, 2) + '\n');
    console.log('reviews.json updated successfully');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
