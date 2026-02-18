#!/usr/bin/env node
/**
 * 跨平台构建脚本
 * 先加载 .env 文件，然后执行构建
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

            content.split(/\r?\n/).forEach((line) => {
                if (!line || line.startsWith('#')) return;

                const match = line.match(/^([^=]+)=(.*)$/);
                if (match) {
                    const key = match[1].trim();
                    const value = match[2].trim();
                    if (!process.env[key]) {
                        process.env[key] = value;
                    }
                }
            });

            console.log(`[build] 已加载环境变量: ${file}`);
            console.log(`[build] CONTENT_SOURCE: ${process.env.CONTENT_SOURCE || '未设置'}`);
            return;
        }
    }

    console.log('[build] 未找到 .env 文件，使用系统环境变量');
    console.log(`[build] CONTENT_SOURCE: ${process.env.CONTENT_SOURCE || '未设置'}`);
}

// 主函数
function main() {
    loadEnv();

    // 先运行 generate-icons.js
    console.log('[build] 生成图标...');
    const generateIcons = spawn('node', ['scripts/generate-icons.js'], {
        cwd: rootDir,
        stdio: 'inherit',
        shell: true,
        env: process.env
    });

    generateIcons.on('exit', (code) => {
        if (code !== 0) {
            process.exit(code);
        }

        // 运行 Astro 构建
        console.log('[build] 开始构建...');
        const astroBuild = spawn('npx', ['astro', 'build'], {
            cwd: rootDir,
            stdio: 'inherit',
            shell: true,
            env: process.env
        });

        astroBuild.on('exit', (buildCode) => {
            if (buildCode !== 0) {
                process.exit(buildCode);
            }

            // 运行 pagefind
            console.log('[build] 生成搜索索引...');
            const pagefind = spawn('npx', ['pagefind', '--site', 'dist'], {
                cwd: rootDir,
                stdio: 'inherit',
                shell: true,
                env: process.env
            });

            pagefind.on('exit', (pagefindCode) => {
                process.exit(pagefindCode);
            });
        });
    });
}

main();
