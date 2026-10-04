const list = document.getElementById("list");
const empty = document.getElementById("empty");
const input = document.getElementById("input");
const htmlBtn = document.getElementById("html");
const mdBtn = document.getElementById("md");
const copyBtn = document.getElementById("copy");
const clearBtn = document.getElementById("clear");
const confirmMask = document.getElementById("confirm-mask");
const cancelBtn = document.getElementById("cancel");
const confirmClearBtn = document.getElementById("confirm-clear");
const verEl = document.getElementById("ver");

let entries = [];

function fmt(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function render() {
  while (list.firstChild) list.removeChild(list.firstChild);
  empty.style.display = entries.length ? "none" : "";
  entries.forEach((e, i) => {
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
    }

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "×";
    del.title = "删除";
    del.addEventListener("click", async () => {
      entries = await NoteDB.removeEntry(i);
      render();
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
      // e.html 由扩展自身 toHtml() 生成，仅含 <p> 和 <br>，用 DOM API 安全渲染
      const parser = new DOMParser();
      const doc = parser.parseFromString(e.html || e.content, "text/html");
      while (doc.body.firstChild) t.appendChild(doc.body.firstChild);
      t.appendChild(del);
      div.appendChild(t);
    }
    list.appendChild(div);
  });
  list.scrollTop = list.scrollHeight;
}

async function refresh() {
  entries = await NoteDB.load();
  render();
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
  document.getElementById("add").classList.remove("active");
  render();
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
}

document.getElementById("add").addEventListener("click", addNote);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    addNote();
  }
});
input.addEventListener("input", () => {
  document.getElementById("add").classList.toggle("active", input.value.trim().length > 0);
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
  if (e.key === "Escape") closeConfirm();
});

verEl.textContent = "1.7.0";

// 监听来自 content script 的刷新通知
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.cmd === "refresh") {
    refresh();
  }
});

refresh();
