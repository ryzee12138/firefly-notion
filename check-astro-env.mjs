// 模拟 Astro 加载环境变量的方式
import fs from 'fs';

console.log('========== Astro 环境变量诊断 ==========\n');

// 方法 1: 直接读取 process.env
console.log('1. 当前 process.env');
console.log('   CONTENT_SOURCE:', process.env.CONTENT_SOURCE || '❌ 未设置');
console.log('   NOTION_TOKEN:', process.env.NOTION_TOKEN ? '✅ 已设置' : '❌ 未设置');

// 方法 2: 模拟 dotenv 解析
console.log('\n2. 手动解析 .env.local');
const content = fs.readFileSync('.env.local', 'utf-8');
const parsed = {};
content.split(/\r?\n/).forEach(line => {
    if (!line || line.startsWith('#')) return;
    const idx = line.indexOf('=');
    if (idx > 0) {
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        parsed[key] = value;
    }
});

console.log('   CONTENT_SOURCE:', parsed.CONTENT_SOURCE || '❌ 未设置');
console.log('   NOTION_TOKEN:', parsed.NOTION_TOKEN ? '✅ 已设置' : '❌ 未设置');

// 检查 Astro 是否可能读取到
console.log('\n3. 建议操作');
if (parsed.CONTENT_SOURCE === 'notion') {
    console.log('   ✅ .env.local 配置正确');
    console.log('   ⚠️  如果 Astro 仍显示本地文章，请检查:');
    console.log('      1. 是否重启了开发服务器 (npm run dev)');
    console.log('      2. 是否在 Windows PowerShell/CMD 中设置了旧的环境变量');
    console.log('      3. 是否有 .env 文件覆盖了 .env.local');

    // 检查是否有 .env 文件
    if (fs.existsSync('.env')) {
        console.log('\n   ⚠️  检测到 .env 文件，可能覆盖了 .env.local');
        const envContent = fs.readFileSync('.env', 'utf-8');
        if (envContent.includes('CONTENT_SOURCE')) {
            console.log('      .env 中也有 CONTENT_SOURCE 设置');
        }
    }
}

console.log('\n========== 诊断完成 ==========');
