// Wix Form 1 ("Become a client") webhook.
//
// Intentionally a NO-OP: this form no longer creates a Notion entry. Only the
// onboarding form (client-onboarding.js) creates client entries now.
//
// The endpoint is kept (returns 200) so the Wix automation stays green; a 404
// would surface failed-automation errors and retries on Wix's side. Lead
// submissions remain visible in Wix's form-responses dashboard and in the log
// line below.

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Log for lead visibility, but do not write to Notion.
  console.log('Become-a-client webhook (no-op, not written to Notion):', JSON.stringify(req.body));

  return res.status(200).json({ success: true, noop: true });
};
