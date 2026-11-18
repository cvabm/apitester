# ApiTester · HTTP / WebSocket 桌面调试工具

[![Windows build](https://github.com/cvabm/apitester/actions/workflows/windows.yml/badge.svg)](https://github.com/cvabm/apitester/actions/workflows/windows.yml)

一个基于 Wails + Go 的 Windows HTTP / WebSocket 接口管理与调试工具。

## 下载与使用

- [正式版本](https://github.com/cvabm/apitester/releases)：发布后下载 `ApiTester-windows-amd64.zip`；没有版本时可使用下面的构建产物。
- [自动构建](https://github.com/cvabm/apitester/actions/workflows/windows.yml)：进入成功的运行，下载 `ApiTester-windows-amd64` Artifact（需登录 GitHub，保留 14 天）。

解压后运行 `ApiTester.exe`。需要 Windows 10/11 x64 和 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)，不需要安装开发工具。当前构建未做代码签名。

第一次启动选择数据文件夹，再创建项目、接口和环境。详细操作、备份和常见问题见 [使用说明](docs/USER_GUIDE.zh-CN.md)。

## 主要功能

- 文档模式：按项目和模块维护 HTTP 接口或 WebSocket 消息，无需先创建环境。
- 调试模式：选择环境后执行已保存的接口；环境只提供 `BASE_URL` 地址前缀和变量值。
- HTTP 调试对齐 CyberAPI 工作台：左目录、中请求、右本次响应（状态码 / 耗时 / 大小 + 响应体 / 响应头）；顶栏控件与以前一样直接显示。WebSocket 调试仍用消息列表和底部发送框。
- 支持 `http`、`https`、`ws`、`wss`，以及 Params、Headers、Auth、Body、重定向和 WebSocket subprotocol。
- 项目、环境和接口分层保存；每个环境只属于一个项目，同项目数据保存在一个 JSON 文件中。
- 支持接口目录导入导出、请求记录、会话日志和历史搜索。
- 每次启动默认进入文档模式。
- 可导入 Postman Collection、ApiZza 项目和 OpenAPI/Swagger（JSON/YAML），支持从文件或 URL 导入，支持 Cookie 管理及 curl 导出。
- HTTPS/WSS 默认校验证书，自签名测试需显式启用“忽略证书错误（不安全）”。

## 数据目录

首次启动会要求选择数据文件夹，之后记住该位置；选择取消或失败不会保存默认位置。新默认目录名为 `apitester-data`。

目录统一使用 `apitester-data`，不保留旧名称的兼容或自动迁移逻辑。记住的目录失效或不可写时，会重新要求选择。

所选目录中包含：

- `connection-profiles/`：项目、环境和接口定义，一个项目一个 JSON 文件。
- `api-requests/`：HTTP / WebSocket 会话日志。

建议选择仓库和 `build/bin` 之外的目录，避免清理构建产物时误删。应用不会自动把该目录加入主仓库；是否提交由该目录自身的 Git 配置决定。

**鉴权信息和日志以明文存储。** 分享接口目录前请脱敏，不要提交真实密码、Token、Cookie 或业务数据。更多限制见 [安全说明](SECURITY.md)。

已有独立数据仓库时，启动程序后选择包含这两个子目录的仓库根目录即可，无需把数据复制进程序源码。

例如本地目录为 `apitester/apitester-data/` 时，选择 `apitester-data` 这一层。程序仓库忽略该目录；独立数据仓库的 Git 历史及远端配置不受程序打包影响。

## 开发

本轮验证环境：Go **1.26.6**、Node.js **24.18.0**、Windows x64。`go.mod` 声明 Go 1.25.0，并锁定 Go 1.26.6 工具链（启用自动工具链时会按需下载）；CI 使用上述已验证版本。还需 WebView2；竞态检查需要 PATH 中可用的 GCC（例如 MinGW-w64）。

```bash
go run github.com/wailsapp/wails/v2/cmd/wails@v2.13.0 dev
```

构建工具与项目的 Wails 依赖保持一致。先生成前端资源，再运行 Go 测试（后端通过 `go:embed` 引用 `frontend/dist`）：

```bash
cd frontend
npm ci
npm test
npm audit --audit-level=moderate
npm run build
cd ..
go mod verify
go test -race -count=1 ./...
go vet ./...
go run golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...
go run github.com/wailsapp/wails/v2/cmd/wails@v2.13.0 build -clean -trimpath -platform windows/amd64
```

产物位于 `build/bin/ApiTester.exe`。

在 PowerShell 中运行 `.\scripts\package-windows.ps1` 可生成 `build/bin/ApiTester-windows-amd64.zip` 和 `SHA256SUMS.txt`。下载包包含程序、使用说明、更新记录和第三方许可，不包含项目数据及日志。

可用 `Get-FileHash .\ApiTester-windows-amd64.zip -Algorithm SHA256` 核对下载包。

已有私有数据的兼容性检查可在 PowerShell 中按需运行：

```powershell
$env:APITESTER_TEST_DATA = 'D:\path\to\private-data'
go test -race -run '^TestPrivateDataOfflineCompatibility$' -v ./...
Remove-Item Env:APITESTER_TEST_DATA
```

该测试只在临时副本上进行项目读取和保存，不请求真实接口，不修改原数据文件。普通测试和 CI 默认跳过；不要把私有数据或凭据上传到公共 CI。

## 自动构建与发布

推送 `main`、提交 Pull Request 或手动运行 Workflow，会测试、构建并上传 Windows 下载包。推送 `v*` 标签时，会创建 **Release 草稿**，由维护者确认版本号、更新记录和产物后手动公开。

发布前请更新 `wails.json` 的 `info.productVersion` 和 [更新记录](CHANGELOG.md)，确保测试通过；不要在未确认的提交上直接打版本标签。已有 Release 需人工处理，流程不会覆盖它。
