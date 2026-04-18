# 腾讯会议转写助手

<p align="center">
  <a href="#简体中文">简体中文</a> | <a href="#english">English</a>
</p>

<a id="简体中文"></a>

## 简体中文

一个用于腾讯会议录制页面的 Tampermonkey 用户脚本。

它可以从腾讯会议录制页、逐字稿页中收集完整转写内容，包括使用虚拟滚动渲染的长逐字稿。脚本会自动切到逐字稿面板并滚动收集内容，避免只复制当前屏幕里可见的一小段。

## 功能

- 复制完整逐字稿
- 复制带 AI 修复提示词的完整逐字稿
- 尝试打开 Codex 新聊天并填入修复提示词
- 从腾讯会议真实逐字稿 DOM 中提取内容，过滤页面底部的反馈区等非逐字稿内容
- 支持拖动工具面板，提示信息会跟随面板当前位置显示

## 安装

先安装 Tampermonkey，然后从下面这个地址安装脚本：

https://raw.githubusercontent.com/dunhao-raymond/tencent-meeting-transcript-copier/main/plugin.js

## 使用

1. 打开腾讯会议录制链接。
2. 等页面加载完成。
3. 使用页面上的“会议转写助手”面板。
4. 点击需要的操作：
   - `复制完整逐字稿`
   - `复制AI修复提示词`
   - `打开Codex修复`

## 自动更新

脚本 metadata 已配置：

- `@updateURL`
- `@downloadURL`

它们都指向 GitHub raw 文件：

https://raw.githubusercontent.com/dunhao-raymond/tencent-meeting-transcript-copier/main/plugin.js

脚本安装后，只要 `main` 分支里的 `@version` 增加，Tampermonkey 就可以在自己的自动检查周期内发现更新。Tampermonkey 不会在 GitHub 推送后立刻收到通知，所以更新可能不会马上弹出。

如果想立刻更新，也可以手动检查：

1. 打开 Tampermonkey 管理面板。
2. 打开已安装的脚本。
3. 点击检查用户脚本更新。

## 核心文件

- `plugin.js`: Tampermonkey 用户脚本主体。

<p align="center">
  <a href="#腾讯会议转写助手">回到顶部</a> · <a href="#english">English</a>
</p>

---

<a id="english"></a>

## English

A Tampermonkey userscript for Tencent Meeting recording pages.

It collects full transcripts from Tencent Meeting recording and transcript pages, including long transcripts rendered with virtual scrolling. The script can switch to the transcript panel and scroll through the content so it does not only copy the visible rows.

## Features

- Copy the complete transcript
- Copy the complete transcript with an AI repair prompt
- Try to open a new Codex chat and fill in the repair prompt
- Extract transcript content from Tencent Meeting's real transcript DOM and skip non-transcript blocks such as the feedback section at the bottom
- Drag the floating tool panel, with toast messages anchored near the current panel position

## Install

Install Tampermonkey first, then install the userscript from:

https://raw.githubusercontent.com/dunhao-raymond/tencent-meeting-transcript-copier/main/plugin.js

## Usage

1. Open a Tencent Meeting recording link.
2. Wait for the page to finish loading.
3. Use the `会议转写助手` panel on the page.
4. Choose one of the available actions:
   - `复制完整逐字稿`
   - `复制AI修复提示词`
   - `打开Codex修复`

## Updates

The userscript metadata includes:

- `@updateURL`
- `@downloadURL`

Both point to the GitHub raw file:

https://raw.githubusercontent.com/dunhao-raymond/tencent-meeting-transcript-copier/main/plugin.js

After installation, Tampermonkey can update the script automatically when `@version` is increased on the `main` branch. Tampermonkey checks on its own schedule, so updates may not appear immediately after a GitHub push.

To update immediately:

1. Open the Tampermonkey dashboard.
2. Open the installed script.
3. Use `Check for userscript updates`.

## Core File

- `plugin.js`: the Tampermonkey userscript.

<p align="center">
  <a href="#腾讯会议转写助手">Back to top</a> · <a href="#简体中文">简体中文</a>
</p>
