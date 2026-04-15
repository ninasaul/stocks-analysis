# 前端架构说明（Next.js + Zustand + shadcn/ui）

本文描述 `apps/web` 的前端架构、职责边界与扩展建议。仓库根目录为 Turborepo monorepo，本应用与 `apps/api`（FastAPI）协作。依赖已在 `apps/web/package.json` 中落地：Next.js、Tailwind 4、shadcn/ui（preset `base-nova`、Base UI 基元）、Zustand、TanStack Query、nuqs、Zod、React Hook Form；示例用法见 `apps/web/src/components/home-content.tsx` 与根布局中的 `AppProviders`。

---

## 1. 目标技术栈

| 层级 | 技术 | 职责 |
|------|------|------|
| 框架 | Next.js（App Router） | 路由、布局、SSR/RSC、API Route 或 BFF、静态资源 |
| UI 与样式 | React、Tailwind CSS、shadcn/ui | 组件实现、设计令牌、可访问的复合组件（当前 preset 基于 Base UI） |
| 远程数据 | TanStack Query | 缓存、重试、与后端交互的异步状态 |
| URL 状态 | nuqs | 可分享、可刷新的查询参数状态（使用 `useQueryState` 的页面需 `Suspense` 边界以满足 Next.js 预渲染要求） |
| 表单与校验 | React Hook Form、Zod、`@hookform/resolvers` | 客户端表单与 schema 校验 |
| 客户端全局状态 | Zustand | 跨组件的 UI 状态、会话内偏好、不依赖 URL 的轻量业务状态 |
| 类型与工具 | TypeScript | 端到端类型约束 |

---

## 2. 与 monorepo 的关系

- 根目录 `npm run dev` 通过 Turbo 并行启动各 workspace；前端仅关心 `apps/web` 内的依赖与脚本。
- 与后端通信优先使用**明确的基础 URL**（环境变量，如 `NEXT_PUBLIC_API_BASE_URL`），避免在组件内硬编码主机名。
- 若未来抽取共享类型或常量，可考虑 `packages/`  workspace；当前保持 `apps/web` 自包含即可。

---

## 3. 推荐目录结构

在现有 `src/app` 基础上，建议逐步演化为：

```
apps/web/
├── src/
│   ├── app/                 # App Router：页面、layout、loading、error
│   ├── components/
│   │   ├── ui/              # shadcn 生成的基元组件（Button、Dialog 等）
│   │   └── ...              # 业务复合组件（引用 ui/）
│   ├── lib/                 # 纯函数、fetch 封装、常量
│   ├── stores/              # Zustand stores（按域拆分文件）
│   └── hooks/               # 可复用 React hooks
├── components.json          # shadcn CLI 配置（初始化后生成）
└── ...
```

原则：**页面薄、业务逻辑进 hooks 或 server 层、可复用 UI 进 components**。

---

## 4. Next.js（App Router）

### 4.1 Server 与 Client 边界

- 默认 Server Components：数据获取、访问后端密钥、大段只读渲染放在服务端，减少客户端 JS。
- 仅在需要浏览器 API、订阅、或 Zustand/React 事件时，在文件顶部使用 `"use client"`，并尽量**缩小** client 子树（把 client 组件 leaf 化）。

### 4.2 数据获取策略（与 Zustand 的配合）

- **首屏与 SEO 相关数据**：在 Server Component 中 `fetch` 或调用封装好的 server-only 模块，通过 props 下传。
- **客户端轮询、乐观更新、缓存失效**：见下文「补充建议」中的 TanStack Query；不宜全部塞进 Zustand。
- **纯 UI 状态**（侧边栏开关、当前步骤、临时表单草稿）：适合 Zustand。

### 4.3 路由与布局

- 按业务域划分 route segment，共用布局放在 `layout.tsx`。
- 错误与加载态使用 `error.tsx`、`loading.tsx`，与 shadcn 的 Alert、Skeleton 等组合。

---

## 5. Zustand

### 5.1 适用场景

- 全局 UI：主题切换、布局折叠、抽屉/对话框栈（若不做 URL 驱动）。
- 客户端会话内状态：筛选条件未同步到 URL 前的暂存、向导步骤。
- 小型跨页状态：注意与 URL 可分享性之间的权衡。

### 5.2 不适用场景

- 服务端已可拿到的列表/详情：优先 RSC + props 或请求层缓存。
- 复杂异步列表缓存、分页、去重请求：**交给 TanStack Query** 更省事。

### 5.3 工程化建议

- **按域拆分**多个 store 文件（如 `stores/use-ui-store.ts`），避免单文件巨型 store。
- 需要持久化时用 `persist` 中间件，并明确 **SSR**：首屏避免依赖未水合的持久化值导致闪烁，可用 `skipHydration` 等模式（以官方文档为准）。
- TypeScript：`create` 时推断 state 类型，actions 与 selectors 显式命名导出。

---

## 6. shadcn/ui

### 6.1 定位

- shadcn 将组件**拷贝**到仓库，便于定制；当前 preset 基于 **Base UI** 与 Tailwind，与本项目 Tailwind 4 路线一致。
- `components/ui` 仅放生成的基础件；业务组件放在 `components` 其他子目录并组合 `ui/*`。

### 6.2 主题与设计令牌

- 在 `globals.css` 与 CSS 变量层统一色板与圆角，与 shadcn 的 `cssVariables` 策略对齐，避免在业务组件中散落魔法色值。

### 6.3 表单

- 与 **React Hook Form + Zod**（见下节）组合时，用 shadcn 的 Form、Input、Select 等保持可访问性与一致错误展示。

---

## 7. 与 FastAPI 协作

- 浏览器可达的 API 地址使用 `NEXT_PUBLIC_*`；仅服务端使用的密钥不放 `NEXT_PUBLIC`。
- 在 `apps/web/src/lib` 中集中定义 `fetch` 封装：统一 baseURL、错误解析、超时（按需）。
- 对请求/响应体用 Zod 或共享类型做校验，避免静默字段漂移。

---

## 8. 补充建议（在「Next + Zustand + shadcn」之上的常见增强）

以下并非替代关系，而是**分工更细**时的常见组合。

1. **TanStack Query（React Query）**  
   管理服务端状态：缓存、重试、后台刷新、与乐观更新。Zustand 专注客户端 UI/会话态，避免把「远程数据缓存」手写进 store。

2. **URL 作为状态源（如 nuqs）**  
   筛选、分页、标签页等需要分享或刷新不丢的场景，用查询参数驱动；Zustand 仅作辅助或短期草稿。

3. **Zod + 表单**  
   与 React Hook Form 搭配，在客户端与服务端（若用 Server Actions）复用同一套 schema，降低校验分叉。

4. **Server Actions / Route Handlers**  
   若希望少暴露公网 BFF，可由 Next 转发或代理到 FastAPI，并在服务端持有敏感配置。

5. **测试**  
   Vitest + React Testing Library 测 hooks 与组件；Playwright 测关键用户路径。

6. **可访问性与国际化**  
   Radix/shadcn 已提供较好基础；文案与路由级 i18n 若需要可评估 `next-intl` 等方案。

7. **状态库替代**  
   若团队更偏好原子化细粒度更新，可评估 Jotai；全局 reducer 型流程可用 Redux Toolkit。对多数仪表盘类应用，Zustand 足够轻量。

---

## 9. 演进检查清单

- [x] 环境变量与 API 客户端封装（`apps/web/src/lib/env.ts`、`apps/web/src/lib/api.ts`、`apps/web/.env.example`）  
- [x] `components/ui` 与业务组件目录分离（示例：`apps/web/src/components/home-content.tsx`）  
- [x] 根布局挂载 `QueryClientProvider` 与 `NuqsAdapter`（`apps/web/src/components/providers/app-providers.tsx`）  
- [x] Zustand 示例 store（`apps/web/src/stores/use-ui-store.ts`）  
- [ ] 新增路由优先 Server Component，按需下沉 `"use client"`  
- [ ] 关键业务表单与 API 契约对齐（共享 Zod schema、错误码映射等）  

---

## 10. 文档维护

架构变更（例如引入 `packages/shared`、更换数据层）时，同步更新本文与仓库根目录 `README.md` 中的技术栈表格，避免口头约定与仓库不一致。仓库内其它说明文档统一放在根目录 `docs/` 下。
