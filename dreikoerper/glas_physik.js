/* glas_physik.js — der Rechenkern für „Glas ohne Formel“. Philip, 21.10.2026. Ohne DOM; läuft im Browser und in Node.
 * Dasselbe Modell wie glas_mc.py (Das ideale Glas): N weiche Scheiben in einer periodischen Box, Durchmesser ~ s^-3 zwischen
 * 0,73 und 1,62 (Mittel 1), Packungsdichte φ, Nichtadditivität 0,2, harmonische Überlappenergie ½ε(1 − r/σij)² für r < σij.
 * Monte Carlo: je Sweep N Verschiebungsversuche und N/2 Tauschversuche (Metropolis). Tal: FIRE-Abstieg auf der Energie.
 * Zufall: Mulberry32 mit festem Startwert, in Python (erzeuge_glas_pruefwerte.py) Zug für Zug gleich nachgebaut; darum
 * treffen sich die Zahlen hier und dort nicht nur ungefähr, sondern genau (glas_pruefung.html).
 */
(function (global) {
  "use strict";

  // ---- Zufall: Mulberry32 (32-Bit-Schritte, in Python mit & 0xFFFFFFFF identisch) ----
  function Mulberry32(saat) {
    this.a = saat >>> 0;
  }
  Mulberry32.prototype.naechste = function () {       // gleichverteilt in [0, 1)
    this.a = (this.a + 0x6D2B79F5) >>> 0;
    var t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0)) >>> 0;
    t = (t ^ (t >>> 14)) >>> 0;
    return t / 4294967296;
  };
  Mulberry32.prototype.ganz = function (n) {           // ganze Zahl in [0, n)
    return Math.floor(this.naechste() * n);
  };

  // ---- Durchmesser und Box ----
  function durchmesser(N, rng) {                        // p(s) ~ s^-3 zwischen smin und smax, dann auf Mittel 1 skaliert
    var smin = 0.73, smax = 1.62, a = 1 / (smin * smin), b = 1 / (smax * smax), sig = new Array(N), summe = 0;
    for (var i = 0; i < N; i++) {
      var u = rng.naechste();
      sig[i] = 1 / Math.sqrt(a - u * (a - b));
      summe += sig[i];
    }
    var m = summe / N;
    for (var k = 0; k < N; k++) sig[k] = sig[k] / m;
    return sig;
  }
  function boxlaenge(sig, phi) {
    var flaeche = 0;
    for (var i = 0; i < sig.length; i++) flaeche += Math.PI * (sig[i] / 2) * (sig[i] / 2);
    return Math.sqrt(flaeche / phi);
  }
  function sigmaij(si, sj, nonadd) {
    return 0.5 * (si + sj) * (1 - nonadd * Math.abs(si - sj));
  }

  // ---- Das Glas ----
  function Glas(opt) {
    opt = opt || {};
    this.N = opt.N || 64; this.phi = opt.phi || 1.12; this.eps = 1.0; this.nonadd = (opt.nonadd === undefined) ? 0.2 : opt.nonadd;
    this.rng = new Mulberry32(opt.saat === undefined ? 20261021 : opt.saat);
    this.sig = opt.sig ? opt.sig.slice() : durchmesser(this.N, this.rng);
    this.L = boxlaenge(this.sig, this.phi);
    this.x = new Float64Array(this.N); this.y = new Float64Array(this.N);
    if (opt.pos) { for (var i = 0; i < this.N; i++) { this.x[i] = opt.pos[i][0]; this.y[i] = opt.pos[i][1]; } }
    else { for (var j = 0; j < this.N; j++) { this.x[j] = this.rng.naechste() * this.L; this.y[j] = this.rng.naechste() * this.L; } }
    this.schritt = opt.schritt || 0.3;
    this.T = opt.T || 0.004;
    this.annahme = 0;
  }
  Glas.prototype.bild = function (d) {                  // kürzester Abstand in der periodischen Box
    return d - this.L * Math.floor(d / this.L + 0.5);   // floor(x + 0.5) statt round: in Python identisch nachbaubar
  };
  Glas.prototype.paarEnergie = function (i, j) {
    var dx = this.bild(this.x[i] - this.x[j]), dy = this.bild(this.y[i] - this.y[j]);
    var r = Math.sqrt(dx * dx + dy * dy), s = sigmaij(this.sig[i], this.sig[j], this.nonadd);
    if (r >= s) return 0;
    var ov = 1 - r / s;
    return 0.5 * this.eps * ov * ov;
  };
  Glas.prototype.teilchenEnergie = function (i) {
    var e = 0;
    for (var j = 0; j < this.N; j++) if (j !== i) e += this.paarEnergie(i, j);
    return e;
  };
  Glas.prototype.energie = function () {               // Gesamtenergie (jedes Paar einmal)
    var e = 0;
    for (var i = 0; i < this.N; i++) for (var j = i + 1; j < this.N; j++) e += this.paarEnergie(i, j);
    return e;
  };
  Glas.prototype.kraefte = function () {               // Kraft auf jedes Teilchen, F = -dE/dr
    var fx = new Float64Array(this.N), fy = new Float64Array(this.N);
    for (var i = 0; i < this.N; i++) for (var j = i + 1; j < this.N; j++) {
      var dx = this.bild(this.x[i] - this.x[j]), dy = this.bild(this.y[i] - this.y[j]);
      var r = Math.sqrt(dx * dx + dy * dy), s = sigmaij(this.sig[i], this.sig[j], this.nonadd);
      if (r >= s || r === 0) continue;
      var k = this.eps * (1 - r / s) / (s * r);        // Betrag/r der abstoßenden Kraft
      fx[i] += k * dx; fy[i] += k * dy; fx[j] -= k * dx; fy[j] -= k * dy;
    }
    return { fx: fx, fy: fy };
  };
  Glas.prototype.sweep = function () {                 // N Verschiebungen, dann N/2 Tauschversuche; gibt Annahmerate der Verschiebungen
    var ang = 0, N = this.N;
    for (var k = 0; k < N; k++) {
      var i = this.rng.ganz(N);
      var e0 = this.teilchenEnergie(i), x0 = this.x[i], y0 = this.y[i];
      this.x[i] = x0 + (2 * this.rng.naechste() - 1) * this.schritt;
      this.y[i] = y0 + (2 * this.rng.naechste() - 1) * this.schritt;
      var e1 = this.teilchenEnergie(i);
      if (e1 <= e0 || this.rng.naechste() < Math.exp(-(e1 - e0) / this.T)) {
        ang++;
        this.x[i] = ((this.x[i] % this.L) + this.L) % this.L; this.y[i] = ((this.y[i] % this.L) + this.L) % this.L;
      } else { this.x[i] = x0; this.y[i] = y0; }
    }
    for (var m = 0; m < N / 2; m++) {
      var a = this.rng.ganz(N), b = this.rng.ganz(N);
      if (a === b) continue;
      var ea = this.teilchenEnergie(a) + this.teilchenEnergie(b) - this.paarEnergie(a, b);
      var sa = this.sig[a]; this.sig[a] = this.sig[b]; this.sig[b] = sa;
      var eb = this.teilchenEnergie(a) + this.teilchenEnergie(b) - this.paarEnergie(a, b);
      if (!(eb <= ea || this.rng.naechste() < Math.exp(-(eb - ea) / this.T))) { this.sig[b] = this.sig[a]; this.sig[a] = sa; }
    }
    this.annahme = ang / N;
    return this.annahme;
  };
  Glas.prototype.schrittAnpassen = function () {       // Schrittweite auf 30 bis 50 % Annahme
    var f = this.annahme > 0.5 ? 1.2 : (this.annahme < 0.3 ? 0.85 : 1.0);
    this.schritt = Math.min(1.0, Math.max(0.02, this.schritt * f));
    return this.schritt;
  };
  Glas.prototype.tal = function (maxSchritte) {        // FIRE: in das nächste Energieminimum (T = 0); gibt {energie, schritte, kraft}
    maxSchritte = maxSchritte || 5000;
    var N = this.N, vx = new Float64Array(N), vy = new Float64Array(N), dt = 0.05, dtmax = 0.5, alpha = 0.1, seit = 0;
    var f = this.kraefte(), e = this.energie();
    for (var s = 0; s < maxSchritte; s++) {
      var P = 0, vn = 0, fn = 0;
      for (var i = 0; i < N; i++) { P += f.fx[i] * vx[i] + f.fy[i] * vy[i]; vn += vx[i] * vx[i] + vy[i] * vy[i]; fn += f.fx[i] * f.fx[i] + f.fy[i] * f.fy[i]; }
      vn = Math.sqrt(vn); fn = Math.sqrt(fn);
      if (fn < 1e-10) break;
      if (P > 0) {
        var g = fn > 0 ? vn / fn : 0;
        for (var j = 0; j < N; j++) { vx[j] = (1 - alpha) * vx[j] + alpha * f.fx[j] * g; vy[j] = (1 - alpha) * vy[j] + alpha * f.fy[j] * g; }
        if (++seit > 5) { dt = Math.min(dt * 1.1, dtmax); alpha *= 0.99; }
      } else { for (var k = 0; k < N; k++) { vx[k] = 0; vy[k] = 0; } dt *= 0.5; alpha = 0.1; seit = 0; }
      for (var m = 0; m < N; m++) {
        vx[m] += dt * f.fx[m]; vy[m] += dt * f.fy[m];
        var dx = dt * vx[m], dy = dt * vy[m], dr = Math.sqrt(dx * dx + dy * dy);
        if (dr > 0.1) { dx *= 0.1 / dr; dy *= 0.1 / dr; }  // kein Schritt länger als 0,1
        this.x[m] = ((this.x[m] + dx) % this.L + this.L) % this.L; this.y[m] = ((this.y[m] + dy) % this.L + this.L) % this.L;
      }
      f = this.kraefte();
    }
    e = this.energie();
    return { energie: e, schritte: s, kraft: fn };
  };
  Glas.prototype.positionen = function () {
    var p = []; for (var i = 0; i < this.N; i++) p.push([this.x[i], this.y[i]]); return p;
  };

  var Physik = { Mulberry32: Mulberry32, durchmesser: durchmesser, boxlaenge: boxlaenge, sigmaij: sigmaij, Glas: Glas, fassung: "20261021a" };
  if (typeof module !== "undefined" && module.exports) module.exports = Physik; else global.GlasPhysik = Physik;
})(typeof window !== "undefined" ? window : this);
