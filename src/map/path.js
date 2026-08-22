/* Virtual Tactics :: map/path.js
   Movement range, pathfinding, line of sight and cover.

   Elevation is the whole point of a tactics grid, so movement is a Dijkstra
   over (x, y, diagonal-parity) states with these rules:
     - stepping UP one 5ft step costs an extra 5ft (a scramble)
     - stepping UP two or more steps is a wall; you need to go around
     - stepping DOWN up to 10ft is free
     - stepping DOWN more than 10ft is allowed but you land hard and stop
     - you may move THROUGH an ally, never through an enemy, and never end
       your move sharing a square */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, G = VT.gmap, FT = VT.iso.FT;

  var DIRS = [
    { dx: 1, dy: 0, d: 0 }, { dx: -1, dy: 0, d: 0 }, { dx: 0, dy: 1, d: 0 }, { dx: 0, dy: -1, d: 0 },
    { dx: 1, dy: 1, d: 1 }, { dx: 1, dy: -1, d: 1 }, { dx: -1, dy: 1, d: 1 }, { dx: -1, dy: -1, d: 1 }
  ];

  var MAX_CLIMB = 1;     // steps you can scramble up (5 ft)
  var FREE_DROP = 2;     // steps you can drop without consequence (10 ft)
  var MAX_DROP = 8;      // steps the pathfinder will ever drop (40 ft)

  function key(x, y, p) { return (y * 1000 + x) * 2 + p; }

  /* Minimal binary heap keyed on .cost */
  function Heap() { this.a = []; }
  Heap.prototype.push = function (n) {
    var a = this.a; a.push(n);
    var i = a.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (a[p].cost <= a[i].cost) break;
      var t = a[p]; a[p] = a[i]; a[i] = t; i = p;
    }
  };
  Heap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, s = i;
        if (l < a.length && a[l].cost < a[s].cost) s = l;
        if (r < a.length && a[r].cost < a[s].cost) s = r;
        if (s === i) break;
        var t = a[s]; a[s] = a[i]; a[i] = t; i = s;
      }
    }
    return top;
  };
  Heap.prototype.size = function () { return this.a.length; };

  /* ---- movement range -------------------------------------------------- */
  /* Returns a Map of "x,y" -> {x,y,cost,fall,prev,danger}. Only tiles you can
     legally END on are included; pass-through squares are used internally. */
  function reachable(map, actor, budgetFt, settings) {
    settings = settings || VT.store.settings();
    var alternating = settings.diagonals === 'alternating';
    var climbCost = settings.climbCost !== false;
    var best = {}, out = new Map();
    var startK = key(actor.x, actor.y, 0);
    var startNode = { x: actor.x, y: actor.y, p: 0, cost: 0, prev: null, fall: 0 };
    best[startK] = 0;
    var heap = new Heap();
    heap.push(startNode);

    while (heap.size()) {
      var cur = heap.pop();
      if (cur.cost > (best[key(cur.x, cur.y, cur.p)] != null ? best[key(cur.x, cur.y, cur.p)] : Infinity)) continue;

      /* record as a landing spot if nothing is standing there */
      var occ = G.anyTokenAt(map, cur.x, cur.y);
      var canStop = (cur.x === actor.x && cur.y === actor.y) || !occ || occ.id === actor.id;
      if (canStop) {
        var prevBest = out.get(cur.x + ',' + cur.y);
        if (!prevBest || prevBest.cost > cur.cost) {
          out.set(cur.x + ',' + cur.y, {
            x: cur.x, y: cur.y, cost: cur.cost, fall: cur.fall,
            prev: cur.prev, danger: !!(G.terrain(map, cur.x, cur.y) || {}).hazard
          });
        }
      }
      /* a hard landing ends your movement */
      if (cur.fall) continue;

      for (var i = 0; i < DIRS.length; i++) {
        var d = DIRS[i], nx = cur.x + d.dx, ny = cur.y + d.dy;
        if (!G.inB(map, nx, ny)) continue;

        /* no cutting corners diagonally past blocked squares */
        if (d.d && (!G.standable(map, cur.x + d.dx, cur.y) && !G.standable(map, cur.x, cur.y + d.dy))) continue;

        var base = G.enterCost(map, nx, ny);
        if (base == null) continue;

        var other = G.anyTokenAt(map, nx, ny);
        if (other && other.id !== actor.id) {
          if (other.team !== actor.team && other.hp > 0) continue;  // enemies block
        }

        var de = G.elev(map, nx, ny) - G.elev(map, cur.x, cur.y);
        var fall = 0;
        if (de > MAX_CLIMB) continue;                       // too high to scramble
        if (de > 0 && climbCost) base += FT * de;           // scrambling up costs extra
        if (de < -FREE_DROP) {
          if (-de > MAX_DROP) continue;
          fall = -de;                                        // hard landing, movement ends
        }

        var np = alternating && d.d ? (cur.p ^ 1) : cur.p;
        var stepCost = base + (alternating && d.d && cur.p === 1 ? FT : 0);
        var nc = cur.cost + stepCost;
        if (nc > budgetFt) continue;

        var nk = key(nx, ny, np);
        if (best[nk] != null && best[nk] <= nc) continue;
        best[nk] = nc;
        var node = { x: nx, y: ny, p: np, cost: nc, prev: cur, fall: fall };
        heap.push(node);
      }
    }
    return out;
  }

  /* Walk the prev-chain back to the start. Returns [{x,y,fall}, ...] */
  function pathTo(rangeMap, x, y) {
    var node = rangeMap.get(x + ',' + y);
    if (!node) return null;
    var out = [{ x: node.x, y: node.y, fall: node.fall, cost: node.cost }];
    var p = node.prev;
    while (p) { out.unshift({ x: p.x, y: p.y, fall: p.fall, cost: p.cost }); p = p.prev; }
    return out;
  }

  /* ---- line of sight & cover ------------------------------------------ */
  var EYE = 1;  // eye height in 5ft steps above the standing tile

  /* Supercover-ish walk between two tile centres. */
  function tilesBetween(x0, y0, x1, y1) {
    var pts = [], dx = x1 - x0, dy = y1 - y0;
    var n = Math.max(Math.abs(dx), Math.abs(dy));
    if (n === 0) return pts;
    for (var i = 1; i < n; i++) {
      var t = i / n;
      var fx = x0 + dx * t, fy = y0 + dy * t;
      var cx = Math.round(fx), cy = Math.round(fy);
      var last = pts[pts.length - 1];
      if (!last || last.x !== cx || last.y !== cy) pts.push({ x: cx, y: cy, t: t });
    }
    return pts;
  }

  /* los(map, from, to) -> { blocked, cover: 0 | 2 | 5, coverName } */
  function los(map, from, to) {
    var e0 = G.elev(map, from.x, from.y) + EYE;
    var e1 = G.elev(map, to.x, to.y) + EYE;
    var pts = tilesBetween(from.x, from.y, to.x, to.y);
    var cover = 0, blocked = false;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (!G.inB(map, p.x, p.y)) continue;
      var lineE = U.lerp(e0, e1, p.t);
      var tile = G.at(map, p.x, p.y);
      var topE = tile.e;
      var pr = tile.p ? G.PROPS[tile.p] : null;
      var adjacentToTarget = U.gridDist(p.x, p.y, to.x, to.y) <= 1;

      /* solid ground rising into the line */
      if (topE >= lineE + 0.5) {
        if (adjacentToTarget) { cover = Math.max(cover, 5); }
        else { blocked = true; break; }
      } else if (topE >= lineE - 0.35) {
        cover = Math.max(cover, 2);   // firing over a lip
      }

      /* props */
      if (pr) {
        var propTop = tile.e + pr.h;
        if (pr.tall && propTop >= lineE + .2) {
          if (adjacentToTarget) cover = Math.max(cover, 5);
          else { blocked = true; break; }
        } else if (pr.cover === 'three' && propTop >= lineE - .3) {
          cover = Math.max(cover, 5);
        } else if (pr.cover === 'half' && propTop >= lineE - .3) {
          cover = Math.max(cover, 2);
        }
      }

      /* a creature in the way gives the target half cover */
      var occ = G.tokenAt(map, p.x, p.y);
      if (occ && occ.id !== from.id && occ.id !== to.id) cover = Math.max(cover, 2);
    }
    if (!VT.store.settings().cover) cover = 0;
    return {
      blocked: blocked,
      cover: blocked ? 99 : cover,
      coverName: blocked ? 'total cover' : cover === 5 ? 'three-quarters cover' : cover === 2 ? 'half cover' : null
    };
  }

  /* Every tile within `radiusFt` of an origin tile, respecting line of sight -
     used for spell areas and for listing valid attack targets. */
  function inRadius(map, ox, oy, radiusFt, requireLos) {
    var r = Math.floor(radiusFt / FT), out = [];
    for (var y = oy - r; y <= oy + r; y++) {
      for (var x = ox - r; x <= ox + r; x++) {
        if (!G.inB(map, x, y)) continue;
        if (U.gridDist(x, y, ox, oy) > r) continue;
        if (requireLos && los(map, { x: ox, y: oy }, { x: x, y: y }).blocked) continue;
        out.push({ x: x, y: y });
      }
    }
    return out;
  }

  /* Distance in feet between two tiles, counting elevation as a third axis. */
  function feet(map, a, b) {
    var flat = U.gridDist(a.x, a.y, b.x, b.y);
    var dz = Math.abs(G.elev(map, a.x, a.y) - G.elev(map, b.x, b.y));
    return Math.max(flat, dz) * FT;
  }

  VT.path = {
    reachable: reachable, pathTo: pathTo, los: los, inRadius: inRadius,
    tilesBetween: tilesBetween, feet: feet, DIRS: DIRS,
    MAX_CLIMB: MAX_CLIMB, FREE_DROP: FREE_DROP
  };
})();
