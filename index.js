require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: 'https://oxfordpennant.com',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));
app.options('/{*path}', cors());
app.use(express.json());

const SHOPIFY_API_URL = `https://${process.env.SHOPIFY_STORE}/admin/api/2024-07/graphql.json`;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;


// Route
app.post('/api/get-media', async (req, res) => {
  try {
    console.log("📥 Incoming data:", req.body);

    const { file_reference } = req.body;

    if (!file_reference) {
      return res.status(400).json({
        error: 'file_reference is required'
      });
    }

    // GraphQL query
    const query = `
      query getMedia($id: ID!) {
        node(id: $id) {
          id
          __typename
          ... on MediaImage {
            image {
              url
            }
          }
          ... on GenericFile {
            url
          }
        }
      }
    `;

    // Timeout controller
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
        body: JSON.stringify({
          query,
          variables: { id: file_reference },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      console.error("❌ Fetch error:", err);
      return res.status(500).json({
        error: 'Failed to reach Shopify API',
        details: err.message
      });
    } finally {
      clearTimeout(timeout);
    }

    console.log("📡 Shopify status:", response.status);

    const text = await response.text();
    console.log("📦 Raw Shopify response:", text);

    let result;

    try {
      result = JSON.parse(text);
    } catch (err) {
      return res.status(500).json({
        error: 'Invalid JSON from Shopify',
        raw: text
      });
    }

    if (result.errors) {
      console.error("❌ GraphQL errors:", result.errors);
      return res.status(500).json({
        error: 'Shopify GraphQL error',
        details: result.errors
      });
    }

    const node = result.data?.node;

    console.log("🔍 Resolved node:", node);

    if (!node) {
      return res.status(404).json({
        error: 'Media not found',
        fullResponse: result
      });
    }

    let mediaUrl = null;

    // Handle MediaImage
    if (node.image?.url) {
      mediaUrl = node.image.url;
    }

    // Handle GenericFile
    if (!mediaUrl && node.url) {
      mediaUrl = node.url;
    }

    if (!mediaUrl) {
      return res.status(500).json({
        error: 'Could not extract media URL',
        node
      });
    }

    console.log("✅ Final URL:", mediaUrl);

    return res.json({
      success: true,
      mediaId: node.id,
      mediaUrl: mediaUrl
    });

  } catch (error) {
    console.error('❌ Server error:', error);

    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

app.get('/', (req, res) => {
  res.send('API is working ✅');
});

if (require.main === module) {
  app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
  });
}

module.exports = app;

