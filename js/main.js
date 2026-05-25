// Boot.
(function (G) {
  "use strict";
  function boot() {
    const canvas = document.getElementById("game");
    const game = new G.Game();
    G.game = game;
    game.init(canvas);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.G);
