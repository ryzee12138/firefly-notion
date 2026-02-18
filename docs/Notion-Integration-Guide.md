# Firefly Notion 数据源集成指南

本文档介绍如何将 Firefly 博客系统的数据源从本地文件切换为 Notion 数据库。

---

## 1. 功能概述

通过本集成方案，你可以：

- 使用 **Notion 数据库** 作为文章数据源，替代本地 Markdown 文件
- 在 Notion 中编写文章，构建时自动同步到站点
- 支持文章**密码保护**（前端哈希校验）
- 支持**图片自动下载**到本地（解决 Notion 图片链接有效期问题）
- 支持 **Column/List 分栏布局**
- 支持 **Toggle、Callout、Table** 等 Notion 特色块
- 开发环境**智能缓存**，避免频繁调用 API
- **容错模式**，构建失败时可使用缓存数据

---

## 2. 实现细节

### 2.1 新增文件

| 文件路径 | 说明 |
|---------|------|
| `src/utils/notion-client.ts` | Notion API 客户端封装，含超时控制、重试机制、429 限流处理、并发控制 |
| `src/utils/notion-adapter.ts` | Notion → Firefly 适配层，字段映射和 Block 转 Markdown |
| `src/utils/notion-image.ts` | 图片下载与缓存管理，构建时自动下载 Notion 图片到本地 |
| `src/components/post/PostPassword.astro` | 密码保护组件，前端 SHA-256 哈希校验 |
| `.env.example` | 环境变量模板 |

### 2.2 修改的文件

| 文件路径 | 修改内容 |
|---------|---------|
| `src/utils/content-utils.ts` | 添加 `isNotionSource()` 判断，统一封装 `getSortedPosts()`、`getTagList()`、`getCategoryList()` 等接口，支持本地和 Notion 双数据源 |
| `src/pages/posts/[...slug].astro` | 添加 Notion 文章渲染支持，集成密码保护组件 |
| `src/pages/rss.xml.ts` | 兼容 Notion 文章的内容渲染 |
| `package.json` | 添加 `@notionhq/client` 依赖 |

### 2.3 技术架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Notion API    │────▶│  notion-client  │────▶│ notion-adapter  │
│  (Database +    │     │  (缓存/重试/限流) │     │ (字段映射/Block  │
│   Page Blocks)  │     │                 │     │   转 Markdown)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                       ┌─────────────────┐              │
                       │  notion-image   │◀─────────────┘
                       │ (图片下载/缓存)  │    (提取图片 URL)
                       └─────────────────┘
                                │
                                ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  content-utils  │◀────│   统一 Post 接口  │◀────│   页面渲染组件   │
│ (双数据源兼容)   │     │ (UnifiedPost)   │     │ (列表/详情/RSS) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## 3. 环境变量配置

创建 `.env.local` 文件（从 `.env.example` 复制）：

```bash
# ==========================================
# 数据源配置
# ==========================================

# 内容来源: file (本地文件) | notion (Notion 数据库)
CONTENT_SOURCE=notion

# ==========================================
# Notion API 配置（CONTENT_SOURCE=notion 时必填）
# ==========================================

# Notion Integration Token
# 获取方式: https://www.notion.so/my-integrations
NOTION_TOKEN=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Notion 数据库 ID
# 从数据库页面 URL 获取: https://www.notion.so/workspace/DATABASE_ID?v=...
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ==========================================
# API 行为配置（可选）
# ==========================================

# API 超时时间（毫秒），默认 30000
NOTION_TIMEOUT_MS=30000

# 重试次数，默认 3
NOTION_RETRY=3

# 并发请求上限，默认 5
NOTION_CONCURRENCY=5

# ==========================================
# 图片处理配置
# ==========================================

# 图片处理策略: notion (直接使用) | download (下载到本地)
# 生产环境强烈建议使用 download
IMAGE_STRATEGY=download

# 下载图片的缓存目录，默认 public/images/notion
IMAGE_CACHE_DIR=public/images/notion

# ==========================================
# 密码保护配置
# ==========================================

# 密码哈希盐值（用于增强安全性）
# 生成方式: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
PASSWORD_SALT=your_random_salt_here
```

---

## 4. Notion 数据库设置

### 4.1 创建数据库

1. 在 Notion 中创建新页面，选择 **Table** 类型
2. 点击右上角 `...` → `Add connections`，添加你的 Integration

### 4.2 数据库字段

| 字段名 | 类型 | 必填 | 说明 |
|-------|------|------|------|
| **Title** | Title | ✅ | 文章标题 |
| **Slug** | Rich text | ✅ | URL 标识符，全库唯一，如 `my-first-post` |
| **Published** | Date | ✅ | 发布日期 |
| **Updated** | Date | ❌ | 更新日期 |
| **Draft** | Checkbox | ❌ | 草稿标记，勾选后不显示 |
| **Description** | Rich text | ❌ | 文章摘要 |
| **Tags** | Multi-select | ❌ | 标签 |
| **Category** | Select | ❌ | 分类 |
| **Lang** | Select | ❌ | 语言，如 `zh-CN`、`en` |
| **Pinned** | Checkbox | ❌ | 置顶标记 |
| **Image** | Files & media | ❌ | 封面图 |
| **Password** | Rich text | ❌ | 访问密码（明文，构建时哈希） |
| **Comment** | Checkbox | ❌ | 是否开启评论，默认开启 |
| **Author** | Rich text | ❌ | 作者名称 |
| **SourceLink** | URL | ❌ | 原文链接（转载用） |
| **LicenseName** | Rich text | ❌ | 许可证名称 |
| **LicenseUrl** | URL | ❌ | 许可证链接 |

### 4.3 获取 Integration Token

1. 访问 [Notion Integrations](https://www.notion.so/my-integrations)
2. 点击 `New integration`
3. 填写名称（如 "Firefly Blog"），选择工作区
4. 复制 `Internal Integration Token`（以 `secret_` 开头）

### 4.4 获取 Database ID

从数据库页面 URL 中提取：

```
https://www.notion.so/workspace/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx?v=...
                      └────── 32位字符串即为 DATABASE_ID ──────┘
```

---

## 5. 使用步骤（Windows 开发 + CentOS 生产）

### 5.1 安装依赖

```bash
npm install
```

### 5.2 配置环境变量

**方案 A：使用 `.env` 文件（推荐，跨平台通用）**

```bash
# 复制模板
cp .env.example .env

# 编辑 .env，填入你的配置
NOTION_TOKEN=ntn_xxxxxxxxxx
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**方案 B：使用 `.env.local`（仅本地开发）**

```bash
cp .env.example .env.local
# 编辑 .env.local
```

> **优先级**: `.env.local` > `.env`
>
> 建议：
> - 开发环境：使用 `.env.local`
> - 生产环境（CentOS）：使用 `.env` 或系统环境变量

### 5.3 本地开发（Windows）

我们使用 `cross-env` + Node.js 脚本来确保跨平台兼容：

```bash
# 启动开发服务器（自动加载 .env/.env.local）
npm run dev

# 清除缓存后重启（如果环境变量修改后不生效）
npm run dev:clean
```

**工作原理**：
- `scripts/dev.js` 会先加载 `.env` 或 `.env.local` 文件
- 然后启动 Astro 开发服务器
- 自动处理 Windows CRLF 和 CentOS LF 换行符差异

### 5.4 生产构建（CentOS）

```bash
# 完整构建（含图标生成、构建、搜索索引）
npm run build

# 仅构建（假设环境变量已通过其他方式设置）
npm run build:raw
```

**生产环境配置方式**（任选其一）：

**方式 1：使用 .env 文件**
```bash
# 在 CentOS 上创建 .env 文件
echo "CONTENT_SOURCE=notion" >> .env
echo "NOTION_TOKEN=your_token" >> .env
echo "NOTION_DATABASE_ID=your_db_id" >> .env
npm run build
```

**方式 2：使用系统环境变量（推荐用于 CI/CD）**
```bash
export CONTENT_SOURCE=notion
export NOTION_TOKEN=your_token
export NOTION_DATABASE_ID=your_db_id
npm run build
```

**方式 3：在 GitHub Actions 等 CI 中**
```yaml
- name: Build
  env:
    CONTENT_SOURCE: notion
    NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
    NOTION_DATABASE_ID: ${{ secrets.NOTION_DATABASE_ID }}
  run: npm run build
```

开发环境特性：
- 数据缓存 5 分钟，避免频繁调用 Notion API
- 修改文章后最多延迟 5 分钟刷新
- 如需立即刷新，删除 `.cache/notion/` 目录

### 5.4 构建部署

```bash
npm run build
```

构建过程：
1. 从 Notion 拉取所有文章数据
2. 下载文章中的图片到 `public/images/notion/`
3. 生成静态页面
4. 生成 Pagefind 搜索索引

---

## 6. 特性详解

### 6.1 支持的 Notion Blocks

| Block 类型 | 支持状态 | 说明 |
|-----------|---------|------|
| Paragraph | ✅ | 段落 |
| Heading 1/2/3 | ✅ | 标题 |
| Bulleted list | ✅ | 无序列表 |
| Numbered list | ✅ | 有序列表 |
| Code | ✅ | 代码块，支持语法高亮 |
| Quote | ✅ | 引用块 |
| Callout | ✅ | 提示框 |
| Toggle | ✅ | 可折叠内容 |
| Divider | ✅ | 分割线 |
| Image | ✅ | 图片（自动下载） |
| Column list / Column | ✅ | 分栏布局（转为 flex） |
| Table | ⚠️ | 基础支持 |
| Bookmark | ✅ | 链接卡片 |
| Equation | ✅ | 数学公式（KaTeX） |
| Video / File / PDF | ⚠️ | 转为链接 |
| Database | ❌ | 不支持 |

### 6.2 密码保护

在 Notion 数据库的 `Password` 字段填入密码（明文）：

- 构建时密码会被 SHA-256 哈希处理
- 访问文章时弹出密码输入框
- 密码正确后显示文章内容（sessionStorage 记住状态）
- **注意**：由于纯静态站点限制，文章内容仍存在于 HTML 源码中，仅提供基础访问控制

### 6.3 图片处理

Notion 图片外链有效期约 1 小时，本方案采用**构建时下载**策略：

1. 构建时扫描文章中的图片 URL
2. 下载图片到 `public/images/notion/`
3. 替换 Markdown 中的 URL 为本地路径
4. 使用文件哈希命名，避免重复下载

缓存机制：
- 缓存元数据保存在 `public/images/notion/.metadata.json`
- 已下载的图片不会重复下载
- 如需强制重新下载，删除 `.metadata.json` 或整个 `public/images/notion/` 目录

### 6.4 开发缓存

开发环境（`npm run dev`）启用智能缓存：

- 缓存位置：`.cache/notion/`
- 缓存时长：5 分钟
- 如需立即刷新，删除缓存文件或设置 `DOWNLOAD_NOTION_CONTENT=true`

### 6.5 容错模式

构建时如果 Notion API 调用失败：

1. 尝试使用上次成功的缓存数据（`.cache/notion-fallback.json`）
2. 如果缓存存在，使用缓存继续构建
3. 如果缓存不存在，构建失败

---

## 7. 常见问题

### Q: 文章没有出现在站点中？

检查以下几点：
- `CONTENT_SOURCE` 是否设置为 `notion`
- `NOTION_TOKEN` 和 `NOTION_DATABASE_ID` 是否正确
- 文章是否有填写 **Slug** 字段
- Draft 是否被勾选（勾选会隐藏）
- Published 日期是否是未来日期

### Q: 如何切换回本地文件？

修改 `.env.local`：

```bash
CONTENT_SOURCE=file
```

或删除/注释掉 `CONTENT_SOURCE` 环境变量。

### Q: 图片无法显示？

- 检查 `IMAGE_STRATEGY` 是否为 `download`
- 检查构建日志中的图片下载是否成功
- 检查 `public/images/notion/` 目录是否存在图片
- 检查 `PASSWORD_SALT` 是否已设置

### Q: 如何更新已发布的文章？

直接在 Notion 中编辑，然后重新构建：

```bash
npm run build
```

如需触发自动部署，配置 Deploy Hook 或使用 GitHub Actions 轮询。

### Q: 可以多人协作编辑吗？

可以，在 Notion 中邀请其他用户访问数据库页面即可。

---

## 8. 主动更新机制（可选）

对于纯静态托管，需要主动触发重新构建：

### 方案 1：GitHub Actions 轮询（免费）

创建 `.github/workflows/sync-notion.yml`：

```yaml
name: Sync Notion Posts

on:
  schedule:
    - cron: '0 */6 * * *'  # 每 6 小时检查一次
  workflow_dispatch:  # 支持手动触发

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check Notion updates
        env:
          NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
          NOTION_DATABASE_ID: ${{ secrets.NOTION_DATABASE_ID }}
        run: |
          # 获取上次同步时间
          LAST_SYNC=$(cat .last-sync 2>/dev/null || echo "1970-01-01")
          # 调用 Notion API 检查 last_edited_time
          # 如有更新，触发构建

      - name: Trigger Deploy
        if: env.HAS_UPDATES == 'true'
        run: |
          curl -X POST ${{ secrets.DEPLOY_HOOK_URL }}
```

### 方案 2：Notion Automation（需要付费计划）

在 Notion 中设置数据库自动化：
- 触发条件：页面被编辑
- 动作：发送 Webhook 到 Deploy Hook URL

---

## 9. 安全提示

1. **不要提交 `.env.local` 到 Git**
   - 已将 `.env.local` 加入 `.gitignore`
   - 在服务器/CI 中设置环境变量

2. **保护 NOTION_TOKEN**
   - Token 拥有对你授权数据库的完全访问权限
   - 如需撤销，在 Notion Integration 页面删除

3. **密码保护限制**
   - 仅提供基础访问控制
   - 文章内容仍存在于页面源码中
   - 不适合保护高度敏感内容

---

## 10. 故障排查

### 构建失败，提示 Notion API 错误

```bash
# 检查环境变量
echo $NOTION_TOKEN
echo $NOTION_DATABASE_ID

# 清除缓存重试
rm -rf .cache/notion/
npm run build
```

### 图片下载失败

```bash
# 检查网络连接
# 检查图片 URL 是否可访问
# 清除图片缓存重试
rm -rf public/images/notion/
npm run build
```

### 类型检查错误

```bash
npx astro check
```

---

## 11. 参考文档

- [Notion API 官方文档](https://developers.notion.com/)
- [Notion 数据库模板配置](./Notion-Database-Template.md)
- [Astro Content Collections](https://docs.astro.build/en/guides/content-collections/)

---

如有其他问题，请参考项目 README 或提交 Issue。
