/* glas_pruefung_kern.js — die Prüfung von glas_physik.js gegen glas_pruefwerte.json. Philip, 21.10.2026, Fall 7 am 23.10.2026, nach Armins Muster (pruefung_kern.js).
 * Läuft im Browser (glas_pruefung.html) und in Node: node glas_pruefung_kern.js
 */
(function (global) {
  "use strict";

  function maxAbw(a, b) {
    var d = 0; for (var i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i])); return d;
  }

  function pruefe(Physik, werte) {
    return werte.faelle.map(function (fall) {
      var erg = { name: fall.name, warum: fall.warum };
      try {
        if (fall.art === "hinweis") {
          erg.hinweis = true; erg.zeile = fall.zeile;
        } else if (fall.art === "zufall") {
          var r = new Physik.Mulberry32(fall.saat), z = [];
          for (var i = 0; i < fall.zahlen.length; i++) z.push(r.naechste());
          erg.abweichung = maxAbw(z, fall.zahlen); erg.ok = erg.abweichung <= fall.toleranz;
          erg.zeile = "größte Abweichung " + erg.abweichung.toExponential(1) + " (erlaubt " + fall.toleranz + "); erste Zahl " + z[0].toFixed(12);
        } else if (fall.art === "durchmesser") {
          var g = new Physik.Glas({ N: fall.N, phi: fall.phi, saat: fall.saat });
          erg.abweichung = Math.max(maxAbw(g.sig, fall.sig), Math.abs(g.L - fall.L)); erg.ok = erg.abweichung <= fall.toleranz;
          erg.zeile = "größte Abweichung " + erg.abweichung.toExponential(1) + " (erlaubt " + fall.toleranz + "); L = " + g.L.toFixed(6);
        } else if (fall.art === "energie_kraft") {
          var g2 = new Physik.Glas({ saat: fall.saat, sig: fall.sig, pos: fall.pos });
          var e = g2.energie(), f = g2.kraefte();
          erg.abweichung = Math.max(Math.abs(e - fall.energie), maxAbw(Array.from(f.fx), fall.fx), maxAbw(Array.from(f.fy), fall.fy));
          erg.ok = erg.abweichung <= fall.toleranz;
          erg.zeile = "Energie " + e.toFixed(9) + " (soll " + fall.energie.toFixed(9) + "), größte Abweichung in Energie und Kraft " + erg.abweichung.toExponential(1) + " (erlaubt " + fall.toleranz + ")";
        } else if (fall.art === "kraft_differenzen") {
          var g7 = new Physik.Glas({ saat: fall.saat, sig: fall.sig, pos: fall.pos }), f7 = g7.kraefte(), h = fall.h, dmax = 0;
          for (var c = 0; c < g7.N; c++) {
            for (var ko = 0; ko < 2; ko++) {
              var arr = ko === 0 ? g7.x : g7.y, v0 = arr[c];
              arr[c] = v0 + h; var ep = g7.energie(); arr[c] = v0 - h; var em = g7.energie(); arr[c] = v0;
              var fd = -(ep - em) / (2 * h), fa = ko === 0 ? f7.fx[c] : f7.fy[c];
              dmax = Math.max(dmax, Math.abs(fd - fa));
            }
          }
          erg.abweichung = dmax; erg.ok = dmax <= fall.toleranz;
          erg.zeile = "größte Abweichung Kraft gegen Differenzenquotient " + dmax.toExponential(1) + " in " + (2 * g7.N) + " Komponenten (erlaubt " + fall.toleranz + "; Python " + fall.abweichung_python.toExponential(1) + ")";
        } else if (fall.art === "sweeps") {
          var g3 = new Physik.Glas({ saat: fall.saat, T: fall.T, schritt: fall.schritt }), es = [];
          for (var k = 0; k < fall.sweeps; k++) { g3.sweep(); if ((k + 1) % fall.anpassen_alle === 0) g3.schrittAnpassen(); es.push(g3.energie()); }
          erg.abweichung = Math.max(maxAbw(es, fall.energien), maxAbw(g3.sig, fall.sig_ende), Math.abs(g3.schritt - fall.schritt_ende));
          erg.ok = erg.abweichung <= fall.toleranz;
          erg.zeile = "Energie nach " + fall.sweeps + " Sweeps " + es[es.length - 1].toFixed(9) + " (soll " + fall.energien[fall.energien.length - 1].toFixed(9) + "), größte Abweichung " + erg.abweichung.toExponential(1) + " (erlaubt " + fall.toleranz + ")";
        } else if (fall.art === "tal") {
          var g4 = new Physik.Glas({ saat: fall.saat, T: 0.004, schritt: 0.3 });
          for (var m = 0; m < fall.nach_sweeps; m++) { g4.sweep(); if ((m + 1) % 10 === 0) g4.schrittAnpassen(); }
          var eVor = g4.energie(), t = g4.tal();
          erg.abweichung = Math.abs(t.energie - fall.energie_tal);
          erg.ok = t.energie <= eVor && erg.abweichung <= fall.toleranz;
          erg.zeile = "vor dem Tal " + eVor.toFixed(9) + ", im Tal " + t.energie.toFixed(9) + " (soll " + fall.energie_tal.toFixed(9) + "), " + t.schritte + " Schritte (Python " + fall.schritte + "), Abweichung " + erg.abweichung.toExponential(1);
        } else if (fall.art === "mittel") {
          var g5 = new Physik.Glas({ saat: fall.saat, T: fall.T, schritt: 0.3 }), s = 0, n = 0;
          for (var q = 0; q < fall.sweeps; q++) { g5.sweep(); if ((q + 1) % 10 === 0) g5.schrittAnpassen(); if (q >= fall.ab) { s += g5.energie() / g5.N; n++; } }
          var mittel = s / n;
          var g6 = new Physik.Glas({ saat: fall.saat + 1, T: fall.T, schritt: 0.3 }), s2 = 0, n2 = 0;
          for (var q2 = 0; q2 < fall.sweeps; q2++) { g6.sweep(); if ((q2 + 1) % 10 === 0) g6.schrittAnpassen(); if (q2 >= fall.ab) { s2 += g6.energie() / g6.N; n2++; } }
          var mittel2 = s2 / n2;
          erg.abweichung = Math.abs(mittel - fall.mittel);
          var imBand = Math.abs(mittel2 - fall.mittel) <= fall.band * fall.streuung;
          erg.ok = erg.abweichung <= fall.toleranz && imBand;
          erg.zeile = "gleiche Saat: " + mittel.toFixed(9) + " (soll " + fall.mittel.toFixed(9) + ", Abweichung " + erg.abweichung.toExponential(1) + "); andere Saat: " + mittel2.toFixed(6) + (imBand ? " liegt" : " liegt NICHT") + " im Band ± " + (fall.band * fall.streuung).toFixed(6);
        } else { erg.ok = false; erg.zeile = "unbekannte Art " + fall.art; }
      } catch (ex) { erg.ok = false; erg.zeile = "Fehler: " + ex.message; }
      return erg;
    });
  }

  var API = { pruefe: pruefe };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
    if (require.main === module) {
      var fs = require("fs"), Physik = require("./glas_physik.js"), werte = JSON.parse(fs.readFileSync(__dirname + "/glas_pruefwerte.json", "utf8"));
      var erg = pruefe(Physik, werte), gruen = 0, zahl = 0;
      erg.forEach(function (e) { if (!e.hinweis) { zahl++; if (e.ok) gruen++; } console.log((e.hinweis ? "Hinweis" : e.ok ? "grün   " : "ROT    ") + "  " + e.name + "\n          " + e.zeile); });
      console.log(gruen + " von " + zahl + " Fällen grün. Prüfwerte: " + werte.erzeugt);
      process.exit(gruen === zahl ? 0 : 1);
    }
  } else global.GlasPruefungKern = API;
})(typeof window !== "undefined" ? window : this);
