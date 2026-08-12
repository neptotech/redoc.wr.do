// api/post.js — GET /api/post?slug=my-post-slug
// Returns a single post's metadata + rendered HTML content.
// Notion token is kept server-side, never exposed to the client.

const NOTION_TOKEN   = process.env.NOTION_TOKEN;
const NOTION_DB_ID   = process.env.NOTION_DB_ID;
const NOTION_VERSION = '2022-06-28';

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function getProp(properties, name, fallback = null) {
    const prop = properties?.[name];
    if (!prop) return fallback;
    switch (prop.type) {
        case 'title':       return prop.title?.[0]?.plain_text ?? fallback;
        case 'rich_text':   return prop.rich_text?.[0]?.plain_text ?? fallback;
        case 'checkbox':    return prop.checkbox ?? fallback;
        case 'date':        return prop.date?.start ?? fallback;
        case 'multi_select':return prop.multi_select?.map((s) => s.name) ?? fallback;
        default:            return fallback;
    }
}

function getTitleKey(properties) {
    return Object.keys(properties ?? {}).find(
        (k) => properties[k].type === 'title'
    ) ?? 'Name';
}

/** Convert Notion rich_text array → HTML string */
function richTextToHtml(richTextArr = []) {
    return richTextArr
        .map((rt) => {
            let text = escHtml(rt.plain_text ?? '');
            const ann = rt.annotations ?? {};
            if (ann.bold)          text = `<strong>${text}</strong>`;
            if (ann.italic)        text = `<em>${text}</em>`;
            if (ann.strikethrough) text = `<s>${text}</s>`;
            if (ann.underline)     text = `<u>${text}</u>`;
            if (ann.code)          text = `<code>${text}</code>`;
            if (rt.href)           text = `<a href="${escHtml(rt.href)}" target="_blank" rel="noopener">${text}</a>`;
            return text;
        })
        .join('');
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Convert an array of Notion blocks into an HTML string.
 * Handles: paragraph, heading_1-3, bulleted_list_item, numbered_list_item,
 *          code, quote, callout, image, divider, toggle, to_do
 */
function blocksToHtml(blocks = []) {
    const html = [];
    let inBullet   = false;
    let inNumbered = false;

    const closeBullet   = () => { if (inBullet)   { html.push('</ul>');   inBullet   = false; } };
    const closeNumbered = () => { if (inNumbered) { html.push('</ol>');  inNumbered = false; } };

    for (const block of blocks) {
        const type = block.type;
        const data = block[type] ?? {};
        const rt   = data.rich_text ?? [];

        // Close open lists when we hit a non-list block
        if (type !== 'bulleted_list_item')   closeBullet();
        if (type !== 'numbered_list_item')   closeNumbered();

        switch (type) {
            case 'paragraph':
                html.push(`<p>${richTextToHtml(rt)}</p>`);
                break;

            case 'heading_1':
                html.push(`<h2>${richTextToHtml(rt)}</h2>`);
                break;
            case 'heading_2':
                html.push(`<h3>${richTextToHtml(rt)}</h3>`);
                break;
            case 'heading_3':
                html.push(`<h4>${richTextToHtml(rt)}</h4>`);
                break;

            case 'bulleted_list_item':
                if (!inBullet) { html.push('<ul>'); inBullet = true; }
                html.push(`<li>${richTextToHtml(rt)}</li>`);
                break;

            case 'numbered_list_item':
                if (!inNumbered) { html.push('<ol>'); inNumbered = true; }
                html.push(`<li>${richTextToHtml(rt)}</li>`);
                break;

            case 'to_do': {
                const checked = data.checked ? ' checked' : '';
                html.push(
                    `<label class="post-todo"><input type="checkbox"${checked} disabled> ${richTextToHtml(rt)}</label>`
                );
                break;
            }

            case 'quote':
                html.push(`<blockquote>${richTextToHtml(rt)}</blockquote>`);
                break;

            case 'callout': {
                const icon = data.icon?.emoji ?? '💡';
                html.push(
                    `<div class="post-callout"><span class="callout-icon">${icon}</span><div>${richTextToHtml(rt)}</div></div>`
                );
                break;
            }

            case 'code': {
                const lang  = data.language ?? '';
                const codeText = rt.map((r) => r.plain_text).join('');
                html.push(
                    `<pre><code class="language-${escHtml(lang)}">${escHtml(codeText)}</code></pre>`
                );
                break;
            }

            case 'image': {
                const imgUrl =
                    data.type === 'external'
                        ? data.external?.url
                        : data.file?.url;
                const caption = (data.caption ?? []).map((r) => r.plain_text).join('');
                if (imgUrl) {
                    html.push(
                        `<figure class="post-image"><img src="${escHtml(imgUrl)}" alt="${escHtml(caption)}" loading="lazy"><figcaption>${escHtml(caption)}</figcaption></figure>`
                    );
                }
                break;
            }

            case 'divider':
                html.push('<hr>');
                break;

            case 'toggle':
                html.push(
                    `<details class="post-toggle"><summary>${richTextToHtml(rt)}</summary><div class="toggle-body"></div></details>`
                );
                break;

            default:
                // Silently skip unsupported block types (e.g. table, column, etc.)
                break;
        }
    }

    // Close any still-open lists
    closeBullet();
    closeNumbered();

    return html.join('\n');
}

/* ─── main handler ────────────────────────────────────────────────────────── */

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (!NOTION_TOKEN || !NOTION_DB_ID) {
        return res.status(500).json({ error: 'Notion credentials not configured.' });
    }

    const slug = req.query?.slug?.trim();
    if (!slug) {
        return res.status(400).json({ error: 'Missing ?slug= parameter.' });
    }

    try {
        // 1. Query the DB to find the matching page by Slug property
        const queryRes = await fetch(
            `https://api.notion.com/v1/databases/${NOTION_DB_ID.trim()}/query`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${NOTION_TOKEN}`,
                    'Notion-Version': NOTION_VERSION,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    filter: {
                        and: [
                            { property: 'Published', checkbox: { equals: true } },
                            { property: 'Slug', rich_text: { equals: slug } },
                        ],
                    },
                    page_size: 1,
                }),
            }
        );

        const queryData = await queryRes.json();
        if (!queryRes.ok) {
            return res.status(502).json({ error: queryData.message ?? 'Notion API error' });
        }

        if (!queryData.results?.length) {
            return res.status(404).json({ error: 'Post not found.' });
        }

        const page  = queryData.results[0];
        const props = page.properties ?? {};
        const titleKey = getTitleKey(props);

        const title   = getProp(props, titleKey, '(Untitled)');
        const date    = getProp(props, 'Date', null);
        const tags    = getProp(props, 'Tags', []);
        const excerpt = getProp(props, 'Excerpt', '');

        // 2. Fetch all blocks (paginate if needed)
        const allBlocks = [];
        let cursor = undefined;

        do {
            const blockUrl = new URL(
                `https://api.notion.com/v1/blocks/${page.id}/children`
            );
            blockUrl.searchParams.set('page_size', '100');
            if (cursor) blockUrl.searchParams.set('start_cursor', cursor);

            const blockRes = await fetch(blockUrl.toString(), {
                headers: {
                    Authorization: `Bearer ${NOTION_TOKEN}`,
                    'Notion-Version': NOTION_VERSION,
                },
            });

            const blockData = await blockRes.json();
            if (!blockRes.ok) {
                return res.status(502).json({ error: blockData.message ?? 'Block fetch error' });
            }

            allBlocks.push(...(blockData.results ?? []));
            cursor = blockData.has_more ? blockData.next_cursor : undefined;
        } while (cursor);

        // 3. Convert blocks to HTML
        const content_html = blocksToHtml(allBlocks);

        return res.status(200).json({ title, date, tags, excerpt, content_html });
    } catch (err) {
        console.error('post.js error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}
