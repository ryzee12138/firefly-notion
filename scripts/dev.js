#!/usr/bin/env node
/**
 * 跨平台开发服务器启动脚本
 * 先加载 .env 文件，然后启动 Astro 开发服务器
 * 支持 Windows 和 CentOS
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// 加载环境变量
function loadEnv() {
    const envFiles = ['.env.local', '.env'];

    for (const file of envFiles) {
        const envPath = path.join(rootDir, file);
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');

            // 解析环境变量（处理 CRLF 和 LF）
            content.split(/\r?\n/).forEach((line) => {
                if (!line || line.startsWith('#')) return;

                const match = line.match(/^([^=]+)=(.*)$/);
                if (match) {
                    const key = match[1].trim();
                    const value = match[2].trim();
                    // 只在未设置时写入
                    if (!process.env[key]) {
                        process.env[key] = value;
                    }
                }
            });

            console.log(`[dev] 已加载环境变量: ${file}`);
            console.log(`[dev] CONTENT_SOURCE: ${process.env.CONTENT_SOURCE || '未设置'}`);
            return;
        }
    }

    console.warn('[dev] 警告: 未找到 .env 或 .env.local 文件');
}

// 主函数
function main() {
    loadEnv();

    // 启动 Astro 开发服务器
    const astro = spawn('npx', ['astro', 'dev'], {
        cwd: rootDir,
        stdio: 'inherit',
        shell: true,
        env: process.env  // 传递加载的环境变量
    });

    astro.on('error', (err) => {
        console.error('[dev] 启动失败:', err.message);
        process.exit(1);
    });

    astro.on('exit', (code) => {
        process.exit(code);
    });
}

main();
