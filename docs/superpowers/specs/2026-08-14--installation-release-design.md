# Zearo 安装与发布设计

## 目标

让 GitHub 首页更简洁，并同时服务三类用户：希望快速安装的普通用户、需要完整源码的开发者，以及习惯从 GitHub Releases 下载固定版本的用户。

## 命名

- GitHub 账号用户名：`qilens`
- 仓库名：`zearo`（不变）
- 项目展示名：`Zearo · 题镜`

`qilens` 取自“题镜”的意象与英文 `lens`，作为不暴露真实姓名的个人品牌用户名。修改前需在 GitHub 设置页再次验证用户名可用；修改会影响该账号下所有仓库的网址。

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

提供 `git clone https://github.com/qilens/zearo.git`，随后按本地加载步骤选择仓库目录。这种方式保留完整源码、设计文档和测试，适合开发者。

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
4. 在 GitHub 设置页验证 `qilens` 可用，并在最终确认后修改账号用户名。
5. 把本地 `origin` 更新为 `https://github.com/qilens/zearo.git`，验证拉取和推送正常。
6. 更新 README，并验证快速安装命令与 Release 下载地址一致。
7. 提交并推送源码改动。
8. 创建 `v0.1.0` Release，上传安装包。
9. 在 GitHub 页面确认新账号地址、Release、附件和 README 均可访问。

## 后续版本打包规则

新增固定的 `scripts/package.ps1` 打包入口。脚本从 `manifest.json` 读取版本号，并采用运行文件白名单生成 `dist/zearo-v<version>.zip`。

允许进入安装包的内容只有：

- `manifest.json`
- `service-worker.js`
- `core.js`
- `content.js`
- `sidepanel.html`
- `sidepanel.css`
- `sidepanel.js`
- `assets/`
- `_locales/`

脚本不得从项目根目录整体打包，也不得使用仅依赖排除名单的方式。`dist/`、`docs/`、`tests/`、`.git/`、README 和脚本自身不会进入安装包；未来新增的目录默认也不会进入安装包。

生成后自动检查：

1. ZIP 根目录包含 `manifest.json`。
2. ZIP 中的版本号与文件名一致。
3. `_locales/` 与运行资源存在。
4. 不存在 `dist/`、`docs/`、`tests/`、`.git/` 等禁入路径。

## GitHub 仓库精简

仓库首页面向安装与使用场景，仅保留扩展源码、运行资源、README、忽略规则和发布脚本。

从当前分支移除：

- `docs/`：设计记录继续保留在 Git 历史中，不再显示于仓库首页。
- `tests/`：自动化测试不再随当前源码分支发布。

继续保留：

- `scripts/package.ps1`：后续版本继续通过白名单生成干净安装包。
- `.gitignore`：继续阻止 `dist/`、日志、依赖与本地环境文件误提交。
- `README.md`：保留安装、使用、功能和打包说明，移除测试命令与手工验收清单。

`dist/` 当前未被 Git 跟踪，无需从仓库删除；它继续作为本地生成目录被忽略。

## 非目标

- 不自动修改 Edge 企业策略。
- 不绕过 Edge 的扩展安装确认。
- 本次不发布到 Microsoft Edge Add-ons 商店。
- 不修改扩展功能代码或版本号。
- 不修改仓库名 `zearo`。
