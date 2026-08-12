// notion-test.mjs
import { config } from 'dotenv';

config({ path: '.env.local' });

const token = process.env.NOTION_TOKEN;
const dbId = process.env.NOTION_DB_ID?.trim();

async function main() {
    if (!token) {
        console.error('❌ NOTION_TOKEN is missing in .env.local');
        return;
    }
    if (!dbId) {
        console.error('❌ NOTION_DB_ID is missing in .env.local');
        return;
    }

    console.log(`\n🔍  Testing READ on database: ${dbId} using Fetch API...\n`);

    const response = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            page_size: 5,
        }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || JSON.stringify(data));
    }

    console.log(`✅  Found ${data.results.length} existing page(s):`);
    data.results.forEach((page) => {
        const titleProp = Object.values(page.properties).find(p => p.type === 'title');
        const title = titleProp?.title?.[0]?.plain_text ?? '(no title)';
        console.log(`   • "${title}"  [${page.id}]`);
    });

    // WRITE: create a test page
    console.log('\n✍️   Testing WRITE — creating a test page...\n');

    const titlePropName = Object.entries(data.results[0]?.properties ?? {})
        .find(([, v]) => v.type === 'title')?.[0] ?? 'Name';

    const writeResponse = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            parent: { database_id: dbId },
            properties: {
                [titlePropName]: {
                    title: [{ text: { content: '🧪 Test Post — delete me' } }],
                },
            },
            children: [
                {
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                        rich_text: [{ text: { content: 'Hello from Fetch API! Read + Write works ✅' } }],
                    },
                },
            ],
        }),
    });

    const writeData = await writeResponse.json();

    if (!writeResponse.ok) {
        throw new Error(writeData.message || JSON.stringify(writeData));
    }

    console.log(`   ✅  Page created: "${writeData.id}"`);
    console.log(`   URL: ${writeData.url}`);
    console.log('\n🎉  Both READ and WRITE work via Fetch API.\n');
}

main().catch((err) => {
    console.error('\n❌  Error:', err.message ?? err);
    process.exit(1);
});

