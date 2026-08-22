/* Board messaging that survives TaleSpire's size limit.

   TS.sync.send rejects any payload over 500 characters:

     sync failed: Error: string too long: max length is 500, length was 3853

   and it rejects the whole message rather than truncating it, so anything
   bigger simply never arrives. A shop with its stock is a few thousand
   characters and a mirrored character sheet is around a thousand, which is why
   neither was reaching the other side of the table.

   So every message goes out in frames small enough to be accepted, and is put
   back together on arrival:

     VTF|<msgId>|<index>|<total>|<chunk of the payload>

   Plain text on purpose. Wrapping a chunk of JSON inside another JSON object
   would escape every quote in it, which inflates the very thing being kept
   small - by roughly a third for our payloads, and unpredictably.

   Frames are budgeted in UTF-8 bytes rather than characters. The limit is
   stated in characters, but an item name with an accent or a dash costs more
   than one byte, and being wrong in that direction means the message is thrown
   away with no way to tell. Counting bytes is never an underestimate. */
(function () {
  'use strict';
  var VT = window.VT = window.VT || {};

  var MAGIC = 'VTF';
  var LIMIT = 440;          /* whole frame, in UTF-8 bytes; 500 is the wall */
  var STALE = 30000;        /* drop half-assembled messages after this */

  /* What a string costs once encoded, without allocating a buffer for it. */
  function byteLen(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xD800 && c <= 0xDBFF) { n += 4; i++; }   /* surrogate pair */
      else n += 3;
    }
    return n;
  }

  function uid() {
    return Math.random().toString(36).slice(2, 8);
  }

  /* Cut text into pieces that each fit the budget. Never splits a surrogate
     pair, so an emoji in a shop name cannot come out the other end as two
     broken halves. */
  function chunk(text, budget) {
    var out = [], i = 0;
    while (i < text.length) {
      var used = 0, start = i;
      while (i < text.length) {
        var c = text.charCodeAt(i);
        var cost, step;
        if (c < 0x80) { cost = 1; step = 1; }
        else if (c < 0x800) { cost = 2; step = 1; }
        else if (c >= 0xD800 && c <= 0xDBFF) { cost = 4; step = 2; }
        else { cost = 3; step = 1; }
        if (used + cost > budget) break;
        used += cost; i += step;
      }
      if (i === start) { i = start + 1; }   /* budget smaller than one char */
      out.push(text.slice(start, i));
    }
    return out.length ? out : [''];
  }

  /* One message -> the frames to put on the board, in order. */
  function frames(text) {
    var id = uid();
    /* Budget the header at its widest so the count cannot change the maths
       once the pieces are already cut. */
    var header = MAGIC + '|' + id + '|999|999|';
    var pieces = chunk(String(text), LIMIT - byteLen(header));
    return pieces.map(function (p, i) {
      return MAGIC + '|' + id + '|' + i + '|' + pieces.length + '|' + p;
    });
  }

  /* Half-assembled messages, keyed by sender and message id. Kept per sender so
     two people talking at once cannot interleave into each other's message. */
  var pending = {};

  function sweep(now) {
    Object.keys(pending).forEach(function (k) {
      if (now - pending[k].at > STALE) delete pending[k];
    });
  }

  /* Feed every incoming string through this. Returns the complete payload when
     the last missing frame arrives, and null until then. A string that is not
     one of our frames comes straight back, so a caller can still handle
     anything else that turns up on the board. */
  function receive(str, from) {
    if (typeof str !== 'string') return null;
    if (str.slice(0, 4) !== MAGIC + '|') return str;

    var head = str.split('|', 4);
    if (head.length < 4) return null;
    var id = head[1], i = parseInt(head[2], 10), n = parseInt(head[3], 10);
    if (!id || isNaN(i) || isNaN(n) || n < 1 || i < 0 || i >= n) return null;

    /* the chunk is everything after the fourth separator, which may itself
       contain '|' - so count separators rather than splitting on them */
    var at = 0;
    for (var seen = 0; seen < 4 && at < str.length; at++) {
      if (str.charAt(at) === '|') seen++;
    }
    var data = str.slice(at);

    if (n === 1) return data;                 /* the common case, no bookkeeping */

    var now = Date.now();
    sweep(now);
    var key = (from || '?') + '|' + id;
    var slot = pending[key];
    if (!slot || slot.n !== n) slot = pending[key] = { n: n, parts: new Array(n), got: 0, at: now };
    if (slot.parts[i] == null) { slot.parts[i] = data; slot.got++; }
    slot.at = now;

    if (slot.got < n) return null;
    delete pending[key];
    return slot.parts.join('');
  }

  /* Frames go out spaced slightly apart. Firing twenty at once is a good way to
     meet a rate limit nobody documented, and a message that is a few
     milliseconds late costs nothing here. */
  function send(api, text, target, onError) {
    if (!api || !api.send) return;
    var list = frames(text);
    list.forEach(function (f, i) {
      var fire = function () {
        try {
          var p = api.send(f, target || 'board');
          if (p && p.catch) {
            p.catch(function (e) {
              if (onError) onError(e, f);
            });
          }
        } catch (e) { if (onError) onError(e, f); }
      };
      if (i === 0) fire(); else setTimeout(fire, i * 25);
    });
    return list.length;
  }

  VT.sync = {
    LIMIT: LIMIT,
    byteLen: byteLen,
    frames: frames,
    receive: receive,
    send: send
  };
})();
