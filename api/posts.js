// api/posts.js — GET /api/posts
// Returns all Notion DB pages where Published = true
// Notion token is kept server-side, never exposed to the client.

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DB_ID  = process.env.NOTION_DB_ID;

const NOTION_VERSION = '2022-06-28';

/**
 * Safely read a Notion property value, returning a default if the
 * property doesn't exist or has an unexpected shape.
 */
function getProp(properties, name, fallback = null) {
    if (!properties) return fallback;
    const targetKey = Object.keys(properties).find(
        (k) => k.toLowerCase() === name.toLowerCase()
    );
    if (!targetKey) return fallback;
    const prop = properties[targetKey];
    if (!prop) return fallback;

    switch (prop.type) {
        case 'title':
            return prop.title?.map((t) => t.plain_text).join('') || fallback;
        case 'rich_text':
            return prop.rich_text?.map((t) => t.plain_text).join('') || fallback;
        case 'checkbox':
            return prop.checkbox ?? fallback;
        case 'date':
            return prop.date?.start ?? fallback;
        case 'multi_select':
            return prop.multi_select?.map((s) => s.name) ?? fallback;
        default:
            return fallback;
    }
}

/** Find the title property key (Notion stores it as type=title, any name) */
function getTitleKey(properties) {
    return Object.keys(properties ?? {}).find(
        (k) => properties[k].type === 'title'
    ) ?? 'Name';
}

export default async function handler(req, res) {
    // CORS – allow the blog HTML pages on the same domain / localhost
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const token = process.env.NOTION_TOKEN;
    const dbId  = process.env.NOTION_DB_ID;

    if (!token || !dbId) {
        return res.status(500).json({ error: 'Notion credentials not configured.' });
    }

    try {
        // Query Notion: only Published = true pages, sorted newest first
        const queryBody = {
            filter: {
                property: 'Published',
                checkbox: { equals: true },
            },
            sorts: [
                { property: 'Date', direction: 'descending' },
            ],
            page_size: 50,
        };

        const notionRes = await fetch(
            `https://api.notion.com/v1/databases/${dbId.trim()}/query`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Notion-Version': NOTION_VERSION,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(queryBody),
            }
        );

        const data = await notionRes.json();

        if (!notionRes.ok) {
            console.error('Notion API error:', data);
            return res.status(502).json({ error: data.message ?? 'Notion API error' });
        }

        // Map each Notion page to our blog post shape
        const posts = data.results.map((page) => {
            const props = page.properties ?? {};
            const titleKey = getTitleKey(props);

            const title   = getProp(props, titleKey, '(Untitled)');
            const rawSlug = getProp(props, 'Slug', null);
            const slug    = (rawSlug && rawSlug.trim().length > 0) ? rawSlug.trim() : page.id;
            const date    = getProp(props, 'Date', null);
            const tags    = getProp(props, 'Tags', []);
            const excerpt = getProp(props, 'Excerpt', '');

            return { id: page.id, title, slug, date, tags, excerpt };
        });

        return res.status(200).json({ posts });
    } catch (err) {
        console.error('posts.js error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}
