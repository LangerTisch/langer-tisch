/* glas_steuerung.js — Zeichnen und Steuerung für „Glas ohne Formel“, einfache Fassung. Philip, 21.10.2026.
 * Braucht glas_physik.js (GlasPhysik) und in glas.html: #leinwand (canvas), #temp (range), #tempwert, #lauf, #tal, #neu, #zahlen. (Scheren kommt später, mit Lees-Edwards-Rand wie in tag18b_scherzyklus.py; ohne ihn wäre es nur ein Bild.) Rechnet im Browser mit demselben Kern, der in glas_pruefung.html geprüft wird.
 */
(function () {
  "use strict";
  var P = window.GlasPhysik, glas, laeuft = false, sweeps = 0, eTal = null, saat = 20261021;
  var lw = document.getElementById("leinwand"), ctx = lw.getContext("2d");
  var temp = document.getElementById("temp"), tempwert = document.getElementById("tempwert"), zahlen = document.getElementById("zahlen");
  var kLauf = document.getElementById("lauf"), kTal = document.getElementById("tal"), kNeu = document.getElementById("neu");

  function tAusRegler() { return Math.exp(parseFloat(temp.value)); }           // Regler ist ln T, 0,0005 bis 0,05
  function farbe(s) {                                                           // kleine Scheiben kühl, große warm
    var u = Math.max(0, Math.min(1, (s - 0.73) / (1.62 - 0.73)));
    return "hsl(" + Math.round(215 - 200 * u) + ", 60%, 52%)";                   // blau (klein) über grün und gelb nach rot (groß)
  }
  function zeichne() {
    var W = lw.width, m = W / glas.L;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--flaeche") || "#fcfbf7";
    ctx.fillRect(0, 0, W, W);
    for (var i = 0; i < glas.N; i++) {
      var x = glas.x[i] * m, y = glas.y[i] * m, rad = glas.sig[i] / 2 * m;
      ctx.fillStyle = farbe(glas.sig[i]); ctx.globalAlpha = 0.85;
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {       // Bilder über den Rand hinaus
        var X = x + dx * W, Y = y + dy * W;
        if (X + rad < 0 || X - rad > W || Y + rad < 0 || Y - rad > W) continue;
        ctx.beginPath(); ctx.arc(X, Y, rad, 0, 2 * Math.PI); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    var e = glas.energie() / glas.N;
    zahlen.textContent = "T = " + glas.T.toFixed(4) + " · Sweeps " + sweeps + " · Energie je Scheibe " + e.toFixed(5) +
      (eTal !== null ? " · letztes Tal " + eTal.toFixed(5) : "") + " · Schrittweite " + glas.schritt.toFixed(3) + " · Saat " + saat;
  }
  function neu(s) {
    saat = s; glas = new P.Glas({ saat: saat, T: tAusRegler(), schritt: 0.3 }); sweeps = 0; eTal = null;
    for (var k = 0; k < 20; k++) { glas.sweep(); if ((k + 1) % 10 === 0) glas.schrittAnpassen(); }  // kurz einlaufen, damit die Scheiben sich entwirren
    zeichne();
  }
  function schritt() {
    if (!laeuft) return;
    glas.T = tAusRegler();
    for (var k = 0; k < 3; k++) { glas.sweep(); sweeps++; if (sweeps % 10 === 0) glas.schrittAnpassen(); }
    zeichne(); requestAnimationFrame(schritt);
  }
  temp.addEventListener("input", function () { tempwert.textContent = tAusRegler().toFixed(4); if (glas) { glas.T = tAusRegler(); zeichne(); } });
  kLauf.addEventListener("click", function () { laeuft = !laeuft; kLauf.textContent = laeuft ? "Anhalten" : "Wärmen / Kühlen"; if (laeuft) requestAnimationFrame(schritt); });
  kTal.addEventListener("click", function () { laeuft = false; kLauf.textContent = "Wärmen / Kühlen"; var t = glas.tal(); eTal = t.energie / glas.N; zeichne(); });
  kNeu.addEventListener("click", function () { laeuft = false; kLauf.textContent = "Wärmen / Kühlen"; neu(saat + 1); });
  tempwert.textContent = tAusRegler().toFixed(4);
  neu(saat);
})();
