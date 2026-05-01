const axios = require('axios');

function cleanInstagramUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch (e) {
    return url;
  }
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
  let urlContext = '';
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  const textWithoutUrl = urlMatch ? text.replace(urlMatch[0], '').trim() : text;
  const isBareLink = urlMatch && textWithoutUrl.length === 0;

  if (urlMatch) {
    urlContext = await fetchUrlContext(urlMatch[0]);
  }

  const prompt = `You are SaveBot, an extremely intelligent personal assistant that categorizes things people want to remember or act on.

Someone texted you: "${text}"
${urlContext ? `\nContext from the link: "${urlContext}"` : ''}
${textWithoutUrl ? `\nUser added this context: "${textWithoutUrl}"` : ''}
${isBareLink && !urlContext ? '\nNote: This is a bare link with no additional context. Make your best guess based on the URL structure.' : ''}

CATEGORY RULES (pick exactly one):
- "todo" → any action, task, or reminder. Examples: "remember to call mom", "thank God", "pick up package"
- "recipe" → any food or meal to make at home
- "restaurant" → any restaurant, cafe, bar, or food spot to visit
- "video-inspo" → ONLY if user explicitly mentions video, style, aesthetic, or content creation
- "music" → song lyrics, music ideas, artists
- "idea" → a thought, quote, or creative idea
- "product" → something to buy
- "article" → something to read
- "place" → non-food location to visit

IMPORTANT: If there is no context and no caption/transcript from the link, default to "idea" — do NOT guess video-inspo.

TITLE RULES:
- Be descriptive and human, not just the URL
- For todos: start with a verb
- For recipes: name the dish
- For restaurants: name the place if known
- Max 60 characters

Respond with ONLY raw JSON, no markdown, no backticks:
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