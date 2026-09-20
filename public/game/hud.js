/* The entire game interface is drawn in this canvas. HTML is reserved for the
   portfolio link, the no-WebGL fallback and the operating system file picker. */
(() => {
  const D = GardenData;
  class GardenHUD {
    constructor(canvas, view, dispatch) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.view = view;
      this.dispatch = dispatch;
      this.buttons = [];
      this.blocks = [];
      this.images = new Map();
      this.focus = 0;
      this.page = 0;
      this.lastPanel = "";
      this.hover = null;
      this.drag = null;
      this.pointer = { x: 0, y: 0 };
      this.palette = {
        ink: "#344737",
        muted: "#76806b",
        paper: "#f3ecd8",
        rim: "#998361",
        wood: "#745b3e",
        green: "#496a43",
        gold: "#d5b365",
      };
      this.resize();
      new ResizeObserver(() => this.resize()).observe(canvas);
    }
    resize() {
      this.w = this.canvas.clientWidth;
      this.h = this.canvas.clientHeight;
      const d = Math.min(devicePixelRatio, 1.5);
      this.canvas.width = this.w * d;
      this.canvas.height = this.h * d;
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
    }
    plate(x, y, w, h) {
      this.blocks.push({ id: "surface", x, y, w, h, action: "none", data: {} });
      this.box(x, y + 4, w, h, "#34463244", 13);
      this.box(x, y, w, h, this.palette.wood, 13);
      this.box(x + 3, y + 3, w - 6, h - 6, this.palette.rim, 10);
      this.box(x + 6, y + 6, w - 12, h - 12, this.palette.paper, 8);
    }

    hit(x, y) {
      return (
        [...this.buttons]
          .reverse()
          .find(
            (b) =>
              !b.disabled &&
              x >= b.x &&
              x <= b.x + b.w &&
              y >= b.y &&
              y <= b.y + b.h,
          ) ||
        [...this.blocks]
          .reverse()
          .find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
      );
    }
    activate(b) {
      if (b && !b.disabled) this.dispatch(b.action, b.data);
    }
    draw(m) {
      this.model = m;
      const { w, h, ctx: c } = this;
      c.clearRect(0, 0, w, h);
      this.buttons = [];
      this.blocks = [];
      const mobile = w < 650,
        p = this.palette;
      if (this.lastPanel !== m.panel) {
        this.page = 0;
        this.focus = 0;
        this.lastPanel = m.panel;
        // Epic C2.9: hud-panel.js's observation rows are memoized on s.elapsed (a real tick
        // counter) to avoid re-running RainelleMovement.routeTo's grid BFS every animation frame
        // while the panel sits open — but a command that changes what it shows (teaching a
        // gesture, registering a station) never itself calls tick(), so elapsed alone would miss
        // it if the player left this panel and came back before the next tick. Invalidating here,
        // on every panel change (not just entering "observation"), guarantees a fresh read the
        // instant this panel becomes visible again, whatever caused the panel switch.
        this._observationCache = null;
      }
      if (m.panel === "inspection") {
        this.drawInspection(m);
        return;
      }
      const l = {
        mobile,
        p,
        left: mobile ? 12 : 22,
        rw: mobile ? 212 : 285,
      };
      l.size = mobile ? Math.min(61, (w - 42) / 5) : 66;
      l.gap = 7;
      l.bw = l.size * 5 + l.gap * 4 + 18;
      l.bx = (w - l.bw) / 2;
      l.by = h - (l.size + 37);
      const left = l.left,
        rw = l.rw,
        by = l.by;
      this.drawHeader(m, l, w, h, c);
      this.drawNav(m, l, w, h, c);
      this.drawHotbar(m, l, w, h, c);
      this.drawBuildCard(m, l, w, h, c);
      this.drawCamera(m, l, w, h, c);
      this.drawJoystick(m, l, w, h, c);
      this.worldRects = [];
      if (!m.panel && !m.build) {
        this.drawWorldActions(m, by);
        this.drawMoisture(m, by);
      }
      if (m.network && !m.panel && !m.build)
        for (const tank of m.s.entities.filter(
          (e) => !e.stored && e.type === "tank" && e !== m.selected,
        )) {
          const pt = this.view.screenPoint(tank, 2);
          if (!pt.visible) continue;
          const rect = {
            x: Math.max(8, Math.min(w - 238, pt.x - 115)),
            y: pt.y - 48,
            w: 230,
            h: 48,
          };
          if (rect.y < 185 || rect.y + 48 > by - 35 || this.overlaps(rect))
            continue;
          this.worldRects.push(rect);
          const status = GardenIrrigation.status(m.s, tank);
          this.box(rect.x, rect.y, rect.w, rect.h, "#e4eddfeb", 7, "#779170");
          this.text(
            `${Math.floor(tank.water)}/160`,
            rect.x + 10,
            rect.y + 13,
            11,
          );
          this.text(status.message, rect.x + 10, rect.y + 33, 10);
        }
      const light = this.view.lighting;
      if (light) {
        const x = left + rw - 27,
          y = 60;
        this.text(light.height >= 0 ? "☀" : "☾", x, y, 20, p.ink, "center");
      }
      if (m.s.settings.hints && !m.panel && !m.toast && !mobile)
        this.text(m.hint, w / 2, 30, 12, p.ink, "center");
      if (m.panel === "inspection") this.drawInspection(m);
      else if (m.panel) this.drawPanel(m);
      if (
        m.toast &&
        m.panel !== "inspection" &&
        performance.now() < m.toastUntil
      ) {
        const tw = Math.min(480, w - 30),
          ty = m.panel
            ? Math.min(h - 68, this.panelRect.y + this.panelRect.h + 8)
            : mobile
              ? by - 100
              : 190;
        this.plate((w - tw) / 2, ty, tw, 58);
        this.wrap(m.toast, (w - tw) / 2 + 15, ty + 21, tw - 30, 12);
      }
      if (this.drag?.item) {
        this.icon(this.drag.item, this.pointer.x - 28, this.pointer.y - 28, 56);
      }
    }
    overlaps(rect) {
      return this.worldRects.some(
        (r) =>
          rect.x < r.x + r.w + 5 &&
          rect.x + rect.w + 5 > r.x &&
          rect.y < r.y + r.h + 5 &&
          rect.y + rect.h + 5 > r.y,
      );
    }
    drawPanel(m) {
      const { w, h, palette: p, ctx: c } = this;
      this.box(0, 0, w, h, "#1e302950", 0);
      this.buttons = [];
      const pw = Math.min(730, w - 20),
        ph = Math.min(w < 500 ? 620 : 580, h - 26),
        x = (w - pw) / 2,
        y = (h - ph) / 2;
      this.panelRect = { x, y, w: pw, h: ph };
      this.plate(x, y, pw, ph);
      const titles = {
        inventory: "Ton inventaire",
        map: "Les chemins du jardin",
        notebook: "Le carnet botanique",
        visitor: "Les échanges de Léa",
        settings: "À ton rythme",
        reserve: "Les objets rangés",
        nursery: "Choisir une bouture",
        nightfall: "La nuit tombe",
        observation: "Le mode d'observation",
        "gesture-scene": "Un geste observé",
        teaching: "« Regarde-moi »",
      };
      this.text(
        titles[m.panel],
        x + 22,
        y + 30,
        w < 500 ? 22 : 27,
        p.ink,
        "left",
        700,
      );
      this.button("close", "×", x + pw - 58, y + 10, 43, 39, "close");
      if (m.panel === "inventory") {
        this.drawInventory(m, w, x, y, pw, ph, p);
      } else {
        const rows = this.buildPanelRows(m, w, x, y, pw, ph, p);
        this.drawPanelRows(rows, m, w, x, y, pw, ph, p);
      }
    }
  }
  window.GardenHUD = GardenHUD;
})();
