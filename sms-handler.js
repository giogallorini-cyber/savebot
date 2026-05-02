const axios = require('axios');

function cleanInstagramUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch (e) {
    return url;
  }
}

function extractUserContext(text, url) {
  if (!url) return text;
  return text.replace(url, '').trim();
}

async function scrapeInstagramReel(url) {
  const cleanUrl = cleanInstagramUrl(url);
  try {
    const response = await axios.post(
      `https://api.apify.com/v2/acts/xMc5Ga1oCONPmWJIa/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`,
      {
        directUrls: [cleanUrl],
        downloadVideos: false,
        includeTranscript: true
      },
      { timeout: 30000 }
    );
    const data = response.data;
    if (data && data[0]) {
      const post = data[0];
      return {
        caption: post.caption || '',
        transcript: post.transcript || '',
        hashtags: post.hashtags ? post.hashtags.join(' ') : '',
        author: post.ownerUsername || ''
      };
    }
    return null;
  } catch (e) {
    console.error('Apify error:', e.message);
    return null;
  }
}

async function fetchUrlContext(url) {
  try {
    if (url.includes('instagram.com')) {
      const reelData = await scrapeInstagramReel(url);
      if (reelData && (reelData.caption || reelData.transcript)) {
        return `Instagram reel by @${reelData.author}. Caption: "${reelData.caption}". Transcript: "${reelData.transcript}". Hashtags: ${reelData.hashtags}`;
      }
      return '';
    }
    const response = await axios.get(url, {
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SaveBot/1.0)' }
    });
    const html = response.data;
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const descMatch = html.match(/property="og:description" content="(.*?)"/i) ||
                      html.match(/name="description" content="(.*?)"/i);
    return `Page title: ${titleMatch ? titleMatch[1] : ''}. Description: ${descMatch ? descMatch[1] : ''}`;
  } catch (e) {
    return '';
  }
}

async function interpretWithClaude(text) {
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  const url = urlMatch ? urlMatch[0] : null;
  const userContext = url ? extractUserContext(text, url) : text;
  const isBareLink = url && userContext.length === 0;
  let linkContext = '';

  if (url) {
    linkContext = await fetchUrlContext(url);
  }

  const prompt = `You are SaveBot, an intelligent personal assistant that categorizes saved content.

INCOMING MESSAGE: "${text}"
${userContext ? `USER CONTEXT WORDS: "${userContext}" ← USE THESE AS PRIMARY SIGNAL` : ''}
${linkContext ? `LINK CONTENT: "${linkContext}"` : ''}
${isBareLink && !linkContext ? 'NOTE: Bare link, no context available.' : ''}

CRITICAL RULES:
- If the user wrote "recipe", "make this", "cook this", "food" → category MUST be "recipe"
- If the user wrote "try this place", "restaurant", "eat here", "taco", "food spot" → category MUST be "restaurant"  
- If the user wrote "todo", "remember", "don't forget", "remind me" → category MUST be "todo"
- If the user wrote "buy this", "want this", "product" → category MUST be "product"
- If the user wrote "video", "style", "aesthetic", "content" → category MUST be "video-inspo"
- If the user wrote "music", "song", "lyric", "beat" → category MUST be "music"
- If there is no user context AND no link content → category = "idea"
- Use link content as secondary signal only when no user context exists

CATEGORIES: todo, recipe, restaurant, video-inspo, music, idea, product, article, place

TITLE: Be specific and human. Max 60 chars. For recipes name the dish. For todos start with a verb.

Respond with ONLY raw JSON:
{
  "category": "...",
  "title": "...",
  "description": "...",
  "action": "...",
  "why": "..."
}`;

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    const textContent = response.data.content[0].text;
    const cleaned = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch (error) {
    console.error('Claude error:', error.response?.data || error.message);
    return {
      category: 'idea',
      title: text.substring(0, 60),
      description: text,
      action: 'Review this',
      why: 'Saved for later'
    };
  }
}

module.exports = { interpretWithClaude };