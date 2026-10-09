const { Client } = require('@notionhq/client');

// Bounded timeouts: the SDK default (60s per call, retry-after waits up to 60s)
// can outlast Wix's webhook timeout, and a Wix retry creates a duplicate row.
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  timeoutMs: 10000,
  retry: { maxRetries: 2, maxRetryDelayMs: 3000 },
});
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

// Weekly Schedule Archive (one row per client cook day). Each new client page gets a
// linked view of it filtered to that client, like Haley's hand-built ones (Ana, Gareth).
// Properties are referenced by id so renames in Notion don't break the view.
const ARCHIVE_DATA_SOURCE_ID = '3a7f9bcd-7056-8029-9c24-000b22ab808a';
const ARCHIVE_PROP = {
  client: '%5ECMD', // 🧑‍🤝‍🧑 Client Rolodex (relation)
  cookDate: '~mRz', // Cook Date
  menu: 'O~pn', // Menu
  clientDate: 'title', // Client_Date
};
const MENU_ARCHIVES_TITLE = '📋 Menu Archives';
const MENU_ARCHIVES_PLACEHOLDER = '⚠️ Archive view was not set up automatically. If a Weekly Schedule Archive table sits right below this toggle, drag it in here; otherwise add a linked view of Weekly Schedule Archive filtered to this client.';
// Past this age the post-create steps (pantry copy, archive view) are skipped; their
// placeholders then tell Haley to finish by hand.
const POST_CREATE_DEADLINE_MS = 20000;

// Haley's master pantry list, a row in Client Rolodex. Read on every submission, so
// her edits to it apply to the next new client with no code change.
const PANTRY_TEMPLATE_PAGE_ID = '3f3f9bcd-7056-80b6-b5ee-e5ed63f8ee93';
const PANTRY_TEMPLATE_READ_TIMEOUT_MS = 5000;
const PANTRY_PLACEHOLDER_START = "⚠️ Pantry list wasn't copied";
// The only tags the template's markdown may hold. Anything else (a sub-page, linked
// view, mention, callout, table) is refused, as are images: a markdown write moves a
// sub-page or view out of the template instead of copying it, and the rest is untested.
const PANTRY_TEMPLATE_TAG_RE = /^(<br\s*\/?>|<span( (color|underline)="[a-z_]+")+>|<\/span>|<empty-block\/>)$/;
// Form checkbox -> template item names, used only when the template has no item
// with the checkbox's own name.
const PANTRY_ALIASES = {
  'Rice Wine Vinegar': ['Rice Vinegar'],
  'Dijon Mustard': ['Dijon'],
  'Flour': ['AP Flour'],
  'Breadcrumbs': ['Regular Breadcrumbs'],
  'Sugar': ['Brown Sugar'],
  'Tin Foil': ['Tinfoil'],
};

const CENSUS_GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/locations/address';
const GEOCODE_TIMEOUT_MS = 5000;

// Notion rejects any single rich_text object over 2000 characters, on every retry.
const RICH_TEXT_LIMIT = 2000;

// 13+ digits joined by up to 3 non-letter characters (any spacing/punctuation, any
// digit script): a card number or other long number. richText() hides these in every
// piece of text written to Notion, and the payload log hides them too, so a full card
// number typed into any field never lands in Notion (Card rolls up into every Weekly
// Schedule Archive row) or the logs.
const LONG_NUMBER_RE = /\p{Nd}(?:[^\p{L}\p{Nd}]{0,3}\p{Nd}){12,}/gu;
const STATUS_PROP_ID = 'iPH~'; // Client Rolodex "Status", by id for the fallback row

const STATE_CODES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY',
  louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA',
  washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};

// Wix form splits "Mixing Bowls" and "Cutting Boards" into two separate checkboxes.
const KITCHEN_TOOLS = [
  'Pots and Pans', 'Large and Medium Tupperware', 'Sheet Trays',
  'Mixing Bowls', 'Cutting Boards', 'Tin Foil', 'Parchment Paper',
  'Rice Cooker or Instapot', 'Blender',
];

// Known menu options from the Wix form (update when Haley changes the menu)
const MENU_OPTIONS = [
  'Lemon Honey Salmon, Mini Roasted Potatoes and Greek Salad (mixed greens, tomatoes, cucumbers, feta, shallots, parsley, mint) with a Lemon Herb Vinaigrette',
  'Miso Shrimp with Roasted Broccoli and Sesame Scallion Jasmine Rice',
  'Beef and Black Bean Chili (corn, peppers, onions) Homemade Tortilla Strips with Lime Greek Yogurt Topping',
  'Steak Taco Bowls - Lime Cumin Skirt Steak, Roasted Peppers and Onions, Brown Rice and Avocado Crema',
  'Roasted Chicken Breasts (skin-on bone-in) with Brussels Sprout Quinoa Salad (Roasted Carrots, Goat Cheese, Nuts, Herbs, Craisins)',
  'Maple Dijon Salmon, Roasted Delicata Squash and Side of Herby Couscous',
  'Italian Turkey Meatballs with Red Sauce and Basil, Roasted Asparagus and Spaghetti (or sub. spaghetti squash)',
  'Veggie Packed Beef Bolognese (onion, carrot, celery, spinach, red wine, herbs) with Side of Pasta',
  'Pan Seared Chicken Thighs (boneless) with Sautéed Asparagus and side of Lemon Parm Arugula Orzo',
];

/**
 * Splits a Wix combined checkbox string into individual menu items
 * by matching against known options (needed because meals contain commas)
 */
function splitMenuChoices(combined) {
  const normalized = combined.replace(/\s+/g, ' ');
  const matches = MENU_OPTIONS.filter(opt =>
    normalized.includes(opt.replace(/\s+/g, ' '))
  );
  return matches.length > 0 ? matches : [combined];
}

/**
 * Normalizes a label for tolerant matching: straightens curly apostrophes,
 * collapses whitespace, lowercases. Guards against silent label-match drops.
 */
function normalizeLabel(s) {
  return String(s || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Label lookups over one submission that remember which answers were used, so
 * anything the code doesn't map lands in "Other form answers" instead of being dropped.
 * Each lookup returns the first matching answer's trimmed value, or '' if none match.
 */
function makeReader(submissions) {
  const used = new Set();
  const take = entry => {
    if (!entry) return '';
    used.add(entry);
    return entry.value.trim();
  };
  return {
    exact: label => take(submissions.find(s => normalizeLabel(s.label) === normalizeLabel(label))),
    anyOf: labels => {
      const wanted = labels.map(normalizeLabel);
      return take(submissions.find(s => wanted.includes(normalizeLabel(s.label))));
    },
    where: test => take(submissions.find(s => test(normalizeLabel(s.label)))),
    // Every ticked checkbox matching the label test, as trimmed labels
    ticked: test => submissions.filter(s => s.value.trim() === 'Checked' && test(normalizeLabel(s.label)))
      .map(s => { used.add(s); return s.label.trim(); }),
    unused: () => submissions.filter(s => !used.has(s) && s.value.trim() && s.value.trim() !== 'Not checked'),
  };
}

/**
 * Formats a phone number by stripping the +1 prefix and formatting as (xxx) xxx-xxxx.
 * Copied from new-client.js (serverless functions cannot share imports).
 */
function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length === 10) {
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return local;
}

/** Replaces any long number (possible card number) with "[number hidden]". */
function hideLongNumbers(text) {
  return String(text).replace(LONG_NUMBER_RE, '[number hidden]');
}

/** "241 5th ave, unit 11a, new york, ny 10001" from the form's five address fields. */
function composeAddress({ street, apt, city, state, zip }) {
  return [street, apt, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

function toStateCode(s) {
  const t = String(s || '').trim();
  if (/^[a-z]{2}$/i.test(t)) return t.toUpperCase();
  return STATE_CODES[t.toLowerCase()] || t.toUpperCase();
}

/**
 * Looks up map coordinates for the Client Map (Notion's place property requires
 * lat/lon; the API won't geocode an address). Returns null on any doubt, which
 * leaves Location blank for Haley to set by hand.
 */
async function geocode({ street, city, state, zip }) {
  if (!street || !state || !(zip || city)) return null;
  const query = Object.entries({ street, city, state, zip }).filter(([, v]) => v);
  const params = new URLSearchParams([...query, ['benchmark', 'Public_AR_Current'], ['format', 'json']]);
  try {
    const res = await fetch(`${CENSUS_GEOCODER_URL}?${params}`, { signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS) });
    if (!res.ok) {
      console.warn('Onboarding: geocoder HTTP status', res.status);
      return null;
    }
    const body = await res.json();
    const matches = (body.result && body.result.addressMatches) || [];
    const distinct = new Set(matches.map(m => m.matchedAddress));
    const match = matches[0];
    // Gate: exactly one address, in the state the client typed. Without a zip the
    // geocoder has returned a confident match in another state (5th Ave, NY -> Kansas).
    if (distinct.size !== 1 || toStateCode(match.addressComponents && match.addressComponents.state) !== toStateCode(state)) {
      console.warn('Onboarding: geocode rejected:', JSON.stringify({ matches: [...distinct].slice(0, 3), state }));
      return null;
    }
    return { lat: match.coordinates.y, lon: match.coordinates.x };
  } catch (err) {
    console.warn('Onboarding: geocode failed:', err.name, err.message);
    return null;
  }
}

/**
 * Reads the master pantry template as markdown. Returns null (the pantry placeholder
 * then stays on the page) when it can't be read in time, came back partial, or holds
 * any tag outside PANTRY_TEMPLATE_TAG_RE.
 */
async function readPantryTemplate() {
  let timer;
  try {
    const res = await Promise.race([
      notion.pages.retrieveMarkdown({ page_id: PANTRY_TEMPLATE_PAGE_ID }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), PANTRY_TEMPLATE_READ_TIMEOUT_MS);
      }),
    ]);
    const markdown = res.markdown || '';
    // Tags only, not an escaped "\<" in item text
    const badTag = (markdown.match(/(?<!\\)<[^>\n]*>/g) || []).find(t => !PANTRY_TEMPLATE_TAG_RE.test(t));
    const unknownBlocks = (res.unknown_block_ids || []).length;
    const hasImage = /^\t*!\[/m.test(markdown);
    if (res.truncated || unknownBlocks || badTag || hasImage || !/^\t*- \[[ xX]\](\s|$)/m.test(markdown)) {
      console.warn('Onboarding: pantry template not usable:', JSON.stringify({ truncated: res.truncated, unknownBlocks, badTag: badTag && badTag.slice(0, 80), hasImage }));
      return null;
    }
    return markdown;
  } catch (err) {
    console.warn('Onboarding: pantry template not read:', err && (err.code || err.name), err && err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Unchecks every item in the template, then checks each ticked form box: the
 * template items with the box's own name, else its PANTRY_ALIASES names.
 * Returns the filled markdown and the ticked pantry boxes no item matched.
 */
function fillPantryTemplate(markdown, tickedPantry, tickedKitchen) {
  const lines = markdown.split('\n');
  const items = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(\t*- \[)[ xX](\])(\s.*|)$/);
    if (!m) return;
    lines[i] = `${m[1]} ${m[2]}${m[3]}`;
    // Item name without inline markup or a block color, e.g. '**Olive Oil** {color="red"}' -> "olive oil"
    const name = m[3].replace(/\s*\{[^{}]*\}\s*$/, '').replace(/<[^>]*>/g, '').replace(/[*~`\\]/g, '');
    items.push({ i, key: normalizeLabel(name) });
  });
  const matching = name => items.filter(item => item.key === normalizeLabel(name));
  const check = label => {
    const aliasKey = Object.keys(PANTRY_ALIASES).find(k => normalizeLabel(k) === normalizeLabel(label));
    const own = matching(label);
    const hits = own.length || !aliasKey ? own : PANTRY_ALIASES[aliasKey].flatMap(matching);
    for (const item of hits) lines[item.i] = lines[item.i].replace('- [ ]', '- [x]');
    return hits.length > 0;
  };
  const unmatched = tickedPantry.filter(label => !check(label));
  tickedKitchen.forEach(check); // Parchment Paper, Tin Foil are on the template too
  return { markdown: lines.join('\n'), unmatched };
}

// --- Block builders ---

/**
 * All text written to Notion goes through here: hides long numbers, then splits into
 * rich_text objects under Notion's per-object limit (never splits a character).
 */
function richText(text, annotations) {
  const chunks = [];
  let cur = '';
  for (const ch of hideLongNumbers(text)) {
    if (cur.length + ch.length > RICH_TEXT_LIMIT) {
      chunks.push(cur);
      cur = '';
    }
    cur += ch;
  }
  chunks.push(cur);
  return chunks.map(content => (annotations ? { text: { content }, annotations } : { text: { content } }));
}

function makeParagraph(boldLabel, text) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [...richText(`${boldLabel}: `, { bold: true }), ...richText(text)],
    },
  };
}

function makeLine(text) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: richText(text) },
  };
}

function makeHeading(text) {
  return {
    object: 'block',
    type: 'heading_3',
    heading_3: { rich_text: richText(text) },
  };
}

/**
 * A collapsible heading_3 (is_toggleable) holding nested children. Children are
 * one level deep, so the whole page (properties + these toggles) fits in a
 * single pages.create call within Notion's 2-level nesting limit.
 */
function makeToggleHeading(text, children) {
  return {
    object: 'block',
    type: 'heading_3',
    heading_3: {
      rich_text: richText(text),
      is_toggleable: true,
      children,
    },
  };
}

function makeTodo(text, checked) {
  return {
    object: 'block',
    type: 'to_do',
    to_do: { rich_text: richText(text), checked: !!checked },
  };
}

function makeBullet(text) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: richText(text) },
  };
}

function makeBoldLabel(text) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: richText(text, { bold: true }) },
  };
}

function makeCallout(emoji, text) {
  return {
    object: 'block',
    type: 'callout',
    callout: { rich_text: richText(text), icon: { type: 'emoji', emoji } },
  };
}

/**
 * Puts a linked view of the live Weekly Schedule Archive (this client's cook days,
 * newest first, Client_Date + Menu) inside the page's Menu Archives toggle.
 * The API can't create a linked view inside a toggle, so it is created right after
 * the toggle, then moved in by a markdown edit that also deletes the placeholder.
 * Any failure leaves the placeholder in place for Haley. No call starts after the
 * request deadline (one already in flight can still run to its 10s timeout).
 */
async function attachMenuArchive(pageId, deadlineAt) {
  const beforeCall = step => {
    if (Date.now() > deadlineAt) throw new Error(`deadline passed before ${step}`);
  };
  beforeCall('blocks.children.list');
  const top = await notion.blocks.children.list({ block_id: pageId, page_size: 100 });
  const toggle = top.results.find(b =>
    b.type === 'heading_3' && b.heading_3.rich_text.map(t => t.plain_text).join('') === MENU_ARCHIVES_TITLE);
  if (!toggle) throw new Error('Menu Archives toggle not found');

  beforeCall('dataSources.retrieve');
  const archive = await notion.dataSources.retrieve({ data_source_id: ARCHIVE_DATA_SOURCE_ID });
  const visible = [ARCHIVE_PROP.clientDate, ARCHIVE_PROP.menu];
  const hidden = Object.values(archive.properties).map(p => p.id).filter(id => !visible.includes(id));
  beforeCall('views.create');
  const view = await notion.views.create({
    data_source_id: ARCHIVE_DATA_SOURCE_ID,
    name: 'Menus',
    type: 'table',
    create_database: {
      parent: { type: 'page_id', page_id: pageId },
      position: { type: 'after_block', block_id: toggle.id },
    },
    filter: { property: ARCHIVE_PROP.client, relation: { contains: pageId } },
    sorts: [{ property: ARCHIVE_PROP.cookDate, direction: 'descending' }],
    configuration: {
      type: 'table',
      properties: [
        ...visible.map(id => ({ property_id: id, visible: true })),
        ...hidden.map(id => ({ property_id: id, visible: false })),
      ],
    },
  });

  const dbId = view.parent.database_id.replace(/-/g, '');
  beforeCall('pages.retrieveMarkdown');
  const lines = (await notion.pages.retrieveMarkdown({ page_id: pageId })).markdown.split('\n');
  const h = lines.findIndex(l => l.startsWith('#') && l.includes(MENU_ARCHIVES_TITLE));
  const d = lines.findIndex((l, i) => i > h && l.startsWith('<database') && l.includes(dbId));
  // Between the heading and the new view there must only be the toggle's (indented)
  // children, and the view tag must be one complete line, or the edit could move half a tag.
  if (h < 0 || d < 0 || !lines[d].endsWith('</database>') || lines.slice(h + 1, d).some(l => !l.startsWith('\t'))) {
    throw new Error('unexpected markdown layout around Menu Archives');
  }
  beforeCall('pages.updateMarkdown');
  await notion.pages.updateMarkdown({
    page_id: pageId,
    type: 'update_content',
    update_content: {
      content_updates: [{ old_str: lines.slice(h, d + 1).join('\n'), new_str: `${lines[h]}\n\t${lines[d]}` }],
      allow_deleting_content: true,
    },
  });
}

/**
 * Replaces the pantry placeholder line (inside the pantry toggle) with the filled
 * template, in one markdown write: either the whole list lands or the placeholder,
 * which lists the ticked boxes, stays. Skipped past the request deadline.
 */
async function fillPantry(pageId, pantryMarkdown, deadlineAt) {
  const beforeCall = step => {
    if (Date.now() > deadlineAt) throw new Error(`deadline passed before ${step}`);
  };
  beforeCall('pages.retrieveMarkdown');
  const lines = (await notion.pages.retrieveMarkdown({ page_id: pageId })).markdown.split('\n');
  // Read back rather than rebuilt, since Notion may escape characters in the line
  const found = lines.filter(l => l.startsWith(`\t${PANTRY_PLACEHOLDER_START}`));
  if (found.length !== 1) throw new Error(`pantry placeholder found ${found.length} times`);
  beforeCall('pages.updateMarkdown');
  await notion.pages.updateMarkdown({
    page_id: pageId,
    type: 'update_content',
    update_content: {
      // Leading newline anchors the match to the start of the placeholder line
      content_updates: [{ old_str: `\n${found[0]}`, new_str: `\n${pantryMarkdown.split('\n').map(l => `\t${l}`).join('\n')}` }],
      allow_deleting_content: true,
    },
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startedAt = Date.now();
  try {
    const body = req.body || {};
    console.log('Client onboarding webhook payload:', hideLongNumbers(JSON.stringify(body, null, 2)));

    // Normalize once so every label/value is a string. Guards the whole file's
    // label/value reads against null entries (a malformed submission degrades
    // gracefully instead of throwing an opaque 500).
    const submissions = (body.data && Array.isArray(body.data.submissions) ? body.data.submissions : [])
      .filter(s => s && s.label != null)
      .map(s => ({ label: String(s.label), value: s.value == null ? '' : String(s.value) }));
    // Nothing to save (stray POST, Wix test ping): don't create an empty row.
    if (!submissions.some(s => s.value.trim() && s.value.trim() !== 'Not checked')) {
      console.error('Onboarding: no form answers in payload, nothing created');
      return res.status(400).json({ error: 'No form answers in payload' });
    }
    const reader = makeReader(submissions);

    const name = reader.exact('Name');
    const email = reader.exact('Email');
    const firstName = name.split(' ')[0] || 'Client';
    const phoneRaw = reader.anyOf(['Phone', 'Phone Number', 'Cell', 'Cell Phone', 'Mobile']);
    const formattedPhone = phoneRaw ? formatPhone(phoneRaw) : '';

    // Address: five separate fields since the 10/08/26 form update
    const addressParts = {
      street: reader.exact('Street Address'),
      apt: reader.exact('Apt. Number'),
      city: reader.exact('City'),
      state: reader.exact('State'),
      zip: reader.exact('Zip Code'),
    };
    const address = composeAddress(addressParts);
    const cardRaw = reader.where(l => l.startsWith('last 4 # of the credit card'));
    const familySize = reader.exact('How many people will be eating the meals? (adults, children/ages)');
    const allergies = reader.exact('Allergies or dietary restrictions');

    // Preferences fields
    const favoriteFoods = reader.exact('Favorite foods or something you\'d like to incorporate more of');
    const extraWeekly = reader.exact('would you like anything extra added weekly?');
    const foodPrefsValue = reader.where(l => l.includes('eating and food preferences'));
    const swapValue = reader.where(l => l.includes('swap from the above'));

    // Main body fields
    const packageValue = reader.exact('Single choice');
    const deliveryValue = reader.where(l => l.includes('handle grocery delivery'));
    const pantryLevelValue = reader.where(l => l.includes('describes your pantry'));

    // Checkbox processing. Every ticked box that isn't a kitchen tool is a pantry item,
    // matched by name against the live pantry template (no form list to keep in sync).
    const checkedTools = KITCHEN_TOOLS.filter(item => reader.exact(item) === 'Checked');
    const kitchenLabels = KITCHEN_TOOLS.map(normalizeLabel);
    const tickedPantry = reader.ticked(l => !kitchenLabels.includes(l));

    // Menu selections - Wix joins multiple checkbox picks into one comma-separated string
    const menuValue = reader.where(l => l.startsWith('please choose 3 meals'));
    const menuChoices = menuValue ? splitMenuChoices(menuValue) : [];

    // Drift detection: warn when expected form labels are absent from the payload
    // (a renamed Wix field silently degrades data instead of erroring).
    const presentLabels = new Set(submissions.map(s => normalizeLabel(s.label)));
    const missingTools = KITCHEN_TOOLS.filter(i => !presentLabels.has(normalizeLabel(i)));
    if (missingTools.length) console.warn('Onboarding: kitchen labels not in payload (possible form drift):', missingTools);
    const anyMenuMatch = menuValue && MENU_OPTIONS.some(opt =>
      menuValue.replace(/\s+/g, ' ').includes(opt.replace(/\s+/g, ' ')));
    if (menuValue && !anyMenuMatch) {
      console.warn('Onboarding: menu selection did not match any MENU_OPTIONS (possible menu drift):', menuValue);
    }

    // Neither call throws; the template read runs alongside the geocode wait
    const [coords, pantryTemplate] = await Promise.all([
      address ? geocode(addressParts) : null,
      readPantryTemplate(),
    ]);
    const pantry = pantryTemplate ? fillPantryTemplate(pantryTemplate, tickedPantry, checkedTools) : null;

    // Card: the form asks for the last 4 digits. Keep a clean 4-digit answer (or a
    // digit-free note like "paypal"); anything else (full card number, card + expiry)
    // is left blank rather than guessed, since Card rolls up into every Weekly
    // Schedule Archive row the cooks see.
    const cardDigits = cardRaw.replace(/\D/g, '');
    const cardUnclear = cardDigits.length > 0 && cardDigits.length !== 4;
    const card = cardUnclear ? '' : (cardDigits || cardRaw);

    // Notices render as callouts at the top of the page: the row is the only
    // place Haley sees problems (Vercel logs expire after an hour).
    const notices = [];
    if (!email) notices.push(makeCallout('⚠️', 'No email in this submission. Add it by hand.'));
    if (cardUnclear) notices.push(makeCallout('⚠️', "The card answer wasn't just the last 4 digits, so Card was left blank. Check the Wix submission and fill it in."));
    if (!coords) {
      notices.push(makeCallout('📍', address
        ? `Map pin not set automatically for "${address}". Set Location by hand.`
        : 'Map pin not set: no address in this submission.'));
    }

    // --- Properties (exact live schema names; "Allergies  " has two trailing spaces) ---
    const properties = {
      Name: { title: richText(`New* ${name}`) },
      Status: { select: { name: 'Meal Prep Client' } },
    };
    if (email) properties.Email = { rich_text: richText(email) };
    if (formattedPhone) properties['Phone Numbers'] = { rich_text: richText(formattedPhone) };
    if (address) properties.Address = { rich_text: richText(address) };
    if (card) properties.Card = { rich_text: richText(card) };
    if (coords) properties.Location = { place: { lat: coords.lat, lon: coords.lon, name: address, address } };
    if (allergies) properties['Allergies  '] = { rich_text: richText(allergies) };

    // --- Page body (single atomic create) ---
    const children = [...notices];
    if (packageValue) children.push(makeParagraph('Package', packageValue));
    if (deliveryValue) children.push(makeParagraph('Grocery delivery', deliveryValue));

    // Preferences toggle (Food Preferences + Allergies as nested headings)
    const prefsChildren = [];
    if (familySize) prefsChildren.push(makeParagraph('Family size', familySize));
    prefsChildren.push(makeHeading('Food Preferences:'));
    if (favoriteFoods) prefsChildren.push(makeParagraph('Favorite / more of', favoriteFoods));
    if (extraWeekly) prefsChildren.push(makeParagraph('Extra weekly', extraWeekly));
    if (foodPrefsValue) prefsChildren.push(makeLine(foodPrefsValue));
    prefsChildren.push(makeHeading('Allergies:'));
    if (allergies) prefsChildren.push(makeLine(allergies));
    children.push(makeToggleHeading(`❤️ ${firstName}'s Preferences`, prefsChildren));

    // Kitchen toggle (its own section, above Pantry)
    const kitchenChildren = KITCHEN_TOOLS.map(tool => makeTodo(tool, checkedTools.includes(tool)));
    children.push(makeToggleHeading(`🔪 ${firstName}'s Kitchen`, kitchenChildren));

    // Pantry toggle: the template list replaces the placeholder after create (fillPantry).
    // Client-typed text (Pantry level) stays in these JSON blocks, out of the markdown write.
    const pantryChildren = [];
    if (pantryLevelValue) pantryChildren.push(makeParagraph('Pantry level', pantryLevelValue));
    if (pantry && pantry.unmatched.length) {
      pantryChildren.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: richText(`Form also checked (not on the pantry list): ${pantry.unmatched.join(', ')}`, { color: 'pink_background' }) },
      });
    }
    pantryChildren.push(makeLine(`${PANTRY_PLACEHOLDER_START} from "pantry template for wix". Copy it in by hand. Form checked: ${tickedPantry.join(', ') || 'none'}`));
    children.push(makeToggleHeading(`🍴 ${firstName}'s Pantry`, pantryChildren));

    // Menu Archives toggle: the archive view is moved in after create (attachMenuArchive)
    children.push(makeToggleHeading(MENU_ARCHIVES_TITLE, [makeLine(MENU_ARCHIVES_PLACEHOLDER)]));

    // First week's menu choices + swaps
    if (menuChoices.length > 0) {
      children.push(makeBoldLabel("First week's menu choices:"));
      children.push(...menuChoices.map(meal => makeBullet(meal)));
    }
    if (swapValue) children.push(makeParagraph('First Menu Swaps', swapValue));

    // Answers no lookup above used (new or renamed form fields)
    const unused = reader.unused();
    if (unused.length) {
      children.push(makeToggleHeading('📝 Other form answers',
        unused.slice(0, 100).map(s => makeParagraph(s.label.trim(), s.value.trim()))));
    }

    let created;
    try {
      created = await notion.pages.create({
        parent: { database_id: DATABASE_ID },
        properties,
        children,
      });
    } catch (err) {
      // A validation error (e.g. a renamed Notion property) fails the same way on
      // every Wix retry, so save a minimal row Haley can see instead. Timeouts and
      // 5xx stay a 500: Notion may have saved the page, and a duplicate from a Wix
      // retry beats a lost client.
      if (err.code !== 'validation_error') throw err;
      console.error('Onboarding: full create rejected, saving fallback row:', err.message);
      const fallbackChildren = [
        makeCallout('⚠️', `Onboarding import failed Notion validation, so only the raw form answers were saved. Error: ${String(err.message).slice(0, 500)}`),
        ...submissions.filter(s => s.value.trim()).slice(0, 99)
          .map(s => makeParagraph(s.label.trim(), s.value.trim())),
      ];
      const title = { title: richText(`New* ${name || email || 'Unknown'}`) };
      // With Status the row shows in Haley's Meal Prep Clients view; if Status itself
      // is what Notion rejects, save the row without it.
      try {
        created = await notion.pages.create({
          parent: { database_id: DATABASE_ID },
          properties: { title, [STATUS_PROP_ID]: { select: { name: 'Meal Prep Client' } } },
          children: fallbackChildren,
        });
      } catch (statusErr) {
        if (statusErr.code !== 'validation_error') throw statusErr;
        console.error('Onboarding: fallback with Status rejected, saving title-only row:', statusErr.message);
        created = await notion.pages.create({
          parent: { database_id: DATABASE_ID },
          properties: { title },
          children: fallbackChildren,
        });
      }
      return res.status(200).json({ success: true, action: 'created_fallback', id: created.id });
    }

    // The row exists from here on: always answer 200 so Wix doesn't retry into a duplicate.
    // The two steps run in turn (two markdown writes to one page at once is untested).
    const deadlineAt = startedAt + POST_CREATE_DEADLINE_MS;
    if (pantry) {
      try {
        await fillPantry(created.id, pantry.markdown, deadlineAt);
      } catch (err) {
        console.error('Onboarding: pantry list not copied, placeholder left on page:', err && (err.code || err.name), err && err.message);
      }
    }
    try {
      await attachMenuArchive(created.id, deadlineAt);
    } catch (err) {
      console.error('Onboarding: menu archive view not attached, placeholder left on page:', err && (err.code || err.name), err && err.message);
    }
    console.log('Onboarding: done (ms):', Date.now() - startedAt);

    res.status(200).json({ success: true, action: 'created', id: created.id });
  } catch (error) {
    console.error('Error processing onboarding:', error);
    res.status(500).json({ error: 'Failed to process onboarding' });
  }
};
