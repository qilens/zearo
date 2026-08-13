# Zearo · 题镜

一款用于 LeetCode 公开题学习的 Edge 侧边栏扩展。读取题目描述和当前编辑器语言，通过你配置的 OpenAI Chat Completions 兼容接口，生成结构化中文讲解与参考代码。

## 安装

### 快速安装（推荐）

在 PowerShell 中运行：

```powershell
$installDir="$env:LOCALAPPDATA\Zearo\v0.1.2"; $zipFile="$env:TEMP\zearo-v0.1.2.zip"; New-Item -ItemType Directory -Force -Path $installDir | Out-Null; Invoke-WebRequest "https://github.com/qilens/zearo/releases/download/v0.1.2/zearo-v0.1.2.zip" -OutFile $zipFile; Expand-Archive -Path $zipFile -DestinationPath $installDir -Force; Start-Process explorer.exe $installDir; Start-Process msedge.exe "edge://extensions/"
```

命令会下载并解压最新版安装包，同时打开扩展目录和 Edge 扩展管理页。随后：

1. 开启“开发人员模式”。
2. 点击“加载解压缩的扩展”。
3. 选择刚刚打开的 `v0.1.2` 文件夹。

> Edge 不允许脚本静默安装未上架商店的扩展，因此最后三步需要手动完成。

### 获取完整源码

```powershell
git clone https://github.com/qilens/zearo.git
```

克隆后在 `edge://extensions/` 开启开发人员模式，点击“加载解压缩的扩展”，选择 `zearo` 目录。

### 下载 Release

也可以直接下载 [`zearo-v0.1.2.zip`](https://github.com/qilens/zearo/releases/download/v0.1.2/zearo-v0.1.2.zip)，解压后按上述方式加载。

## 使用

1. 打开 `leetcode.cn` 或 `leetcode.com` 的公开题“题目描述”页面。
2. 点击 Zearo · 题镜图标打开侧边栏。
3. 填写 API Base URL、API Key 和模型后开始解题。

Base URL 只填写协议、域名和端口，例如 `https://api.openai.com` 或 `http://localhost:1234`。Zearo 会请求 `POST <Base URL>/v1/chat/completions`。

## 功能

- 支持 Python 3、Java、C++、JavaScript、TypeScript、Go 和 Rust。
- 可选择 OJ 快捷模式或标准独立编译模式。
- 缓存最近使用的 100 份完整解答。
- 完整解答后支持一次性追问。
- 不读取、修改、运行或提交编辑器代码。
- 支持 LeetCode 中英文站的公开题页面。
- 扩展更新或标签页恢复后可自动补注入内容脚本。


