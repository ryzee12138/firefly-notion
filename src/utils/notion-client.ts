import { Client, isFullPage } from "@notionhq/client";
import type {
	PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import type {
	BlockObjectResponse,
	ListBlockChildrenResponse,
} from "@notionhq/client/build/src/api-endpoints";

// Use any for query response to avoid type issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryDatabaseResponse = any;
import fs from "node:fs";
import path from "node:path";

// 开发环境缓存配置
const DEV_CACHE_DIR = path.join(process.cwd(), ".cache", "notion");
const DEV_CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟

// 容错模式缓存
const FALLBACK_CACHE_FILE = path.join(
	process.cwd(),
	".cache",
	"notion-fallback.json",
);

export interface NotionClientConfig {
	token: string;
	databaseId: string;
	timeoutMs?: number;
	retry?: number;
	concurrency?: number;
}

export interface NotionPost {
	id: string;
	slug: string;
	data: {
		title: string;
		published: Date;
		updated?: Date;
		draft?: boolean;
		description?: string;
		image?: string;
		tags?: string[];
		category?: string;
		lang?: string;
		pinned?: boolean;
		comment?: boolean;
		author?: string;
		sourceLink?: string;
		licenseName?: string;
		licenseUrl?: string;
		password?: string;
	};
	body?: string;
}

class NotionClient {
	private client: Client;
	private databaseId: string;
	private config: Required<NotionClientConfig>;
	private requestQueue: Promise<unknown>[] = [];

	constructor(config: NotionClientConfig) {
		this.config = {
			timeoutMs: 30000,
			retry: 3,
			concurrency: 5,
			...config,
		};
		this.databaseId = config.databaseId;
		this.client = new Client({
			auth: config.token,
			timeoutMs: this.config.timeoutMs,
		});
	}

	/**
	 * 带重试的请求包装器
	 */
	private async withRetry<T>(
		fn: () => Promise<T>,
		retries = this.config.retry,
	): Promise<T> {
		try {
			return await fn();
		} catch (error) {
			if (retries <= 0) throw error;

			// 处理 Notion API 限流 (429)
			if (error instanceof Error && error.message.includes("rate_limited")) {
				const retryAfter = this.extractRetryAfter(error.message) || 1;
				console.log(`Rate limited, waiting ${retryAfter}s...`);
				await this.sleep(retryAfter * 1000);
				return this.withRetry(fn, retries - 1);
			}

			// 指数退避
			const delay = Math.pow(2, this.config.retry - retries) * 1000;
			await this.sleep(delay);
			return this.withRetry(fn, retries - 1);
		}
	}

	private extractRetryAfter(message: string): number | undefined {
		const match = message.match(/retry[_\s]?after[:\s]*(\d+)/i);
		return match ? Number.parseInt(match[1], 10) : undefined;
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * 控制并发请求
	 */
	private async enqueue<T>(fn: () => Promise<T>): Promise<T> {
		while (this.requestQueue.length >= this.config.concurrency) {
			await Promise.race(this.requestQueue);
		}

		const promise = fn();
		this.requestQueue.push(promise);

		promise.then(
			() => {
				this.removeFromQueue(promise);
			},
			() => {
				this.removeFromQueue(promise);
			},
		);

		return promise;
	}

	private removeFromQueue(promise: Promise<unknown>) {
		const index = this.requestQueue.indexOf(promise);
		if (index > -1) {
			this.requestQueue.splice(index, 1);
		}
	}

	/**
	 * 查询数据库中的所有文章
	 */
	async queryDatabase(): Promise<PageObjectResponse[]> {
		const results: PageObjectResponse[] = [];
		let cursor: string | undefined;

		do {
			const response: QueryDatabaseResponse = await this.withRetry(() =>
				this.enqueue(async () => {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const client = this.client as any;
					return client.databases.query({
						database_id: this.databaseId,
						start_cursor: cursor,
					});
				}),
			);

			for (const page of response.results) {
				if (isFullPage(page)) {
					results.push(page);
				}
			}

			cursor = response.next_cursor ?? undefined;
		} while (cursor);

		return results;
	}

	/**
	 * 获取页面的所有 blocks
	 */
	async getPageBlocks(pageId: string): Promise<BlockObjectResponse[]> {
		const results: BlockObjectResponse[] = [];
		let cursor: string | undefined;

		do {
			const response: ListBlockChildrenResponse = await this.withRetry(() =>
				this.enqueue(async () => {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const client = this.client as any;
					return client.blocks.children.list({
						block_id: pageId,
						start_cursor: cursor,
					});
				}),
			);

			for (const block of response.results) {
				if (this.isFullBlock(block)) {
					results.push(block);
					// 递归获取嵌套 blocks（如 toggle、column_list）
					if (this.hasChildren(block)) {
						const children = await this.getPageBlocks(block.id);
						results.push(...children);
					}
				}
			}

			cursor = response.next_cursor ?? undefined;
		} while (cursor);

		return results;
	}

	private isFullBlock(
		block: unknown,
	): block is BlockObjectResponse {
		return (
			typeof block === "object" &&
			block !== null &&
			"type" in block &&
			"id" in block
		);
	}

	private hasChildren(block: BlockObjectResponse): boolean {
		const hasChildrenTypes = [
			"toggle",
			"column_list",
			"column",
			"paragraph",
			"heading_1",
			"heading_2",
			"heading_3",
			"bulleted_list_item",
			"numbered_list_item",
			"quote",
			"callout",
			"to_do",
			"synced_block",
			"template",
		];
		return (
			hasChildrenTypes.includes(block.type) &&
			"has_children" in block &&
			block.has_children
		);
	}
}

// 缓存相关函数
function getCacheFilePath(key: string): string {
	return path.join(DEV_CACHE_DIR, `${key}.json`);
}

function getCachedData<T>(key: string): T | null {
	try {
		const cacheFile = getCacheFilePath(key);
		if (!fs.existsSync(cacheFile)) return null;

		const stats = fs.statSync(cacheFile);
		const age = Date.now() - stats.mtimeMs;

		if (age > DEV_CACHE_TTL_MS) return null;

		const data = fs.readFileSync(cacheFile, "utf-8");
		return JSON.parse(data) as T;
	} catch {
		return null;
	}
}

function setCachedData<T>(key: string, data: T): void {
	try {
		if (!fs.existsSync(DEV_CACHE_DIR)) {
			fs.mkdirSync(DEV_CACHE_DIR, { recursive: true });
		}
		const cacheFile = getCacheFilePath(key);
		fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), "utf-8");
	} catch (error) {
		console.warn("Failed to cache Notion data:", error);
	}
}

// 容错缓存
function getFallbackCache<T>(): T | null {
	try {
		if (!fs.existsSync(FALLBACK_CACHE_FILE)) return null;
		const data = fs.readFileSync(FALLBACK_CACHE_FILE, "utf-8");
		return JSON.parse(data) as T;
	} catch {
		return null;
	}
}

function setFallbackCache<T>(data: T): void {
	try {
		const cacheDir = path.dirname(FALLBACK_CACHE_FILE);
		if (!fs.existsSync(cacheDir)) {
			fs.mkdirSync(cacheDir, { recursive: true });
		}
		fs.writeFileSync(
			FALLBACK_CACHE_FILE,
			JSON.stringify(data, null, 2),
			"utf-8",
		);
	} catch (error) {
		console.warn("Failed to save fallback cache:", error);
	}
}

// 导出单例工厂函数
let clientInstance: NotionClient | null = null;

export function getNotionClient(): NotionClient {
	if (clientInstance) return clientInstance;

	const token = process.env.NOTION_TOKEN;
	const databaseId = process.env.NOTION_DATABASE_ID;

	if (!token || !databaseId) {
		throw new Error(
			"Missing NOTION_TOKEN or NOTION_DATABASE_ID environment variables",
		);
	}

	clientInstance = new NotionClient({
		token,
		databaseId,
		timeoutMs: Number.parseInt(process.env.NOTION_TIMEOUT_MS || "30000", 10),
		retry: Number.parseInt(process.env.NOTION_RETRY || "3", 10),
		concurrency: Number.parseInt(process.env.NOTION_CONCURRENCY || "5", 10),
	});

	return clientInstance;
}

export {
	NotionClient,
	getCachedData,
	setCachedData,
	getFallbackCache,
	setFallbackCache,
	DEV_CACHE_TTL_MS,
};
