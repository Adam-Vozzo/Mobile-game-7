// Boot.
(function (G) {
  "use strict";
  function boot() {
    const canvas = document.getElementById("game");
    const game = new G.Game();
    G.game = game;
    game.init(canvas);
    const ver = document.getElementById("ver");
    if (ver) ver.textContent = "CORE " + (G.BUILD || "");
    if (window.console) console.log("CORE build " + (G.BUILD || "?"));
    // Register the service worker -> installable PWA + offline play.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.G);
