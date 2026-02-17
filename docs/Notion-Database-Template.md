# Notion 数据库模板配置指南

本文档说明如何在 Notion 中创建适用于 Firefly 博客系统的数据库。

---

## 1. 创建数据库

### 步骤 1：创建新页面
1. 在 Notion 工作区中，点击左侧边栏的 `+ New page`
2. 选择 `Table` 数据库类型

### 步骤 2：配置数据库
1. 点击数据库右上角的 `...`（更多选项）
2. 选择 `Edit view` → `Layout`
3. 确认数据库类型为 `Table`

---

## 2. 数据库字段配置

在数据库中创建以下字段（Properties）：

| 字段名 | 类型 | 必填 | 说明 |
|-------|------|------|------|
| **Title** | Title | ✅ | 文章标题 |
| **Slug** | Rich text | ✅ | URL 标识符，全库唯一，如 `my-first-post` |
| **Published** | Date | ✅ | 发布日期，选择 Date 类型 |
| **Updated** | Date | ❌ | 更新日期 |
| **Draft** | Checkbox | ❌ | 草稿标记，勾选后不会在站点显示 |
| **Description** | Rich text | ❌ | 文章摘要/描述 |
| **Tags** | Multi-select | ❌ | 标签，可添加多个 |
| **Category** | Select | ❌ | 分类，单选 |
| **Lang** | Select | ❌ | 语言，如 `zh-CN`、`en` |
| **Pinned** | Checkbox | ❌ | 置顶标记，勾选后文章置顶显示 |
| **Image** | Files & media | ❌ | 封面图，上传图片或粘贴链接 |
| **Password** | Rich text | ❌ | 访问密码，填写后文章需要密码查看 |
| **Comment** | Checkbox | ❌ | 是否开启评论，默认开启 |
| **Author** | Rich text | ❌ | 作者名称 |
| **SourceLink** | URL | ❌ | 原文链接（转载文章用） |
| **LicenseName** | Rich text | ❌ | 许可证名称 |
| **LicenseUrl** | URL | ❌ | 许可证链接 |

### 字段配置截图示意

```
┌─────────────────────────────────────────────────────────────┐
│ Title │ Slug │ Published │ Draft │ Tags │ Category │ ...  │
├─────────────────────────────────────────────────────────────┤
│ 文章1 │ post-1 │ 2024-01-01 │ ☐    │ 标签1 │ 分类1   │ ...  │
│ 文章2 │ post-2 │ 2024-01-15 │ ☑    │ 标签2 │ 分类2   │ ...  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 创建 Integration Token

Firefly 需要通过 Notion API 读取数据库内容，你需要创建一个 Integration。

### 步骤 1：创建 Integration

1. 访问 [Notion Integrations](https://www.notion.so/my-integrations)
2. 点击 `New integration`
3. 填写信息：
   - **Name**: Firefly Blog（或其他你喜欢的名字）
   - **Associated workspace**: 选择你的工作区
4. 点击 `Submit`
5. 复制生成的 `Internal Integration Token`（以 `secret_` 开头）

### 步骤 2：关联数据库

1. 回到你的 Notion 数据库页面
2. 点击右上角的 `...`（更多选项）
3. 选择 `Add connections`
4. 搜索并选择你刚创建的 Integration（如 "Firefly Blog"）
5. 点击 `Confirm`

---

## 4. 获取 Database ID

Database ID 用于标识你的数据库，有两种获取方式：

### 方式一：从 URL 获取

1. 在浏览器中打开你的 Notion 数据库页面
2. 复制 URL，格式类似：
   ```
   https://www.notion.so/workspace/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx?v=...
   ```
3. Database ID 是 URL 中第一个 32 位字符串：
   ```
   xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### 方式二：从页面分享链接获取

1. 点击数据库页面右上角的 `Share`
2. 点击 `Copy link`
3. 链接格式类似：
   ```
   https://www.notion.so/xxxxxxxxx?v=...
   ```
4. Database ID 是 `notion.so/` 后的字符串

---

## 5. 配置环境变量

将以下信息填入 `.env.local` 文件：

```bash
# Notion Integration Token
NOTION_TOKEN=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Notion Database ID
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 6. 编写第一篇文章

### 步骤 1：添加页面

1. 在数据库中点击 `+ New` 创建新页面
2. 填写 Title 和 Slug（必填）
3. 设置 Published 日期

### 步骤 2：编写内容

1. 点击刚创建的页面标题进入编辑模式
2. 在页面正文中编写文章内容
3. 使用 Notion 的富文本编辑器添加格式、图片、代码块等

### 步骤 3：支持的 Notion 块

| Notion 块 | Firefly 支持状态 | 说明 |
|----------|----------------|------|
| Paragraph | ✅ | 段落 |
| Heading 1/2/3 | ✅ | 标题 |
| Bulleted list | ✅ | 无序列表 |
| Numbered list | ✅ | 有序列表 |
| Code | ✅ | 代码块，支持语法高亮 |
| Quote | ✅ | 引用块 |
| Callout | ✅ | 提示框 |
| Toggle | ✅ | 可折叠内容 |
| Divider | ✅ | 分割线 |
| Image | ✅ | 图片（构建时下载到本地） |
| Column list / Column | ✅ | 分栏布局 |
| Table | ✅ | 表格 |
| Bookmark | ✅ | 链接卡片 |
| Equation | ✅ | 数学公式（KaTeX） |
| Video / File / PDF | ⚠️ | 转为链接 |
| Embed | ⚠️ | 部分支持（YouTube 等） |
| Database | ❌ | 不支持，会被跳过 |

---

## 7. 密码保护文章

如需为文章设置访问密码：

1. 在数据库的 `Password` 字段中填写密码（纯文本）
2. 构建时密码会被哈希处理
3. 访问文章时读者需要输入正确密码才能查看内容

**注意**：由于纯静态站点的限制，文章内容仍存在于页面源码中，密码保护仅提供基本的访问控制，不适合保护高度敏感内容。

---

## 8. 常见问题

### Q: 文章没有出现在站点中？

检查以下几点：
- Slug 字段是否填写
- Draft 是否被勾选（勾选会隐藏）
- Published 日期是否是未来日期

### Q: 图片无法显示？

Notion 图片链接有有效期，Firefly 构建时会自动下载图片到本地。如果图片仍无法显示：
- 检查构建日志中的图片下载是否成功
- 确认 `IMAGE_STRATEGY=download` 配置

### Q: 如何修改已发布文章？

直接在 Notion 中编辑，然后重新构建站点：
- 本地开发：保存后会自动更新（有缓存，最多延迟 5 分钟）
- 生产环境：触发 Deploy Hook 重新构建

### Q: 可以有多人协作编辑吗？

可以，邀请其他 Notion 用户访问数据库页面，设置适当的权限即可。

---

## 9. 字段映射速查表

```
Notion Field    →    Firefly Frontmatter
────────────────────────────────────────
Title                title
Slug                 slug
Published            published
Updated              updated
Draft                draft
Description          description
Tags                 tags
Category             category
Lang                 lang
Pinned               pinned
Image                image
Password             password
Comment              comment
Author               author
SourceLink           sourceLink
LicenseName          licenseName
LicenseUrl           licenseUrl
```

---

配置完成后，运行 `npm run dev` 启动开发服务器，如果一切正常，你应该能在首页看到从 Notion 拉取的文章列表。
