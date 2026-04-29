const SHOPIFY_API_URL = `https://${process.env.SHOPIFY_STORE}/admin/api/2024-07/graphql.json`;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://oxfordpennant.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { file_reference } = req.body;

    if (!file_reference) {
      return res.status(400).json({ error: 'file_reference is required' });
    }

    const query = `
      query getMedia($id: ID!) {
        node(id: $id) {
          id
          __typename
          ... on MediaImage {
            image { url }
          }
          ... on GenericFile {
            url
          }
        }
      }
    `;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      response = await fetch(SHOPIFY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query, variables: { id: file_reference } }),
        signal: controller.signal,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to reach Shopify API', details: err.message });
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      return res.status(500).json({ error: 'Invalid JSON from Shopify', raw: text });
    }

    if (result.errors) {
      return res.status(500).json({ error: 'Shopify GraphQL error', details: result.errors });
    }

    const node = result.data?.node;
    if (!node) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const mediaUrl = node.image?.url || node.url || null;
    if (!mediaUrl) {
      return res.status(500).json({ error: 'Could not extract media URL', node });
    }

    return res.json({ success: true, mediaId: node.id, mediaUrl });

  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};
