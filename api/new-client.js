const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

/**
 * Extracts a field value from Wix submissions array by label
 */
function getField(submissions, label) {
  const field = submissions.find(s => s.label === label);
  return field ? field.value : '';
}

/**
 * Formats a phone number by stripping +1 prefix and formatting as (xxx) xxx-xxxx
 */
function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length === 10) {
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return local;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;
    console.log('New client webhook payload:', JSON.stringify(body, null, 2));

    const submissions = body.data && body.data.submissions ? body.data.submissions : [];

    const name = getField(submissions, 'Name');
    const email = getField(submissions, 'Email');
    const phone = getField(submissions, 'Phone');
    const howDidYouHear = getField(submissions, 'How did you hear about me?');
    const briefOverview = getField(submissions, 'Provide a brief overview of what you are looking for');

    const firstName = name.split(' ')[0];
    const formattedPhone = formatPhone(phone);

    const children = [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { text: { content: `${firstName}'s Cell: ` }, annotations: { bold: true } },
            { text: { content: formattedPhone } },
          ],
        },
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { text: { content: 'How did you hear about me? ' }, annotations: { bold: true } },
            { text: { content: howDidYouHear } },
          ],
        },
      },
    ];

    if (briefOverview) {
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { text: { content: 'Brief overview: ' }, annotations: { bold: true } },
            { text: { content: briefOverview } },
          ],
        },
      });
    }

    await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: {
        Name: { title: [{ text: { content: name } }] },
        Email: { rich_text: [{ text: { content: email } }] },
      },
      children,
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error creating Notion entry:', error);
    res.status(500).json({ error: 'Failed to create Notion entry' });
  }
};
