importScripts("db.js");

const MENU_APPEND = "append-to-note";
const MENU_VIEWPORT = "viewport-capture";
const MENU_ELEMENT = "element-capture";
const MENU_REGION = "region-capture";

// 确保侧边栏行为：点击图标时打开侧边栏（Chrome 114+）
if (typeof chrome.sidePanel !== "undefined" && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

// 点击扩展图标时打开侧边栏（备用，兼容旧版 Chrome）
chrome.action.onClicked.addListener((tab) => {
  if (chrome.sidePanel) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  }
});

function ensureMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_APPEND,
      title: "追加到随手记",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: MENU_VIEWPORT,
      title: "截取当前屏幕",
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: MENU_ELEMENT,
      title: "截取元素…",
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: MENU_REGION,
      title: "框选截图…",
      contexts: ["page"]
    });
  });
}

// Context menus persist across browser restarts, but re-create them on
// install/update/startup so a stale or missing menu never lingers.
// 也放在顶层：Service Worker 每次启动都会重建，避免休眠后被浏览器清掉。
ensureMenu();
chrome.runtime.onInstalled.addListener(ensureMenu);
chrome.runtime.onStartup.addListener(ensureMenu);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.cmd === "refresh") {
    chrome.storage.local.set({ __st_refresh__: Date.now() }).catch(() => {});
    sendResponse && sendResponse({ ok: true });
    return false;
  }
  if (msg.cmd === "saveText") {
    const text = typeof msg.text === "string" ? msg.text.trim() : "";
    if (!sender.tab || !text) {
      sendResponse({ ok: false });
      return false;
    }
    NoteDB.addText(text, sender.tab.url)
      .then(async () => {
        sendResponse({ ok: true });
        showFeedback("✓");
        chrome.storage.local.set({ __st_refresh__: Date.now() }).catch(() => {});
        await webdavBackup().catch(() => {});
      })
      .catch(() => {
        sendResponse({ ok: false });
      });
    return true;
  }
  if (msg.cmd === "webdav:backup") {
    webdavBackup().then((r) => sendResponse(r));
    return true;
  }
  if (msg.cmd === "webdav:restore") {
    webdavRestore().then((r) => sendResponse(r));
    return true;
  }
  if (msg.cmd === "webdav:test") {
    webdavBackup().then((r) => sendResponse(r));
    return true;
  }
  return false;
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_APPEND) {
    const text = (info.selectionText || "").trim();
    if (text) appendTextToNote(text, tab.url);
  } else if (info.menuItemId === MENU_VIEWPORT) {
    captureViewport(tab);
  } else if (info.menuItemId === MENU_ELEMENT) {
    captureElement(tab);
  } else if (info.menuItemId === MENU_REGION) {
    captureRegion(tab);
  }
});

async function appendTextToNote(text, url) {
  await NoteDB.addText(text, url);
  showFeedback("✓");
  chrome.storage.local.set({ __st_refresh__: Date.now() }).catch(() => {});
  await webdavBackup().catch(() => {});
}

// ---------- 可视区域：浏览器原生截图，任何网页都成功 ----------
function captureVisible(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (url) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(url);
    });
  });
}

async function captureViewport(tab) {
  try {
    const dataUrl = await captureVisible(tab.windowId);
    await NoteDB.addImage(dataUrl, tab.url);
    showFeedback("✓");
    chrome.storage.local.set({ __st_refresh__: Date.now() }).catch(() => {});
    await webdavBackup().catch(() => {});
  } catch (e) {
    showFeedback("✕");
  }
}

// ---------- 点击选元素：注入 snapdom + 点选器，精确截取某个元素 ----------
async function captureElement(tab) {
  try {
    // 用 files 注入，让 snapdom 和 picker 都在页面 context 执行，overlay 才能正确显示
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["vendor/snapdom.js", "scripts/picker.js"]
    });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function () { return window.__pickElement(); }
    });
    const result = results && results[0] && results[0].result;
    if (!result || result.error) {
      if (result && result.error !== "cancel") showFeedback("✕");
      return;
    }
    await NoteDB.addImage(result.dataUrl, tab.url);
    showFeedback("✓");
    chrome.storage.local.set({ __st_refresh__: Date.now() }).catch(() => {});
    await webdavBackup().catch(() => {});
  } catch (e) {
    showFeedback("✕");
  }
}

// ---------- 框选截图：拖一个矩形，用原生截图裁剪出该区域 ----------
async function captureRegion(tab) {
  try {
    // 用 files 注入，确保 overlay 在页面 context 执行
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["scripts/picker.js"]
    });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function () { return window.__pickRect(); }
    });
    const result = results && results[0] && results[0].result;
    if (!result || result.error) {
      if (result && result.error !== "cancel") showFeedback("✕");
      return;
    }
    const dataUrl = await captureVisible(tab.windowId);
    const cropped = await cropRegion(dataUrl, result.rect, result.viewport);
    await NoteDB.addImage(cropped, tab.url);
    showFeedback("✓");
    chrome.storage.local.set({ __st_refresh__: Date.now() }).catch(() => {});
    await webdavBackup().catch(() => {});
  } catch (e) {
    showFeedback("✕");
  }
}

// 原生截图裁剪：把视口截图按拖动矩形裁出（坐标按 DPR 缩放）
async function cropRegion(dataUrl, rect, viewport) {
  const blob = await (await fetch(dataUrl)).blob();
  const img = await createImageBitmap(blob);
  const ratio = img.width / viewport.width;
  const cw = Math.max(1, Math.round(rect.width * ratio));
  const ch = Math.max(1, Math.round(rect.height * ratio));
  const c = new OffscreenCanvas(cw, ch);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, rect.x * ratio, rect.y * ratio, cw, ch, 0, 0, cw, ch);
  const out = await c.convertToBlob({ type: "image/png" });
  return blobToDataUrl(out);
}

async function blobToDataUrl(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
  }
  return "data:" + blob.type + ";base64," + btoa(bin);
}

function showFeedback(mark) {
  chrome.action.setBadgeText({ text: mark });
  chrome.action.setBadgeBackgroundColor({
    color: mark === "✓" ? "#059669" : "#dc2626"
  });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1500);
}

// ---------- WebDAV 自动备份 ----------

const DEFAULT_WEBDAV_PATH = "/savetotext-backup.json";

function getWebdavSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ["webdav_url", "webdav_user", "webdav_pass", "webdav_enabled", "webdav_path"],
      (res) => {
        resolve({
          enabled: !!res.webdav_enabled,
          url: (res.webdav_url || "").toString().trim(),
          user: (res.webdav_user || "").toString().trim(),
          pass: (res.webdav_pass || "").toString().trim(),
          path: res.webdav_path || DEFAULT_WEBDAV_PATH
        });
      }
    );
  });
}

function buildAuthHeader(user, pass) {
  const token = btoa(unescape(encodeURIComponent(`${user}:${pass}`)));
  return `Basic ${token}`;
}

async function webdavBackup() {
  const cfg = await getWebdavSettings();
  if (!cfg.enabled || !cfg.url) return { ok: false, reason: "disabled" };
  try {
    const entries = await NoteDB.load();
    const payload = JSON.stringify({
      version: 1,
      ts: Date.now(),
      entries
    });
    // 规范化 URL：把 path 直接拼在 url 后面（不管 url 是否带尾部 /），避免 URL 构造吞掉尾部路径段
    let base = cfg.url.toString().trim();
    let p = cfg.path.toString().trim();
    if (!p) p = "/savetotext-backup.json";
    if (!p.startsWith("/")) p = "/" + p;
    if (base.endsWith("/")) base = base.slice(0, -1);
    const finalUrl = base + p;
    const headers = { "Content-Type": "application/json" };
    if (cfg.user || cfg.pass) headers["Authorization"] = buildAuthHeader(cfg.user, cfg.pass);
    const resp = await fetch(finalUrl, {
      method: "PUT",
      headers,
      body: payload
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, status: resp.status, reason: text.slice(0, 200), url: finalUrl };
    }
    return { ok: true, ts: Date.now(), url: finalUrl };
  } catch (e) {
    return { ok: false, reason: (e && e.message) || String(e) };
  }
}

async function webdavRestore() {
  const cfg = await getWebdavSettings();
  if (!cfg.enabled || !cfg.url) return { ok: false, reason: "disabled" };
  try {
    let base = cfg.url.toString().trim();
    let p = cfg.path.toString().trim();
    if (!p) p = "/savetotext-backup.json";
    if (!p.startsWith("/")) p = "/" + p;
    if (base.endsWith("/")) base = base.slice(0, -1);
    const finalUrl = base + p;
    const headers = {};
    if (cfg.user || cfg.pass) headers["Authorization"] = buildAuthHeader(cfg.user, cfg.pass);
    const resp = await fetch(finalUrl, {
      method: "GET",
      headers
    });
    if (resp.status === 404) return { ok: true, ts: 0, count: 0, first: true, url: finalUrl };
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, status: resp.status, reason: text.slice(0, 200), url: finalUrl };
    }
    const text = await resp.text();
    if (!text) return { ok: true, ts: 0, count: 0, url: finalUrl };
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.entries)) return { ok: false, reason: "invalid_backup", url: finalUrl };
    await NoteDB.replaceAll(data.entries);
    return { ok: true, ts: data.ts || 0, count: data.entries.length, url: finalUrl };
  } catch (e) {
    return { ok: false, reason: (e && e.message) || String(e) };
  }
}
