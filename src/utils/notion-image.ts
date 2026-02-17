import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// 图片缓存目录
const IMAGE_CACHE_DIR = process.env.IMAGE_CACHE_DIR || "public/images/notion";
const FULL_CACHE_PATH = path.join(process.cwd(), IMAGE_CACHE_DIR);

// 图片元数据缓存文件
const METADATA_FILE = path.join(FULL_CACHE_PATH, ".metadata.json");

interface ImageMetadata {
	[originalUrl: string]: {
		filename: string;
		downloadedAt: string;
		size: number;
	};
}

// 确保缓存目录存在
function ensureCacheDir(): void {
	if (!fs.existsSync(FULL_CACHE_PATH)) {
		fs.mkdirSync(FULL_CACHE_PATH, { recursive: true });
	}
}

// 读取元数据
function readMetadata(): ImageMetadata {
	try {
		if (fs.existsSync(METADATA_FILE)) {
			const data = fs.readFileSync(METADATA_FILE, "utf-8");
			return JSON.parse(data);
		}
	} catch (error) {
		console.warn("Failed to read image metadata:", error);
	}
	return {};
}

// 保存元数据
function saveMetadata(metadata: ImageMetadata): void {
	try {
		ensureCacheDir();
		fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2), "utf-8");
	} catch (error) {
		console.warn("Failed to save image metadata:", error);
	}
}

// 从 URL 生成文件名
function generateFilename(url: string): string {
	// 提取扩展名
	const urlObj = new URL(url);
	const pathname = urlObj.pathname;
	const extMatch = pathname.match(/\.(\w+)(?:\?|$)/);
	const ext = extMatch ? extMatch[1].toLowerCase() : "png";

	// 使用 URL 的哈希作为文件名
	const hash = crypto.createHash("md5").update(url).digest("hex").slice(0, 12);

	return `notion-${hash}.${ext}`;
}

// 下载单张图片
async function downloadImage(
	url: string,
	filename: string,
): Promise<{ success: boolean; size: number }> {
	try {
		const response = await fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
			},
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const buffer = Buffer.from(await response.arrayBuffer());
		const filepath = path.join(FULL_CACHE_PATH, filename);

		fs.writeFileSync(filepath, buffer);

		return { success: true, size: buffer.length };
	} catch (error) {
		console.error(`Failed to download image ${url}:`, error);
		return { success: false, size: 0 };
	}
}

// 处理文章中的图片
export async function processPostImages(
	imageUrls: Array<{ original: string; filename: string }>,
): Promise<Map<string, string>> {
	ensureCacheDir();
	const metadata = readMetadata();
	const urlMapping = new Map<string, string>();

	for (const { original, filename: suggestedFilename } of imageUrls) {
		// 检查是否已缓存
		if (metadata[original]) {
			const cachedFilename = metadata[original].filename;
			const cachedPath = path.join(FULL_CACHE_PATH, cachedFilename);

			// 验证文件是否存在
			if (fs.existsSync(cachedPath)) {
				urlMapping.set(
					original,
					path.posix.join("/", IMAGE_CACHE_DIR, cachedFilename),
				);
				continue;
			}
		}

		// 生成最终文件名
		const finalFilename = generateFilename(original);

		// 下载图片
		console.log(`Downloading image: ${original}`);
		const result = await downloadImage(original, finalFilename);

		if (result.success) {
			metadata[original] = {
				filename: finalFilename,
				downloadedAt: new Date().toISOString(),
				size: result.size,
			};
			urlMapping.set(
				original,
				path.posix.join("/", IMAGE_CACHE_DIR, finalFilename),
			);
		} else {
			// 下载失败，保留原始 URL
			urlMapping.set(original, original);
		}
	}

	// 保存元数据
	saveMetadata(metadata);

	return urlMapping;
}

// 替换 Markdown 中的图片 URL
export function replaceImageUrlsInMarkdown(
	markdown: string,
	urlMapping: Map<string, string>,
): string {
	let result = markdown;

	for (const [original, local] of urlMapping.entries()) {
		// 替换占位路径
		const placeholderPattern = `/images/notion/${original.split("/").pop() || original}`;
		result = result.replace(placeholderPattern, local);

		// 也替换直接的 notion URL
		if (original.includes("notion.so") || original.includes("secure.notion-static.com")) {
			const escapedUrl = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const pattern = new RegExp(escapedUrl, "g");
			result = result.replace(pattern, local);
		}
	}

	return result;
}

// 清理未使用的图片（可选，在构建后调用）
export function cleanupUnusedImages(usedFilenames: Set<string>): void {
	try {
		if (!fs.existsSync(FULL_CACHE_PATH)) return;

		const files = fs.readdirSync(FULL_CACHE_PATH);
		const metadata = readMetadata();

		for (const file of files) {
			if (file === ".metadata.json") continue;

			if (!usedFilenames.has(file)) {
				// 检查是否仍在元数据中（防止误删）
				const isInMetadata = Object.values(metadata).some(
					(m) => m.filename === file,
				);

				if (!isInMetadata) {
					const filepath = path.join(FULL_CACHE_PATH, file);
					fs.unlinkSync(filepath);
					console.log(`Cleaned up unused image: ${file}`);
				}
			}
		}
	} catch (error) {
		console.warn("Failed to cleanup unused images:", error);
	}
}

// 获取所有已缓存的图片
export function getCachedImages(): string[] {
	try {
		if (!fs.existsSync(FULL_CACHE_PATH)) return [];

		return fs
			.readdirSync(FULL_CACHE_PATH)
			.filter((f) => f !== ".metadata.json");
	} catch {
		return [];
	}
}
