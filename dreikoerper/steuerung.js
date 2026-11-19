/* steuerung.js — Bahnen ohne Formel: Anfänge laden, Knöpfe und Regler, die Rechenschleife. Armin, 08.10.2026.
 * Abends dazu: Ansicht „Himmel“ (3D, drehbar, Sternenhintergrund) neben dem Schema.
 * Braucht physik.js (Rechnen) und zeichnen.js (Malen). Lädt anfaenge.json und der_dritte_kommt_ausgaenge.json
 * (beide von Philip, 08.10.2026); deshalb muss die Seite über Apache geöffnet werden, nicht per Doppelklick.
 *
 * Abmachungen aus Phils Prüfblatt 06: Kein Körper hat Radius 0. hMax ist etwa ein Hundertstel der kürzesten
 * Umlaufzeit, damit die Ellipsen rund aussehen (bei Alpha Centauri 0,8 Jahre).
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var himmel = $("himmel"), waechterbild = $("waechterbild"), kartenbild = $("karte");
  var ansicht = new Zeichnen.Ansicht();
  var kamera = new Zeichnen.Kamera();      // für die Ansicht „Himmel“ (3D), 08.10.

  var A = null;              // anfaenge.json
  var KARTE = null;          // der_dritte_kommt_ausgaenge.json
  var lage = {               // alles, was sich während eines Laufs ändert
    anfang: null, z0: null, z: null, G: 1, h: null, laeuft: false, abbruch: null, fertig: null,
    spuren: [], verlauf: [], letzteZeit: null, hervor: -1, positionen: [], zeigerWaechter: null,
    art: "schema", ebenenR: 1, spurSchritt: 0.001
  };

  // Simulationszeit je Sekunde Bildschirmzeit, je Anfang (bei Tempo 1)
  var TEMPO = { zwei_sterne: 1.5, die_acht: 1.6, lagrange_dreieck: 0.9, pythagoras: 2.5, alpha_centauri: 16, der_dritte_kommt: 3 };
  var EINHEIT = { alpha_centauri: "AE" };
  // Genauigkeit je Anfang. Pythagoras braucht 1e-12: Mit 1e-10 fliegt die Masse 3 zwar auch hinaus, aber viel später
  // als bei Szebehely und Peters (1967), weil die engen Begegnungen den Fehler vergrößern (09.10., Prüffall 8).
  var RTOL = { pythagoras: 1e-12 };
  // 11.10. (Phil, Brief 13): „Der Dritte kommt“ unter v = 1,1 so fein wie Pythagoras. Die Grenze 1e-6 bleibt stehen;
  // der Befund wird an die Zahl angepasst, nicht die Zahl an den Befund.
  function rtolFuer(a) {
    if (a.id === "der_dritte_kommt") { var w = reglerWert(); return (w !== null && w < 1.1) ? 1e-12 : 1e-10; }
    return RTOL[a.id] || 1e-10;
  }
  var MAX_SPUR = 16000, MAX_VERLAUF = 1500;

  // ---------- Laden ----------
  function laden(datei) {
    return fetch(datei).then(function (a) { if (!a.ok) throw new Error(datei + ": HTTP " + a.status); return a.json(); });
  }
  Promise.all([laden("anfaenge.json"), laden("der_dritte_kommt_ausgaenge.json")])
    .then(function (daten) { A = daten[0]; KARTE = daten[1]; aufbauen(); })
    .catch(function (e) {
      meldung("Die Anfänge ließen sich nicht laden (" + e.message + "). Die Seite muss über Apache geöffnet werden, " +
              "also über <code>http://localhost/…</code>, nicht per Doppelklick als Datei.", true);
    });

  function aufbauen() {
    // Der Anfang der Postbotin zuerst, dann die übrigen in Phils Reihenfolge
    var liste = A.anfaenge.slice().sort(function (a, b) { return (b.id === "der_dritte_kommt") - (a.id === "der_dritte_kommt"); });
    var sel = $("anfang");
    liste.forEach(function (a) { var o = document.createElement("option"); o.value = a.id; o.textContent = a.titel; sel.appendChild(o); });
    sel.addEventListener("change", function () { waehle(sel.value); });
    $("los").addEventListener("click", function () { if (lage.abbruch || lage.fertig) neuStart(); lage.laeuft = !lage.laeuft; knopf(); });
    $("neu").addEventListener("click", function () { neuStart(); });
    $("einpassen").addEventListener("click", function () { einpassen(lage.z, false); });
    $("naeher").addEventListener("click", function () { if (lage.art === "himmel") kamera.k *= 1.5; else ansicht.zoom(1.5, ansicht.w / 2, ansicht.h / 2); });
    $("weiter").addEventListener("click", function () { if (lage.art === "himmel") kamera.k /= 1.5; else ansicht.zoom(1 / 1.5, ansicht.w / 2, ansicht.h / 2); });
    $("art").addEventListener("change", function () { lage.art = $("art").value; artAnzeigen(); });
    artAnzeigen();
    $("regler").addEventListener("input", function () { reglerGeaendert(); });
    zeigerUndZiehen();
    waehle(liste[0].id);
    requestAnimationFrame(schleife);
  }

  function anfangMitId(id) { return A.anfaenge.filter(function (a) { return a.id === id; })[0]; }

  // ---------- Anfang wählen, Regler ----------
  function waehle(id) {
    var a = anfangMitId(id);
    lage.anfang = a; lage.G = a.G;
    $("titel").textContent = a.titel;
    $("wasmansieht").textContent = a.was_man_sieht;
    $("quelle").textContent = "Quelle: " + a.quelle;
    var rk = $("reglerkasten"), r = $("regler");
    if (a.regler) {
      rk.style.display = "block";
      $("reglername").textContent = a.regler.beschriftung;
      if (a.id === "der_dritte_kommt") {
        r.min = a.regler.von; r.max = a.regler.bis; r.step = a.regler.schritt; r.value = a.regler.vorgabe;
        kartenbild.style.display = "block";
      } else {                                   // Alpha Centauri: nur die sieben Rastpunkte (Phil, Brief 11)
        r.min = 0; r.max = a.regler.rastpunkte.length - 1; r.step = 1; r.value = a.regler.rastpunkte.indexOf(a.regler.vorgabe);
        kartenbild.style.display = "none";
      }
    } else {
      rk.style.display = "none";
    }
    legende();
    neuStart();
  }

  function reglerWert() {
    var a = lage.anfang, r = $("regler");
    if (!a.regler) return null;
    if (a.id === "der_dritte_kommt") return Math.round(parseFloat(r.value) * 100) / 100;
    return a.regler.rastpunkte[parseInt(r.value, 10)];
  }

  function reglerGeaendert() { neuStart(); }

  // „Der Dritte kommt“: Paar auf dem Kreis mit Abstand 1, der Dritte bei x = start_x, y = b, Geschwindigkeit v nach rechts,
  // dann Schwerpunkt abziehen (wie Phils der_dritte_kommt.py, Funktion anfang). Radien und Namen aus der Vorgabe.
  function dritterAnfang(a, v) {
    var b = a.regler.stossparameter_b, D = -a.regler.start_x, vk = Math.sqrt(a.G * 2 / 1);
    var r = [[-0.5, 0, 0], [0.5, 0, 0], [-D, b, 0]], w = [[0, -vk / 2, 0], [0, vk / 2, 0], [v, 0, 0]];
    var z = { t: 0, koerper: a.koerper.map(function (k, i) { return { m: k.m, r: r[i], v: w[i], radius: k.radius, name: k.name, tooltip: k.tooltip }; }) };
    var s = Physik.insSchwerpunktsystem(z);
    s.koerper.forEach(function (k, i) { k.name = a.koerper[i].name; k.tooltip = a.koerper[i].tooltip; });
    return s;
  }

  function startZustand() {
    var a = lage.anfang, quelle = a.koerper, wert = reglerWert();
    if (a.regler && a.rastpunkte_zustaende) {
      var schluessel = a.regler.parameter === "v" ? "v" : "a_out_AE";
      var rp = a.rastpunkte_zustaende.filter(function (z) { return Math.abs(z[schluessel] - wert) < 1e-9; })[0];
      if (rp) quelle = rp.koerper;
      else if (a.id === "der_dritte_kommt") return dritterAnfang(a, wert);
    }
    return {
      t: 0,
      koerper: quelle.map(function (k, i) {
        var vorgabe = a.koerper[i] || {};
        return { m: k.m, r: k.r.slice(), v: k.v.slice(), radius: k.radius || vorgabe.radius || 0.01,   // nie 0 (Prüfblatt 06)
                 name: k.name || vorgabe.name, tooltip: k.tooltip || vorgabe.tooltip };
      })
    };
  }

  function neuStart() {
    var a = lage.anfang;
    lage.z0 = startZustand(); lage.z = Physik.kopie(lage.z0);
    lage.z.koerper.forEach(function (k, i) { k.tooltip = lage.z0.koerper[i].tooltip; });
    lage.h = null; lage.abbruch = null; lage.fertig = null; lage.laeuft = false; lage.letzteZeit = null;
    lage.zaehler = Physik.dreierZaehler(lage.G); lage.zaehler.beobachte(lage.z0);   // 15.10.: Phasen zu dritt (Phil, Briefe 16–18)
    lage.spuren = lage.z.koerper.map(function (k) { return [[k.r[0], k.r[1], k.r[2]]]; });
    lage.verlauf = [{ t: 0, e: 1e-17, l: 1e-17 }];
    meldung("", false);
    reglerAnzeige();
    einpassen(lage.z0, true);
    lage.spurSchritt = Math.max(lage.ebenenR, 1e-9) / 400;
    knopf();
  }

  // Ins Bild holen. Beim Start: Liegt ein Körper so weit draußen, dass die anderen zu einem Punkt würden
  // (Proxima bei 13 000 AE), wird auf die übrigen eingepasst; der ferne bekommt einen Pfeil am Rand.
  function einpassen(z, beimStart) {
    ansicht.groesse(himmel.clientWidth, himmel.clientHeight);
    var p = z.koerper.map(function (k) { return [k.r[0], k.r[1], k.r[2]]; });
    var sp = Physik.schwerpunkt(z).r, auswahl = p, faktor = 1.15;
    ansicht.einpassen(p, 0.18);
    if (beimStart && p.length > 2) {
      var kleinster = Infinity;
      for (var i = 0; i < p.length; i++) for (var j = i + 1; j < p.length; j++) kleinster = Math.min(kleinster, Math.hypot(p[i][0] - p[j][0], p[i][1] - p[j][1], p[i][2] - p[j][2]));
      if (kleinster * ansicht.s < 25) {
        var fern = 0, dmax = -1;
        p.forEach(function (q, i) { var d = Math.hypot(q[0] - sp[0], q[1] - sp[1], q[2] - sp[2]); if (d > dmax) { dmax = d; fern = i; } });
        auswahl = p.filter(function (q, i) { return i !== fern; });
        // Mitte für Kamera und Bahnebene: Schwerpunkt der übrigen, nicht des ganzen Systems. Bei Alpha Centauri liegt der
        // Gesamtschwerpunkt wegen Proxima rund 1000 AE neben dem Paar (09.10. bemerkt: Spuren eckig, Paar im Himmel neben der Mitte).
        var mr = 0, cr = [0, 0, 0];
        z.koerper.forEach(function (k, i) { if (i === fern) return; mr += k.m; for (var c = 0; c < 3; c++) cr[c] += k.m * k.r[c]; });
        sp = cr.map(function (v) { return v / mr; });
        // Bahn des Paars braucht Platz: Apastron ungefähr doppelte Halbachse
        ansicht.einpassen(auswahl, 1.2);
        faktor = 2.2;
      }
    }
    // Kamera für den Himmel: um den Schwerpunkt, Blickwinkel bleibt, wie man ihn gedreht hat
    kamera.einpassen(auswahl.map(function (q) { return [(q[0] - sp[0]) * faktor, (q[1] - sp[1]) * faktor, (q[2] - sp[2]) * faktor]; }),
                     himmel.clientWidth, himmel.clientHeight);
    kamera.ziel = sp.slice();
    lage.ebenenR = 0;
    auswahl.forEach(function (q) { lage.ebenenR = Math.max(lage.ebenenR, Math.hypot(q[0] - sp[0], q[1] - sp[1])); });
    lage.ebenenR *= (faktor > 2 ? 1.6 : 1.0);
  }

  function artAnzeigen() {
    var nacht = lage.art === "himmel";
    $("buehne").classList.toggle("nacht", nacht);
    $("hinweis").textContent = nacht ?
      "Himmel: ziehen dreht den Blick · Mausrad: näher oder weiter · auf einen Stern zeigen (oder tippen): seine Erklärung. Die Sterne im Hintergrund sind Kulisse, sie ziehen nicht." :
      "Kreuz: Schwerpunkt · ziehen: verschieben · Mausrad: näher oder weiter · auf einen Körper zeigen (oder tippen): seine Erklärung";
  }

  function reglerAnzeige() {
    var a = lage.anfang;
    if (!a.regler) return;
    var wert = reglerWert(), hin = $("reglerhinweis");
    if (a.id === "der_dritte_kommt") {
      $("reglerwert").textContent = "v = " + Zeichnen.zahl(wert, 2);
      var reihe = KARTE.ausgaenge[String(a.regler.stossparameter_b)] || [];
      var idx = -1; reihe.forEach(function (r, i) { if (Math.abs(r[0] - wert) < 1e-9) idx = i; });
      Zeichnen.karte(kartenbild, reihe, idx);
      var rp = a.rastpunkte_zustaende.filter(function (z) { return Math.abs(z.v - wert) < 1e-9; })[0];
      var python = idx >= 0 ? reihe[idx][1] : "–";
      hin.innerHTML = "Der Python-Kern (DOP853, bis t = 300) sagt für v = " + Zeichnen.zahl(wert, 2) + ": <b>" + python + "</b>." +
        (rp ? " Rastpunkt: " + rp.erklaerung : "") +
        (wert < 1.1 ? " Unter etwa 1,1 ist die <i>Karte</i> chaotisch: Der Nachbarwert des Reglers kann einen anderen Ausgang haben. Die einzelne Bahn ist meist trotzdem verlässlich; hier rechnet die Seite feiner (rtol 10⁻¹²)." : "");
    } else {
      $("reglerwert").textContent = Zeichnen.zahl(wert, 0) + " AE";
      hin.textContent = "Sieben Rastpunkte, fertig gerechnet von Philip. Je näher Proxima, desto früher ist sie die, die geht.";
    }
  }

  function legende() {
    var alt = $("kartenlegende"); if (alt) alt.remove();
    if (lage.anfang.id !== "der_dritte_kommt") return;
    var div = document.createElement("div"); div.id = "kartenlegende"; div.className = "legende";
    ["Einfang", "Hinauswurf", "Vorbeiflug", "Zusammenstoß", "Zerfall"].forEach(function (n) {
      var s = document.createElement("span"); s.style.display = "inline-flex"; s.style.alignItems = "center"; s.style.gap = "5px";
      s.appendChild(Zeichnen.legendenFeld(n)); s.appendChild(document.createTextNode(n)); div.appendChild(s);
    });
    kartenbild.parentNode.insertBefore(div, $("reglerhinweis"));
  }

  // ---------- Rechnen ----------
  function hMax() {
    var a = lage.anfang;
    if (a.id === "alpha_centauri") return 0.8;
    return a.t_umlauf ? a.t_umlauf / 100 : 0.02;
  }

  function weiterRechnen(dtSim) {
    var a = lage.anfang, z = lage.z, ziel = z.t + dtSim;
    if (a.t_ende && ziel >= a.t_ende) ziel = a.t_ende;
    var spuren = lage.spuren;
    var lauf = Physik.laufeBis(z, ziel, {
      G: lage.G, rtol: rtolFuer(a), atol: rtolFuer(a) * 0.01, hStart: lage.h || undefined, hMax: hMax(), maxSchritte: 400000,
      beiSchritt: function (zz) {
        lage.zaehler.beobachte(zz);
        // Ein Spurpunkt nur, wenn der Körper sich merklich bewegt hat (1/400 der Anfangsgröße); spart Punkte, wo es langsam geht
        zz.koerper.forEach(function (k, i) {
          var sp = spuren[i], q = sp[sp.length - 1];
          if (Math.abs(k.r[0] - q[0]) + Math.abs(k.r[1] - q[1]) + Math.abs(k.r[2] - q[2]) > lage.spurSchritt) sp.push([k.r[0], k.r[1], k.r[2]]);
        });
      }
    });
    lage.z = lauf.zustand; lage.h = lauf.h;
    lage.z.koerper.forEach(function (k, i) { k.tooltip = lage.z0.koerper[i].tooltip; });
    // Zu lange Spuren werden gleichmäßig ausgedünnt (jeder zweite Punkt), nicht abgeschnitten: So bleibt der ganze Weg
    // sichtbar (09.10.: bei Pythagoras mit 41 000 Schritten war sonst der Tanz in der Mitte verschwunden).
    spuren.forEach(function (sp, i) {
      if (sp.length > MAX_SPUR) spuren[i] = sp.filter(function (q, j) { return j % 2 === 0 || j === sp.length - 1; });
    });
    lage.spuren = spuren;
    var w = Physik.waechter(lage.z0, lage.z, lage.G);
    lage.verlauf.push({ t: lage.z.t, e: Math.max(w.energieFehler, 1e-17), l: Math.max(w.drehimpulsFehler, 1e-17) });
    if (lage.verlauf.length > MAX_VERLAUF) lage.verlauf = lage.verlauf.filter(function (p, i) { return i % 2 === 0 || i === lage.verlauf.length - 1; });
    if (lauf.abbruch) {
      lage.abbruch = lauf.abbruch; lage.laeuft = false;
      var ks = lage.z.koerper, b = lauf.abbruch;
      if (b.grund === "Zusammenstoß") {
        meldung("<b>Zusammenstoß bei t = " + Zeichnen.zahl(b.t, 3) + "</b> zwischen " + ks[b.i].name + " und " + ks[b.j].name +
          ": Abstand " + Zeichnen.zahl(b.abstand, 4) + ", kleiner als die Summe ihrer Radien (" +
          Zeichnen.zahl((ks[b.i].radius || 0) + (ks[b.j].radius || 0), 4) + "). Hier hört die Rechnung auf. " +
          "Weiter ginge es nur mit einem Trick, der die Anziehung aus der Nähe abschwächt, und dann wäre es nicht mehr Newton.", true);
      } else {
        meldung("Die Rechnung hat bei t = " + Zeichnen.zahl(b.t, 3) + " aufgehört: " + b.grund + ".", true);
      }
      knopf();
    } else if (a.t_ende && lage.z.t >= a.t_ende - 1e-12) {
      lage.laeuft = false; knopf();
      if (a.id === "der_dritte_kommt") {
        var aus = Physik.ausgang(lage.z, lage.G, 2, 6), wert = reglerWert();
        var reihe = KARTE.ausgaenge[String(a.regler.stossparameter_b)] || [], py = "–";
        reihe.forEach(function (r) { if (Math.abs(r[0] - wert) < 1e-9) py = r[1]; });
        lage.fertig = aus;
        meldung("<b>t = " + Zeichnen.zahl(a.t_ende, 0) + ": " + aus + ".</b> Der Python-Kern sagt für dieselbe Geschwindigkeit: " + py +
          (aus === py ? ". Beide Rechner kommen zum selben Ausgang." :
            ". Die beiden Rechner sind sich hier nicht einig. In der chaotischen Spanne ist das möglich: Ein Unterschied in der zehnten Stelle reicht."), false);
      } else {
        lage.fertig = "Ende";
        meldung("t = " + Zeichnen.zahl(a.t_ende, 0) + " erreicht. " + (a.id === "pythagoras" ? "Wer ist hinausgeflogen?" : ""), false);
      }
    }
  }

  // ---------- Zu dritt (15.10.2026) ----------
  // Wie lange ist das System ohne Hierarchie, also ohne festes Paar mit fernem Drittem? Maß und Regeln von Phil
  // (Briefe 16–18), Zähler in physik.js. Steht im Tooltip jedes Körpers, weil es das ganze System betrifft.
  function zuDrittText() {
    if (!lage.zaehler || !lage.z || lage.z.koerper.length !== 3) return "";
    var s = lage.zaehler.stand(lage.z.t), e = lage.anfang.id === "alpha_centauri" ? "Jahre" : "Zeiteinheiten";
    var kopf = "Zu dritt (ohne festes Paar): ";
    if (lage.z.t <= 0) return kopf + (s.drin ? "ja, von Anfang an" : "noch nicht");
    if (s.anteil > 0.999) return kopf + "die ganze Zeit bisher";
    if (s.zahl === 0) return kopf + "bisher nie; es gibt immer ein festes Paar und einen fernen Dritten";
    return kopf + Zeichnen.zahl(100 * s.anteil, 1) + " % der Zeit (" + Zeichnen.zahl(s.zeit, 2) + " " + e + "), in " +
      s.zahl + (s.zahl === 1 ? " Phase" : " Phasen") + (s.drin ? ", gerade jetzt" : "");
  }

  // ---------- Schleife ----------
  function schleife(jetzt) {
    if (lage.anfang) {
      if (lage.laeuft) {
        var dt = lage.letzteZeit === null ? 0 : Math.min((jetzt - lage.letzteZeit) / 1000, 0.05);
        var tempo = Math.pow(2, parseFloat($("tempo").value)) * (TEMPO[lage.anfang.id] || 1);
        if (dt > 0) weiterRechnen(dt * tempo);
      }
      lage.letzteZeit = lage.laeuft ? jetzt : null;
      malen();
    }
    requestAnimationFrame(schleife);
  }

  function malen() {
    var gemeinsam = {
      zustand: lage.z, spuren: lage.spuren, zeigeSpuren: $("spuren").checked, einheit: EINHEIT[lage.anfang.id] || "",
      schwerpunkt: Physik.schwerpunkt(lage.z).r, hervor: lage.hervor
    };
    var erg;
    if (lage.art === "himmel") {
      gemeinsam.alpha = lage.anfang.id === "alpha_centauri"; gemeinsam.ebenenRadius = lage.ebenenR;
      erg = Zeichnen.himmel3d(himmel, kamera, gemeinsam);
      var grad = Math.round(kamera.el * 180 / Math.PI);
      $("massstab").textContent = grad === 0 ? "Blick genau in der Bahnebene" : "Blick " + Math.abs(grad) + "° " + (grad > 0 ? "über" : "unter") + " der Bahnebene";
    } else {
      erg = Zeichnen.himmel(himmel, ansicht, gemeinsam);
      $("massstab").textContent = erg.massstab;
    }
    lage.positionen = erg.positionen;
    $("zeit").textContent = "t = " + Zeichnen.zahl(lage.z.t, 2) + (lage.anfang.id === "alpha_centauri" ? " Jahre" : "");
    Zeichnen.waechter(waechterbild, lage.verlauf, lage.zeigerWaechter);
    var letzt = lage.verlauf[lage.verlauf.length - 1];
    $("waechterzahlen").textContent = lage.z.t > 0 ?
      "Jetzt: Energie " + Zeichnen.hoch(letzt.e) + ", Drehimpuls " + Zeichnen.hoch(letzt.l) +
      (lage.anfang.id === "pythagoras" ? " (Drehimpuls ist hier null, gezeigt wird der absolute Fehler)" : "") : "Noch nicht gerechnet.";
  }

  function knopf() {
    $("los").textContent = lage.laeuft ? "Anhalten" : (lage.abbruch || lage.fertig ? "Noch einmal" : (lage.z && lage.z.t > 0 ? "Weiter" : "Start"));
  }

  function meldung(html, halt) {
    var m = $("meldung");
    m.innerHTML = html; m.style.display = html ? "block" : "none";
    m.className = halt ? "halt" : "";
  }

  // ---------- Zeigen, ziehen, zoomen ----------
  function zeigerUndZiehen() {
    var tip = $("tip"), buehne = $("buehne"), ziehen = null;
    function koerperBei(x, y) {
      var best = -1, bd = Infinity;
      lage.positionen.forEach(function (p) {
        if (p.draussen) return;
        var d = Math.hypot(p.x - x, p.y - y);
        if (d < Math.max(p.r + 8, 14) && d < bd) { bd = d; best = p.i; }
      });
      return best;
    }
    function zeigeTip(i, x, y) {
      if (i < 0) { tip.style.display = "none"; lage.hervor = -1; return; }
      var k = lage.z.koerper[i];
      lage.hervor = i;
      var zd = zuDrittText();
      tip.innerHTML = "<b>" + (k.name || i + 1) + " · Masse " + Zeichnen.zahl(k.m, 4) + "</b>" + (k.tooltip || "") +
        (zd ? '<span class="zudritt">' + zd + "</span>" : "");
      tip.style.display = "block";
      var bw = buehne.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = Math.min(Math.max(x + 14, 6), bw - tw - 6) + "px";
      tip.style.top = (y + 14 + th > buehne.clientHeight ? y - th - 14 : y + 14) + "px";
    }
    function lokal(e) { var r = himmel.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    himmel.addEventListener("pointerdown", function (e) {
      var p = lokal(e), i = koerperBei(p[0], p[1]);
      if (e.pointerType !== "mouse" && i >= 0) { zeigeTip(i, p[0], p[1]); return; }   // Tippen auf einen Körper: Erklärung
      ziehen = { x: p[0], y: p[1] }; himmel.setPointerCapture(e.pointerId); himmel.classList.add("zieht");
    });
    himmel.addEventListener("pointermove", function (e) {
      var p = lokal(e);
      if (ziehen) {
        if (lage.art === "himmel") {
          kamera.az -= (p[0] - ziehen.x) * 0.008;
          kamera.el = Math.max(-1.55, Math.min(1.55, kamera.el + (p[1] - ziehen.y) * 0.008));
        } else ansicht.verschiebe(p[0] - ziehen.x, p[1] - ziehen.y);
        ziehen = { x: p[0], y: p[1] }; tip.style.display = "none"; return;
      }
      if (e.pointerType === "mouse") zeigeTip(koerperBei(p[0], p[1]), p[0], p[1]);
    });
    function loslassen() { ziehen = null; himmel.classList.remove("zieht"); }
    himmel.addEventListener("pointerup", loslassen);
    himmel.addEventListener("pointercancel", loslassen);
    himmel.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") { tip.style.display = "none"; lage.hervor = -1; } });
    himmel.addEventListener("wheel", function (e) {
      e.preventDefault(); var p = lokal(e);
      if (lage.art === "himmel") kamera.k *= (e.deltaY < 0 ? 1.15 : 1 / 1.15); else ansicht.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, p[0], p[1]);
    }, { passive: false });
    waechterbild.addEventListener("pointermove", function (e) { lage.zeigerWaechter = e.clientX - waechterbild.getBoundingClientRect().left; });
    waechterbild.addEventListener("pointerleave", function () { lage.zeigerWaechter = null; });
  }
})();
