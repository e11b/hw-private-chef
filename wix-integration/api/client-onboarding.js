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

const KITCHEN_TOOLS = [
  'Pots and Pans', 'Large and Medium Tupperware', 'Sheet Trays',
  'Mixing Bowls and Cutting Boards', 'Tin Foil', 'Parchment Paper',
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
  const field = submissions.find(s => s.label.trim() === label);
  return field ? field.value.trim() : '';
}

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

function makeHeading(text) {
  return {
    object: 'block',
    type: 'heading_3',
    heading_3: {
      rich_text: [{ text: { content: text } }],
    },
  };
}

function makeBullet(text) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: [{ text: { content: text } }],
    },
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
    const body = req.body;
    console.log('Client onboarding webhook payload:', JSON.stringify(body, null, 2));

    const submissions = body.data && body.data.submissions ? body.data.submissions : [];

    const name = getField(submissions, 'Name');
    const email = getField(submissions, 'Email');
    const firstName = name.split(' ')[0];

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Search for existing client by email
    const searchResults = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        property: 'Email',
        rich_text: { equals: email },
      },
    });

    // DB column updates
    const properties = {};
    const address = getField(submissions, 'Grocery Delivery Address');
    const familySize = getField(submissions, 'How many people will be eating the meals? (adults, children/ages)');
    const allergies = getField(submissions, 'Allergies or dietary restrictions');
    if (address) properties.Address = { rich_text: [{ text: { content: address } }] };
    if (familySize) properties['Family Size'] = { rich_text: [{ text: { content: familySize } }] };
    if (allergies) properties.Allergies = { rich_text: [{ text: { content: allergies } }] };

    // Preferences fields
    const favoriteFoods = getField(submissions, 'Favorite foods or something you\'d like to incorporate more of');
    const weeklyConsistent = getField(submissions, 'Is there a meal or food you would like consistently each week?');
    const foodPreferences = submissions.find(s => s.label.trim().includes('eating and food preferences'));
    const foodPrefsValue = foodPreferences ? foodPreferences.value.trim() : '';
    const swapEntry = submissions.find(s => s.label.trim().includes('swap from the above'));
    const swapValue = swapEntry ? swapEntry.value.trim() : '';

    // Checkbox processing
    const checkedPantry = PANTRY_ITEMS.filter(item => getField(submissions, item) === 'Checked');
    const uncheckedPantry = PANTRY_ITEMS.filter(item => !checkedPantry.includes(item));
    const checkedTools = KITCHEN_TOOLS.filter(item => getField(submissions, item) === 'Checked');
    const uncheckedTools = KITCHEN_TOOLS.filter(item => !checkedTools.includes(item));

    // Main body fields
    const packageEntry = submissions.find(s => s.label.trim() === 'Single choice');
    const packageValue = packageEntry ? packageEntry.value.trim() : '';
    const deliveryEntry = submissions.find(s => s.label.trim().includes('handle grocery delivery'));
    const deliveryValue = deliveryEntry ? deliveryEntry.value.trim() : '';
    const pantryLevelEntry = submissions.find(s => s.label.trim().includes('describes your pantry'));
    const pantryLevelValue = pantryLevelEntry ? pantryLevelEntry.value.trim() : '';

    // Menu selections - Wix joins multiple checkbox picks into one comma-separated string
    const menuEntry = submissions.find(s => s.label.trim().startsWith('Please choose 3 meals'));
    const menuChoices = menuEntry ? splitMenuChoices(menuEntry.value.trim()) : [];

    // --- Determine client page ID ---
    let clientPageId;

    if (searchResults.results.length > 0) {
      clientPageId = searchResults.results[0].id;
      if (Object.keys(properties).length > 0) {
        await notion.pages.update({ page_id: clientPageId, properties });
      }
    } else {
      const newPage = await notion.pages.create({
        parent: { database_id: DATABASE_ID },
        properties: {
          Name: { title: [{ text: { content: `New* ${name}` } }] },
          Email: { rich_text: [{ text: { content: email } }] },
          ...properties,
        },
      });
      clientPageId = newPage.id;
    }

    // --- Step 1: Append Package + Grocery delivery to main body ---
    const topBlocks = [];
    if (packageValue) topBlocks.push(makeParagraph('Package', packageValue));
    if (deliveryValue) topBlocks.push(makeParagraph('Grocery delivery', deliveryValue));

    if (topBlocks.length > 0) {
      await notion.blocks.children.append({
        block_id: clientPageId,
        children: topBlocks,
      });
    }

    // --- Step 2: Create Preferences sub-page ---
    const prefsChildren = [];
    if (allergies) prefsChildren.push(makeParagraph('Allergies', allergies));
    if (swapValue) prefsChildren.push(makeParagraph('Dislikes/Avoid', swapValue));
    if (favoriteFoods) prefsChildren.push(makeParagraph('Favorite Foods/More of', favoriteFoods));
    if (weeklyConsistent) prefsChildren.push(makeParagraph('Want consistently each week', weeklyConsistent));
    if (foodPrefsValue) prefsChildren.push(makeParagraph('Eating/Food Preferences', foodPrefsValue));

    await notion.pages.create({
      parent: { page_id: clientPageId },
      icon: { type: 'emoji', emoji: '❤️' },
      properties: {
        title: [{ text: { content: `${firstName}'s Preferences` } }],
      },
      children: prefsChildren,
    });

    // --- Step 3: Create Pantry sub-page ---
    const pantryChildren = [];
    if (pantryLevelValue) pantryChildren.push(makeParagraph('Pantry level', pantryLevelValue));

    // Pantry items section
    pantryChildren.push(makeHeading('Pantry Items'));
    if (checkedPantry.length > 0) {
      pantryChildren.push(makeBoldLabel('In Stock:'));
      for (const item of checkedPantry) {
        pantryChildren.push(makeBullet(item));
      }
    }
    if (uncheckedPantry.length > 0) {
      pantryChildren.push(makeBoldLabel('Needs:'));
      for (const item of uncheckedPantry) {
        pantryChildren.push(makeBullet(item));
      }
    }

    // Kitchen tools section
    pantryChildren.push(makeHeading('Kitchen Items'));
    if (checkedTools.length > 0) {
      pantryChildren.push(makeBoldLabel('In Stock:'));
      for (const item of checkedTools) {
        pantryChildren.push(makeBullet(item));
      }
    }
    if (uncheckedTools.length > 0) {
      pantryChildren.push(makeBoldLabel('Needs:'));
      for (const item of uncheckedTools) {
        pantryChildren.push(makeBullet(item));
      }
    }

    await notion.pages.create({
      parent: { page_id: clientPageId },
      icon: { type: 'emoji', emoji: '🍴' },
      properties: {
        title: [{ text: { content: `${firstName}'s Pantry` } }],
      },
      children: pantryChildren,
    });

    // --- Step 4: Append First week's menu choices ---
    if (menuChoices.length > 0) {
      const menuBlocks = [
        makeBoldLabel("First week's menu choices:"),
        ...menuChoices.map(meal => makeBullet(meal)),
      ];
      await notion.blocks.children.append({
        block_id: clientPageId,
        children: menuBlocks,
      });
    }

    res.status(200).json({ success: true, action: searchResults.results.length > 0 ? 'updated' : 'created' });
  } catch (error) {
    console.error('Error processing onboarding:', error);
    res.status(500).json({ error: 'Failed to process onboarding' });
  }
};
