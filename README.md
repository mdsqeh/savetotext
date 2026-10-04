# 极简右键随手记
这是一个 Chrome 浏览器扩展项目，名为「极简右键随手记」(Manifest V3)，用于网页摘录和截图保存。数据完全本地存储，不依赖服务器。

目录布局

f:\MyApplication\SaveToText\
├── manifest.json          # 扩展配置清单 (MV3, v1.9.0)
├── README.md              # 功能说明文档
├── background.js          # Service Worker，处理右键菜单和截图逻辑
├── content.js             # Content Script，注入页面实现悬浮按钮
├── db.js                  # IndexedDB 数据层封装
├── popup.html             # 扩展弹出窗口 HTML
├── popup.js               # 弹出窗口逻辑（展示笔记、导出）
├── sidepanel.html         # 侧边栏入口 HTML
├── sidepanel.js           # 侧边栏逻辑（同 popup，全屏高度）
├── sidepanel.css          # 侧边栏样式
├── styles.css             # 弹出窗口样式
├── icons\                 # 扩展图标资源
│   ├── icon.png
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── vendor\
    └── snapdom.js         # 第三方库，用于 DOM 元素截图
核心功能模块
文件	职责
manifest.json	扩展入口，声明权限、Service Worker、Content Script、弹出窗口
background.js	管理右键菜单（追加文本/截取屏幕/截取元素/框选截图），调用 IndexedDB 存储
content.js	在网页注入悬浮保存按钮，选中文本后自动显示，点击保存并通知 popup 刷新
db.js	IndexedDB 封装，支持文本/图片条目增删查
popup.js	弹出窗口逻辑：渲染笔记列表、手动输入追加、导出 HTML/Markdown/复制、清空确认
popup.html   弹出窗口结构（保留兼容，实际点击图标打开侧边栏）
sidepanel.html  侧边栏入口：点击扩展图标后在页面右侧打开全屏高度面板
sidepanel.js    侧边栏逻辑：与 popup.js 相同，额外调用 setPanelBehavior 确保点击图标打开侧边栏
sidepanel.css   侧边栏样式：与 styles.css 相同，body 改为全屏高度
vendor/snapdom.js	第三方 DOM 截图库，支持精确截取页面元素
技术栈
Manifest V3：使用 service_worker 替代旧的 background page

IndexedDB：本地存储文本和图片（base64），避免 10MB localStorage 限制

原生截图 API：chrome.tabs.captureVisibleTab 实现视口截图

无后端依赖：纯前端实现，数据完全在浏览器本地

主要权限
contextMenus, storage, downloads, scripting, activeTab, tabs
网页浏览时的快速摘录工具，把零散的文字和图片整理成便签。

## 功能

### 网页摘录
- **右键菜单**：选中网页文字后右键 →「追加到随手记」
- **悬浮按钮**：选中文字后，鼠标右侧出现保存按钮，点击即保存（保留换行/段落格式）

### 截图保存
- **截取当前屏幕**：保存当前可见页面为图片
- **截取元素**：悬停点选页面中某个元素，精确截取
- **框选截图**：拖拽选区，裁剪指定区域截图

### 便签管理
- popup 中直接输入文字追加笔记
- 展示所有保存的文字和图片条目，按时间倒序排列
- 支持单条删除

### 导出
- **导出 HTML**：生成独立网页文件，文字保留段落格式，图片清晰不压缩
- **导出 Markdown**：生成 `.md` 文件，方便同步到笔记软件
- **一键复制**：复制全部笔记为纯文本

### 数据安全
- 数据存储在浏览器 IndexedDB，完全本地，不上传服务器

## 安装

1. 打开 Chrome / Edge，访问 `chrome://extensions/`（或 `edge://extensions/`）
2. 右上角开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本目录

## 技术栈

- Manifest V3
- 纯前端，无后端依赖
- IndexedDB 本地存储
