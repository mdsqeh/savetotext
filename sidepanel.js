const list = document.getElementById("list");
const empty = document.getElementById("empty");
const input = document.getElementById("input");
const htmlBtn = document.getElementById("html");
const mdBtn = document.getElementById("md");
const copyBtn = document.getElementById("copy");
const clearBtn = document.getElementById("clear");
const settingsBtn = document.getElementById("settings");
const settingsMask = document.getElementById("settings-mask");
const settingsClose = document.getElementById("settings-close");
const webdavEnabled = document.getElementById("webdav-enabled");
const webdavUrl = document.getElementById("webdav-url");
const webdavUser = document.getElementById("webdav-user");
const webdavPass = document.getElementById("webdav-pass");
const webdavPath = document.getElementById("webdav-path");
const webdavSave = document.getElementById("webdav-save");
const webdavTest = document.getElementById("webdav-test");
const webdavRestore = document.getElementById("webdav-restore");
const webdavStatus = document.getElementById("webdav-status");
const confirmMask = document.getElementById("confirm-mask");
const cancelBtn = document.getElementById("cancel");
const confirmClearBtn = document.getElementById("confirm-clear");
const toggleExpandBtn = document.getElementById("toggle-expand");
const composeEl = document.querySelector(".compose");
const expandIcon = document.getElementById("expand-icon");
const verEl = document.getElementById("ver");
const searchEl = document.getElementById("search");
const searchClearEl = document.getElementById("search-clear");
const previewEl = document.getElementById("preview");

let entries = [];
let searchQuery = "";
let editingEl = null; // 当前进行就地编辑的条目文本元素

// 从编辑态 DOM 还原文本：块级元素(<div>/<p>)与 <br> 之间补 \n，
// 不依赖 innerText，避免 contenteditable 吞换行导致多行变一行。
function readEditedText(el) {
  const parts = [];
  (function walk(node) {
    Array.from(node.childNodes).forEach((c) => {
      if (c.nodeType === Node.TEXT_NODE) {
        parts.push(c.nodeValue);
      } else if (c.nodeType === Node.ELEMENT_NODE) {
        const tag = c.tagName.toLowerCase();
        if (tag === "br") {
          parts.push("\n");
        } else if (tag === "div" || tag === "p") {
          walk(c);
          parts.push("\n");
        } else {
          walk(c);
        }
      }
    });
  })(el);
  return parts.join("").replace(/\n+$/, "");
}

// —— 列表内容就地编辑 ——
// 双击进入编辑（contenteditable），失焦自动保存，Esc 取消
function startEdit(el, realIndex) {
  // 已在编辑其他条目则先提交它
  if (editingEl && editingEl !== el) commitEdit(editingEl, editingEl._realIndex, true);
  editingEl = el;
  el._realIndex = realIndex;
  const text = (entries[realIndex] && entries[realIndex].content) || "";
  el.classList.add("editing");
  el.setAttribute("contenteditable", "true");
  // 编辑态：把源码按行拆成 <div> 块，保证保存时 innerText 能完整还原所有换行（含空行）。
  // 直接 textContent 赋值时，contenteditable 会吞掉文本节点里的 \n，导致换行丢失。
  while (el.firstChild) el.removeChild(el.firstChild);
  const frag = document.createDocumentFragment();
  text.split("\n").forEach((line) => {
    const d = document.createElement("div");
    d.textContent = line;
    frag.appendChild(d);
  });
  el.appendChild(frag);
  // 光标定位到末尾
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function commitEdit(el, realIndex, cancelled) {
  if (!el) return;
  const newText = cancelled ? "" : readEditedText(el);
  el.setAttribute("contenteditable", "false");
  el.classList.remove("editing");
  editingEl = null;
  if (cancelled) {
    // 取消：直接重渲染恢复原内容
    render();
    return;
  }
  const old = entries[realIndex] && entries[realIndex].content;
  if (newText.trim() !== (old || "").trim()) {
    NoteDB.updateText(realIndex, newText)
      .then((res) => {
        entries = res;
        render();
        // 内容变更后自动备份
        backgroundCmd("webdav:backup");
      })
      .catch(() => {
        render();
      });
  } else {
    render();
  }
}

function fmt(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function render() {
  while (list.firstChild) list.removeChild(list.firstChild);

  // 匹配判断：文字内容或来源链接包含关键词（截图无文本，不参与）
  const q = searchQuery.trim().toLowerCase();
  const matches = (e) => {
    if (!q) return true;
    if (e.type === "image") return false;
    if (e.content && e.content.toLowerCase().includes(q)) return true;
    if (e.url && e.url.toLowerCase().includes(q)) return true;
    return false;
  };

  const shownEntries = entries.filter(matches);

  if (q) {
    empty.textContent = shownEntries.length ? "" : "无匹配结果";
    empty.style.display = shownEntries.length ? "none" : "";
  } else {
    empty.innerHTML =
      "选中网页文字或区域，右键即可摘录/截图……<br />也可以直接在下面写一条。";
    empty.style.display = entries.length ? "none" : "";
  }

  // 高亮文本中的关键词（仅文字内容，来源链接保持普通文本）
  const highlight = (html) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html || "", "text/html");
    // 无关键词时无需高亮，直接返回（indexOf("") 恒为 0 会死循环）
    if (!q) return doc.body;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (!node.nodeValue || !node.nodeValue.toLowerCase().includes(q)) return;
      const frag = document.createDocumentFragment();
      const low = node.nodeValue.toLowerCase();
      let rest = node.nodeValue;
      while (rest) {
        const idx = rest.toLowerCase().indexOf(q);
        if (idx < 0) {
          frag.appendChild(document.createTextNode(rest));
          break;
        }
        if (idx > 0) frag.appendChild(document.createTextNode(rest.slice(0, idx)));
        const mark = document.createElement("mark");
        mark.textContent = rest.slice(idx, idx + q.length);
        frag.appendChild(mark);
        rest = rest.slice(idx + q.length);
      }
      node.parentNode.replaceChild(frag, node);
    });
    return doc.body;
  };

  shownEntries.forEach((e, shownIndex) => {
    const div = document.createElement("div");
    div.className = "entry";

    const ts = document.createElement("div");
    ts.className = "ts";
    ts.textContent = fmt(e.ts);
    div.appendChild(ts);

    if (e.url) {
      const src = document.createElement("a");
      src.className = "src";
      src.href = e.url;
      src.target = "_blank";
      src.rel = "noopener";
      src.textContent = e.url;
      src.title = e.url;
      div.appendChild(src);
    } else {
      const src = document.createElement("div");
      src.className = "src";
      div.appendChild(src);
    }

    // 原始索引（entries 内）用于删除
    const realIndex = entries.indexOf(e);

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "×";
    del.title = "删除";
    del.addEventListener("click", async () => {
      entries = await NoteDB.removeEntry(realIndex);
      render();
      document.dispatchEvent(new CustomEvent("st_entry_deleted"));
    });

    if (e.type === "image") {
      const wrap = document.createElement("div");
      wrap.className = "img-wrap";
      const img = document.createElement("img");
      img.src = e.dataUrl;
      img.alt = "截图";
      wrap.appendChild(img);
      wrap.appendChild(del);
      div.appendChild(wrap);
    } else {
      const t = document.createElement("div");
      t.className = "text";
      // e.html 是 Markdown 渲染后的白名单安全 HTML，用 DOM API 安全渲染
      const parsed = highlight(e.html || e.content);
      if (parsed) {
        while (parsed.firstChild) t.appendChild(parsed.firstChild);
      }
      t.appendChild(del);
      // 双击进入就地编辑，失焦自动保存，Esc 取消
      t.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        startEdit(t, realIndex);
      });
      t.addEventListener("blur", () => {
        if (editingEl === t) commitEdit(t, t._realIndex, false);
      });
      t.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          commitEdit(t, t._realIndex, true);
          ev.stopPropagation();
        }
      });
      div.appendChild(t);
    }
    list.appendChild(div);
  });
  list.scrollTop = q ? 0 : list.scrollHeight;
}

async function refresh() {
  try {
    entries = await NoteDB.load();
    console.log("[SidePanel] loaded", entries.length, "entries");
    render();
  } catch (e) {
    console.error("[SidePanel] load error:", e);
    list.innerHTML = `<div class="empty">加载失败：${e.message}</div>`;
  }
}

async function activeTabUrl() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return (tab && tab.url) || "";
  } catch {
    return "";
  }
}

async function addNote() {
  const v = input.value.trim();
  if (!v) return;
  const url = await activeTabUrl();
  entries = await NoteDB.addText(v, url);
  input.value = "";
  renderPreview();
  document.getElementById("add").classList.remove("active");
  render();
  // 自动备份
  backgroundCmd("webdav:backup");
}

// 输入区实时预览：Markdown 渲染为安全 HTML，用 DOM API 填充（不用 innerHTML）
function renderPreview() {
  const v = input.value.trim();
  if (!v) {
    while (previewEl.firstChild) previewEl.removeChild(previewEl.firstChild);
    return;
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(NoteDB.renderMarkdown(v), "text/html");
  while (previewEl.firstChild) previewEl.removeChild(previewEl.firstChild);
  while (doc.body.firstChild) previewEl.appendChild(doc.body.firstChild);
}

function setBtn(btn, text, disabled) {
  btn.textContent = text;
  btn.disabled = disabled;
}

// ---------- 下载 .md：只导出文本条目 ----------
function downloadMd() {
  const textEntries = entries.filter((e) => e.type === "text");
  const md = textEntries.map((e) => `## ${fmt(e.ts)}\n\n${e.content}`).join("\n\n").trim();
  if (!md) return;

  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  chrome.downloads.download({ url, filename: `随手记-${date}.md`, saveAs: false });
  URL.revokeObjectURL(url);

  setBtn(mdBtn, "已下载", false);
  setTimeout(() => setBtn(mdBtn, "下载 .md", false), 1500);
}

// ---------- 下载 .html：所有条目（文字+图片），格式与 popup 一致 ----------
function downloadHtml() {
  if (!entries.length) return;

  const pad = (n) => String(n).padStart(2, "0");
  const date = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}`;

  const entriesHtml = entries.map((e) => {
    const ts = fmt(e.ts);
    let body = "";
    if (e.type === "image") {
      body = `<img src="${e.dataUrl}" alt="截图" />`;
    } else {
      body = `<div class="note-text">${e.html || e.content}</div>`;
    }
    const src = e.url
      ? `<a class="note-src" href="${e.url}" target="_blank" rel="noopener">${e.url}</a>`
      : "";
    return `<div class="note-entry"><div class="note-ts">${ts}</div>${src}${body}</div>`;
  }).join("\n    ");

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>随手记 · ${date}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 14px; line-height: 1.6; color: #1f2328;
    background: #f3f4f6; padding: 32px 16px;
  }
  .container { max-width: 780px; margin: 0 auto; }
  h1 {
    font-size: 18px; font-weight: 600; color: #111827;
    margin-bottom: 20px; padding-bottom: 12px;
    border-bottom: 2px solid #e5e7eb;
  }
  .note-entry {
    background: #fff; border-radius: 10px;
    padding: 16px 18px; margin-bottom: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  }
  .note-ts { font-size: 11px; color: #9ca3af; margin-bottom: 6px; }
  .note-src {
    display: block; font-size: 11px; color: #9ca3af;
    text-decoration: none; margin-bottom: 8px; word-break: break-all;
  }
  .note-src:hover { color: #ef4444; text-decoration: underline; }
  .note-text p { margin: 0 0 6px; }
  .note-text p:last-child { margin-bottom: 0; }
  .note-text img {
    display: block; max-width: 100%; border-radius: 6px;
    border: 1px solid #e5e7eb; margin-top: 4px;
  }
</style>
</head>
<body>
  <div class="container">
    <h1>随手记 · ${date}</h1>
    ${entriesHtml}
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename: `随手记-${date}.html`, saveAs: false });
  URL.revokeObjectURL(url);

  setBtn(htmlBtn, "已下载", false);
  setTimeout(() => setBtn(htmlBtn, "下载 .html", false), 1500);
}

// ---------- 复制：只复制文本条目 ----------
async function copyAll() {
  const text = entries.filter((e) => e.type === "text").map((e) => e.content).join("\n\n").trim();
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const temp = document.createElement("textarea");
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    temp.remove();
  }

  setBtn(copyBtn, "已复制", false);
  setTimeout(() => setBtn(copyBtn, "复制", false), 1500);
}

function openConfirm() {
  confirmMask.classList.remove("hidden");
}

function closeConfirm() {
  confirmMask.classList.add("hidden");
}

async function clearNote() {
  closeConfirm();
  entries = await NoteDB.clear();
  render();
  // 自动备份
  backgroundCmd("webdav:backup");
}

function backgroundCmd(cmd, payload) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ cmd, ...(payload || {}) }, (r) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, reason: chrome.runtime.lastError.message });
        } else {
          resolve(r || { ok: false });
        }
      });
    } catch (e) {
      resolve({ ok: false, reason: (e && e.message) || String(e) });
    }
  });
}

// ---------- 设置面板 ----------

function openSettings() {
  settingsMask.classList.remove("hidden");
  // 读取当前配置
  chrome.storage.local.get(
    ["webdav_enabled", "webdav_url", "webdav_user", "webdav_pass", "webdav_path"],
    (r) => {
      webdavEnabled.checked = !!r.webdav_enabled;
      webdavUrl.value = r.webdav_url || "https://dav.jianguoyun.com/dav/";
      webdavUser.value = r.webdav_user || "";
      webdavPass.value = r.webdav_pass || "";
      webdavPath.value = r.webdav_path || "/savetotext-backup.json";
      hideStatus();
    }
  );
}

function closeSettings() {
  settingsMask.classList.add("hidden");
  hideStatus();
}

function showStatus(text, isError) {
  webdavStatus.classList.remove("ok", "err");
  webdavStatus.classList.add(isError ? "err" : "ok", "show");
  webdavStatus.textContent = text;
}

function hideStatus() {
  webdavStatus.classList.remove("ok", "err", "show");
}

function collectSettings() {
  return {
    webdav_enabled: webdavEnabled.checked,
    webdav_url: webdavUrl.value.trim(),
    webdav_user: webdavUser.value.trim(),
    webdav_pass: webdavPass.value,
    webdav_path: webdavPath.value.trim() || "/savetotext-backup.json"
  };
}

function validateSettings(s, requireEnabled) {
  if (requireEnabled && !s.webdav_enabled) return "请先勾选启用 WebDAV 自动备份";
  if (!s.webdav_enabled) return null;
  if (!s.webdav_url) return "请填写服务器地址";
  try {
    new URL(s.webdav_url);
  } catch {
    return "服务器地址格式错误";
  }
  return null;
}

webdavSave.addEventListener("click", async () => {
  const s = collectSettings();
  const err = validateSettings(s, false);
  if (err) {
    showStatus(err, true);
    return;
  }
  chrome.storage.local.set(s, () => {
    showStatus("设置已保存");
    // 已启用时立刻备份一次
    if (s.webdav_enabled) {
      backgroundCmd("webdav:backup").then((r) => {
        if (r.ok) showStatus("设置已保存，首次备份成功");
        else showStatus("设置已保存，但备份失败：" + (r.reason || "未知原因"), true);
      });
    }
  });
});

webdavTest.addEventListener("click", async () => {
  const s = collectSettings();
  const err = validateSettings(s, true);
  if (err) {
    showStatus(err, true);
    return;
  }
  // 临时写入设置以让 background 能读到
  chrome.storage.local.set(s, async () => {
    showStatus("正在尝试连接…");
    const r = await backgroundCmd("webdav:test");
    if (r.ok) showStatus("连接成功！上传地址：" + (r.url || ""));
    else showStatus("连接失败（上传地址 " + (r.url || "") + "）：" + (r.reason || "未知原因") + (r.status ? " (HTTP " + r.status + ")" : ""), true);
  });
});

webdavRestore.addEventListener("click", async () => {
  if (!webdavEnabled.checked) {
    showStatus("请先启用 WebDAV 并保存设置", true);
    return;
  }
  if (!confirm("从云端恢复将覆盖当前本地数据，是否继续？")) return;
  showStatus("正在下载…");
  const r = await backgroundCmd("webdav:restore");
  if (r.ok) {
    await refresh();
    showStatus(r.first ? "云端暂无备份，跳过（下载地址 " + (r.url || "") + "）" : `恢复成功：${r.count} 条（下载地址 ${r.url || ""}）`);
  } else {
    showStatus("恢复失败（下载地址 " + (r.url || "") + "）：" + (r.reason || "未知原因") + (r.status ? " (HTTP " + r.status + ")" : ""), true);
  }
});

// 打开侧边栏时自动从云端恢复
(async function autoRestoreOnOpen() {
  try {
    const settings = await new Promise((resolve) =>
      chrome.storage.local.get(
        ["webdav_enabled", "webdav_url", "webdav_user", "webdav_pass", "webdav_path"],
        resolve
      )
    );
    if (!settings.webdav_enabled || !settings.webdav_url) return;
    const r = await backgroundCmd("webdav:restore");
    if (r.ok && !r.first && r.count > 0) {
      await refresh();
    }
  } catch {
    // 静默忽略
  }
})();

// 最大化/还原输入区
let isExpanded = false;
toggleExpandBtn.addEventListener("click", () => {
  isExpanded = !isExpanded;
  composeEl.classList.toggle("expanded", isExpanded);
  list.style.display = isExpanded ? "none" : "";
  expandIcon.innerHTML = isExpanded
    ? '<polyline points="7 9 12 4 17 9"/><line x1="12" y1="4" x2="12" y2="20"/><polyline points="7 15 12 20 17 15"/>'
    : '<polyline points="7 15 12 20 17 15"/><line x1="12" y1="4" x2="12" y2="20"/><polyline points="7 9 12 4 17 9"/>';
  if (isExpanded) {
    input.focus();
  }
});

document.getElementById("add").addEventListener("click", addNote);
input.addEventListener("input", () => {
  document.getElementById("add").classList.toggle("active", input.value.trim().length > 0);
  renderPreview();
});
htmlBtn.addEventListener("click", downloadHtml);
mdBtn.addEventListener("click", downloadMd);
copyBtn.addEventListener("click", copyAll);
clearBtn.addEventListener("click", openConfirm);
cancelBtn.addEventListener("click", closeConfirm);
confirmClearBtn.addEventListener("click", clearNote);
confirmMask.addEventListener("click", (e) => {
  if (e.target === confirmMask) closeConfirm();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeConfirm();
    if (settingsMask && !settingsMask.classList.contains("hidden")) closeSettings();
  }
});

settingsBtn.addEventListener("click", openSettings);
settingsClose.addEventListener("click", closeSettings);
settingsMask.addEventListener("click", (e) => {
  if (e.target === settingsMask) closeSettings();
});

// 内容搜索：实时过滤 + 高亮
searchEl.addEventListener("input", () => {
  searchQuery = searchEl.value;
  searchClearEl.hidden = !searchQuery;
  render();
});
searchClearEl.addEventListener("click", () => {
  searchEl.value = "";
  searchQuery = "";
  searchClearEl.hidden = true;
  render();
  searchEl.focus();
});

verEl.textContent = "v1.9.0";

// 监听 storage 变更：content script 保存后写此 key，通知侧边栏刷新
chrome.storage.onChanged.addListener((changes) => {
  if (changes.__st_refresh__) {
    refresh();
  }
});

// 删除条目后自动备份
document.addEventListener("st_entry_deleted", () => backgroundCmd("webdav:backup"));

refresh();

