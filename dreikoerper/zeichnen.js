/* zeichnen.js — Bahnen ohne Formel: alles, was auf die Leinwand kommt. Armin, 08.10.2026.
 * Rechnet nichts Physikalisches; bekommt Zustände aus physik.js und malt sie.
 *   Zeichnen.Ansicht       Weltkoordinaten <-> Bildpunkte, verschieben, zoomen, einpassen
 *   Zeichnen.himmel(...)   Spuren, Körper, Schwerpunkt, Randpfeile für Körper außerhalb des Bildes
 *   Zeichnen.waechter(...) relativer Fehler von Energie und Drehimpuls über der Zeit (logarithmisch)
 *   Zeichnen.karte(...)    Ausgangskarte für den Regler (aus Phils Python-Läufen)
 *   Zeichnen.Kamera, Zeichnen.himmel3d(...)  (08.10.) dieselben Körper als Sterne im Raum: Perspektive, Drehen, Sternenhintergrund
 */
(function (global) {
  "use strict";

  // ---------- Farben aus den CSS-Variablen (hell/dunkel) ----------
  var farbenCache = null;
  function farben() {
    if (farbenCache) return farbenCache;
    var cs = getComputedStyle(document.documentElement);
    function v(n) { return cs.getPropertyValue(n).trim(); }
    farbenCache = {
      fg: v("--fg"), muted: v("--muted"), rule: v("--rule"), flaeche: v("--flaeche"), accent: v("--accent"), rot: v("--rot"),
      koerper: [v("--k1"), v("--k2"), v("--k3")]
    };
    return farbenCache;
  }
  function farbenNeu() { farbenCache = null; }
  if (global.matchMedia) {
    var mq = global.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", farbenNeu);
  }
  function alpha(farbe, a) {                 // "#rrggbb" -> rgba(...)
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(farbe);
    if (!m) return farbe;
    return "rgba(" + parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," + parseInt(m[3], 16) + "," + a + ")";
  }

  // ---------- Leinwand scharf auf hochauflösenden Bildschirmen ----------
  function vorbereiten(canvas) {
    var dpr = global.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  // ---------- Ansicht ----------
  function Ansicht() { this.cx = 0; this.cy = 0; this.s = 100; this.w = 1; this.h = 1; }
  Ansicht.prototype.groesse = function (w, h) { this.w = w; this.h = h; };
  Ansicht.prototype.bild = function (x, y) { return [this.w / 2 + (x - this.cx) * this.s, this.h / 2 - (y - this.cy) * this.s]; };
  Ansicht.prototype.welt = function (px, py) { return [this.cx + (px - this.w / 2) / this.s, this.cy - (py - this.h / 2) / this.s]; };
  Ansicht.prototype.einpassen = function (punkte, rand) {
    if (!punkte.length) return;
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    punkte.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    var bw = Math.max(x1 - x0, 1e-9), bh = Math.max(y1 - y0, 1e-9), r = rand || 0.15;
    this.cx = (x0 + x1) / 2; this.cy = (y0 + y1) / 2;
    this.s = Math.min(this.w / (bw * (1 + 2 * r)), this.h / (bh * (1 + 2 * r)));
    if (!isFinite(this.s) || this.s <= 0) this.s = 100;
  };
  Ansicht.prototype.zoom = function (faktor, px, py) {   // um den Bildpunkt (px, py) herum
    var vor = this.welt(px, py); this.s *= faktor; var nach = this.welt(px, py);
    this.cx += vor[0] - nach[0]; this.cy += vor[1] - nach[1];
  };
  Ansicht.prototype.verschiebe = function (dpx, dpy) { this.cx -= dpx / this.s; this.cy += dpy / this.s; };

  // ---------- Zahlen ----------
  function zahl(x, stellen) {
    if (!isFinite(x)) return "–";
    return x.toLocaleString("de-DE", { maximumFractionDigits: stellen === undefined ? 2 : stellen });
  }
  function hoch(x) {                       // 3.2e-11 -> "3,2·10⁻¹¹"
    if (x === 0) return "0";
    if (!isFinite(x)) return "–";
    var e = Math.floor(Math.log10(Math.abs(x))), m = x / Math.pow(10, e);
    var sup = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
    return m.toFixed(1).replace(".", ",") + "·10" + String(e).split("").map(function (c) { return sup[c]; }).join("");
  }
  function hochNur(e) {
    var sup = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
    return "10" + String(e).split("").map(function (c) { return sup[c]; }).join("");
  }
  function schoeneLaenge(x) {              // 1, 2, 5 · 10^n, nicht größer als x
    var e = Math.pow(10, Math.floor(Math.log10(x))), m = x / e;
    return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e;
  }

  // ---------- Himmel ----------
  // opt: { zustand, spuren: [[ [x,y], ... ], ...], zeigeSpuren, einheit, schwerpunkt: [x,y], hervor: Index oder -1 }
  function himmel(canvas, ansicht, opt) {
    var v = vorbereiten(canvas), ctx = v.ctx, w = v.w, h = v.h, F = farben();
    ansicht.groesse(w, h);
    ctx.clearRect(0, 0, w, h);
    var ks = opt.zustand.koerper, mmax = Math.max.apply(null, ks.map(function (k) { return k.m; }));

    // Spuren: ältere Teile blasser, in Stücken gezeichnet
    if (opt.zeigeSpuren) {
      opt.spuren.forEach(function (sp, i) {
        if (sp.length < 2) return;
        var farbe = F.koerper[i % F.koerper.length], stuecke = 10, n = sp.length;
        ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.lineCap = "round";
        for (var s = 0; s < stuecke; s++) {
          var a = Math.floor(n * s / stuecke), b = Math.min(n - 1, Math.floor(n * (s + 1) / stuecke) + 1);
          if (b - a < 1) continue;
          ctx.strokeStyle = alpha(farbe, 0.12 + 0.75 * (s + 1) / stuecke);
          ctx.beginPath();
          var p = ansicht.bild(sp[a][0], sp[a][1]); ctx.moveTo(p[0], p[1]);
          var letzt = p;
          for (var j = a + 1; j <= b; j++) {
            var q = ansicht.bild(sp[j][0], sp[j][1]);
            if (Math.abs(q[0] - letzt[0]) + Math.abs(q[1] - letzt[1]) < 0.7 && j < b) continue;   // ausdünnen
            ctx.lineTo(q[0], q[1]); letzt = q;
          }
          ctx.stroke();
        }
      });
    }

    // Schwerpunkt als Kreuz
    if (opt.schwerpunkt) {
      var c = ansicht.bild(opt.schwerpunkt[0], opt.schwerpunkt[1]);
      ctx.strokeStyle = F.muted; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(c[0] - 6, c[1]); ctx.lineTo(c[0] + 6, c[1]); ctx.moveTo(c[0], c[1] - 6); ctx.lineTo(c[0], c[1] + 6); ctx.stroke();
    }

    // Körper; außerhalb des Bildes ein Pfeil am Rand
    var positionen = [], belegt = [];
    ks.forEach(function (k, i) {
      var p = ansicht.bild(k.r[0], k.r[1]), farbe = F.koerper[i % F.koerper.length];
      var rz = Math.max(4 + 3 * Math.sqrt(k.m / mmax), (k.radius || 0) * ansicht.s);
      positionen.push({ x: p[0], y: p[1], r: rz, i: i });
      var drin = p[0] > -rz && p[0] < w + rz && p[1] > -rz && p[1] < h + rz;
      if (drin) {
        ctx.fillStyle = farbe; ctx.strokeStyle = F.flaeche; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p[0], p[1], rz, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        if (opt.hervor === i) { ctx.strokeStyle = F.fg; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p[0], p[1], rz + 4, 0, 2 * Math.PI); ctx.stroke(); }
        ctx.fillStyle = F.fg; ctx.font = "13px Georgia, serif"; ctx.textBaseline = "middle";
        ctx.fillText(k.name || String(i + 1), p[0] + rz + 5, p[1] - rz - 2);
      } else {
        var mx = w / 2, my = h / 2, dx = p[0] - mx, dy = p[1] - my;
        var t = Math.min((w / 2 - 18) / Math.abs(dx || 1e-9), (h / 2 - 18) / Math.abs(dy || 1e-9));
        var ex = mx + dx * t, ey = my + dy * t, wkl = Math.atan2(dy, dx);
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(wkl);
        ctx.fillStyle = farbe; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
        ctx.restore();
        var weit = Math.hypot(k.r[0] - ansicht.cx, k.r[1] - ansicht.cy);
        ctx.fillStyle = F.fg; ctx.font = "12px Georgia, serif"; ctx.textBaseline = "middle";
        var txt = (k.name || String(i + 1)) + ", " + zahl(weit, weit < 10 ? 2 : 0) + (opt.einheit ? " " + opt.einheit : "") + " weg";
        var tw = ctx.measureText(txt).width, ly = ey + (ey > h / 2 ? -16 : 16), lx = Math.min(Math.max(ex - tw / 2, 6), w - tw - 6);
        // Beschriftungen von Pfeilen, die nah beieinander liegen, untereinander statt übereinander
        belegt.forEach(function (b) { if (Math.abs(b[0] - lx) < tw && Math.abs(b[1] - ly) < 14) ly += (ey > h / 2 ? -15 : 15); });
        belegt.push([lx, ly]);
        ctx.fillText(txt, lx, ly);
        positionen[positionen.length - 1].draussen = true;
      }
    });

    // Maßstab
    var laenge = schoeneLaenge(120 / ansicht.s);
    return { positionen: positionen, massstab: zahl(laenge, 6) + (opt.einheit ? " " + opt.einheit : "") + " ≙ " + Math.round(laenge * ansicht.s) + " px" };
  }

  // ---------- Wächterbild ----------
  // verlauf: [{t, e, l}], e und l relative Fehler; zeiger: Bild-x der Maus oder null
  function waechter(canvas, verlauf, zeiger) {
    var v = vorbereiten(canvas), ctx = v.ctx, w = v.w, h = v.h, F = farben();
    ctx.clearRect(0, 0, w, h);
    var links = 44, rechts = 8, oben = 8, unten = 20, bw = w - links - rechts, bh = h - oben - unten;
    var lg = function (x) { return Math.log10(Math.max(x, 1e-17)); };
    var emin = -16, emax = -4;
    verlauf.forEach(function (p) { emax = Math.max(emax, Math.ceil(lg(p.e)), Math.ceil(lg(p.l))); });
    emax = Math.min(emax, 2);
    var tmax = verlauf.length ? Math.max(verlauf[verlauf.length - 1].t, 1e-9) : 1;
    var X = function (t) { return links + bw * t / tmax; }, Y = function (e) { return oben + bh * (emax - e) / (emax - emin); };
    // Gitter und Achsen
    ctx.font = "11px Georgia, serif"; ctx.textBaseline = "middle"; ctx.fillStyle = F.muted;
    for (var e = emin; e <= emax; e += 4) {
      var y = Y(e); ctx.strokeStyle = F.rule; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(links, y); ctx.lineTo(w - rechts, y); ctx.stroke();
      ctx.fillText(hochNur(e), 6, y);
    }
    var y6 = Y(-6); ctx.setLineDash([4, 4]); ctx.strokeStyle = F.muted;
    ctx.beginPath(); ctx.moveTo(links, y6); ctx.lineTo(w - rechts, y6); ctx.stroke(); ctx.setLineDash([]);
    var gt = "Grenze " + hochNur(-6); ctx.fillText(gt, w - rechts - ctx.measureText(gt).width, y6 - 7);
    ctx.textBaseline = "alphabetic";
    ctx.fillText("t = 0", links, h - 5);
    var tt = "t = " + zahl(tmax, 1); ctx.fillText(tt, w - rechts - ctx.measureText(tt).width, h - 5);
    if (verlauf.length < 2) return;
    [["e", F.koerper[0]], ["l", F.koerper[1]]].forEach(function (s) {
      ctx.strokeStyle = s[1]; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.beginPath();
      verlauf.forEach(function (p, j) { var x = X(p.t), y = Y(Math.max(lg(p[s[0]]), emin)); if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    });
    // Zeiger: senkrechte Linie und Werte
    if (zeiger !== null && zeiger !== undefined && zeiger >= links && zeiger <= w - rechts) {
      var tz = (zeiger - links) / bw * tmax, best = verlauf[0];
      verlauf.forEach(function (p) { if (Math.abs(p.t - tz) < Math.abs(best.t - tz)) best = p; });
      var xz = X(best.t);
      ctx.strokeStyle = F.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xz, oben); ctx.lineTo(xz, oben + bh); ctx.stroke();
      [["e", F.koerper[0]], ["l", F.koerper[1]]].forEach(function (s) {
        ctx.fillStyle = s[1]; ctx.strokeStyle = F.flaeche; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(xz, Y(Math.max(lg(best[s[0]]), emin)), 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      });
      var txt = "t = " + zahl(best.t, 2) + "   Energie " + hoch(best.e) + "   Drehimpuls " + hoch(best.l);
      ctx.font = "12px Georgia, serif"; var tw = ctx.measureText(txt).width;
      var bx = Math.min(Math.max(xz - tw / 2 - 6, links), w - rechts - tw - 12);
      ctx.fillStyle = F.flaeche; ctx.globalAlpha = 0.92; ctx.fillRect(bx, oben, tw + 12, 20); ctx.globalAlpha = 1;
      ctx.fillStyle = F.fg; ctx.textBaseline = "middle"; ctx.fillText(txt, bx + 6, oben + 10);
    }
  }

  // ---------- Ausgangskarte ----------
  // reihe: [[v, ausgang, t], ...]; aktuell: Index oder -1.
  // Einfang, Hinauswurf, Vorbeiflug tragen die drei geprüften Farben (alle Paare unterscheidbar, hell und dunkel);
  // Zusammenstoß und Zerfall bekommen statt einer vierten Farbe eine Schraffur. Dazu der Anfangsbuchstabe, wo Platz ist.
  var AUSGANG = {
    "Einfang": { farbe: 0, kurz: "E" }, "Hinauswurf": { farbe: 1, kurz: "H" }, "Vorbeiflug": { farbe: 2, kurz: "V" },
    "Zusammenstoß": { schraffur: [45], kurz: "X" }, "Zerfall": { schraffur: [45, 135], kurz: "Z" }
  };
  function feld(ctx, x, y, w, h, ausgang, F) {
    var a = AUSGANG[ausgang] || { schraffur: [45], kurz: "?" };
    if (a.farbe !== undefined) { ctx.fillStyle = F.koerper[a.farbe]; ctx.fillRect(x, y, w, h); }
    else {
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.strokeStyle = F.muted; ctx.lineWidth = 1.3;
      a.schraffur.forEach(function (wkl) {
        ctx.beginPath();
        for (var d = -h; d < w + h; d += 5) {
          if (wkl === 45) { ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y); } else { ctx.moveTo(x + d, y); ctx.lineTo(x + d + h, y + h); }
        }
        ctx.stroke();
      });
      ctx.restore();
      ctx.strokeStyle = F.muted; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    return a;
  }
  function karte(canvas, reihe, aktuell) {
    var v = vorbereiten(canvas), ctx = v.ctx, w = v.w, h = v.h, F = farben();
    ctx.clearRect(0, 0, w, h);
    var n = reihe.length, zb = w / n;
    reihe.forEach(function (r, i) {
      var a = feld(ctx, i * zb + 1, 3, zb - 2, h - 6, r[1], F);       // 2px Fuge zwischen den Feldern
      if (zb >= 14) {
        ctx.font = "bold 11px Georgia, serif"; ctx.textBaseline = "middle"; ctx.textAlign = "center";
        ctx.fillStyle = a.farbe !== undefined ? F.flaeche : F.fg;
        ctx.fillText(a.kurz, i * zb + zb / 2, h / 2 + 0.5); ctx.textAlign = "start";
      }
    });
    if (aktuell >= 0) {
      ctx.strokeStyle = F.fg; ctx.lineWidth = 2; ctx.strokeRect(aktuell * zb + 0.5, 1, zb - 1, h - 2);
    }
  }
  // Kleines Musterfeld für die Legende (als Daten-URL, damit die Legende dieselbe Schraffur zeigt)
  function legendenFeld(ausgang) {
    var c = document.createElement("canvas"); c.width = 28; c.height = 28; c.style.width = "14px"; c.style.height = "14px";
    var ctx = c.getContext("2d"); ctx.scale(2, 2); feld(ctx, 0, 0, 14, 14, ausgang, farben()); return c;
  }


  // =====================================================================================================
  // Himmel in 3D (08.10.2026, Wunsch der Postbotin: „3 Sterne im Universum, schwarz mit Sternen in der Schwärze“).
  // Dieselben Zustände wie im Schema, nur anders gezeigt: Perspektive, drehbare Kamera, Sternenhintergrund.
  // Die Rechnung ist immer dreidimensional; die Anfänge liegen bisher alle in der Ebene z = 0.
  // =====================================================================================================
  function Kamera() { this.az = -0.9; this.el = 0.5; this.ziel = [0, 0, 0]; this.k = 100; this.D = 10; this.w = 1; this.h = 1; }
  Kamera.prototype.basis = function () {
    var ce = Math.cos(this.el), c = [ce * Math.cos(this.az), ce * Math.sin(this.az), Math.sin(this.el)];   // vom Ziel zur Kamera
    var r = [-Math.sin(this.az), Math.cos(this.az), 0];                                                     // rechts
    var u = [c[1] * r[2] - c[2] * r[1], c[2] * r[0] - c[0] * r[2], c[0] * r[1] - c[1] * r[0]];             // oben = c × r
    return { c: c, r: r, u: u };
  };
  // Weltpunkt -> Bildpunkt; null, wenn hinter der Kamera
  Kamera.prototype.bild = function (p, B) {
    var q = [p[0] - this.ziel[0], p[1] - this.ziel[1], (p[2] || 0) - this.ziel[2]];
    var x = q[0] * B.r[0] + q[1] * B.r[1] + q[2] * B.r[2];
    var y = q[0] * B.u[0] + q[1] * B.u[1] + q[2] * B.u[2];
    var t = q[0] * B.c[0] + q[1] * B.c[1] + q[2] * B.c[2];
    if (t > this.D * 0.97) return null;
    var f = this.D / (this.D - t);
    return [this.w / 2 + this.k * f * x, this.h / 2 - this.k * f * y, f];
  };
  Kamera.prototype.einpassen = function (punkte, w, h) {
    this.w = w; this.h = h;
    var R = 1e-9;
    punkte.forEach(function (p) { R = Math.max(R, Math.hypot(p[0], p[1], p[2] || 0)); });
    this.ziel = [0, 0, 0]; this.D = R * 5; this.k = Math.min(w, h) * 0.40 / R;
  };

  // Hintergrundsterne: feste Richtungen, dichter in einem schrägen Band (eine Milchstraße), Helligkeiten sehr verschieden
  var HINTERGRUND = (function () {
    var sterne = [], seed = 20261008;
    function zufall() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
    function gauss() { return Math.sqrt(-2 * Math.log(zufall() + 1e-12)) * Math.cos(2 * Math.PI * zufall()); }
    var nb = [0.25, -0.55, 0.80], nl = Math.hypot(nb[0], nb[1], nb[2]); nb = nb.map(function (v) { return v / nl; });  // Pol des Bandes
    for (var i = 0; i < 2600; i++) {
      var d;
      if (i < 1500) {                          // gleichmäßig über die Kugel
        var z = 2 * zufall() - 1, ph = 2 * Math.PI * zufall(), rr = Math.sqrt(1 - z * z);
        d = [rr * Math.cos(ph), rr * Math.sin(ph), z];
      } else {                                 // im Band: nahe dem Großkreis senkrecht zu nb
        var a = [1, 0, 0], e1 = [a[1] * nb[2] - a[2] * nb[1], a[2] * nb[0] - a[0] * nb[2], a[0] * nb[1] - a[1] * nb[0]];
        var l1 = Math.hypot(e1[0], e1[1], e1[2]); e1 = e1.map(function (v) { return v / l1; });
        var e2 = [nb[1] * e1[2] - nb[2] * e1[1], nb[2] * e1[0] - nb[0] * e1[2], nb[0] * e1[1] - nb[1] * e1[0]];
        var w = 2 * Math.PI * zufall(), b = gauss() * 0.12;
        d = [0, 1, 2].map(function (k) { return Math.cos(b) * (Math.cos(w) * e1[k] + Math.sin(w) * e2[k]) + Math.sin(b) * nb[k]; });
      }
      var hell = Math.pow(zufall(), 3.2);       // wenige helle, viele schwache
      var farbe = zufall();
      sterne.push({ d: d, hell: hell, farbe: farbe < 0.12 ? [255, 214, 170] : farbe < 0.22 ? [190, 210, 255] : [235, 236, 245] });
    }
    return sterne;
  })();

  // Farben der Körper vor dem schwarzen Himmel (Sternfarben); Alpha Centauri nach Spektraltyp
  var HIMMELSFARBEN = ["#9cc4ff", "#ffd27a", "#ff8a5c"];
  var ALPHA_FARBEN = { "A": "#fff0c8", "B": "#ffc27a", "Proxima": "#ff6f4f" };

  function himmel3d(canvas, kam, opt) {
    var v = vorbereiten(canvas), ctx = v.ctx, w = v.w, h = v.h;
    kam.w = w; kam.h = h;
    var B = kam.basis(), F = Math.min(w, h) * 0.9;
    ctx.fillStyle = "#04050a"; ctx.fillRect(0, 0, w, h);
    // Hintergrund: nur gedreht, nicht verschoben (unendlich weit)
    HINTERGRUND.forEach(function (s) {
      var d = s.d, vor = -(d[0] * B.c[0] + d[1] * B.c[1] + d[2] * B.c[2]);
      if (vor <= 0.05) return;
      var x = d[0] * B.r[0] + d[1] * B.r[1] + d[2] * B.r[2], y = d[0] * B.u[0] + d[1] * B.u[1] + d[2] * B.u[2];
      var px = w / 2 + F * x / vor, py = h / 2 - F * y / vor;
      if (px < -2 || px > w + 2 || py < -2 || py > h + 2) return;
      var a = 0.18 + 0.82 * s.hell, r = 0.45 + 1.25 * s.hell;
      ctx.fillStyle = "rgba(" + s.farbe[0] + "," + s.farbe[1] + "," + s.farbe[2] + "," + a.toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(px, py, r, 0, 2 * Math.PI); ctx.fill();
    });
    var ks = opt.zustand.koerper, mmax = Math.max.apply(null, ks.map(function (k) { return k.m; }));
    var farbeVon = function (i) { var n = ks[i].name; return (opt.alpha && ALPHA_FARBEN[n]) || HIMMELSFARBEN[i % 3]; };

    // Bezugsebene z = 0: wenige blasse Kreise um den Schwerpunkt, damit man die Neigung sieht
    var sp = opt.schwerpunkt || [0, 0, 0], Rr = opt.ebenenRadius || 1;
    ctx.strokeStyle = "rgba(150,170,210,0.10)"; ctx.lineWidth = 1;
    [0.5, 1, 1.5].forEach(function (f) {
      ctx.beginPath(); var erst = true;
      for (var a = 0; a <= 64; a++) {
        var wkl = 2 * Math.PI * a / 64, p = kam.bild([sp[0] + f * Rr * Math.cos(wkl), sp[1] + f * Rr * Math.sin(wkl), 0], B);
        if (!p) { erst = true; continue; }
        if (erst) { ctx.moveTo(p[0], p[1]); erst = false; } else ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();
    });

    // Spuren
    if (opt.zeigeSpuren) {
      opt.spuren.forEach(function (sp3, i) {
        if (sp3.length < 2) return;
        var farbe = farbeVon(i), stuecke = 10, n = sp3.length;
        ctx.lineWidth = 1.3; ctx.lineJoin = "round"; ctx.lineCap = "round";
        for (var s = 0; s < stuecke; s++) {
          var a = Math.floor(n * s / stuecke), b = Math.min(n - 1, Math.floor(n * (s + 1) / stuecke) + 1);
          if (b - a < 1) continue;
          ctx.strokeStyle = alpha(farbe, 0.06 + 0.5 * (s + 1) / stuecke);
          ctx.beginPath(); var erst = true, letzt = null;
          for (var j = a; j <= b; j++) {
            var q = kam.bild(sp3[j], B);
            if (!q) { erst = true; continue; }
            if (!erst && letzt && Math.abs(q[0] - letzt[0]) + Math.abs(q[1] - letzt[1]) < 0.7 && j < b) continue;
            if (erst) { ctx.moveTo(q[0], q[1]); erst = false; } else ctx.lineTo(q[0], q[1]);
            letzt = q;
          }
          ctx.stroke();
        }
      });
    }

    // Körper: von hinten nach vorn, mit Lichthof
    var positionen = [], belegt = [];
    var reihe = ks.map(function (k, i) { return { k: k, i: i, p: kam.bild(k.r, B) }; });
    reihe.sort(function (a, b) { return (a.p ? a.p[2] : 0) - (b.p ? b.p[2] : 0); });
    ctx.globalCompositeOperation = "lighter";
    reihe.forEach(function (e) {
      var p = e.p, farbe = farbeVon(e.i);
      if (!p) return;
      var kern = (2.4 + 2.6 * Math.cbrt(e.k.m / mmax)) * Math.min(Math.max(p[2], 0.5), 2.5);
      var drin = p[0] > -kern && p[0] < w + kern && p[1] > -kern && p[1] < h + kern;
      positionen.push({ x: p[0], y: p[1], r: kern + 4, i: e.i, draussen: !drin });
      if (!drin) return;
      var g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], kern * 6);
      g.addColorStop(0, alpha(farbe, 0.55)); g.addColorStop(0.25, alpha(farbe, 0.18)); g.addColorStop(1, alpha(farbe, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], kern * 6, 0, 2 * Math.PI); ctx.fill();
      var g2 = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], kern);
      g2.addColorStop(0, "rgba(255,255,255,1)"); g2.addColorStop(0.55, alpha(farbe, 0.95)); g2.addColorStop(1, alpha(farbe, 0));
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(p[0], p[1], kern, 0, 2 * Math.PI); ctx.fill();
    });
    ctx.globalCompositeOperation = "source-over";
    // Namen und Pfeile für Körper außerhalb des Bildes
    ctx.font = "13px Georgia, serif"; ctx.textBaseline = "middle";
    positionen.forEach(function (q) {
      var k = ks[q.i], farbe = farbeVon(q.i);
      if (!q.draussen) {
        if (opt.hervor === q.i) { ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(q.x, q.y, q.r + 6, 0, 2 * Math.PI); ctx.stroke(); }
        ctx.fillStyle = "rgba(235,236,245,0.85)"; ctx.fillText(k.name || String(q.i + 1), q.x + q.r + 4, q.y - q.r);
        return;
      }
      var mx = w / 2, my = h / 2, dx = q.x - mx, dy = q.y - my;
      var t = Math.min((w / 2 - 18) / Math.abs(dx || 1e-9), (h / 2 - 18) / Math.abs(dy || 1e-9));
      var ex = mx + dx * t, ey = my + dy * t;
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = farbe; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.restore();
      var weit = Math.hypot(k.r[0] - sp[0], k.r[1] - sp[1], (k.r[2] || 0) - (sp[2] || 0));
      var txt = (k.name || String(q.i + 1)) + ", " + zahl(weit, weit < 10 ? 2 : 0) + (opt.einheit ? " " + opt.einheit : "") + " vom Schwerpunkt";
      ctx.font = "12px Georgia, serif"; var tw = ctx.measureText(txt).width;
      var lx = Math.min(Math.max(ex - tw / 2, 6), w - tw - 6), ly = ey + (ey > h / 2 ? -16 : 16);
      belegt.forEach(function (b) { if (Math.abs(b[0] - lx) < tw && Math.abs(b[1] - ly) < 14) ly += (ey > h / 2 ? -15 : 15); });
      belegt.push([lx, ly]);
      ctx.fillStyle = "rgba(235,236,245,0.85)"; ctx.fillText(txt, lx, ly);
    });
    return { positionen: positionen };
  }

  global.Zeichnen = { Ansicht: Ansicht, Kamera: Kamera, himmel: himmel, himmel3d: himmel3d, waechter: waechter, karte: karte, legendenFeld: legendenFeld,
                      zahl: zahl, hoch: hoch, farbenNeu: farbenNeu };
})(window);
