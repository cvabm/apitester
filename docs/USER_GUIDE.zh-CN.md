# ApiTester 使用说明

ApiTester 是 Windows 上的 HTTP / WebSocket 接口管理与调试工具。下载包无需安装 Go、Node.js 或 GCC。

## 开始使用

1. 把 ZIP 解压到一个固定目录，不要直接在压缩包内运行。
2. 运行 `ApiTester.exe`。需要 Windows 10/11 x64 和 Microsoft Edge WebView2 Runtime。
3. 首次启动会先出现程序内提示，再点「选择文件夹」挑选数据目录。建议放在个人文档目录，不要放在程序包、源码仓库或 `build/bin` 内。
4. 默认进入文档模式：创建项目、模块和接口，填写请求地址、Headers、鉴权和请求体。
5. 为项目配置环境及 `BASE_URL`，切换到调试模式，选择环境后执行请求。

如果接口数据已在独立目录或独立 Git 仓库中，直接选择包含 `connection-profiles/` 和 `api-requests/` 的上层目录，不要选择这两个子目录，也不必先导入 JSON。程序和数据分别维护；程序下载包不会附带你的接口数据。

默认目录统一为 `apitester-data`，例如 `apitester/apitester-data/`。不提供旧名称的兼容或自动迁移；如果记住的目录已不存在或不可写，需要重新选择实际数据目录。

取消或选目录失败时不会保存默认位置，下次启动仍会询问；如果已记住可用目录，不会每次弹窗。

例如接口地址保存为 `/health`，环境的 `BASE_URL` 为 `https://example.com/api`，执行时的地址就是 `https://example.com/api/health`。请换成你自己有权访问的服务。

## HTTP 与 WebSocket

- HTTP/HTTPS：选择方法并发送。可控制是否跟随重定向；同一主机的 Cookie 在内存中保留，可以清除。
- WebSocket：填写 `ws://` 或 `wss://` 地址，可设置 subprotocol，连接后发送文本消息；可启用自动重连。
- Params、Headers、鉴权及请求体按接口配置；环境变量使用 `{{变量名}}`。
- 可导入项目 JSON、Postman Collection、ApiZza 项目和 OpenAPI/Swagger（JSON/YAML），支持从本机文件或 URL 下载后导入，导出接口目录，查看请求记录和会话日志。URL 导入会用文档的实际下载地址补全相对或缺失的 `servers`，自签名证书会单独询问是否忽略。

## HTTPS/WSS 证书

默认校验服务器证书。连接自签名测试服务失败时，优先使用可信证书；确有需要时，可勾选“忽略证书错误（不安全）”。这个设置会保存到项目配置，且影响该项目的 HTTPS/WSS 调试。

启用后无法确认对方服务器身份，可能受到中间人攻击；不要在不可信网络中发送真实密码或生产凭据。复制 HTTP 请求为 curl 时，只有明确启用这个选项的请求才会带 `-k`。

## 数据与备份

你选择的数据文件夹包含：

- `connection-profiles/`：项目、环境和接口定义。
- `api-requests/`：HTTP / WebSocket 会话日志。

这些文件可能包含密码、Token、Cookie、请求体和响应内容，都是明文保存。不要提交到 GitHub，也不要把真实数据混进分享的接口目录。分享前需要自行脱敏。

关闭程序后复制整个数据文件夹即可备份。更换电脑时，在新电脑首次启动时选择复制后的文件夹。关闭程序并删除 `%AppData%\ApiTester\data-location.json` 后，下次启动会再次出现程序内提示让你选择数据位置；删除该定位文件不会删除项目或日志。附近若已有 `apitester-data` 也不会自动占用。

## 常见问题

- 窗口打不开或空白：确认 WebView2 Runtime 已安装，可从 Microsoft 官方网站获取。
- 数据目录被重新询问：原目录不存在或无法写入，请选择可写目录。
- 返回证书错误：检查证书有效期、系统时间和证书信任链，不要直接对生产服务关闭校验。
- 大响应不完整：当前 HTTP 响应正文最多读取 2 MiB，超过会标记截断。
- Windows 提示未知发布者：当前构建没有代码签名。只使用可信来源的下载；不要关闭系统安全防护。

正式 Release 尚未发布时，GitHub Actions 的构建产物也可以下载，但需登录 GitHub；产物保留 14 天。
