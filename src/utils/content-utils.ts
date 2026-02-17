import { type CollectionEntry, getCollection } from "astro:content";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { getCategoryUrl } from "@utils/url-utils";
import {
	getNotionClient,
	getCachedData,
	setCachedData,
	getFallbackCache,
	setFallbackCache,
} from "./notion-client";
import { parseNotionPage, convertBlocksToMarkdown, type NotionPostEntry } from "./notion-adapter";
import { processPostImages, replaceImageUrlsInMarkdown } from "./notion-image";

// 判断数据源类型
const isNotionSource = (): boolean => {
	return process.env.CONTENT_SOURCE === "notion";
};

// ==========================================
// Notion 数据源
// ==========================================

async function getNotionPosts(): Promise<NotionPostEntry[]> {
	// 开发环境使用缓存
	const isDev = !import.meta.env.PROD;
	const cacheKey = "notion-posts";

	if (isDev) {
		const cached = getCachedData<NotionPostEntry[]>(cacheKey);
		if (cached) {
			console.log("[Notion] Using cached posts");
			return cached;
		}
	}

	try {
		const client = getNotionClient();

		// 查询所有页面
		console.log("[Notion] Fetching posts from database...");
		const pages = await client.queryDatabase();

		// 解析页面数据
		const posts: NotionPostEntry[] = [];
		for (const page of pages) {
			const post = parseNotionPage(page);
			if (post) {
				posts.push(post);
			}
		}

		// 获取每篇文章的 blocks 并转换为 Markdown
		if (import.meta.env.PROD || process.env.DOWNLOAD_NOTION_CONTENT === "true") {
			console.log("[Notion] Fetching page content...");
			for (const post of posts) {
				try {
					// 获取原始 page ID（parseNotionPage 后需要用原始 ID 获取 blocks）
					const pageId = pages.find((p) =>
						parseNotionPage(p)?.slug === post.slug
					)?.id;

					if (pageId) {
						const blocks = await client.getPageBlocks(pageId);
						const { markdown, imageUrls } = convertBlocksToMarkdown(blocks);

						// 处理图片下载
						if (imageUrls.length > 0) {
							console.log(`[Notion] Processing ${imageUrls.length} images for "${post.data.title}"`);
							const urlMapping = await processPostImages(imageUrls);
							post.body = replaceImageUrlsInMarkdown(markdown, urlMapping);
						} else {
							post.body = markdown;
						}
					}
				} catch (error) {
					console.error(`[Notion] Failed to fetch content for "${post.data.title}":`, error);
					post.body = ""; // 失败时留空
				}
			}
		}

		// 保存缓存
		if (isDev) {
			setCachedData(cacheKey, posts);
		}

		// 保存容错缓存
		setFallbackCache(posts);

		return posts;
	} catch (error) {
		console.error("[Notion] Failed to fetch posts:", error);

		// 容错模式：尝试使用缓存数据
		const fallback = getFallbackCache<NotionPostEntry[]>();
		if (fallback) {
			console.warn("[Notion] Using fallback cache due to error");
			return fallback;
		}

		throw error;
	}
}

// ==========================================
// 本地文件数据源
// ==========================================

async function getLocalPosts(): Promise<CollectionEntry<"posts">[]> {
	return getCollection("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});
}

// ==========================================
// 统一接口
// ==========================================

// 统一的 Post 类型
type UnifiedPost = CollectionEntry<"posts"> | NotionPostEntry;

// 获取原始排序文章
async function getRawSortedPosts(): Promise<UnifiedPost[]> {
	let posts: UnifiedPost[];

	if (isNotionSource()) {
		posts = await getNotionPosts();
	} else {
		posts = await getLocalPosts();
	}

	const sorted = posts.sort((a, b) => {
		// 首先按置顶状态排序，置顶文章在前
		if (a.data.pinned && !b.data.pinned) return -1;
		if (!a.data.pinned && b.data.pinned) return 1;

		// 如果置顶状态相同，则按发布日期排序
		const dateA = new Date(a.data.published);
		const dateB = new Date(b.data.published);
		return dateA > dateB ? -1 : 1;
	});

	return sorted;
}

export async function getSortedPosts(): Promise<UnifiedPost[]> {
	const sorted = await getRawSortedPosts();

	for (let i = 1; i < sorted.length; i++) {
		sorted[i].data.nextSlug = sorted[i - 1].id;
		sorted[i].data.nextTitle = sorted[i - 1].data.title;
	}
	for (let i = 0; i < sorted.length - 1; i++) {
		sorted[i].data.prevSlug = sorted[i + 1].id;
		sorted[i].data.prevTitle = sorted[i + 1].data.title;
	}

	return sorted;
}

export type PostForList = {
	id: string;
	data: CollectionEntry<"posts">["data"];
};

export async function getSortedPostsList(): Promise<PostForList[]> {
	const sortedFullPosts = await getRawSortedPosts();

	// delete post.body
	const sortedPostsList = sortedFullPosts.map((post) => ({
		id: post.id,
		data: post.data,
	}));

	return sortedPostsList;
}

export type Tag = {
	name: string;
	count: number;
};

export async function getTagList(): Promise<Tag[]> {
	const allBlogPosts = await getRawSortedPosts();

	const countMap: { [key: string]: number } = {};
	allBlogPosts.forEach((post: { data: { tags: string[] } }) => {
		post.data.tags.forEach((tag: string) => {
			if (!countMap[tag]) countMap[tag] = 0;
			countMap[tag]++;
		});
	});

	// sort tags
	const keys: string[] = Object.keys(countMap).sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	return keys.map((key) => ({ name: key, count: countMap[key] }));
}

export type Category = {
	name: string;
	count: number;
	url: string;
};

export async function getCategoryList(): Promise<Category[]> {
	const allBlogPosts = await getRawSortedPosts();
	const count: { [key: string]: number } = {};
	allBlogPosts.forEach((post: { data: { category: string | null } }) => {
		if (!post.data.category) {
			const ucKey = i18n(I18nKey.uncategorized);
			count[ucKey] = count[ucKey] ? count[ucKey] + 1 : 1;
			return;
		}

		const categoryName =
			typeof post.data.category === "string"
				? post.data.category.trim()
				: String(post.data.category).trim();

		count[categoryName] = count[categoryName] ? count[categoryName] + 1 : 1;
	});

	const lst = Object.keys(count).sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	const ret: Category[] = [];
	for (const c of lst) {
		ret.push({
			name: c,
			count: count[c],
			url: getCategoryUrl(c),
		});
	}
	return ret;
}

// 导出类型和工具
export { isNotionSource };
export type { NotionPostEntry, UnifiedPost };
