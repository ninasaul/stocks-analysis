# TuringFin

TuringFin 是一个投研辅助应用。仓库采用 monorepo 结构，包含 Web 前端、FastAPI 后端、Tauri 桌面端，以及一个微信小程序目录。

当前桌面端不是完整离线应用。生产构建将主窗口初始 URL 设为远程 Web 工作台（由 `DESKTOP_WEB_URL` 与可选的 `DESKTOP_WEB_PATH` 决定），仍保留 Web 端的统一发布能力。`dist/index.html` 仅作打包占位，启动时直接加载远程页面。

## 项目结构

```text
.
├── apps
│   ├── api          # FastAPI 后端
│   ├── desktop      # Tauri 桌面端
│   ├── mp-weixin    # 微信小程序
│   └── web          # Next.js Web 前端
├── docs             # 产品与技术文档
├── scripts          # 部署脚本
├── package.json     # npm workspaces 与根命令
└── turbo.json       # Turbo 任务配置
```

## 技术栈

- Web：Next.js 16、React 19、TypeScript、Tailwind CSS 4
- 状态与数据：Zustand、TanStack Query、nuqs
- UI：shadcn/ui、Base UI、Framer Motion
- API：FastAPI、Uvicorn、Python 3.11+
- 桌面端：Tauri v2
- 任务编排：npm workspaces、Turborepo

## 环境要求

- Node.js 20 或更高版本
- npm，建议使用根目录 `package.json` 中声明的版本
- Python 3.11 或更高版本
- 构建桌面端需要 Rust 和 Tauri 所需的系统依赖

macOS 构建桌面端通常需要 Xcode Command Line Tools。Windows 安装包建议在 Windows 机器或 GitHub Actions 的 `windows-latest` runner 上构建。

## 安装依赖

在仓库根目录安装 Node 依赖：

```bash
npm install
```

后端建议使用虚拟环境：

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..
```

Windows 下激活虚拟环境：

```powershell
apps\api\.venv\Scripts\activate
```

## 本地开发

启动全部服务：

```bash
npm run dev
```

默认端口：

- Web：`http://localhost:4000`
- API：`http://localhost:8011`

也可以只启动某个 workspace：

```bash
npm run dev -w web
npm run dev -w api
```

## 环境变量

Web 端会读取公开 API 地址：

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8011
```

未设置时，浏览器请求默认指向 `http://localhost:8011`。

后端环境变量放在 `apps/api/.env`。示例文件见：

```text
apps/api/.env.example
```

不要提交真实密钥或生产环境 `.env` 文件。

## 常用命令

```bash
npm run dev
npm run build
npm run lint
```

根命令由 Turbo 分发到各 workspace。

单独构建 Web：

```bash
npm run build -w web
```

单独检查 API：

```bash
npm run lint -w api
```

## 桌面端

桌面端位于：

```text
apps/desktop
```

开发时先启动 Web：

```bash
npm run dev
```

再启动 Tauri：

```bash
npm run desktop:dev
```

生产打包时通过 `DESKTOP_WEB_URL` 指定远程 Web 地址。若只提供域名，桌面启动页会默认指向 `/app/analyze`。

```bash
DESKTOP_WEB_URL=http://139.199.71.77:3000 npm run desktop:build
```

也可以显式指定路径：

```bash
DESKTOP_WEB_URL=http://139.199.71.77:3000 DESKTOP_WEB_PATH=/app/analyze npm run desktop:build
```

macOS 产物：

```text
apps/desktop/src-tauri/target/release/bundle/macos/TuringFin.app
apps/desktop/src-tauri/target/release/bundle/dmg/TuringFin_0.1.0_aarch64.dmg
```

Windows 产物需要在 Windows 环境构建。项目里已经提供 GitHub Actions 工作流：

```text
.github/workflows/build-desktop.yml
```

在 GitHub Actions 手动运行 `Build Desktop Clients` 后，可以下载 macOS 和 Windows artifact。

## 桌面端设计说明

当前桌面端采用“启动即加载远程工作台”的方式：

- 生产构建在 `tauri.generated.conf.json` 中为窗口设置 `url`，应用打开即深链到远程 Web（默认路径为 `/app/analyze`，可用 `DESKTOP_WEB_PATH` 覆盖）。
- `dist/index.html` 仅满足 Tauri 对 `frontendDist` 的打包要求，正常启动时不会作为首屏展示。
- Web 页面仍由远程服务提供，便于统一发布和热更新。

这不是完整离线包。若要完全离线，需要把 FastAPI、Python 运行时、数据依赖和前端资源一起打进桌面端，维护成本会明显增加。

## 图标

桌面端源图标：

```text
apps/desktop/app-icon.svg
```

重新生成 Tauri 图标：

```bash
npm --workspace desktop exec -- tauri icon app-icon.svg
```

生成后的图标位于：

```text
apps/desktop/src-tauri/icons
```

macOS 使用 `icon.icns`，Windows 使用 `icon.ico` 和 Windows Store 相关 PNG。

## 部署 Web

VPS 部署脚本：

```bash
scripts/deploy-web-vps.sh
```

示例环境变量文件：

```text
scripts/deploy-web-vps.env.example
```

## 后端

API 入口：

```text
apps/api/app/main.py
```

开发启动：

```bash
cd apps/api
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8011
```

接口文档：

- `http://localhost:8011/docs`
- `http://localhost:8011/redoc`

## 注意事项

- `apps/web` 当前是 Next.js standalone 模式，不是纯静态站点。
- 不建议短期内强行把完整 Web 静态导出后塞进 Tauri；动态路由、API route 和登录态会带来额外改造。
- 桌面端如果进入工作台后卡在“正在验证登录状态...”，优先检查 Web 端认证逻辑和远程服务状态。
- `apps/desktop/src-tauri/target`、`.next` 等构建产物不应提交。

## 文档

产品与实现文档主要放在 `docs/`：

```text
docs/product-requirements.md
docs/frontend-architecture.md
docs/timing-agent-simplified.md
```

## License

当前仓库未附带许可证文件。如需开源发布，请先补充 `LICENSE`。
