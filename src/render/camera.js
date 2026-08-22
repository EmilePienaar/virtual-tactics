/* Virtual Tactics :: render/camera.js
   Pan / zoom / four-way rotation. Rotation is applied at the tile-index level
   (see iso.js), so the camera itself only ever translates and scales - which
   keeps the projection crisp at every angle. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, ISO = VT.iso;

  function Camera() {
    this.x = 0; this.y = 0;          // world-space point at screen centre
    this.tx = 0; this.ty = 0;        // pan target (smoothed)
    this.zoom = 1; this.tzoom = 1;
    this.rot = 0;
    this.vw = 800; this.vh = 600;
    this.minZoom = 0.4; this.maxZoom = 3;
  }

  Camera.prototype.resize = function (w, h) { this.vw = w; this.vh = h; };

  Camera.prototype.worldToScreen = function (wx, wy) {
    return {
      x: (wx - this.x) * this.zoom + this.vw / 2,
      y: (wy - this.y) * this.zoom + this.vh / 2
    };
  };
  Camera.prototype.screenToWorld = function (sx, sy) {
    return {
      x: (sx - this.vw / 2) / this.zoom + this.x,
      y: (sy - this.vh / 2) / this.zoom + this.y
    };
  };

  Camera.prototype.panBy = function (dxScreen, dyScreen) {
    this.tx = this.x = this.x - dxScreen / this.zoom;
    this.ty = this.y = this.y - dyScreen / this.zoom;
  };

  Camera.prototype.zoomAt = function (sx, sy, factor) {
    var before = this.screenToWorld(sx, sy);
    this.tzoom = this.zoom = U.clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    var after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x; this.y += before.y - after.y;
    this.tx = this.x; this.ty = this.y;
  };

  /* Glide toward a map tile - used when the turn passes to a new actor. */
  Camera.prototype.focusTile = function (map, x, y, elev) {
    var r = ISO.rot(x, y, this.rot, map.w, map.h);
    var p = ISO.project(r.x, r.y, elev || 0);
    this.tx = p.x; this.ty = p.y - 12;
  };

  Camera.prototype.centerMap = function (map) {
    var d = ISO.rdims(this.rot, map.w, map.h);
    var a = ISO.project(0, 0, 0);
    var b = ISO.project(d.w - 1, d.h - 1, 0);
    this.tx = this.x = (a.x + b.x) / 2;
    this.ty = this.y = (a.y + b.y) / 2 - VT.gmap.maxElev(map) * ISO.STEP / 2;
  };

  /* Fit the whole board on screen. */
  Camera.prototype.fitMap = function (map, pad) {
    this.centerMap(map);
    var d = ISO.rdims(this.rot, map.w, map.h);
    var wPx = (d.w + d.h) * ISO.TILE_W / 2;
    var hPx = (d.w + d.h) * ISO.TILE_H / 2 + VT.gmap.maxElev(map) * ISO.STEP + 60;
    var z = Math.min((this.vw - (pad || 60)) / wPx, (this.vh - (pad || 60)) / hPx);
    this.zoom = this.tzoom = U.clamp(z, this.minZoom, this.maxZoom);
  };

  Camera.prototype.rotate = function (dir, map) {
    /* keep the tile under the screen centre roughly put across the rotation */
    this.rot = (this.rot + (dir > 0 ? 1 : 3)) & 3;
    if (map) this.centerMap(map);
  };

  Camera.prototype.update = function (dt) {
    var k = VT.store.settings().animate === false ? 1 : Math.min(1, dt * 9);
    this.x = U.lerp(this.x, this.tx, k);
    this.y = U.lerp(this.y, this.ty, k);
    this.zoom = U.lerp(this.zoom, this.tzoom, k);
  };

  VT.Camera = Camera;
})();
