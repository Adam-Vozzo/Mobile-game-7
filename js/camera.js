// Camera: follows the player and derives zoom from influence. As influence
// grows the view widens, so formations that once filled the screen shrink.
(function (G) {
  "use strict";
  const U = G.util;

  function Camera() {
    this.x = 0;
    this.y = 0;
    this.scale = 1; // screen pixels per world unit
    this._targetScale = 1;
  }

  // viewWidth = world units visible across the internal canvas.
  Camera.prototype.viewWidth = function (influence) {
    return G.CFG.camera.baseView * Math.sqrt(influence);
  };

  Camera.prototype.update = function (dt, tx, ty, tvx, tvy, influence, vw) {
    const c = G.CFG.camera;
    this._targetScale = vw / this.viewWidth(influence);
    const k = 1 - Math.exp(-c.follow * dt);
    const lead = c.lead;
    const gx = tx + tvx * lead;
    const gy = ty + tvy * lead;
    this.x += (gx - this.x) * k;
    this.y += (gy - this.y) * k;
    this.scale += (this._targetScale - this.scale) * k;
  };

  Camera.prototype.snap = function (tx, ty, influence, vw) {
    this.x = tx;
    this.y = ty;
    this.scale = vw / this.viewWidth(influence);
    this._targetScale = this.scale;
  };

  Camera.prototype.worldToScreen = function (wx, wy, vw, vh) {
    return { x: vw * 0.5 + (wx - this.x) * this.scale, y: vh * 0.5 + (wy - this.y) * this.scale };
  };

  Camera.prototype.screenToWorld = function (sx, sy, vw, vh) {
    return { x: (sx - vw * 0.5) / this.scale + this.x, y: (sy - vh * 0.5) / this.scale + this.y };
  };

  G.Camera = Camera;
})(window.G);
