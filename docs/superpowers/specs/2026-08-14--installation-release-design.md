# Zearo 安装与发布设计

## 目标

让 GitHub 首页更简洁，并同时服务三类用户：希望快速安装的普通用户、需要完整源码的开发者，以及习惯从 GitHub Releases 下载固定版本的用户。

## README 结构

README 调整为以下顺序：

1. 项目简介
2. 安装
3. 使用
4. 功能
5. 开发验证

原有手工验收清单保留在“开发验证”中，避免丢失维护信息；面向普通用户的安装和使用说明放到前面。

## 三种安装方式

### 快速安装

提供一条 PowerShell 命令，下载 `v0.1.0` Release 中的安装包、解压到用户指定的固定目录，并打开 `edge://extensions/`。

Edge 不允许普通脚本静默安装未上架商店的扩展，因此 README 明确提示用户开启开发人员模式，并点击“加载解压缩的扩展”选择解压目录。命令不修改浏览器策略，也不绕过 Edge 的安全限制。

### 源码安装

提供 `git clone https://github.com/moshen-zhangjinlai/zearo.git`，随后按本地加载步骤选择仓库目录。这种方式保留完整源码、设计文档和测试，适合开发者。

### Release 下载

创建公开 GitHub Release `v0.1.0`，上传 `zearo-v0.1.0.zip`。安装包仅包含扩展运行所需文件：

- `manifest.json`
- `service-worker.js`
- `core.js`
- `content.js`
- `sidepanel.html`
- `sidepanel.css`
- `sidepanel.js`
- `assets/`

不包含 `.git`、设计文档、测试和仓库维护文件。

## 发布与验证

1. 运行现有自动化测试。
2. 生成安装包并核对文件清单。
3. 验证 ZIP 解压后 `manifest.json` 位于包根目录。
4. 更新 README，并验证快速安装命令与 Release 下载地址一致。
5. 提交并推送源码改动。
6. 创建 `v0.1.0` Release，上传安装包。
7. 在 GitHub 页面确认 Release、附件和 README 均可访问。

## 非目标

- 不自动修改 Edge 企业策略。
- 不绕过 Edge 的扩展安装确认。
- 本次不发布到 Microsoft Edge Add-ons 商店。
- 不修改扩展功能代码或版本号。
