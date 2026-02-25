import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import type { BlockObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { createHash } from "node:crypto";
import type { CollectionEntry } from "astro:content";

// Notion 属性类型
interface NotionProperties {
	title?: { title: Array<{ plain_text: string }> };
	slug?: { rich_text: Array<{ plain_text: string }> };
	published?: { date: { start: string } };
	updated?: { date: { start: string } };
	draft?: { checkbox: boolean };
	description?: { rich_text: Array<{ plain_text: string }> };
	image?: { files: Array<{ file?: { url: string }; external?: { url: string } }> };
	tags?: { multi_select: Array<{ name: string }> };
	category?: { select: { name: string } | null };
	lang?: { select: { name: string } | null };
	pinned?: { checkbox: boolean };
	password?: { rich_text: Array<{ plain_text: string }> };
	comment?: { checkbox: boolean };
	author?: { rich_text: Array<{ plain_text: string }> };
	sourceLink?: { url: string | null };
	licenseName?: { rich_text: Array<{ plain_text: string }> };
	licenseUrl?: { url: string | null };
}

// Firefly Post 数据类型（兼容 CollectionEntry<"posts">）
export type NotionPostEntry = {
	id: string;
	slug: string;
	data: {
		title: string;
		published: Date;
		updated?: Date;
		draft: boolean;
		description: string;
		image: string;
		tags: string[];
		category: string;
		lang: string;
		pinned: boolean;
		comment: boolean;
		author: string;
		sourceLink: string;
		licenseName: string;
		licenseUrl: string;
		prevTitle: string;
		prevSlug: string;
		nextTitle: string;
		nextSlug: string;
		password?: string;
	};
	body: string;
};

// 密码哈希处理
export function hashPassword(password: string): string {
	const salt = process.env.PASSWORD_SALT || "firefly-default-salt";
	return createHash("sha256").update(password + salt).digest("hex").slice(0, 16);
}

// 提取 Notion 属性值
function getPropertyValue<T>(
	properties: Record<string, unknown>,
	key: string,
	defaultValue: T,
): T {
	const prop = properties[key] as NotionProperties[keyof NotionProperties] | undefined;
	if (!prop) return defaultValue;

	// // @ts-ignore - dynamic property access
	if ("title" in prop && prop.title) {
		// // @ts-ignore
		return prop.title.map((t) => t.plain_text).join("") as unknown as T;
	}
	// // @ts-ignore
	if ("rich_text" in prop && prop.rich_text) {
		// // @ts-ignore
		return prop.rich_text.map((t) => t.plain_text).join("") as unknown as T;
	}
	// // @ts-ignore
	if ("date" in prop && prop.date) {
		// // @ts-ignore
		return new Date(prop.date.start) as unknown as T;
	}
	// // @ts-ignore
	if ("checkbox" in prop) {
		// // @ts-ignore
		return prop.checkbox as unknown as T;
	}
	// // @ts-ignore
	if ("multi_select" in prop && prop.multi_select) {
		// // @ts-ignore
		return prop.multi_select.map((t) => t.name) as unknown as T;
	}
	// // @ts-ignore
	if ("select" in prop && prop.select) {
		// // @ts-ignore
		return prop.select.name as unknown as T;
	}
	// // @ts-ignore
	if ("files" in prop && prop.files) {
		// // @ts-ignore
		const file = prop.files[0];
		if (file) {
			return (file.file?.url || file.external?.url || "") as unknown as T;
		}
	}
	// // @ts-ignore
	if ("url" in prop) {
		// // @ts-ignore
		return (prop.url || "") as unknown as T;
	}

	return defaultValue;
}

// 解析 Notion 页面为 Firefly Post 数据
export function parseNotionPage(page: PageObjectResponse): NotionPostEntry | null {
	const properties = page.properties as Record<string, unknown>;

	// 提取 slug，如果没有则跳过此文章
	const slug = getPropertyValue<string>(properties, "Slug", "").trim();
	if (!slug) {
		console.warn(`Skipping page ${page.id}: no slug found`);
		return null;
	}

	// 提取标题
	const title = getPropertyValue<string>(properties, "Title", "").trim() || "Untitled";

	// 提取发布日期
	let published: Date;
	const publishedProp = properties["Published"] as { type: string; date?: { start?: string } } | undefined;
	if (publishedProp?.type === "date" && publishedProp.date?.start) {
		published = new Date(publishedProp.date.start);
	} else {
		console.warn(`[Notion] 文章 "${title}" 没有 Published 日期，使用今天日期`);
		published = new Date();
	}

	// 提取更新日期
	let updated: Date | undefined;
	const updatedProp = properties["Updated"] as { type: string; date?: { start?: string } } | undefined;
	if (updatedProp?.type === "date" && updatedProp.date?.start) {
		updated = new Date(updatedProp.date.start);
	}

	// 提取密码（如有）
	const password = getPropertyValue<string>(properties, "Password", "").trim();

	return {
		id: slug, // 使用 slug 作为 id
		slug,
		data: {
			title,
			published,
			updated,
			draft: getPropertyValue<boolean>(properties, "Draft", false),
			description: getPropertyValue<string>(properties, "Description", ""),
			image: getPropertyValue<string>(properties, "Image", ""),
			tags: getPropertyValue<string[]>(properties, "Tags", []),
			category: getPropertyValue<string>(properties, "Category", ""),
			lang: getPropertyValue<string>(properties, "Lang", ""),
			pinned: getPropertyValue<boolean>(properties, "Pinned", false),
			comment: getPropertyValue<boolean>(properties, "Comment", true),
			author: getPropertyValue<string>(properties, "Author", ""),
			sourceLink: getPropertyValue<string>(properties, "SourceLink", ""),
			licenseName: getPropertyValue<string>(properties, "LicenseName", ""),
			licenseUrl: getPropertyValue<string>(properties, "LicenseUrl", ""),
			prevTitle: "",
			prevSlug: "",
			nextTitle: "",
			nextSlug: "",
			// 存储哈希后的密码，不存储明文
			...(password ? { password: hashPassword(password) } : {}),
		},
		body: "", // 稍后填充
	};
}

// 将 Rich Text 数组转换为 Markdown
function richTextToMarkdown(richTexts: Array<{
	plain_text: string;
	annotations?: {
		bold?: boolean;
		italic?: boolean;
		strikethrough?: boolean;
		underline?: boolean;
		code?: boolean;
	};
	href?: string;
}>): string {
	return richTexts.map((text) => {
		let content = text.plain_text;
		const annotations = text.annotations || {};

		if (annotations.code) content = `\`${content}\``;
		if (annotations.bold) content = `**${content}**`;
		if (annotations.italic) content = `*${content}*`;
		if (annotations.strikethrough) content = `~~${content}~~`;
		if (annotations.underline) content = `<u>${content}</u>`;
		if (text.href) content = `[${content}](${text.href})`;

		return content;
	}).join("");
}

// Block 转换器
class BlockConverter {
	private imageUrls: Array<{ original: string; filename: string }> = [];

	getImageUrls(): Array<{ original: string; filename: string }> {
		return this.imageUrls;
	}

	convert(block: BlockObjectResponse, depth = 0): string {
		const indent = "  ".repeat(depth);

		switch (block.type) {
			case "paragraph":
				return this.convertParagraph(block, indent);
			case "heading_1":
				return this.convertHeading(block, 1);
			case "heading_2":
				return this.convertHeading(block, 2);
			case "heading_3":
				return this.convertHeading(block, 3);
			case "bulleted_list_item":
				return this.convertListItem(block, "bulleted", indent);
			case "numbered_list_item":
				return this.convertListItem(block, "numbered", indent);
			case "to_do":
				return this.convertTodo(block, indent);
			case "quote":
				return this.convertQuote(block);
			case "code":
				return this.convertCode(block);
			case "callout":
				return this.convertCallout(block);
			case "divider":
				return "---\n";
			case "image":
				return this.convertImage(block);
			case "bookmark":
				return this.convertBookmark(block);
			case "equation":
				return this.convertEquation(block);
			case "toggle":
				return this.convertToggle(block, depth);
			case "column_list":
				return this.convertColumnList(block, depth);
			case "column":
				return this.convertColumn(block, depth);
			case "table":
				return this.convertTable(block);
			case "link_to_page":
				return this.convertLinkToPage(block);
			case "divider":
				return "---\n\n";
			default:
				// 未知类型跳过
				return "";
		}
	}

	private convertParagraph(block: BlockObjectResponse, indent: string): string {
		
		const richText = (block as any).paragraph?.rich_text || [];
		const content = richTextToMarkdown(richText);
		return content ? `${indent}${content}\n\n` : "\n";
	}

	private convertHeading(block: BlockObjectResponse, level: number): string {
		const key = `heading_${level}` as const;
		
		const richText = block[key]?.rich_text || [];
		const content = richTextToMarkdown(richText);
		return content ? `${"#".repeat(level)} ${content}\n\n` : "";
	}

	private convertListItem(block: BlockObjectResponse, type: string, indent: string): string {
		
		const richText = block[type === "bulleted" ? "bulleted_list_item" : "numbered_list_item"]?.rich_text || [];
		const content = richTextToMarkdown(richText);
		const prefix = type === "bulleted" ? "- " : "1. ";
		return content ? `${indent}${prefix}${content}\n` : "";
	}

	private convertTodo(block: BlockObjectResponse, indent: string): string {
		
		const richText = (block as any).to_do?.rich_text || [];
		
		const checked = (block as any).to_do?.checked || false;
		const content = richTextToMarkdown(richText);
		const prefix = checked ? "- [x] " : "- [ ] ";
		return content ? `${indent}${prefix}${content}\n` : "";
	}

	private convertQuote(block: BlockObjectResponse): string {
		
		const richText = (block as any).quote?.rich_text || [];
		const content = richTextToMarkdown(richText);
		return content ? `> ${content}\n\n` : "";
	}

	private convertCode(block: BlockObjectResponse): string {
		
		const richText = (block as any).code?.rich_text || [];
		
		const language = (block as any).code?.language || "";
		const content = richText.map((t: { plain_text: string }) => t.plain_text).join("");
		return content ? `\`\`\`${language}\n${content}\n\`\`\`\n\n` : "";
	}

	private convertCallout(block: BlockObjectResponse): string {
		
		const richText = (block as any).callout?.rich_text || [];
		
		const icon = (block as any).callout?.icon;
		const content = richTextToMarkdown(richText);
		const iconText = icon?.emoji || "💡";
		return content ? `:::tip[${iconText}]\n${content}\n:::\n\n` : "";
	}

	private convertImage(block: BlockObjectResponse): string {
		
		const image = (block as any).image;
		const url = image?.file?.url || image?.external?.url || "";
		
		const caption = richTextToMarkdown(image?.caption || []);

		if (!url) return "";

		// 提取文件名用于本地存储
		const filename = `notion-image-${Date.now()}-${Math.random().toString(36).slice(2, 11)}.png`;
		this.imageUrls.push({ original: url, filename });

		// 使用占位路径，后续会替换为本地路径
		return `![${caption || "image"}](/images/notion/${filename})\n\n`;
	}

	private convertBookmark(block: BlockObjectResponse): string {
		
		const url = (block as any).bookmark?.url || "";
		return url ? `<${url}>\n\n` : "";
	}

	private convertEquation(block: BlockObjectResponse): string {
		
		const expression = (block as any).equation?.expression || "";
		return expression ? `$$${expression}$$\n\n` : "";
	}

	private convertToggle(block: BlockObjectResponse, depth: number): string {
		const richText = (block as any).toggle?.rich_text || [];
		const summary = richTextToMarkdown(richText);
		// Toggle 的内容在子 blocks 中，这里只返回开头标签（不包括闭合标签）
		return summary ? `<details><summary>${summary}</summary>\n\n` : "";
	}

	private convertColumnList(block: BlockObjectResponse, depth: number): string {
		// Column list 本身只是容器，内容在 column 中
		// 我们使用 HTML div + flex 布局来实现
		return `<div class="notion-columns" style="display: flex; gap: 1rem; margin: 1rem 0;">\n`;
	}

	private convertColumn(block: BlockObjectResponse, depth: number): string {
		// Column 也是容器，实际内容在其子 blocks 中
		// 使用 flex: 1 让列等宽
		return `  <div class="notion-column" style="flex: 1;">\n`;
	}

	private convertTable(block: BlockObjectResponse): string {
		// Table 内容在 table_row 子 blocks 中
		// 这里返回占位，实际处理在批量转换时
		return "\n<!-- Table content will be processed separately -->\n\n";
	}

	private convertLinkToPage(block: BlockObjectResponse): string {
		
		const pageId = (block as any).link_to_page?.page_id || "";
		return pageId ? `[Linked Page](https://notion.so/${pageId})\n\n` : "";
	}
}

// 批量转换 blocks
export function convertBlocksToMarkdown(
	blocks: BlockObjectResponse[],
): {
	markdown: string;
	imageUrls: Array<{ original: string; filename: string }>;
} {
	const converter = new BlockConverter();
	const result = convertBlocksRecursively(blocks, converter, 0);
	return {
		markdown: result.markdown.trim(),
		imageUrls: converter.getImageUrls(),
	};
}

// 递归转换 blocks，支持嵌套结构
function convertBlocksRecursively(
	blocks: BlockObjectResponse[],
	converter: BlockConverter,
	depth: number,
	parentType?: string,
): { markdown: string; processedCount: number } {
	let markdown = "";
	let processedCount = 0;

	// 处理列表连续性
	let inBulletedList = false;
	let inNumberedList = false;

	let i = 0;
	while (i < blocks.length) {
		const block = blocks[i];

		// 处理列表连续性
		if (block.type !== "bulleted_list_item" && inBulletedList) {
			markdown += "\n";
			inBulletedList = false;
		}
		if (block.type !== "numbered_list_item" && inNumberedList) {
			markdown += "\n";
			inNumberedList = false;
		}
		if (block.type === "bulleted_list_item") inBulletedList = true;
		if (block.type === "numbered_list_item") inNumberedList = true;

		// 转换 block
		const converted = converter.convert(block, depth);

		// 处理 column_list：递归处理其 column 子项
		if (block.type === "column_list") {
			markdown += converted; // <div class="notion-columns">

			// 寻找并处理所有 column 子项
			let j = i + 1;
			while (j < blocks.length && blocks[j].type === "column") {
				const columnBlock = blocks[j];
                markdown += converter.convert(columnBlock, depth + 1); // <div class="notion-column">

				// 递归处理 column 的子内容（column 后面的 blocks 直到下一个 column 或 column_list 结束）
				const childBlocks: BlockObjectResponse[] = [];
				let k = j + 1;
				while (k < blocks.length &&
					   blocks[k].type !== "column" &&
					   blocks[k].type !== "column_list") {
					childBlocks.push(blocks[k]);
					k++;
				}

				// 递归转换子 blocks
				if (childBlocks.length > 0) {
					const childResult = convertBlocksRecursively(childBlocks, converter, depth + 2, "column");
					markdown += childResult.markdown;
				}

				markdown += "  </div>\n"; // close column
				j = k;
			}

			markdown += "</div>\n\n"; // close column_list
			i = j; // 跳过已处理的 blocks
			processedCount += (j - i);
			continue;
		}

		// 跳过已在 column_list 处理中的 column
		if (block.type === "column") {
			i++;
			processedCount++;
			continue;
		}

		// 处理 toggle：递归获取子内容
		if (block.type === "toggle") {
			markdown += converted; // <details><summary>...</summary>

			// Toggle 的子 blocks 紧随其后
			const childBlocks: BlockObjectResponse[] = [];
			let j = i + 1;
			while (j < blocks.length) {
				// 简单的深度检测：如果遇到同级的 block，停止
				if (isTopLevelBlock(blocks[j])) break;
				childBlocks.push(blocks[j]);
				j++;
			}

			if (childBlocks.length > 0) {
				const childResult = convertBlocksRecursively(childBlocks, converter, depth + 1, "toggle");
				markdown += childResult.markdown;
				i = j;
				processedCount += childBlocks.length;
			} else {
				i++;
			}

			markdown += "</details>\n\n";
			continue;
		}

		// 其他 block 直接添加
		markdown += converted;
		i++;
		processedCount++;
	}

	// 关闭未闭合的列表
	if (inBulletedList || inNumberedList) {
		markdown += "\n";
	}

	return { markdown, processedCount };
}

// 判断是否是顶级 block（用于嵌套检测）
function isTopLevelBlock(block: BlockObjectResponse): boolean {
	const topLevelTypes = [
		"heading_1", "heading_2", "heading_3",
		"paragraph", "divider",
		"column_list", "column",
		"table", "table_row",
	];
	return topLevelTypes.includes(block.type);
}

// 注：由于 NotionPostEntry 和 CollectionEntry 不完全兼容，
// 建议在需要时直接类型断言或使用 UnifiedPost 类型
