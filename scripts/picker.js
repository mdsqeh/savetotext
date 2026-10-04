(function () {
  "use strict";

  // ---------- 点击选元素 ----------
  window.__pickElement = function () {
    return new Promise(function (resolve) {
      var overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;";
      var box = document.createElement("div");
      box.style.cssText =
        "position:absolute;pointer-events:none;border:2px solid #2563eb;" +
        "background:rgba(37,99,235,.12);box-sizing:border-box;display:none;z-index:2147483648;";
      document.documentElement.appendChild(overlay);
      document.documentElement.appendChild(box);

      var target = null;

      function cleanup() {
        overlay.remove();
        box.remove();
        document.removeEventListener("keydown", onKey, true);
      }

      function onMove(e) {
        overlay.style.pointerEvents = "none";
        var el = document.elementFromPoint(e.clientX, e.clientY);
        overlay.style.pointerEvents = "";
        if (!el) {
          box.style.display = "none";
          target = null;
          return;
        }
        var r = el.getBoundingClientRect();
        box.style.display = "block";
        box.style.left = r.left + "px";
        box.style.top = r.top + "px";
        box.style.width = r.width + "px";
        box.style.height = r.height + "px";
        target = el;
      }

      function onKey(e) {
        if (e.key === "Escape") {
          cleanup();
          resolve({ error: "cancel" });
        }
      }

      overlay.addEventListener("mousemove", onMove);
      overlay.addEventListener("click", async function (e) {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
        if (!target) {
          resolve({ error: "cancel" });
          return;
        }
        try {
          var snap = await window.snapdom(target, {
            backgroundColor: "#ffffff",
            scale: Math.max(1, window.devicePixelRatio || 1)
          });
          var canvas = await snap.toCanvas();
          resolve({ dataUrl: canvas.toDataURL("image/png") });
        } catch (err) {
          resolve({ error: String((err && err.name) || err) });
        }
      });
      document.addEventListener("keydown", onKey, true);
    });
  };

  // ---------- 拖拽框选 ----------
  window.__pickRect = function () {
    return new Promise(function (resolve) {
      var overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;";
      var box = document.createElement("div");
      box.style.cssText =
        "position:absolute;pointer-events:none;border:1px solid #2563eb;" +
        "background:rgba(37,99,235,.15);box-sizing:border-box;display:none;z-index:2147483648;";
      document.documentElement.appendChild(overlay);
      document.documentElement.appendChild(box);

      var start = null;

      function cleanup() {
        overlay.remove();
        box.remove();
        document.removeEventListener("keydown", onKey, true);
      }

      function updateBox(a, b) {
        box.style.left = Math.min(a.x, b.x) + "px";
        box.style.top = Math.min(a.y, b.y) + "px";
        box.style.width = Math.abs(b.x - a.x) + "px";
        box.style.height = Math.abs(b.y - a.y) + "px";
      }

      function onDown(e) {
        e.preventDefault();
        e.stopPropagation();
        start = { x: e.clientX, y: e.clientY };
        box.style.display = "block";
        updateBox(start, start);
      }

      function onMove(e) {
        if (!start) return;
        e.preventDefault();
        e.stopPropagation();
        updateBox(start, { x: e.clientX, y: e.clientY });
      }

      function onUp(e) {
        if (!start) return;
        e.preventDefault();
        e.stopPropagation();
        var x = Math.min(start.x, e.clientX);
        var y = Math.min(start.y, e.clientY);
        var w = Math.abs(e.clientX - start.x);
        var h = Math.abs(e.clientY - start.y);
        cleanup();
        if (w < 2 || h < 2) {
          resolve({ error: "cancel" });
          return;
        }
        resolve({
          rect: { x: x, y: y, width: w, height: h },
          viewport: { width: window.innerWidth, height: window.innerHeight }
        });
      }

      function onKey(e) {
        if (e.key === "Escape") {
          cleanup();
          resolve({ error: "cancel" });
        }
      }

      overlay.addEventListener("mousedown", onDown);
      overlay.addEventListener("mousemove", onMove);
      overlay.addEventListener("mouseup", onUp);
      document.addEventListener("keydown", onKey, true);
    });
  };
})();
