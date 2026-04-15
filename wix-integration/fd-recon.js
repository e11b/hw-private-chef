const { chromium } = require('patchright');
const fs = require('fs');

const API_LOG = [];
const INTERESTING_PATTERNS = [
  '/api/', '/graphql', '/gql', '/search', '/cart', '/add', '/product',
  '/checkout', '/order', '/user', '/auth', '/login', '/session',
  '/browse', '/catalog', '/item', '/delivery', '/slot', '/address'
];

function isInteresting(url) {
  const lower = url.toLowerCase();
  // Skip static assets
  if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)(\?|$)/i.test(url)) return false;
  // Skip known analytics/tracking
  if (/(google-analytics|doubleclick|facebook|fbcdn|hotjar|segment|optimizely|newrelic|datadoghq)/i.test(url)) return false;
  // Log all XHR/fetch to freshdirect domains
  if (/freshdirect/i.test(url)) return true;
  // Log anything matching interesting patterns
  return INTERESTING_PATTERNS.some(p => lower.includes(p));
}

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1400,900']
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  // Intercept all requests
  page.on('request', (request) => {
    const url = request.url();
    if (!isInteresting(url)) return;

    const entry = {
      timestamp: new Date().toISOString(),
      method: request.method(),
      url: url,
      resourceType: request.resourceType(),
      headers: request.headers(),
      postData: null
    };

    if (request.method() !== 'GET') {
      try {
        entry.postData = request.postData();
      } catch (e) {}
    }

    API_LOG.push(entry);
    console.log(`[REQ] ${request.method()} ${url.substring(0, 120)}`);
    if (entry.postData) {
      console.log(`  BODY: ${entry.postData.substring(0, 200)}`);
    }
  });

  // Intercept all responses
  page.on('response', async (response) => {
    const url = response.url();
    if (!isInteresting(url)) return;

    const status = response.status();
    const contentType = response.headers()['content-type'] || '';

    // Find matching request entry
    const entry = API_LOG.find(e => e.url === url && !e.responseStatus);
    if (entry) {
      entry.responseStatus = status;
      entry.responseContentType = contentType;
    }

    // Try to capture JSON responses
    if (contentType.includes('json')) {
      try {
        const body = await response.text();
        if (entry) entry.responseBody = body.substring(0, 2000);
        console.log(`[RES] ${status} ${url.substring(0, 120)}`);
        console.log(`  JSON: ${body.substring(0, 300)}`);
      } catch (e) {}
    } else {
      console.log(`[RES] ${status} ${url.substring(0, 120)} (${contentType.split(';')[0]})`);
    }
  });

  console.log('\n=== FRESH DIRECT API RECON ===');
  console.log('Opening freshdirect.com...');
  console.log('Instructions:');
  console.log('  1. Log in manually when the page loads');
  console.log('  2. Search for a product (e.g. "chicken thighs")');
  console.log('  3. Add something to cart');
  console.log('  4. Open the cart');
  console.log('  5. Press Ctrl+C when done - API log saves to fd-api-log.json\n');

  await page.goto('https://www.freshdirect.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Save log on exit
  process.on('SIGINT', () => {
    console.log(`\n\nSaving ${API_LOG.length} captured API calls to fd-api-log.json...`);
    fs.writeFileSync(
      '/Users/ericjung/Desktop/Apps/HW Private Chef/fd-api-log.json',
      JSON.stringify(API_LOG, null, 2)
    );
    console.log('Done. Closing browser.');
    browser.close().then(() => process.exit(0));
  });

  // Keep alive
  await new Promise(() => {});
})();
