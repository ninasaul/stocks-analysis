# stocks-analysis-simple

基于 [Turborepo](https://turbo.build/) 的 monorepo：前端为 [Next.js](https://nextjs.org/)（App Router），后端为 [FastAPI](https://fastapi.tiangolo.com/)（Python）。仓库根目录通过 npm workspaces 管理多个应用，并由 Turbo 统一编排 `dev`、`build`、`lint` 等任务。

---

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 构建与任务编排 | Turborepo 2.x | 多包并行、任务缓存与依赖顺序 |
| 包管理 | npm workspaces | `apps/*` 作为工作区 |
| 前端 | Next.js 16、React 19、TypeScript | App Router，默认启用 React Compiler |
| 样式 | Tailwind CSS 4 | 与 `@tailwindcss/postcss` 集成 |
| 代码质量（前端） | ESLint 9、`eslint-config-next` | `apps/web` 内执行 |
| 后端 | Python 3.11+、FastAPI、Uvicorn | ASGI 服务，开发时热重载 |

---

## 仓库结构

```
.
├── package.json           # 根脚本、workspaces、packageManager（Turbo 要求）
├── package-lock.json
├── turbo.json             # Turbo 任务：build / dev / lint
├── README.md
├── .gitignore
└── apps/
    ├── web/               # Next.js 前端
    │   ├── app/           # App Router 页面与布局
    │   ├── public/
    │   ├── next.config.ts
    │   ├── tsconfig.json
    │   ├── eslint.config.mjs
    │   └── package.json
    └── api/               # FastAPI 后端
        ├── app/
        │   ├── __init__.py
        │   └── main.py    # 应用入口与路由
        ├── package.json   # 供 Turbo 调用的 npm scripts（包装 python3 命令）
        ├── pyproject.toml # Python 项目元数据与依赖声明
        ├── requirements.txt
        └── dist/          # `npm run build` 在 api 包内生成的占位输出（供 Turbo 缓存）
```

**设计说明**

- **前端** `web` 为标准 Next.js 应用，生产构建产物位于 `apps/web/.next`。
- **后端** `api` 为 Python 项目；根目录仍为其提供 `package.json`，使 Turbo 能以与其他包相同的方式调用 `dev` / `build` / `lint`，而无需单独维护一套与 npm 无关的调度器。
- **`dist/.gitkeep`**：当前 `api` 的 `build` 脚本在完成字节码编译后会写入 `dist` 占位文件，以便与根目录 `turbo.json` 中的 `outputs`（`dist/**`）对齐，避免 Turbo 对「无输出任务」的告警。若后续改为打包 wheel 或 Docker 镜像，可改为真实构建产物路径。

---

## 环境要求

- **Node.js**：`>= 20`（见根目录 `package.json` 的 `engines`）。
- **npm**：建议与根目录 `packageManager` 字段一致（例如 `npm@11.6.1`）。若版本不一致，可修改根 `package.json` 中的 `packageManager`，或使用 [Corepack](https://nodejs.org/api/corepack.html) 固定版本。
- **Python**：`>= 3.11`（见 `apps/api/pyproject.toml` 的 `requires-python`）。
- 系统需能执行 **`python3`**（macOS/Linux 常见；`api` 的 npm scripts 使用 `python3` 而非 `python`）。

---

## 快速开始

### 1. 安装 Node 依赖

在仓库根目录执行：

```bash
npm install
```

该命令会安装根依赖（含 `turbo`），并根据 workspaces 安装 `apps/web` 等子包依赖。依赖默认提升（hoist）到根目录 `node_modules`，子应用一般不再各自保留一份 `node_modules`（以你本机 npm 行为为准）。

### 2. 安装 Python 依赖（后端）

在 **`apps/api`** 目录建议使用虚拟环境，避免污染全局 Python：

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ../..
```

安装完成后，确保激活虚拟环境再运行根目录的 `npm run dev`（或单独运行 `api` 的 `dev`），以便 `python3 -m uvicorn` 能找到已安装的包。

也可使用 `pip install -e .`（若你为 `api` 配置了可编辑安装与构建后端）；当前仓库以 **`requirements.txt` 为主**安装路径，与 `pyproject.toml` 中的依赖列表保持一致即可。

### 3. 启动开发环境

在仓库根目录：

```bash
npm run dev
```

Turbo 会并行执行各 workspace 的 `dev` 脚本：

- **web**：`next dev`，默认 [http://localhost:3000](http://localhost:3000)
- **api**：`python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`，即 [http://localhost:8000](http://localhost:8000)

单独启动某一端（仍在根目录，使用 npm workspace 语法）：

```bash
npm run dev -w web
npm run dev -w api
```

---

## 构建与生产运行

### 全仓构建

```bash
npm run build
```

Turbo 按 `turbo.json` 执行各包的 `build`：

- **web**：`next build`，输出在 `apps/web/.next`。
- **api**：`python3 -m compileall app` 并写入 `dist/.gitkeep`（占位 + 校验语法）；若你增加类型检查或测试，可扩展该脚本。

### 仅构建前端

```bash
npm run build -w web
```

### 生产启动前端

```bash
npm run start -w web
```

默认监听 `3000` 端口（Next.js 行为以官方文档为准）。

### 生产启动后端

在已安装依赖且配置好环境的前提下：

```bash
cd apps/api
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

生产环境建议配合进程管理（systemd、supervisor、Kubernetes 等）与 HTTPS 终止代理（如 Nginx）。

---

## 代码检查（Lint）

```bash
npm run lint
```

- **web**：执行 `eslint`（配置见 `apps/web/eslint.config.mjs`）。
- **api**：当前使用 `python3 -m compileall app` 作为轻量静态检查（确保 `.py` 可编译）。后续可替换为 [Ruff](https://docs.astral.sh/ruff/)、[mypy](https://mypy.readthedocs.io/) 等，并在 `apps/api/package.json` 的 `lint` 脚本中更新命令。

仅检查某一包：

```bash
npm run lint -w web
npm run lint -w api
```

---

## Turbo 配置说明

根目录 `turbo.json` 定义了以下任务：

| 任务 | 行为摘要 |
|------|----------|
| `build` | `dependsOn: ["^build"]`：先构建被依赖的上游包（当前主要为 workspace 间预留）；`outputs` 包含 Next 的 `.next` 与 `api` 的 `dist/**`。 |
| `dev` | `cache: false`、`persistent: true`：开发服务器不参与缓存，且视为长驻进程。 |
| `lint` | `dependsOn: ["^lint"]`：与构建类似，先完成依赖包的 lint（按需扩展 monorepo 内包依赖时生效）。 |

更多选项见官方文档：[Configuring tasks](https://turbo.build/repo/docs/reference/configuration)。

---

## 后端 API 说明

- **应用模块**：`apps/api/app/main.py` 中导出 `app`（FastAPI 实例）。
- **健康检查**：`GET /health` 返回 JSON，例如 `{"status":"ok"}`。
- **CORS**：已允许来源 `http://localhost:3000`，便于本地前后端联调。部署到其他域名时，请修改 `CORSMiddleware` 的 `allow_origins`，或使用环境变量驱动配置（可自行扩展 `main.py`）。

交互式文档（开发时默认开启）：

- Swagger UI：`http://localhost:8000/docs`
- ReDoc：`http://localhost:8000/redoc`

---

## 前端说明

- **框架**：Next.js 16 App Router，入口在 `apps/web/app/`。
- **React Compiler**：`next.config.ts` 中 `reactCompiler: true`。
- **样式**：Tailwind CSS 4；全局样式见 `app/globals.css`（若模板有调整，以实际文件为准）。

若需从浏览器请求后端 API，请使用完整 URL（如 `http://localhost:8000`），或在 Next 中配置 [rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites) / Route Handler 做代理，以避免 CORS 与 cookie 策略问题。

---

## 环境变量（建议扩展）

当前模板未强制要求环境变量。常见扩展方式：

- **前端**：在 `apps/web` 使用 `.env.local`（勿提交密钥）；Next.js 以 `NEXT_PUBLIC_` 前缀暴露给浏览器的变量需谨慎命名。
- **后端**：在 `apps/api` 使用 `.env`，通过 [pydantic-settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) 或 `os.environ` 读取；生产环境用密钥管理注入。

根目录 `.gitignore` 已忽略常见 `.env` 文件名，新增规则时请保持与团队约定一致。

---

## 常见问题

### 1. Turbo 报错：缺少 `packageManager` 字段

Turbo 2.x 要求根 `package.json` 声明 `packageManager`。请保留该字段并与实际 npm 版本对齐。

### 2. `api` 任务提示找不到 `python3`

请安装 Python 3.11+ 并确保 shell 中 `python3` 在 `PATH` 内。若必须使用 `python`，可在 `apps/api/package.json` 中把脚本里的 `python3` 全部替换为 `python`（团队需统一约定）。

### 3. `npm run dev` 启动 api 失败：找不到 `uvicorn` 或 `fastapi`

在运行前激活 **`apps/api`** 下已安装依赖的虚拟环境，或全局安装 `requirements.txt`（不推荐全局）。

### 4. 前端无法跨域访问后端

检查后端 `allow_origins` 是否包含前端实际来源（含端口）。生产环境避免使用 `allow_origins=["*"]` 与 `allow_credentials=True` 的组合（浏览器安全限制）。

---

## 相关链接

- [Turborepo 文档](https://turbo.build/repo/docs)
- [Next.js 文档](https://nextjs.org/docs)
- [FastAPI 文档](https://fastapi.tiangolo.com/)
- [Uvicorn 文档](https://www.uvicorn.org/)

---

## 许可证

根目录未默认附带许可证文件。若开源发布，请补充 `LICENSE` 并在本 README 中注明。
