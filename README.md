<p align="center">
  <img src="icons/icon128.png" alt="Yummy! Logo" width="128" height="128">
</p>

<h1 align="center">Yummy!</h1>

<p align="center">
  精细取舍，便捷整合
</p>

<p align="center">
  <a href="https://github.com/TreapGoGo/Yummy/releases"><img src="https://img.shields.io/github/v/release/TreapGoGo/Yummy?display_name=tag&sort=semver&color=blue" alt="Latest Release"></a>
  <a href="https://github.com/TreapGoGo/Yummy/stargazers"><img src="https://img.shields.io/github/stars/TreapGoGo/Yummy?style=social" alt="GitHub Stars"></a>
  <a href="https://github.com/TreapGoGo/Yummy/network/members"><img src="https://img.shields.io/github/forks/TreapGoGo/Yummy?style=social" alt="GitHub Forks"></a>
  <a href="https://github.com/TreapGoGo/Yummy/releases"><img src="https://img.shields.io/github/downloads/TreapGoGo/Yummy/total?label=downloads&logo=github&color=brightgreen" alt="GitHub All Releases"></a>
  <a href="https://github.com/TreapGoGo/Yummy/graphs/commit-activity"><img src="https://img.shields.io/github/commit-activity/m/TreapGoGo/Yummy?color=blue" alt="GitHub Commit Activity"></a>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-green.svg" />
</p>

<p align="center">
  <!-- 功能演示 GIF 区域 -->
  <!-- 建议尺寸: 800x500px, 您可以使用 https://www.screentogif.com/ 或其他工具录制 -->
  <img src="assets/demo.gif" alt="Yummy! Demo GIF">
</p>

---

## 🤔 Yummy! 是什么?

Yummy! 是一款浏览器扩展。您可以使用它快捷进行精细的上下文取舍，并且一键整合你对各个部分的评价，快速生成新的 Prompt 和指令，加快你的文本生成迭代速度！

## 🌰 举个栗子

**痛点**：针对 chatgpt 生成的大段内容进行 **“屎里淘金”** 是一件非常麻烦的事情，光是标记、整理、转述心仪的内容，就会浪费大量的时间和精力。

- **没有 Yummy! 时**：chatgpt生成答复 → 您需要手动选中喜欢的/不喜欢的内容 → 复制他们 → 粘贴到输入框中 → 打字说明“我喜欢这些内容：...我不喜欢这些内容：...” → 手动设定迭代指令 → 发送
- **有了 Yummy!** ：您只需要轻松点击 UI 化的评价按钮和划词工具，即可为段落、句子、词语标记上你对他们的品味， Yummy! 会自动帮你整合出新的 Prompt ，再也不用打字啦~ 聊天效率直接起飞

## ✨ 功能特性

*   **精细化评价系统**： 
    *   **段落评价：** 为 AI 回复的每个段落、标题、列表项提供 😋 / 🤮 评价。
    *   **划词高亮**： 通过快捷按钮或专属的“划词模式”轻松标记关键文本。高亮区域会自动合并，单击即可取消。 
*   **强大的收集与整合**： 所有被“喜欢”和“高亮”的内容都会被自动汇集到屏幕右侧的收集面板中，方便您随时查看、复制和管理。
*   **一键生成后续指令**：
    *   **智能聚合**： 点击右侧的 ✨ 按钮，Yummy! 会自动聚合当前对话中所有“喜欢”和“高亮”的内容，并将整合后的 Prompt 自动注入输入框。您在也不用复制、粘贴然后手写“这一句可以保留/放弃”之类的废话啦！
    *   **动态指令菜单**： 聚合后，会弹出一个指令菜单，提供“综合优化”、“提炼要点”、“风格迁移”等多种预设操作，让您一键发出高质量的复杂指令。
    *   **自定义输入**： 您也可以随时在聚合内容的基础上进行自定义指令设计。
*   **高度优化的用户体验**：
    *   **优雅对齐**： 所有 UI 元素都经过精心布局，确保与 ChatGPT 原生界面完美融合，不产生干扰。
    *   **清晰反馈**： 无论是评价、高亮还是其他操作，都有即时、清晰的视觉反馈。
*   **会话状态持久化**： 您在一个会话中的所有标记（喜欢、不喜欢、高亮）都会被自动保存。刷新页面也没问题，Yummy! 会为您恢复一切，让您的灵感永不丢失。

## 🚀 安装与使用

### 安装

> Yummy! 目前尚未发布到 Chrome 网上应用店。您可以通过以下步骤手动加载：

1.  下载本仓库的[最新版本](https://github.com/TreapGoGo/Yummy/releases)或直接 `clone` 到本地。
2.  打开 Chrome/Edge 浏览器，进入 `chrome://extensions/` 页面。
3.  打开右上角的"开发者模式"开关。
4.  点击"加载已解压的扩展程序"，选择您刚刚下载并解压的 `Yummy` 文件夹。
5.  安装完成！访问 ChatGPT 网站即可开始使用。

### 使用

1.  **评价与分级评价**:
    *   将鼠标悬停在任意段落、列表项上，左侧会出现 😋 和 🤮 按钮，点击即可评价，插件生成高亮背景提示。
    *   **对于标题**: 点击 😋/🤮 会自动覆盖其自身以及下辖内容。
2.  **高亮**:
    *   在普通模式下，选中文字后，点击旁边出现的 😋 小按钮即可高亮。
    *   或者，点击右侧面板的 ✒️ 按钮进入“划词模式”，此时任何选择操作都会直接高亮文本。再次点击该按钮或按 `Esc` 键退出。
    *   单击已高亮的文本可以取消高亮。
3.  **整合与提问**:
    *   完成标记后，点击右侧面板的 ✨ 按钮。
    *   在弹出的指令菜单中选择一个预设指令，或直接选择“自定义指令”并输入您自己的想法。
    *   Yummy! 会将您的标记内容和所选指令组合成一条完整的提示词，并填入输入框。
4.  **查看与管理**:
    *   点击右侧面板的 📚 按钮，可以打开或关闭左侧的“收集面板”。
    *   在这里，您可以查看所有标记过的内容，并进行复制等操作。
5.  **数据持久化**:
    *   所有操作都会自动保存在当前会话中。您可以随时刷新或关闭页面，标记不会丢失。

## 🤝 如何贡献

我们非常欢迎各种形式的贡献！如果您有任何想法、建议或发现了 Bug，请随时提交 [Issues](https://github.com/TreapGoGo/Yummy/issues)。

如果您想贡献代码，请：

1.  Fork 本仓库。
2.  创建您的特性分支 (`git checkout -b feature/AmazingFeature`)。
3.  提交您的更改 (`git commit -m 'Add some AmazingFeature'`)。
4.  将分支推送到远程 (`git push origin feature/AmazingFeature`)。
5.  提交一个 Pull Request。

## 💰 向我捐赠

如果你觉得 Yummy! 对你很有帮助，不妨请我喝杯咖啡！您的支持是我持续更新和维护的最大动力。

| 微信支付 | 支付宝 |
|:---:|:---:|
| <img src="assets/wechat_pay.jpg" alt="微信支付" width="200"> | <img src="assets/alipay_pay.jpg" alt="支付宝" width="200"> |

您也可以通过加密货币支持我：

*   **Solana (SOL):** `GghMKZ3hxsRLvPj2kV5HsVBsZwS1tBaJSw7wGaLfCa27`
*   **Ethereum (ETH/ERC-20):** `0x332772fce634D38cdfC649beE923AF52c9b6a2E5`

---

## 📈 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=TreapGoGo/Yummy&type=Date)](https://star-history.com/#TreapGoGo/Yummy&Date)

## 📄 许可证

本项目基于 MIT 许可证发布。详情请见 `LICENSE` 文件。 

