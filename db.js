// NoteDB — 便签存储。文本+图片条目统一存在 IndexedDB（图片 base64 体积大，storage.local 有 10MB 上限）。
// 旧版本把便签存在 chrome.storage.local 的 "note" 字符串里，首次加载时自动迁移成一条文本条目。
(function () {
  const DB_NAME = "quick-notes";
  const DB_VERSION = 1;
  const STORE = "note";
  const KEY = "doc";

  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => {
        _db = req.result;
        resolve(_db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function getDoc() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const r = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  }

  async function putDoc(doc) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, "readwrite");
      t.objectStore(STORE).put(doc, KEY);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }

  async function load() {
    const doc = await getDoc();
    let entries = doc ? doc.entries : [];

    // 兼容旧条目：没有 html 字段的自动补上
    let dirty = false;
    for (const e of entries) {
      if (e.type === "text" && !e.html && e.content) {
        e.html = renderMarkdown(e.content);
        dirty = true;
      }
    }
    if (dirty) await putDoc({ entries });

    return entries;
  }

  // 白名单：仅保留安全的展示标签，剥离所有属性和事件，避免 XSS
  // 这些标签用于 safeHTML 生成，供 background 和 sidepanel 复用
  const SAFE_TAGS = new Set([
    "p", "br", "strong", "em", "del", "b", "i", "u", "s",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "blockquote", "code", "pre", "hr",
    "a", "img", "table", "thead", "tbody", "tr", "th", "td"
  ]);

  function sanitize(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html || "", "text/html");
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
    const toRemove = [];
    while (walker.nextNode()) {
      const el = walker.currentNode;
      if (!SAFE_TAGS.has(el.tagName.toLowerCase())) {
        toRemove.push(el);
        continue;
      }
      // 剥离所有属性
      const attrs = Array.from(el.attributes);
      attrs.forEach((a) => {
        const name = a.name.toLowerCase();
        const val = a.value.trim();
        if (name === "href" && /^https?:\/\//i.test(val)) return;
        if (name === "src" && /^(data:image\/(png|jpeg|gif|webp);base64,|https?:\/\/)/i.test(val)) return;
        el.removeAttribute(a.name);
      });
    }
    toRemove.forEach((el) => el.parentNode && el.parentNode.removeChild(el));
    return doc.body.innerHTML;
  }

  // 将 Markdown 渲染为安全的 HTML（供列表展示、HTML 导出和预览复用）
  function renderMarkdown(content) {
    if (typeof marked !== "undefined") {
      try {
        return sanitize(marked.parse(content || ""));
      } catch {
        return toHtml(content);
      }
    }
    return toHtml(content);
  }

  // 兜底：将纯文本转为带格式的 HTML：保留段落（双换行）和换行（单换行）
  function toHtml(text) {
    const esc = (s) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return text
      .split(/\n{2,}/)
      .map((p) => `<p>${esc(p).split("\n").join("<br>")}</p>`)
      .join("");
  }

  async function addText(content, url) {
    const entries = await load();
    entries.push({ type: "text", content, html: renderMarkdown(content), ts: Date.now(), url });
    await putDoc({ entries });
    return entries;
  }

  async function addImage(dataUrl, url) {
    const entries = await load();
    entries.push({ type: "image", dataUrl, ts: Date.now(), url });
    await putDoc({ entries });
    return entries;
  }

  async function removeEntry(index) {
    const entries = await load();
    if (index < 0 || index >= entries.length) return entries;
    entries.splice(index, 1);
    await putDoc({ entries });
    return entries;
  }

  async function clear() {
    const entries = [];
    await putDoc({ entries });
    return entries;
  }

  async function replaceAll(newEntries) {
    const entries = Array.isArray(newEntries) ? newEntries : [];
    let dirty = false;
    for (const e of entries) {
      if (e.type === "text" && !e.html && e.content) {
        e.html = renderMarkdown(e.content);
        dirty = true;
      }
    }
    await putDoc({ entries });
    return entries;
  }

  // 按索引更新文字条目：保留 ts/url，重渲染 Markdown
  async function updateText(index, content) {
    const entries = await load();
    if (index < 0 || index >= entries.length) return entries;
    const e = entries[index];
    if (e.type !== "text") return entries;
    e.content = typeof content === "string" ? content : "";
    e.html = renderMarkdown(e.content);
    await putDoc({ entries });
    return entries;
  }

  globalThis.NoteDB = { load, addText, addImage, removeEntry, clear, replaceAll, updateText, renderMarkdown };
})();
