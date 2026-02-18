import fs from 'fs';

// 加载 .env
const content = fs.readFileSync('.env', 'utf-8');
content.split(/\r?\n/).forEach(line => {
    if (!line || line.startsWith('#')) return;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        process.env[match[1].trim()] = match[2].trim();
    }
});

import { Client } from '@notionhq/client';

const client = new Client({ auth: process.env.NOTION_TOKEN });

async function main() {
    console.log('========== Notion 日期字段调试 ==========\n');

    const response = await client.databases.query({
        database_id: process.env.NOTION_DATABASE_ID,
        page_size: 1
    });

    if (response.results.length === 0) {
        console.log('数据库为空');
        return;
    }

    const page = response.results[0];
    console.log('页面 ID:', page.id);
    console.log('\n所有属性:');

    for (const [key, value] of Object.entries(page.properties)) {
        console.log(`\n${key}:`);
        console.log('  类型:', value.type);

        if (value.type === 'date') {
            console.log('  原始值:', JSON.stringify(value.date));
            console.log('  start:', value.date?.start);
            console.log('  end:', value.date?.end);
        } else if (value.type === 'title') {
            console.log('  值:', value.title?.[0]?.plain_text);
        } else if (value.type === 'rich_text') {
            console.log('  值:', value.rich_text?.[0]?.plain_text);
        }
    }

    // 特别检查 Published 字段
    console.log('\n\n========== Published 字段详细检查 ==========');
    const publishedProp = page.properties['Published'] || page.properties['published'];
    if (publishedProp) {
        console.log('找到 Published 字段:');
        console.log('  完整结构:', JSON.stringify(publishedProp, null, 2));
    } else {
        console.log('❌ 未找到 Published 字段！');
        console.log('可用日期字段:', Object.entries(page.properties)
            .filter(([k, v]) => v.type === 'date')
            .map(([k]) => k)
            .join(', '));
    }

    console.log('\n========== 调试完成 ==========');
}

main().catch(console.error);
