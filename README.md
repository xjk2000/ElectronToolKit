# ElectronToolKit

一个类似 uTools 的本地桌面工具箱，基于 Electron 实现。

## 当前工具

- JSON 格式化、压缩、校验，支持树形高亮查看和节点折叠
- 多格式互转：JSON ↔ YAML、JSON ↔ XML
- SQL INSERT 转 JSON 数据、Elasticsearch Bulk NDJSON
- JWT Header/Payload Base64 反序列化与过期时间分析
- URL 参数解析与可编辑 Query 表格，支持反向生成 URL
- CIDR 子网计算、HTTP 状态码查询
- HTML 实体编码/解码、进制转换、Hex 字符串互转、Punycode 转换、下载链接转换
- 摩斯电码编码/解码
- 日期计算、单位换算、数字金额转中文大写
- 个人所得税计算、贷款计算、在线白板
- 颜色选择转换：调色盘、透明度、Hex/RGB/RGBA/CSS Var 复制
- 图片格式转换：本地转换 PNG、JPG、WEBP、AVIF、TIFF、GIF、BMP、ICO、CUR、SVG、PDF、DOC、DOCX、PPM、PGM、PBM、PNM、RGB、RGBA、XBM、XPM
- 二维码生成与 PNG 解码
- 字数信息统计：中文、英文、数字、空格、行数等
- Cron 表达式解析未来 5 次执行时间，支持字段生成表达式
- 正则测试器，内置邮箱、手机号、IP 模板
- 文本清洗与变形：大小写、camelCase、snake_case、常量名、去空格、行去重、行排序
- Mock 数据生成：UUID、手机号、身份证号、姓名、邮箱、随机字符串
- 对称加密/解密：AES、DES、RC4，支持 CBC/ECB 和 Pkcs7/NoPadding
- RSA 公私钥生成：1024/2048/4096，支持 PKCS#1/PKCS#8 私钥格式
- 国密算法：SM2 密钥对、SM3 摘要、SM4 加解密
- MD5、SHA1、SHA256、SHA512 摘要
- Base64 编码、解码
- URL 编码、解码
- Unix 时间戳转换
- UUID v4 生成
- 模型切换：固定模块管理 Claude Code、Codex、Gemini CLI、OpenCode、OpenClaw、Hermes 的供应商与实际配置，菜单栏可快速切换

## 开发运行

```bash
npm install
npm start
```

## 测试

```bash
npm test
```

## 打包 macOS

当前脚本面向 Apple Silicon：

```bash
npm run package:mac
```

打包产物会输出到 `release/` 目录。
目录示例：`release/ElectronToolKit-0.1.14-darwin-arm64/ElectronToolKit.app`。

生成可分发 DMG：

```bash
npm run dist:mac
```

产物路径示例：`release/ElectronToolKit-0.1.14-mac-arm64.dmg`。DMG 内包含 `ElectronToolKit.app` 和 `Applications` 快捷方式。

正式对外分发需要 Apple Developer 的 `Developer ID Application` 证书和 notarization。配置后同样运行 `npm run dist:mac`，脚本会签名、生成 DMG、签名 DMG、提交公证并 stapler：

```bash
export MAC_SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="your-apple-id@example.com"
export APPLE_TEAM_ID="TEAMID"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
npm run dist:mac
```

当前机器如果没有 Developer ID 证书，只能生成 ad-hoc 签名 DMG，适合内部测试，不会通过 Gatekeeper 正式校验。

## 快捷键

- `Command/Ctrl + K`：聚焦工具搜索
- `Command/Ctrl + Enter`：执行当前工具
- `Command/Ctrl + Shift + Space`：显示或隐藏 ElectronToolKit 窗口

## 大 JSON 限制

桌面输入框和树形视图不适合处理上亿字符级 JSON。当前 JSON 工具做了保护：

- 超过 20 万字符会停止实时格式化，需要手动执行
- 超过 50 万字符的格式化结果不会生成树形 DOM，只显示预览
- 超过 1000 万字符会拒绝在 UI 中解析，避免应用假死或内存崩溃

上亿字符级 JSON 应使用文件流式处理模式，这类能力需要单独做成“选择文件 -> 流式校验/压缩/抽取”的工具。

## 项目结构

```text
src/main.cjs                Electron 主进程，负责窗口、全局快捷键和 Node 能力
src/preload.cjs             安全暴露 clipboard、hash、uuid 等能力
src/renderer/index.html     桌面应用界面
src/renderer/renderer.js    工具切换和交互逻辑
src/renderer/tool-functions.js  可测试的通用转换函数
tests/tool-functions.test.js    工具函数测试
```
