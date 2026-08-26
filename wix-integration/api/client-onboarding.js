const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

const PANTRY_ITEMS = [
  'Olive Oil', 'Avocado Oil', 'Sesame Oil', 'Kosher Salt', 'Eggs',
  'Sesame Seeds', 'Onion Powder/Garlic Powder/Basic Seasonings',
  'Apple Cider Vinegar', 'Rice Wine Vinegar', 'Dijon Mustard',
  'Soy Sauce', 'Honey', 'Maple Syrup', 'Miso', 'Quinoa',
  'Brown Rice', 'Jasmine Rice', 'Breadcrumbs', 'Nuts',
];

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

function getField(submissions, label) {
  const want = normalizeLabel(label);
  const field = submissions.find(s => normalizeLabel(s.label) === want);
  return field ? field.value.trim() : '';
}

/**
 * Normalizes a label for tolerant matching: straightens curly apostrophes,
 * collapses whitespace, lowercases. Guards against silent label-match drops.
 */
function normalizeLabel(s) {
  return String(s || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Finds a field by trying a list of candidate labels (normalized match).
 * Returns the first matching field's trimmed value, or '' if none match.
 */
function getFieldFuzzy(submissions, candidates) {
  const wanted = candidates.map(normalizeLabel);
  const field = submissions.find(s => wanted.includes(normalizeLabel(s.label)));
  return field && field.value != null ? String(field.value).trim() : '';
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

// --- Block builders ---

function makeParagraph(boldLabel, text) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [
        { text: { content: `${boldLabel}: ` }, annotations: { bold: true } },
        { text: { content: text } },
      ],
    },
  };
}

function makeLine(text) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: [{ text: { content: text } }] },
  };
}

function makeHeading(text) {
  return {
    object: 'block',
    type: 'heading_3',
    heading_3: { rich_text: [{ text: { content: text } }] },
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
      rich_text: [{ text: { content: text } }],
      is_toggleable: true,
      children,
    },
  };
}

function makeTodo(text, checked) {
  return {
    object: 'block',
    type: 'to_do',
    to_do: { rich_text: [{ text: { content: text } }], checked: !!checked },
  };
}

function makeBullet(text) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: [{ text: { content: text } }] },
  };
}

function makeBoldLabel(text) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ text: { content: text }, annotations: { bold: true } }],
    },
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    console.log('Client onboarding webhook payload:', JSON.stringify(body, null, 2));

    // Normalize once so every label/value is a string. Guards the whole file's
    // label/value reads against null entries (a malformed submission degrades
    // gracefully instead of throwing an opaque 500).
    const submissions = (body.data && Array.isArray(body.data.submissions) ? body.data.submissions : [])
      .filter(s => s && s.label != null)
      .map(s => ({ label: String(s.label), value: s.value == null ? '' : String(s.value) }));

    const name = getField(submissions, 'Name');
    const email = getField(submissions, 'Email');
    const firstName = name.split(' ')[0] || 'Client';
    const phoneRaw = getFieldFuzzy(submissions, ['Phone', 'Phone Number', 'Cell', 'Cell Phone', 'Mobile']);
    const formattedPhone = phoneRaw ? formatPhone(phoneRaw) : '';

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Column values
    const address = getField(submissions, 'Grocery Delivery Address');
    const familySize = getField(submissions, 'How many people will be eating the meals? (adults, children/ages)');
    const allergies = getField(submissions, 'Allergies or dietary restrictions');

    // Preferences fields
    const favoriteFoods = getField(submissions, 'Favorite foods or something you\'d like to incorporate more of');
    const weeklyConsistent = getField(submissions, 'Is there a meal or food you would like consistently each week?');
    const foodPreferences = submissions.find(s => s.label.trim().includes('eating and food preferences'));
    const foodPrefsValue = foodPreferences ? foodPreferences.value.trim() : '';
    const swapEntry = submissions.find(s => s.label.trim().includes('swap from the above'));
    const swapValue = swapEntry ? swapEntry.value.trim() : '';

    // Main body fields
    const packageEntry = submissions.find(s => s.label.trim() === 'Single choice');
    const packageValue = packageEntry ? packageEntry.value.trim() : '';
    const deliveryEntry = submissions.find(s => s.label.trim().includes('handle grocery delivery'));
    const deliveryValue = deliveryEntry ? deliveryEntry.value.trim() : '';
    const pantryLevelEntry = submissions.find(s => s.label.trim().includes('describes your pantry'));
    const pantryLevelValue = pantryLevelEntry ? pantryLevelEntry.value.trim() : '';

    // Checkbox processing
    const checkedPantry = PANTRY_ITEMS.filter(item => getField(submissions, item) === 'Checked');
    const checkedTools = KITCHEN_TOOLS.filter(item => getField(submissions, item) === 'Checked');

    // Menu selections - Wix joins multiple checkbox picks into one comma-separated string
    const menuEntry = submissions.find(s => s.label.trim().startsWith('Please choose 3 meals'));
    const menuChoices = menuEntry ? splitMenuChoices(menuEntry.value.trim()) : [];

    // Drift detection: warn when expected form labels are absent from the payload
    // (a renamed Wix field silently degrades data instead of erroring).
    const presentLabels = new Set(submissions.map(s => normalizeLabel(s.label)));
    const missingPantry = PANTRY_ITEMS.filter(i => !presentLabels.has(normalizeLabel(i)));
    const missingTools = KITCHEN_TOOLS.filter(i => !presentLabels.has(normalizeLabel(i)));
    if (missingPantry.length) console.warn('Onboarding: pantry labels not in payload (possible form drift):', missingPantry);
    if (missingTools.length) console.warn('Onboarding: kitchen labels not in payload (possible form drift):', missingTools);
    const anyMenuMatch = menuEntry && MENU_OPTIONS.some(opt =>
      menuEntry.value.replace(/\s+/g, ' ').includes(opt.replace(/\s+/g, ' ')));
    if (menuEntry && !anyMenuMatch) {
      console.warn('Onboarding: menu selection did not match any MENU_OPTIONS (possible menu drift):', menuEntry.value.trim());
    }

    // --- Properties (exact live schema names; "Allergies  " has two trailing spaces) ---
    const properties = {
      Name: { title: [{ text: { content: `New* ${name}` } }] },
      Email: { rich_text: [{ text: { content: email } }] },
      Status: { select: { name: 'Potential Client' } },
    };
    if (formattedPhone) properties['Phone Numbers'] = { rich_text: [{ text: { content: formattedPhone } }] };
    if (address) properties.Address = { rich_text: [{ text: { content: address } }] };
    if (allergies) properties['Allergies  '] = { rich_text: [{ text: { content: allergies } }] };

    // --- Page body (single atomic create) ---
    const children = [];
    if (packageValue) children.push(makeParagraph('Package', packageValue));
    if (deliveryValue) children.push(makeParagraph('Grocery delivery', deliveryValue));

    // Preferences toggle (Food Preferences + Allergies as nested headings)
    const prefsChildren = [];
    if (familySize) prefsChildren.push(makeParagraph('Family size', familySize));
    prefsChildren.push(makeHeading('Food Preferences:'));
    if (favoriteFoods) prefsChildren.push(makeParagraph('Favorite / more of', favoriteFoods));
    if (weeklyConsistent) prefsChildren.push(makeParagraph('Want consistently', weeklyConsistent));
    if (foodPrefsValue) prefsChildren.push(makeLine(foodPrefsValue));
    prefsChildren.push(makeHeading('Allergies:'));
    if (allergies) prefsChildren.push(makeLine(allergies));
    children.push(makeToggleHeading(`❤️ ${firstName}'s Preferences`, prefsChildren));

    // Kitchen toggle (its own section, above Pantry)
    const kitchenChildren = KITCHEN_TOOLS.map(tool => makeTodo(tool, checkedTools.includes(tool)));
    children.push(makeToggleHeading(`🔪 ${firstName}'s Kitchen`, kitchenChildren));

    // Pantry toggle (Essentials checklist)
    const pantryChildren = [];
    if (pantryLevelValue) pantryChildren.push(makeParagraph('Pantry level', pantryLevelValue));
    pantryChildren.push(makeHeading('Essentials'));
    for (const item of PANTRY_ITEMS) {
      pantryChildren.push(makeTodo(item, checkedPantry.includes(item)));
    }
    children.push(makeToggleHeading(`🍴 ${firstName}'s Pantry`, pantryChildren));

    // First week's menu choices + swaps
    if (menuChoices.length > 0) {
      children.push(makeBoldLabel("First week's menu choices:"));
      children.push(...menuChoices.map(meal => makeBullet(meal)));
    }
    if (swapValue) children.push(makeParagraph('First Menu Swaps', swapValue));

    const created = await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties,
      children,
    });

    res.status(200).json({ success: true, action: 'created', id: created.id });
  } catch (error) {
    console.error('Error processing onboarding:', error);
    res.status(500).json({ error: 'Failed to process onboarding' });
  }
};
