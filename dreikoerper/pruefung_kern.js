/* pruefung_kern.js — die Prüfung von physik.js gegen pruefwerte.json. Armin, 07.10.2026 (08.10.: Art „ausgang“; 09.10.: „frei“ und „pfad“; 11.10.: „pfad“ prüft die Energie; 15.10.: „phasen“).
 * Läuft im Browser (pruefung.html) und in Node (zum Prüfen vor dem Ablegen), mit denselben Zeilen.
 */
(function (global) {
  "use strict";

  function zustandAus(fall) {
    return {
      t: 0,
      koerper: fall.massen.map(function (m, i) {
        return { m: m, r: fall.r0[i].slice(), v: fall.v0[i].slice(), radius: fall.radien ? fall.radien[i] : 0 };
      })
    };
  }

  function maxAbweichung(z, soll) {
    var d = 0;
    z.koerper.forEach(function (k, i) {
      for (var c = 0; c < 3; c++) d = Math.max(d, Math.abs(k.r[c] - soll[i][c]));
    });
    return d;
  }

  function pruefe(Physik, werte) {
    return werte.faelle.map(function (fall) {
      var z0 = zustandAus(fall), erg = { name: fall.name, warum: fall.warum };
      try {
        if (fall.art === "leapfrog") {
          var z = z0;
          for (var s = 0; s < fall.schritte; s++) z = Physik.leapfrogSchritt(z, fall.dt, fall.G);
          var w = Physik.waechter(z0, z, fall.G);
          erg.abweichung = maxAbweichung(z, fall.r_ende);
          erg.energieFehler = w.energieFehler;
          erg.drehimpulsFehler = w.drehimpulsFehler;
          erg.ok = erg.abweichung <= fall.toleranz;
          erg.zeile = "größte Abweichung " + erg.abweichung.toExponential(2) + " (erlaubt " + fall.toleranz + ")";
        } else if (fall.art === "adaptiv") {
          var lauf = Physik.laufeBis(z0, fall.t_ende, { G: fall.G, rtol: fall.rtol, atol: fall.atol });
          var w2 = Physik.waechter(z0, lauf.zustand, fall.G);
          erg.abweichung = maxAbweichung(lauf.zustand, fall.r_ende);
          erg.energieFehler = w2.energieFehler;
          erg.drehimpulsFehler = w2.drehimpulsFehler;
          erg.schritte = lauf.schritte;
          erg.ok = !lauf.abbruch && erg.abweichung <= fall.toleranz;
          erg.zeile = "größte Abweichung " + erg.abweichung.toExponential(2) + " (erlaubt " + fall.toleranz + "), " +
            lauf.schritte + " Schritte, " + lauf.verworfen + " verworfen";
        } else if (fall.art === "abbruch") {
          var lauf2 = Physik.laufeBis(z0, fall.t_ende, { G: fall.G, rtol: fall.rtol, atol: fall.atol });
          erg.ok = !!lauf2.abbruch && lauf2.abbruch.grund === fall.erwartet;
          erg.zeile = lauf2.abbruch ? ("abgebrochen bei t = " + lauf2.abbruch.t.toFixed(4) + ": " + lauf2.abbruch.grund) : "NICHT abgebrochen";
        } else if (fall.art === "ausgang") {
          var lauf3 = Physik.laufeBis(z0, fall.t_ende, { G: fall.G, rtol: fall.rtol, atol: fall.atol, maxSchritte: 3000000 });
          var w3 = Physik.waechter(z0, lauf3.zustand, fall.G);
          var aus = lauf3.abbruch ? lauf3.abbruch.grund : Physik.ausgang(lauf3.zustand, fall.G);
          erg.energieFehler = w3.energieFehler;
          erg.drehimpulsFehler = w3.drehimpulsFehler;
          erg.ok = aus === fall.erwartet && w3.energieFehler <= fall.energie_toleranz;
          erg.zeile = "Ausgang „" + aus + "“ (erwartet „" + fall.erwartet + "“), " + lauf3.schritte + " Schritte";
        } else if (fall.art === "frei") {
          // Wer ist am Ende frei? Physik.ausgang sagt „Vorbeiflug“, wenn genau der Körper mit dem gegebenen Index frei ist.
          var lauf4 = Physik.laufeBis(z0, fall.t_ende, { G: fall.G, rtol: fall.rtol, atol: fall.atol, maxSchritte: 5000000 });
          var w4 = Physik.waechter(z0, lauf4.zustand, fall.G), frei = [];
          if (!lauf4.abbruch) for (var k = 0; k < z0.koerper.length; k++)
            if (Physik.ausgang(lauf4.zustand, fall.G, k, fall.abstand_frei) === "Vorbeiflug") frei.push(k);
          erg.energieFehler = w4.energieFehler; erg.drehimpulsFehler = w4.drehimpulsFehler;
          erg.ok = !lauf4.abbruch && frei.length === 1 && frei[0] === fall.erwartet_frei && w4.energieFehler <= fall.energie_toleranz;
          erg.zeile = lauf4.abbruch ? ("abgebrochen bei t = " + lauf4.abbruch.t.toFixed(4) + ": " + lauf4.abbruch.grund) :
            ("frei: " + (frei.length ? frei.map(function (i) { return "Masse " + z0.koerper[i].m; }).join(", ") : "niemand") +
             " (erwartet Masse " + z0.koerper[fall.erwartet_frei].m + "), " + lauf4.schritte + " Schritte");
          if (fall.r_ende_python) erg.zeile += "; Lage gegen Python nur zur Kenntnis: " + maxAbweichung(lauf4.zustand, fall.r_ende_python).toExponential(1);
        } else if (fall.art === "pfad") {
          // Kein Grün oder Rot: zeigt, wie weit die Wege auseinanderliegen, wenn der Ausgang gleich ist.
          var lauf5 = Physik.laufeBis(z0, fall.t_ende, { G: fall.G, rtol: fall.rtol, atol: fall.atol, maxSchritte: 5000000 });
          var w5 = Physik.waechter(z0, lauf5.zustand, fall.G);
          var aus5 = lauf5.abbruch ? lauf5.abbruch.grund : Physik.ausgang(lauf5.zustand, fall.G);
          erg.hinweis = (fall.energie_toleranz === undefined);   // mit Grenze ein echter Fall, ohne nur ein Hinweis
          // 11.10. (Phil, Brief 13): Die Grenze bleibt; grün nur, wenn die Energie unter ihr bleibt.
          erg.ok = !lauf5.abbruch && aus5 === fall.ausgang_python && (fall.energie_toleranz === undefined || w5.energieFehler <= fall.energie_toleranz);
          erg.energieFehler = w5.energieFehler; erg.drehimpulsFehler = w5.drehimpulsFehler;
          erg.zeile = "Ausgang „" + aus5 + "“ (Python: „" + fall.ausgang_python + "“), größte Abweichung der Lagen " +
            maxAbweichung(lauf5.zustand, fall.r_ende).toExponential(1) + " (Hinweis, nicht geprüft), " + lauf5.schritte + " Schritte";
        } else if (fall.art === "phasen") {
          // 15.10.: Phasen zu dritt (Phils Maß, Briefe 16–18) gegen Python. Gleiche Zahl, Grenzen innerhalb der Toleranz.
          var zz = Physik.dreierZaehler(fall.G); zz.beobachte(z0);
          var lauf6 = Physik.laufeBis(z0, fall.t_ende, { G: fall.G, rtol: fall.rtol, atol: fall.atol, maxSchritte: 5000000,
            beiSchritt: function (z) { zz.beobachte(z); } });
          var st = zz.stand(lauf6.zustand.t), soll = fall.phasen_python, abw = 0;
          var gleich = !lauf6.abbruch && st.zahl === soll.length;
          if (gleich) soll.forEach(function (p, i) { abw = Math.max(abw, Math.abs(p[0] - st.phasen[i].start), Math.abs(p[1] - st.phasen[i].ende)); });
          erg.ok = gleich && abw <= fall.toleranz_zeit;
          erg.zeile = st.zahl + (st.zahl === 1 ? " Phase" : " Phasen") + " zu dritt (Python: " + soll.length + "), Anteil " + (100 * st.anteil).toFixed(1) +
            " % (Python: " + (100 * fall.anteil_python).toFixed(1) + " %), größte Abweichung der Grenzen " + (gleich ? abw.toFixed(3) : "–") +
            " (erlaubt " + fall.toleranz_zeit + "), " + lauf6.schritte + " Schritte";
        } else {
          erg.ok = false; erg.zeile = "unbekannte Art: " + fall.art;
        }
        if (erg.energieFehler !== undefined)
          erg.zeile += "; Energie " + erg.energieFehler.toExponential(1) + ", Drehimpuls " + erg.drehimpulsFehler.toExponential(1);
      } catch (e) {
        erg.ok = false; erg.zeile = "Fehler: " + e.message;
      }
      return erg;
    });
  }

  var PruefungKern = { pruefe: pruefe };
  if (typeof module !== "undefined" && module.exports) module.exports = PruefungKern;
  else global.PruefungKern = PruefungKern;
})(typeof window !== "undefined" ? window : this);
