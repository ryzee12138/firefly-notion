# Notion 数据源改造 Firefly 实施方案

## 1. 目标与边界
- 目标：将 Firefly 的文章源从本地文件改为 Notion 数据库。
- 边界：以 Firefly 架构为主，NotionNext 仅参考思路，不照搬其 Next.js 路由与运行时模型。
- 部署约束：固定纯静态托管。
- 本文范围：方案设计与实施步骤，不涉及代码改动。

## 2. 总体实施策略
1. 数据源层替换：将 `src/content/posts` 文件输入替换为 Notion 数据输入，但输出保持 Firefly 兼容结构。
2. 渲染层复用：尽量沿用现有 Firefly 页面与组件链路（列表、详情、归档、RSS、OG、搜索）。
3. 更新机制静态化：采用“构建期拉取 + 主动触发重建”。
4. 策略配置化：认证、缓存、重试、触发方式做成配置项。
5. 风险前置：限流、slug 稳定性、媒体链接有效期、构建失败回滚在设计阶段明确。

## 3. 分步实施清单（细化）

### 第一步：基线梳理与冻结
- 固定现有依赖点：列表、详情、归档、RSS、OG、日历 API、评论路径、搜索索引。
- 冻结路由规则：文章 URL 继续使用 `/posts/{slug}/`。
- 明确验收口径：页面可访问、链接稳定、构建可重复、搜索可用。

### 第二步：Notion 字段模型定稿（以 Firefly 为准）
- 必填字段：`title`、`published`、`slug`。
- 常用字段：`updated`、`draft`、`description`、`image`、`tags`、`category`、`lang`、`pinned`、`comment`、`author`、`sourceLink`、`licenseName`、`licenseUrl`。
- 规则约束：
  - `slug` 全库唯一且稳定。
  - 日期时区统一。
  - 空值采用默认值策略。
  - 草稿在生产环境过滤。

### 第三步：认证与 API 访问层设计
- 默认方案：官方 Notion API（`@notionhq/client` + Integration Token）。
- 兼容后备：保留 NotionNext 风格兼容模式（非默认）。
- 必备能力：
  - 超时控制
  - 429 限流处理（按 `Retry-After` 退避）
  - 指数退避重试
  - 并发上限控制

### 第四步：Notion 到 Firefly 适配层
- 新增字段映射器：Notion property -> Firefly 文章 schema。
- 新增内容转换器：Notion blocks -> Markdown/MDX（先覆盖高频块，低频块降级）。
- 输出结构与现有页面兼容：`id`、`slug`、`data`、`body`。

### 第五步：内容入口改造
- 将文章集合来源由文件扫描切到 Notion 拉取结果。
- `spec` 页面（about/friends/guestbook）首期保持本地文件，降低改造风险。
- 保持 `content-utils` 排序、分页、分类、标签接口不变或最小变动。

### 第六步：全链路兼容验证
- 列表/详情：分页、上下篇、封面、摘要、阅读时长。
- 周边能力：归档、标签、分类、评论路径、日历 API。
- SEO 输出：RSS、OG、sitemap 链接与日期正确。
- 搜索：`astro build` 后 `pagefind` 索引可用。

### 第七步：主动更新机制（纯静态）
- 主机制：Deploy Hook 触发重建。
- 自动触发：
  - 可用 Notion 自动化时，直接触发重建。
  - 无付费自动化时，走定时轮询策略。
- 免费优先兜底：GitHub Actions 定时检查 `last_edited_time`，有变更才触发构建。
- 人工兜底：保留手动触发入口（脚本或接口）。

### 第八步：配置项设计
- `CONTENT_SOURCE=notion`
- `NOTION_AUTH_MODE=official|compat`
- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`
- `NOTION_TIMEOUT_MS`
- `NOTION_RETRY`
- `NOTION_CONCURRENCY`
- `SYNC_MODE=manual|polling|webhook`
- `POLL_INTERVAL_MIN`
- `REBUILD_HOOK_URL`
- `REBUILD_TOKEN`
- `MIN_REBUILD_GAP_SEC`

### 第九步：上线与回滚
- 分阶段发布：先灰度环境，再正式环境。
- 回滚开关：保留 `CONTENT_SOURCE=file` 一键回退。
- 监控告警：拉取失败、映射失败、空文章集合、构建失败。

## 4. 推荐执行顺序
1. 字段模型与配置项定稿。
2. 认证/API 访问层落地。
3. 映射与内容转换层落地。
4. 内容入口替换与页面联调。
5. 主动更新链路接入。
6. 全链路测试与灰度上线。
7. 文档收口与运维交接。

## 5. 关键风险与应对
- 限流风险：统一重试与退避机制，限制并发。
- slug 变更风险：建立 slug 冻结规则与重定向策略。
- 媒体链接风险：对外链做可用性兜底与降级渲染。
- 构建稳定性风险：失败告警 + 可回滚数据源开关。

---

## 附录：沟通问题与结论汇总

### A1. Notion API 认证方式怎么选？
- 结论：默认选官方 API（稳定、长期可维护）；兼容模式仅后备。

### A2. 更新策略是否支持配置切换？
- 结论：支持。建议 `manual / polling / webhook` 三种模式可配。

### A3. 官方 Notion API 有流控或 API 调用费用吗？
- 结论：有速率限制（需处理 429 与重试）；Notion 不按 API 次数单独收费，成本主要在部署构建与套餐能力。

### A4. 纯静态托管与 Node SSR 的差异是什么？
- 结论：纯静态为构建后产物托管；Node SSR 为请求时服务端渲染。当前方案固定纯静态。

### A5. Notion 推送事件是否需要付费？
- 结论：Notion 原生数据库自动化能力通常依赖付费计划；可用免费替代方案（轮询 + 手动触发）。

### A6. 最终方向是否明确？
- 结论：明确。目标是 Firefly 架构内完成 Notion 数据源接入，纯静态托管，并具备主动更新能力。

