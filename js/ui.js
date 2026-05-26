// HUD + modal upgrade menus + glossary (DOM overlay for crisp tappable UI).
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
      catalyst: document.getElementById("hud-catalyst"),
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
      help: document.getElementById("btn-help"),
      settings: document.getElementById("btn-settings"),
      build: document.getElementById("btn-build"),
      hud: document.getElementById("hud"),
    };
    const self = this;
    this.el.close.addEventListener("click", () => self.close());
    this.el.modal.addEventListener("click", (e) => {
      if (e.target === self.el.modal) self.close();
    });
    this.el.help.addEventListener("click", () => self.openGlossary(game));
    this.el.settings.addEventListener("click", () => self.openSettings(game));
    this.el.build.addEventListener("click", () => game.openBuild());
  };

  UI.setBuildEnabled = function (ready) {
    if (this.el.build) this.el.build.classList.toggle("ready", !!ready);
  };

  UI.updateHUD = function (game) {
    const s = game.state;
    this.el.minerals.textContent = U.formatNum(s.minerals);
    this.el.crystals.textContent = U.formatNum(s.crystals);
    this.el.catalyst.textContent = U.formatNum(s.catalyst);
    let botCount = 0,
      bays = 0;
    for (const f of game.factories) {
      botCount += f.bots.length;
      bays += Math.floor(f.botStats.botBay);
    }
    this.el.bots.textContent = botCount + "/" + bays;
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

  UI.openGlossary = function (game) {
    if (this.open && this.panel === "glossary") {
      this.close();
      return;
    }
    this.open = true;
    this.panel = "glossary";
    this.building = null;
    this.el.modal.classList.add("show");
    this.el.title.textContent = "GLOSSARY";
    this.refresh(game);
  };

  UI.openSettings = function (game) {
    if (this.open && this.panel === "settings") {
      this.close();
      return;
    }
    this.open = true;
    this.panel = "settings";
    this.building = null;
    this._confirmReset = false;
    this.el.modal.classList.add("show");
    this.el.title.textContent = "SETTINGS";
    this.refresh(game);
  };

  UI.close = function () {
    this.open = false;
    this.panel = null;
    this.building = null;
    this._confirmReset = false;
    this.el.modal.classList.remove("show");
  };

  UI.refresh = function (game) {
    if (!this.open) return;
    const list = this.el.list;
    list.innerHTML = "";

    if (this.panel === "settings") {
      this.el.sub.textContent = "Data & experiments";
      if (this._confirmReset) {
        const warn = document.createElement("div");
        warn.className = "settings-warn";
        warn.textContent = "Erase ALL progress? This cannot be undone.";
        list.appendChild(warn);
        const conf = document.createElement("button");
        conf.className = "upg danger";
        conf.innerHTML = '<div class="upg-main"><div class="upg-name">Confirm Reset</div></div><div class="upg-cost">✕</div>';
        conf.addEventListener("click", () => game.resetGame());
        list.appendChild(conf);
        const cancel = document.createElement("button");
        cancel.className = "upg";
        cancel.innerHTML = '<div class="upg-main"><div class="upg-name">Cancel</div></div>';
        cancel.addEventListener("click", () => {
          this._confirmReset = false;
          this.refresh(game);
        });
        list.appendChild(cancel);
      } else {
        const reset = document.createElement("button");
        reset.className = "upg danger-outline";
        reset.innerHTML = '<div class="upg-main"><div class="upg-name">Reset Progress</div><div class="upg-desc">Wipe your save and start a fresh core.</div></div><div class="upg-cost">↺</div>';
        reset.addEventListener("click", () => {
          this._confirmReset = true;
          this.refresh(game);
        });
        list.appendChild(reset);
      }
      const hdr = document.createElement("div");
      hdr.className = "settings-hdr";
      hdr.textContent = "DEVELOPER TOGGLES";
      list.appendChild(hdr);
      for (const def of Eco.DEV_DEFS) {
        const on = !!G.DEV[def.key];
        const row = document.createElement("button");
        row.className = "toggle" + (on ? " on" : "");
        row.innerHTML =
          '<div class="upg-main"><div class="upg-name">' + def.name + ' <span class="upg-lvl">' + def.kind + "</span></div>" +
          '<div class="upg-desc">' + def.desc + "</div></div>" +
          '<div class="tgl">' + (on ? "ON" : "OFF") + "</div>";
        row.addEventListener("click", () => {
          game.toggleDev(def.key);
          this.refresh(game);
        });
        list.appendChild(row);
      }
      return;
    }

    if (this.panel === "glossary") {
      this.el.sub.textContent = "What the readouts at the top mean";
      for (const e of Eco.GLOSSARY) {
        const row = document.createElement("div");
        row.className = "gloss";
        row.innerHTML =
          '<div class="gloss-ic ' + e.cls + '">' + e.glyph + "</div>" +
          '<div class="gloss-main"><div class="gloss-name">' + e.name + "</div>" +
          '<div class="gloss-desc">' + e.desc + "</div></div>";
        list.appendChild(row);
      }
      return;
    }

    const defs = Eco.UPGRADES[this.panel];
    const s = game.state;
    const isFactory = this.panel === "factory";

    if (this.panel === "base") {
      this.el.sub.textContent = "Influence ◎" + U.formatNum(game.stats.influence) + "  ·  Core " + (game.world.carvedFraction() * 100).toFixed(1) + "%";
      if (game.world.carvedFraction() >= 0.9) {
        const asc = document.createElement("button");
        asc.className = "upg ascend";
        asc.innerHTML =
          '<div class="upg-main"><div class="upg-name">ASCEND <span class="upg-lvl">x' +
          (s.ascends || 0) +
          '</span></div><div class="upg-desc">Assimilate this core. Reset progress for a permanent +50% yield and a fresh, richer core.</div></div><div class="upg-cost"><span class="c-cat">✷</span></div>';
        asc.addEventListener("click", () => game.ascend());
        list.appendChild(asc);
      }
    } else {
      const bs = this.building.botStats;
      this.el.sub.textContent = "This factory · " + this.building.bots.length + "/" + Math.floor(bs.botBay) + " bots";
    }

    for (const def of defs) {
      const lvl = isFactory ? this.building.levels[def.id] || 0 : s.levels[def.id] || 0;
      const cost = Eco.cost(def.id, def.id === "factory" ? s.levels.factory : lvl);
      const afford = Eco.canPay(s, cost);

      const row = document.createElement("button");
      row.className = "upg" + (afford ? "" : " locked");
      row.disabled = !afford;

      let levelLabel = "Lv " + lvl;
      if (def.id === "factory") levelLabel = "Built " + s.levels.factory;
      if (def.id === "influence") levelLabel = "◎" + U.formatNum(game.stats.influence);

      let costHtml = '<span class="c-min">◈ ' + U.formatNum(cost.minerals) + "</span>";
      if (cost.crystals > 0) costHtml += '<span class="c-cry">✦ ' + U.formatNum(cost.crystals) + "</span>";
      if (cost.catalyst > 0) costHtml += '<span class="c-cat">✷ ' + U.formatNum(cost.catalyst) + "</span>";

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
      const building = this.building;
      row.addEventListener("click", () => {
        if (game.buyUpgrade(id, building)) {
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
