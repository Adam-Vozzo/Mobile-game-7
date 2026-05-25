// HUD + modal upgrade menus (DOM overlay for crisp text and tappable buttons).
(function (G) {
  "use strict";
  const U = G.util;
  const Eco = G.Economy;

  const UI = {
    open: false,
    panel: null,
    building: null,
    _toastTimer: 0,
  };

  UI.init = function (game) {
    this.game = game;
    this.el = {
      minerals: document.getElementById("hud-minerals"),
      crystals: document.getElementById("hud-crystals"),
      bots: document.getElementById("hud-bots"),
      factories: document.getElementById("hud-factories"),
      influence: document.getElementById("hud-influence"),
      core: document.getElementById("hud-core"),
      modal: document.getElementById("modal"),
      title: document.getElementById("modal-title"),
      list: document.getElementById("modal-list"),
      sub: document.getElementById("modal-sub"),
      close: document.getElementById("modal-close"),
      toast: document.getElementById("toast"),
      prompt: document.getElementById("prompt"),
      btnBase: document.getElementById("btn-base"),
    };
    const self = this;
    this.el.close.addEventListener("click", () => self.close());
    this.el.modal.addEventListener("click", (e) => {
      if (e.target === self.el.modal) self.close();
    });
    this.el.btnBase.addEventListener("click", () => self.openPanel("base", game.base, game));
  };

  UI.updateHUD = function (game) {
    const s = game.state;
    this.el.minerals.textContent = U.formatNum(s.minerals);
    this.el.crystals.textContent = U.formatNum(s.crystals);
    let botCount = 0;
    for (const f of game.factories) botCount += f.bots.length;
    this.el.bots.textContent = botCount + "/" + (game.factories.length * Math.floor(game.stats.botBay));
    this.el.factories.textContent = String(game.factories.length);
    this.el.influence.textContent = U.formatNum(game.stats.influence);
    this.el.core.textContent = (game.world.carvedFraction() * 100).toFixed(1) + "%";
  };

  UI.openPanel = function (panel, building, game) {
    this.open = true;
    this.panel = panel;
    this.building = building;
    this.el.modal.classList.add("show");
    this.el.title.textContent = panel === "base" ? "COMMAND BASE" : "FACTORY";
    this.refresh(game);
  };

  UI.close = function () {
    this.open = false;
    this.panel = null;
    this.building = null;
    this.el.modal.classList.remove("show");
  };

  UI.toggleBase = function (game) {
    if (this.open && this.panel === "base") this.close();
    else this.openPanel("base", game.base, game);
  };

  UI.refresh = function (game) {
    if (!this.open) return;
    const list = this.el.list;
    list.innerHTML = "";
    const defs = Eco.UPGRADES[this.panel];
    const s = game.state;

    if (this.panel === "base") {
      this.el.sub.textContent = "Influence " + U.formatNum(game.stats.influence) + "  ·  Core " + (game.world.carvedFraction() * 100).toFixed(1) + "%";
      if (game.world.carvedFraction() >= 0.9) {
        const asc = document.createElement("button");
        asc.className = "upg ascend";
        asc.innerHTML =
          '<div class="upg-main"><div class="upg-name">ASCEND <span class="upg-lvl">x' +
          (game.state.ascends || 0) +
          '</span></div><div class="upg-desc">Assimilate this core. Reset progress for a permanent +50% yield and a fresh, richer core.</div></div><div class="upg-cost"><span class="c-cry">✦</span></div>';
        asc.addEventListener("click", () => game.ascend());
        list.appendChild(asc);
      }
    } else {
      this.el.sub.textContent = "Bots apply to all factories";
    }

    for (const def of defs) {
      const cost = Eco.cost(s, def.id);
      const afford = Eco.canAfford(s, def.id);
      const lvl = s.levels[def.id] || 0;

      const row = document.createElement("button");
      row.className = "upg" + (afford ? "" : " locked");
      row.disabled = !afford;

      let levelLabel = "Lv " + lvl;
      if (def.id === "factory") levelLabel = "Built " + lvl;
      if (def.id === "influence") levelLabel = "x" + U.formatNum(game.stats.influence);

      let costHtml = '<span class="c-min">◈ ' + U.formatNum(cost.minerals) + "</span>";
      if (cost.crystals > 0) costHtml += '<span class="c-cry">✦ ' + U.formatNum(cost.crystals) + "</span>";

      row.innerHTML =
        '<div class="upg-main"><div class="upg-name">' +
        def.name +
        ' <span class="upg-lvl">' +
        levelLabel +
        "</span></div>" +
        '<div class="upg-desc">' +
        def.desc +
        "</div></div>" +
        '<div class="upg-cost">' +
        costHtml +
        "</div>";

      const id = def.id;
      row.addEventListener("click", () => {
        if (game.buyUpgrade(id)) {
          this.refresh(game);
          this.updateHUD(game);
        }
      });
      list.appendChild(row);
    }
  };

  UI.toast = function (msg, ms) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.el.toast.classList.remove("show"), ms || 3500);
  };

  UI.setPrompt = function (text) {
    if (text) {
      this.el.prompt.textContent = text;
      this.el.prompt.classList.add("show");
    } else {
      this.el.prompt.classList.remove("show");
    }
  };

  G.UI = UI;
})(window.G);
