/* Virtual Tactics :: map/iso.js
   Isometric projection + the four camera rotations.

   All game logic (pathfinding, range, line of sight) happens in plain map
   coordinates. Rotation is a *view* concern only: we rotate (x,y) into screen
   space right before drawing, and unrotate on click. That keeps the rules code
   free of camera state. */
(function () {
  'use strict';
  var VT = window.VT;

  var TILE_W = 64;   // full width of a tile diamond, px
  var TILE_H = 32;   // full height of a tile diamond, px
  var STEP = 16;     // px of vertical rise per 5 ft of elevation
  var FT = 5;        // feet per tile / per height step

  /* map (x,y) -> rotated (rx,ry) for camera rotation r (0..3) */
  function rot(x, y, r, w, h) {
    switch (r & 3) {
      case 1: return { x: h - 1 - y, y: x };
      case 2: return { x: w - 1 - x, y: h - 1 - y };
      case 3: return { x: y, y: w - 1 - x };
      default: return { x: x, y: y };
    }
  }
  /* rotated (rx,ry) -> map (x,y) */
  function unrot(rx, ry, r, w, h) {
    switch (r & 3) {
      case 1: return { x: ry, y: h - 1 - rx };
      case 2: return { x: w - 1 - rx, y: h - 1 - ry };
      case 3: return { x: w - 1 - ry, y: rx };
      default: return { x: rx, y: ry };
    }
  }
  /* dimensions of the rotated grid */
  function rdims(r, w, h) { return (r & 1) ? { w: h, h: w } : { w: w, h: h }; }

  /* Rotated tile + elevation -> world-space centre of its top face. */
  function project(rx, ry, elev) {
    return {
      x: (rx - ry) * (TILE_W / 2),
      y: (rx + ry) * (TILE_H / 2) - (elev || 0) * STEP
    };
  }

  /* The four corners of a tile's top face, in world space. */
  function topFace(rx, ry, elev) {
    var p = project(rx, ry, elev);
    return [
      { x: p.x, y: p.y - TILE_H / 2 },  // north (back)
      { x: p.x + TILE_W / 2, y: p.y },  // east  (right)
      { x: p.x, y: p.y + TILE_H / 2 },  // south (front)
      { x: p.x - TILE_W / 2, y: p.y }   // west  (left)
    ];
  }

  function pointInPoly(px, py, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /* Walk every tile back-to-front (painter's order) in rotated space.
     cb(mapX, mapY, rx, ry) */
  function forEachDrawOrder(r, w, h, cb) {
    var d = rdims(r, w, h);
    for (var ry = 0; ry < d.h; ry++) {
      for (var rx = 0; rx < d.w; rx++) {
        var m = unrot(rx, ry, r, w, h);
        cb(m.x, m.y, rx, ry);
      }
    }
  }
  /* Front-to-back, for hit testing. */
  function forEachPickOrder(r, w, h, cb) {
    var d = rdims(r, w, h);
    for (var ry = d.h - 1; ry >= 0; ry--) {
      for (var rx = d.w - 1; rx >= 0; rx--) {
        var m = unrot(rx, ry, r, w, h);
        if (cb(m.x, m.y, rx, ry) === true) return true;
      }
    }
    return false;
  }

  VT.iso = {
    TILE_W: TILE_W, TILE_H: TILE_H, STEP: STEP, FT: FT,
    rot: rot, unrot: unrot, rdims: rdims,
    project: project, topFace: topFace, pointInPoly: pointInPoly,
    forEachDrawOrder: forEachDrawOrder, forEachPickOrder: forEachPickOrder
  };
})();
