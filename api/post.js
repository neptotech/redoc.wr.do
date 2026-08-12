// api/post.js — GET /api/post?slug=my-post-slug
// Returns a single post's metadata + rendered HTML content.
// Notion token is kept server-side, never exposed to the client.

const NOTION_TOKEN   = process.env.NOTION_TOKEN;
const NOTION_DB_ID   = process.env.NOTION_DB_ID;
const NOTION_VERSION = '2022-06-28';

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function getProp(properties, name, fallback = null) {
    if (!properties) return fallback;
    const targetKey = Object.keys(properties).find(
        (k) => k.toLowerCase() === name.toLowerCase()
    );
    if (!targetKey) return fallback;
    const prop = properties[targetKey];
    if (!prop) return fallback;

    switch (prop.type) {
        case 'title':        return prop.title?.map((t) => t.plain_text).join('') || fallback;
        case 'rich_text':    return prop.rich_text?.map((t) => t.plain_text).join('') || fallback;
        case 'checkbox':     return prop.checkbox ?? fallback;
        case 'date':         return prop.date?.start ?? fallback;
        case 'multi_select': return prop.multi_select?.map((s) => s.name) ?? fallback;
        default:             return fallback;
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
/**
 * Convert an array of Notion blocks into clean HTML.
 * Handles: paragraph, heading_1-3, bulleted_list_item, numbered_list_item,
 *          code, quote, callout, image, divider, toggle, to_do
 * Recursively renders block.children for any block type.
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

        // Close open lists when hitting a non-list block
        if (type !== 'bulleted_list_item')   closeBullet();
        if (type !== 'numbered_list_item')   closeNumbered();

        const childrenHtml = block.children?.length ? blocksToHtml(block.children) : '';

        switch (type) {
            case 'paragraph': {
                const text = richTextToHtml(rt);
                if (text || childrenHtml) {
                    html.push(`<p>${text}</p>${childrenHtml}`);
                }
                break;
            }

            case 'heading_1':
                html.push(`<h2>${richTextToHtml(rt)}</h2>${childrenHtml}`);
                break;
            case 'heading_2':
                html.push(`<h3>${richTextToHtml(rt)}</h3>${childrenHtml}`);
                break;
            case 'heading_3':
                html.push(`<h4>${richTextToHtml(rt)}</h4>${childrenHtml}`);
                break;

            case 'bulleted_list_item': {
                if (!inBullet) { html.push('<ul>'); inBullet = true; }
                const childWrapper = childrenHtml ? `<div class="list-children">${childrenHtml}</div>` : '';
                html.push(`<li>${richTextToHtml(rt)}${childWrapper}</li>`);
                break;
            }

            case 'numbered_list_item': {
                if (!inNumbered) { html.push('<ol>'); inNumbered = true; }
                const childWrapper = childrenHtml ? `<div class="list-children">${childrenHtml}</div>` : '';
                html.push(`<li>${richTextToHtml(rt)}${childWrapper}</li>`);
                break;
            }

            case 'to_do': {
                const checked = data.checked ? ' checked' : '';
                html.push(
                    `<label class="post-todo"><input type="checkbox"${checked} disabled> <span>${richTextToHtml(rt)}</span></label>${childrenHtml}`
                );
                break;
            }

            case 'quote':
                html.push(`<blockquote>${richTextToHtml(rt)}${childrenHtml}</blockquote>`);
                break;

            case 'callout': {
                const icon = data.icon?.emoji ?? '💡';
                html.push(
                    `<div class="post-callout"><span class="callout-icon">${icon}</span><div class="callout-content">${richTextToHtml(rt)}${childrenHtml}</div></div>`
                );
                break;
            }

            case 'code': {
                const rawLang = (data.language ?? 'text').toLowerCase();
                // Map notion language names to Prism/Highlight.js standard names
                const langMap = {
                    'c++': 'cpp',
                    'c#': 'csharp',
                    'visual basic': 'vbnet',
                    'html/css': 'html',
                    'plain text': 'plaintext'
                };
                const lang = langMap[rawLang] || rawLang;
                const codeText = rt.map((r) => r.plain_text).join('');
                const displayLang = data.language ? data.language : 'Code';

                html.push(`
<div class="code-block-wrapper">
    <div class="code-block-header">
        <span class="code-lang-label">${escHtml(displayLang)}</span>
        <button class="copy-code-btn" type="button" aria-label="Copy code" onclick="copyCodeBlock(this)">
            <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span class="copy-text">Copy</span>
        </button>
    </div>
    <pre><code class="language-${escHtml(lang)}">${escHtml(codeText)}</code></pre>
</div>`);
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

            case 'toggle': {
                html.push(
                    `<details class="post-toggle"><summary><span class="toggle-arrow">▶</span> <span class="toggle-title">${richTextToHtml(rt)}</span></summary><div class="toggle-body">${childrenHtml}</div></details>`
                );
                break;
            }

            default:
                if (childrenHtml) html.push(childrenHtml);
                break;
        }
    }

    // Close open lists
    closeBullet();
    closeNumbered();

    return html.join('\n');
}

/* ─── main handler ────────────────────────────────────────────────────────── */

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (!NOTION_TOKEN || !NOTION_DB_ID) {
        return res.status(500).json({ error: 'Notion credentials not configured.' });
    }

    const slug = req.query?.slug?.trim();
    if (!slug) {
        return res.status(400).json({ error: 'Missing ?slug= parameter.' });
    }

    try {
        // 1. Query the DB to find the matching page by Slug property or ID
        let queryRes = await fetch(
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
                        property: 'Published',
                        checkbox: { equals: true },
                    },
                    page_size: 100,
                }),
            }
        );

        let queryData = await queryRes.json();
        let page = (queryData.results ?? []).find((p) => {
            const pSlug = getProp(p.properties, 'Slug', '');
            return pSlug.trim() === slug || p.id === slug;
        });

        // Fallback: If not found in DB query, try fetching page directly by ID
        if (!page) {
            const pageRes = await fetch(`https://api.notion.com/v1/pages/${slug}`, {
                headers: {
                    Authorization: `Bearer ${NOTION_TOKEN}`,
                    'Notion-Version': NOTION_VERSION,
                },
            });
            if (pageRes.ok) {
                const fetchedPage = await pageRes.json();
                const isPublished = getProp(fetchedPage.properties, 'Published', false);
                if (isPublished) {
                    page = fetchedPage;
                }
            }
        }

        if (!page) {
            return res.status(404).json({ error: 'Post not found.' });
        }

        const props = page.properties ?? {};
        const titleKey = getTitleKey(props);

        const title   = getProp(props, titleKey, '(Untitled)');
        const date    = getProp(props, 'Date', null);
        const tags    = getProp(props, 'Tags', []);
        const excerpt = getProp(props, 'Excerpt', '');

        // Helper to fetch block children recursively
        async function fetchBlocksRecursive(parentId) {
            const blocks = [];
            let cursor = undefined;
            do {
                const blockUrl = new URL(`https://api.notion.com/v1/blocks/${parentId}/children`);
                blockUrl.searchParams.set('page_size', '100');
                if (cursor) blockUrl.searchParams.set('start_cursor', cursor);

                const res = await fetch(blockUrl.toString(), {
                    headers: {
                        Authorization: `Bearer ${NOTION_TOKEN}`,
                        'Notion-Version': NOTION_VERSION,
                    },
                });
                const data = await res.json();
                if (!res.ok) break;

                for (const b of (data.results ?? [])) {
                    if (b.has_children) {
                        b.children = await fetchBlocksRecursive(b.id);
                    }
                    blocks.push(b);
                }
                cursor = data.has_more ? data.next_cursor : undefined;
            } while (cursor);
            return blocks;
        }

        // 2. Fetch all blocks recursively
        const allBlocks = await fetchBlocksRecursive(page.id);

        // 3. Convert blocks to HTML
        const content_html = blocksToHtml(allBlocks);

        return res.status(200).json({ title, date, tags, excerpt, content_html });
    } catch (err) {
        console.error('post.js error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}
