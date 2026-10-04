(function () {
  "use strict";

  const BTN_ID = "__savetotext_save__";

  let btn = null;
  let hideTimer = null;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let savedText = "";

  document.addEventListener("mousemove", (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  function createBtn() {
    btn = document.getElementById(BTN_ID);
    if (btn) return btn;
    btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.title = "保存到随手记";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "15");
    svg.setAttribute("height", "15");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z");
    svg.appendChild(path);
    const pol1 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    pol1.setAttribute("points", "17 21 17 13 7 13 7 21");
    svg.appendChild(pol1);
    const pol2 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    pol2.setAttribute("points", "7 3 7 8 15 8");
    svg.appendChild(pol2);
    btn.appendChild(svg);
    btn.style.cssText =
      "position:fixed;z-index:2147483647;width:30px;height:30px;border:none;border-radius:6px;" +
      "background:#ef4444;color:#fff;font-size:0;line-height:1;cursor:pointer;" +
      "box-shadow:0 1px 4px rgba(0,0,0,.2);padding:0;display:none;align-items:center;justify-content:center;" +
      "transition:background .12s,opacity .18s,transform .18s;opacity:0;transform:scale(.85);";
    btn.addEventListener("mouseenter", () => (btn.style.background = "#dc2626"));
    btn.addEventListener("mouseleave", () => (btn.style.background = "#ef4444"));
    btn.addEventListener("click", onSaveClick);
    document.documentElement.appendChild(btn);
    return btn;
  }

  function showBtn() {
    if (!btn) btn = createBtn();
    btn.style.opacity = "1";
    btn.style.transform = "scale(1)";
  }

  function hideBtn() {
    if (!btn) return;
    btn.style.opacity = "0";
    btn.style.transform = "scale(.85)";
    savedText = "";
    setTimeout(() => { if (btn) btn.style.display = "none"; }, 180);
  }

  // 选中文本通过 background 写入扩展自己的 IndexedDB，
  // content script 里直接 open IndexedDB 会落在页面域名下，popup 读不到。
  async function onSaveClick() {
    if (!btn || !savedText) {
      console.log("[SaveToText] onSaveClick: no savedText, btn=" + !!btn);
      return;
    }
    const text = savedText;
    hideBtn();
    try {
      console.log("[SaveToText] sending saveText", text.slice(0, 50));
      const resp = await chrome.runtime.sendMessage({ cmd: "saveText", text });
      console.log("[SaveToText] saveText resp:", resp);
      // 保存成功：写 storage 信号，通知侧边栏刷新（侧边栏是 panel 类型，
      // chrome.runtime.sendMessage 无法直接到达，改用 storage 变更事件）
      chrome.storage.local.set({ __st_refresh__: Date.now() });
      console.log("[SaveToText] Saved");
    } catch (e) {
      console.error("[SaveToText] Save failed:", e);
    }
  }

  function updateBtn() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.toString().trim()) {
      hideBtn();
      return;
    }
    savedText = sel.toString().trim();
    const size = 30;
    const left = Math.min(lastMouseX + 8, window.innerWidth - size - 6);
    const top = Math.max(lastMouseY - size / 2, 6);
    const b = createBtn();
    b.style.left = Math.max(left, 6) + "px";
    b.style.top = top + "px";
    b.style.display = "flex";
    requestAnimationFrame(() => requestAnimationFrame(showBtn));
  }

  document.addEventListener("mouseup", () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(updateBtn, 60);
  });

  document.addEventListener("mousedown", (e) => {
    if (!btn || e.target === btn || btn.contains(e.target)) return;
    hideBtn();
  });

  document.addEventListener("scroll", () => {
    hideBtn();
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hideBtn();
  });
})();
