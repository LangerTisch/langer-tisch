/* physik.js — Bahnen ohne Formel, Rechenkern für den Browser.
 * Armin, 07.10.2026 (08.10.: `ausgang` dazu und `h` in der Rückgabe von laufeBis, die Rechnung selbst unverändert;
 * 15.10.: `dreierZaehler`, Phasen zu dritt nach Phils Regeln, die Rechnung selbst unverändert). Ohne jede Anzeige, damit man ihn für sich prüfen kann (pruefung.html).
 *
 * Einheiten: frei wählbar über G. Für die Anfänge aus Python gilt G = 1; für Alpha Centauri
 * (Sonnenmassen, AE, Jahre) gilt G = 4·π².
 *
 * Ein Zustand ist { t, koerper: [ { m, r: [x,y,z], v: [vx,vy,vz], radius } ] }.
 * Gerechnet wird immer in drei Koordinaten; die Seite zeigt zuerst nur die Draufsicht (x, y).
 *
 * Verfahren:
 *   - leapfrogSchritt: Bocksprung mit festem dt (kick-drift-kick). Nur für die Prüfung gegen den Python-Kern
 *     und zum Vorführen.
 *   - dp45Schritt / laufeBis: Dormand-Prince 5(4) mit Schrittweitensteuerung. Das ist der Normalfall auf der
 *     Seite: Bei engen Begegnungen wird der Schritt von selbst klein, sonst groß.
 *
 * Wächter: Energie und Drehimpuls (Beträge relativ zum Anfang). Kein Softening: Kommen sich zwei Körper näher
 * als die Summe ihrer Radien, bricht die Rechnung mit einer Meldung ab.
 */
(function (global) {
  "use strict";

  // ---------- kleine Vektorhilfen ----------
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { return Math.sqrt(dot(a, a)); }

  function kopie(zustand) {
    return {
      t: zustand.t,
      koerper: zustand.koerper.map(function (k) {
        return { m: k.m, r: k.r.slice(), v: k.v.slice(), radius: k.radius || 0, name: k.name };
      })
    };
  }

  // ---------- Physik ----------
  /** Beschleunigungen aller Körper. Das Σ der Gleichung ist die innere Schleife. */
  function beschleunigungen(r, m, G) {
    var n = r.length, a = [];
    for (var i = 0; i < n; i++) a.push([0, 0, 0]);
    for (i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        var d = sub(r[j], r[i]);
        var d2 = dot(d, d), d3 = d2 * Math.sqrt(d2);
        var fi = G * m[j] / d3, fj = G * m[i] / d3;
        for (var k = 0; k < 3; k++) { a[i][k] += fi * d[k]; a[j][k] -= fj * d[k]; }
      }
    }
    return a;
  }

  function energie(zustand, G) {
    var ks = zustand.koerper, kin = 0, pot = 0;
    for (var i = 0; i < ks.length; i++) {
      kin += 0.5 * ks[i].m * dot(ks[i].v, ks[i].v);
      for (var j = i + 1; j < ks.length; j++) pot -= G * ks[i].m * ks[j].m / norm(sub(ks[j].r, ks[i].r));
    }
    return kin + pot;
  }

  function drehimpuls(zustand) {
    var L = [0, 0, 0];
    zustand.koerper.forEach(function (k) {
      var l = cross(k.r, k.v);
      for (var c = 0; c < 3; c++) L[c] += k.m * l[c];
    });
    return L;
  }

  function schwerpunkt(zustand) {
    var M = 0, R = [0, 0, 0], V = [0, 0, 0];
    zustand.koerper.forEach(function (k) {
      M += k.m;
      for (var c = 0; c < 3; c++) { R[c] += k.m * k.r[c]; V[c] += k.m * k.v[c]; }
    });
    for (var c = 0; c < 3; c++) { R[c] /= M; V[c] /= M; }
    return { r: R, v: V, m: M };
  }

  /** Verschiebt alles so, dass der Schwerpunkt im Nullpunkt ruht (Antwort auf Frage 1 der Postbotin). */
  function insSchwerpunktsystem(zustand) {
    var s = schwerpunkt(zustand), z = kopie(zustand);
    z.koerper.forEach(function (k) {
      for (var c = 0; c < 3; c++) { k.r[c] -= s.r[c]; k.v[c] -= s.v[c]; }
    });
    return z;
  }

  /** Kleinster Abstand zweier Körper, und ob sie sich berühren. */
  function naechsteBegegnung(zustand) {
    var ks = zustand.koerper, best = { abstand: Infinity, i: -1, j: -1, beruehrt: false };
    for (var i = 0; i < ks.length; i++) {
      for (var j = i + 1; j < ks.length; j++) {
        var d = norm(sub(ks[j].r, ks[i].r));
        if (d < best.abstand) best = { abstand: d, i: i, j: j, beruehrt: d < (ks[i].radius || 0) + (ks[j].radius || 0) };
      }
    }
    return best;
  }

  // ---------- Bocksprung mit festem dt ----------
  function leapfrogSchritt(zustand, dt, G) {
    var z = kopie(zustand), ks = z.koerper;
    var m = ks.map(function (k) { return k.m; });
    var a = beschleunigungen(ks.map(function (k) { return k.r; }), m, G);
    ks.forEach(function (k, i) { for (var c = 0; c < 3; c++) { k.v[c] += 0.5 * dt * a[i][c]; k.r[c] += dt * k.v[c]; } });
    a = beschleunigungen(ks.map(function (k) { return k.r; }), m, G);
    ks.forEach(function (k, i) { for (var c = 0; c < 3; c++) k.v[c] += 0.5 * dt * a[i][c]; });
    z.t += dt;
    return z;
  }

  // ---------- Dormand-Prince 5(4) mit Schrittweitensteuerung ----------
  // Zustand als flacher Vektor y = [r0, r1, …, v0, v1, …] (je drei Komponenten).
  function packen(z) {
    var y = [];
    z.koerper.forEach(function (k) { y.push(k.r[0], k.r[1], k.r[2]); });
    z.koerper.forEach(function (k) { y.push(k.v[0], k.v[1], k.v[2]); });
    return y;
  }
  function entpacken(y, vorlage, t) {
    var z = kopie(vorlage), n = z.koerper.length;
    z.koerper.forEach(function (k, i) {
      k.r = [y[3 * i], y[3 * i + 1], y[3 * i + 2]];
      k.v = [y[3 * n + 3 * i], y[3 * n + 3 * i + 1], y[3 * n + 3 * i + 2]];
    });
    z.t = t;
    return z;
  }
  function ableitung(y, m, G) {
    var n = m.length, r = [], dy = new Array(6 * n);
    for (var i = 0; i < n; i++) r.push([y[3 * i], y[3 * i + 1], y[3 * i + 2]]);
    var a = beschleunigungen(r, m, G);
    for (i = 0; i < n; i++) for (var c = 0; c < 3; c++) {
      dy[3 * i + c] = y[3 * n + 3 * i + c];
      dy[3 * n + 3 * i + c] = a[i][c];
    }
    return dy;
  }

  var A = [
    [],
    [1 / 5],
    [3 / 40, 9 / 40],
    [44 / 45, -56 / 15, 32 / 9],
    [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
    [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
    [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]
  ];
  var B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
  var B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

  /** Ein Versuch mit Schrittweite h. Gibt die neue Lösung und die geschätzte Fehlernorm zurück. */
  function dp45Versuch(y, h, m, G, rtol, atol) {
    var s = y.length, k = [];
    for (var st = 0; st < 7; st++) {
      var yt = y.slice();
      for (var j = 0; j < st; j++) {
        var aij = A[st][j];
        if (aij !== 0) for (var q = 0; q < s; q++) yt[q] += h * aij * k[j][q];
      }
      k.push(ableitung(yt, m, G));
    }
    var y5 = y.slice(), fehler = 0;
    for (var q2 = 0; q2 < s; q2++) {
      var inc5 = 0, inc4 = 0;
      for (var st2 = 0; st2 < 7; st2++) { inc5 += B5[st2] * k[st2][q2]; inc4 += B4[st2] * k[st2][q2]; }
      y5[q2] += h * inc5;
      var e = h * (inc5 - inc4);
      var sc = atol + rtol * Math.max(Math.abs(y[q2]), Math.abs(y5[q2]));
      fehler += (e / sc) * (e / sc);
    }
    return { y: y5, fehler: Math.sqrt(fehler / s) };
  }

  /**
   * Rechnet von zustand.t bis tEnde mit adaptivem Schritt.
   * optionen: { G, rtol, atol, hStart, hMax, maxSchritte, beiSchritt(z) }
   * Rückgabe: { zustand, h (zuletzt vorgeschlagener Schritt, für den nächsten Aufruf als hStart; 08.10.), schritte, verworfen, abbruch: null | { grund, t, i, j, abstand } }
   */
  function laufeBis(zustand, tEnde, optionen) {
    var o = optionen || {};
    var G = o.G === undefined ? 1 : o.G, rtol = o.rtol || 1e-10, atol = o.atol || 1e-12;
    var hMax = o.hMax || Infinity, maxSchritte = o.maxSchritte || 1e7;
    var m = zustand.koerper.map(function (k) { return k.m; });
    var y = packen(zustand), t = zustand.t, h = o.hStart || Math.min(1e-3, (tEnde - t) / 10);
    var schritte = 0, verworfen = 0, z = zustand;
    while (t < tEnde) {
      if (schritte + verworfen > maxSchritte) return { zustand: z, h: h, schritte: schritte, verworfen: verworfen, abbruch: { grund: "zu viele Schritte", t: t } };
      if (t + h > tEnde) h = tEnde - t;
      var vers = dp45Versuch(y, h, m, G, rtol, atol);
      if (vers.fehler <= 1 || h < 1e-14) {
        t += h; y = vers.y; schritte++;
        z = entpacken(y, zustand, t);
        var b = naechsteBegegnung(z);
        if (b.beruehrt) return { zustand: z, h: h, schritte: schritte, verworfen: verworfen, abbruch: { grund: "Zusammenstoß", t: t, i: b.i, j: b.j, abstand: b.abstand } };
        if (o.beiSchritt) o.beiSchritt(z);
      } else {
        verworfen++;
      }
      var faktor = vers.fehler === 0 ? 5 : 0.9 * Math.pow(vers.fehler, -0.2);
      h = Math.min(hMax, h * Math.min(5, Math.max(0.2, faktor)));
    }
    return { zustand: z, h: h, schritte: schritte, verworfen: verworfen, abbruch: null };
  }

  /** Die beiden Wächter, relativ zum Anfang. */
  function waechter(anfang, jetzt, G) {
    var E0 = energie(anfang, G), E1 = energie(jetzt, G);
    var L0 = drehimpuls(anfang), L1 = drehimpuls(jetzt);
    var dL = norm(sub(L1, L0)), nL = norm(L0);
    return {
      energie: E1,
      energieFehler: Math.abs((E1 - E0) / (E0 === 0 ? 1 : E0)),
      drehimpuls: L1,
      drehimpulsFehler: nL > 0 ? dL / nL : dL
    };
  }


  // ---------- Ausgang einer Begegnung (08.10.2026, nach Phils der_dritte_kommt.py, Funktion ausgang) ----------
  // Wer ist frei? Ein Körper k gilt als frei, wenn seine Energie gegenüber dem Schwerpunkt der anderen positiv ist,
  // er sich entfernt, weiter als `abstandFrei` weg ist und die anderen beiden (bei drei Körpern) gebunden sind.
  // Ergebnis: "Vorbeiflug" (frei ist der Körper mit Index `index Dritter`), "Hinauswurf" (ein anderer ist frei),
  // "Zerfall" (zwei oder mehr frei), "Einfang" (keiner frei). Nur für drei Körper gedacht.
  function ausgang(zustand, G, indexDritter, abstandFrei) {
    if (G === undefined) G = 1;
    if (indexDritter === undefined) indexDritter = 2;
    if (abstandFrei === undefined) abstandFrei = 6;
    var ks = zustand.koerper, n = ks.length, frei = [];
    for (var k = 0; k < n; k++) {
      var o = [], Mo = 0, ro = [0, 0, 0], vo = [0, 0, 0];
      for (var i = 0; i < n; i++) if (i !== k) o.push(i);
      o.forEach(function (i) { Mo += ks[i].m; for (var c = 0; c < 3; c++) { ro[c] += ks[i].m * ks[i].r[c]; vo[c] += ks[i].m * ks[i].v[c]; } });
      for (var c = 0; c < 3; c++) { ro[c] /= Mo; vo[c] /= Mo; }
      var mu = ks[k].m * Mo / (ks[k].m + Mo), d = sub(ks[k].r, ro), w = sub(ks[k].v, vo);
      var E = 0.5 * mu * dot(w, w) - G * ks[k].m * Mo / norm(d);
      var gebunden = true;
      if (o.length === 2) {
        var a = ks[o[0]], b = ks[o[1]], dp = sub(a.r, b.r), wp = sub(a.v, b.v);
        gebunden = 0.5 * (a.m * b.m / Mo) * dot(wp, wp) - G * a.m * b.m / norm(dp) < 0;
      }
      if (E > 0 && dot(d, w) > 0 && gebunden && norm(d) > abstandFrei) frei.push(k);
    }
    if (frei.length === 1) return frei[0] === indexDritter ? "Vorbeiflug" : "Hinauswurf";
    if (frei.length >= 2) return "Zerfall";
    return "Einfang";
  }

  // ---------- Phasen zu dritt (15.10.2026, nach Phils Briefen 16–18; Maß mit ihm abgesprochen) ----------
  // Eine Phase „zu dritt“ ist eine Zeit ohne Hierarchie: kein festes Paar mit einem fernen Dritten.
  // Engstes Paar (i, j), Dritter k; a = G·mi·mj / (2|E_Paar|), nur wenn das Paar gebunden ist (sonst a = ∞);
  // d = Abstand des Dritten vom Schwerpunkt des Paars. Drei Regeln (Phil, Brief 17):
  //   Eintritt, wenn d < 2a; Austritt erst, wenn d > 3a;
  //   zwei Phasen, zwischen deren Austritt und nächstem Eintritt weniger als eine innere Umlaufzeit
  //   T = 2π·√(a³ / (G·(mi + mj))) liegt (a beim Austritt), sind eine Phase.
  // Nachgesehen wird nicht nur an den Enden der Rechenschritte, sondern auch dazwischen (kubische Hermite-
  // Interpolation von Ort und Geschwindigkeit), damit kurze, flache Eintauchtiefen nicht verloren gehen.
  // Maßstab: Phils dreier_begegnungen.json (DOP853, 1e-12) und Armins armin_dreier_phasen.json (1e-13).
  function dreierMass(r, v, m, G) {
    var paare = [[0, 1, 2], [0, 2, 1], [1, 2, 0]], best = null, dmin = Infinity;
    paare.forEach(function (p) { var d = norm(sub(r[p[0]], r[p[1]])); if (d < dmin) { dmin = d; best = p; } });
    var i = best[0], j = best[1], k = best[2], M = m[i] + m[j], mu = m[i] * m[j] / M;
    var w = sub(v[i], v[j]), E = 0.5 * mu * dot(w, w) - G * m[i] * m[j] / dmin;
    var a = E < 0 ? G * m[i] * m[j] / (2 * Math.abs(E)) : Infinity;
    var cm = [0, 1, 2].map(function (c) { return (m[i] * r[i][c] + m[j] * r[j][c]) / M; });
    var d = norm(sub(r[k], cm));
    return { q: isFinite(a) ? d / a : 0, T: isFinite(a) ? 2 * Math.PI * Math.sqrt(a * a * a / (G * M)) : Infinity };
  }
  function dreierZaehler(G, unterschritte) {
    if (G === undefined) G = 1;
    var n = unterschritte || 4, alt = null, drin = false, t0 = 0, phasen = [], m = null;
    function pruefe(t, r, v) {
      var x = dreierMass(r, v, m, G);
      if (!drin && x.q < 2) { drin = true; t0 = t; }
      else if (drin && x.q > 3) {
        drin = false;
        var letzte = phasen[phasen.length - 1];
        if (letzte && t0 - letzte.ende < letzte.T) { letzte.ende = t; letzte.T = x.T; }
        else phasen.push({ start: t0, ende: t, T: x.T });
      }
    }
    function lage(z) {
      return { t: z.t, r: z.koerper.map(function (k) { return k.r.slice(); }), v: z.koerper.map(function (k) { return k.v.slice(); }),
               a: beschleunigungen(z.koerper.map(function (k) { return k.r; }), m, G) };
    }
    return {
      /** Mit jedem neuen Zustand aufrufen (auch dem Anfang). Zwischen zwei Zuständen wird n-mal nachgesehen. */
      beobachte: function (z) {
        if (z.koerper.length !== 3) return;
        if (!m) m = z.koerper.map(function (k) { return k.m; });
        var neu = lage(z);
        if (!alt) { pruefe(neu.t, neu.r, neu.v); alt = neu; return; }
        var h = neu.t - alt.t;
        for (var s = 1; s <= n; s++) {
          var u = s / n, h00 = 2 * u * u * u - 3 * u * u + 1, h10 = u * u * u - 2 * u * u + u, h01 = -2 * u * u * u + 3 * u * u, h11 = u * u * u - u * u;
          var r = [], v = [];
          for (var b = 0; b < 3; b++) {
            r.push([0, 1, 2].map(function (c) { return h00 * alt.r[b][c] + h10 * h * alt.v[b][c] + h01 * neu.r[b][c] + h11 * h * neu.v[b][c]; }));
            v.push([0, 1, 2].map(function (c) { return h00 * alt.v[b][c] + h10 * h * alt.a[b][c] + h01 * neu.v[b][c] + h11 * h * neu.a[b][c]; }));
          }
          pruefe(alt.t + u * h, r, v);
        }
        alt = neu;
      },
      /** Phasen bis zur Zeit t (eine offene Phase zählt bis t). */
      stand: function (t) {
        var liste = phasen.map(function (p) { return { start: p.start, ende: p.ende, T: p.T }; });
        if (drin) {
          var letzte = liste[liste.length - 1];
          if (letzte && t0 - letzte.ende < letzte.T) letzte.ende = t; else liste.push({ start: t0, ende: t, T: Infinity });
        }
        var zeit = liste.reduce(function (s, p) { return s + (p.ende - p.start); }, 0);
        return { zahl: liste.length, phasen: liste, zeit: zeit, anteil: t > 0 ? zeit / t : (drin ? 1 : 0), drin: drin };
      }
    };
  }

  var Physik = {
    beschleunigungen: beschleunigungen,
    energie: energie,
    drehimpuls: drehimpuls,
    schwerpunkt: schwerpunkt,
    insSchwerpunktsystem: insSchwerpunktsystem,
    naechsteBegegnung: naechsteBegegnung,
    leapfrogSchritt: leapfrogSchritt,
    laufeBis: laufeBis,
    waechter: waechter,
    ausgang: ausgang,
    dreierMass: dreierMass,
    dreierZaehler: dreierZaehler,
    kopie: kopie
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Physik;
  else global.Physik = Physik;
})(typeof window !== "undefined" ? window : this);
