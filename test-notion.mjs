import fs from 'fs';

console.log('========== Notion 配置测试 ==========\n');

// 手动解析 .env.local（处理 Windows CRLF）
const envContent = fs.readFileSync('.env.local', 'utf-8');
envContent.split(/\r?\n/).forEach(line => {
    // 跳过注释和空行
    if (!line || line.startsWith('#')) return;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        process.env[match[1].trim()] = match[2].trim();
    }
});

console.log('1. 环境变量检查');
console.log('   CONTENT_SOURCE:', process.env.CONTENT_SOURCE || '❌ 未设置');
console.log('   NOTION_TOKEN:', process.env.NOTION_TOKEN ? `✅ 已设置` : '❌ 未设置');
console.log('   NOTION_DATABASE_ID:', process.env.NOTION_DATABASE_ID || '❌ 未设置');

// 验证 Token 和 Database ID
const token = process.env.NOTION_TOKEN;
const dbId = process.env.NOTION_DATABASE_ID;

console.log('\n2. 格式验证');
if (token) {
    console.log('   Token 格式:', token.startsWith('ntn_') ? '✅ 新格式 (ntn_)' : token.startsWith('secret_') ? '✅ 旧格式 (secret_)' : '⚠️ 未知格式');
}
if (dbId) {
    console.log('   Database ID 长度:', dbId.length === 32 ? '✅ 32位' : `⚠️ ${dbId.length}位`);
}

console.log('\n3. 测试 Notion API 连接');
if (!token || !dbId) {
    console.log('   ❌ 缺少配置');
    process.exit(1);
}

try {
    const { Client } = await import('@notionhq/client');
    const client = new Client({ auth: token });

    console.log('   查询中...');
    const response = await client.databases.query({
        database_id: dbId,
        page_size: 5
    });

    console.log('   ✅ 连接成功！');
    console.log('   文章数量:', response.results.length);

    if (response.results.length > 0) {
        console.log('\n   文章列表:');
        response.results.forEach((page, i) => {
            const title = page.properties.Title?.title?.[0]?.plain_text || '无标题';
            const slug = page.properties.Slug?.rich_text?.[0]?.plain_text || page.properties.slug?.rich_text?.[0]?.plain_text || '无';
            console.log(`   ${i + 1}. ${title} (slug: ${slug})`);
        });

        const hasSlug = response.results[0].properties.Slug || response.results[0].properties.slug;
        console.log('\n   Slug 字段:', hasSlug ? '✅ 存在' : '❌ 不存在 (文章会被跳过！)');
    } else {
        console.log('   ⚠️ 数据库为空');
    }

} catch (error) {
    console.log('   ❌ 失败:', error.message);
    if (error.message.includes('404') || error.message.includes('database')) {
        console.log('\n   💡 解决: 在 Notion 数据库页面点击 ... → Add connections → 选择你的 Integration');
    }
}

console.log('\n========== 测试完成 ==========');
