/**
 * 环境变量加载脚本
 * 确保在 Windows 和 CentOS 上都能正确加载 .env 文件
 * 使用方法: node scripts/load-env.js && npm run dev
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// 尝试加载 .env 或 .env.local
const envFiles = ['.env.local', '.env'];
let loadedFile = null;

for (const file of envFiles) {
	const envPath = path.join(rootDir, file);
	if (fs.existsSync(envPath)) {
		const content = fs.readFileSync(envPath, 'utf-8');

		// 解析环境变量（处理 CRLF 和 LF）
		content.split(/\r?\n/).forEach((line) => {
			// 跳过注释和空行
			if (!line || line.startsWith('#')) return;

			const match = line.match(/^([^=]+)=(.*)$/);
			if (match) {
				const key = match[1].trim();
				const value = match[2].trim();

				// 只在未设置时写入（避免覆盖已存在的环境变量）
				if (!process.env[key]) {
					process.env[key] = value;
				}
			}
		});

		loadedFile = file;
		break; // 优先加载第一个找到的文件
	}
}

if (loadedFile) {
	console.log(`[load-env] 已加载: ${loadedFile}`);
	console.log(`[load-env] CONTENT_SOURCE: ${process.env.CONTENT_SOURCE || '未设置'}`);
} else {
	console.warn('[load-env] 未找到 .env 或 .env.local 文件');
}
