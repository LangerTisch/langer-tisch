/* Der lange Tisch — das eine, gemeinsame Menü.
   Wird von Seiten in Tiefe 0, 1 und 2 eingebunden; der Wurzel-Präfix
   ergibt sich aus der eigenen Adresse (document.currentScript.src). */
(function () {
  'use strict';

  var eigenesScript = document.currentScript;
  var wurzel = './';
  if (eigenesScript && eigenesScript.src) {
    wurzel = eigenesScript.src.replace(/menue\.js(\?.*)?$/, '');
  }

  /* Das Stilblatt sofort anfordern, damit das Menü nicht nackt aufblitzt. */
  var stilLink = document.createElement('link');
  stilLink.rel = 'stylesheet';
  stilLink.href = wurzel + 'menue.css';
  (document.head || document.documentElement).appendChild(stilLink);

  /* Inhaltsseiten laufen als Hash-Routen über die Shell;
     nur die beiden Maschinen-Seiten (dreikoerper) sind direkte Links. */
  function schale(pfad) { return wurzel + 'index.html#/' + pfad; }

  var struktur = [
    { text: 'Home', href: wurzel + 'index.html' },
    { text: 'Kunst', unter: [
        { text: 'Galerie', href: schale('kunst.html') }
    ]},
    { text: 'Literatur', unter: [
        { text: 'Finde die Mitte', href: schale('buecher/finde-die-mitte/finde_die_mitte.html') }
    ]},
    { text: 'Naturwissenschaften', unter: [
        { text: 'Physik', unter: [
            { text: 'Dreikörper — Bahnen ohne Formel', href: wurzel + 'dreikoerper/index.html' },
            { text: 'Glas', href: wurzel + 'dreikoerper/glas.html' }
        ]}
    ]},
    { text: 'Videos', unter: [
        { text: 'Die Acht', href: schale('videos/die-acht.html') },
        { text: 'Schwarze Löcher', href: schale('inhalt/schwarze-loecher.html') }
    ]},
    { text: 'Wer hier schreibt', href: schale('wer-hier-schreibt.html') },
    { text: 'Zu dieser Seite', href: schale('zu-dieser-seite.html') }
  ];

  function bauListe(eintraege, tiefe) {
    var ul = document.createElement('ul');
    ul.className = tiefe === 0 ? 'menue-liste' : 'untermenue';
    if (tiefe === 0) { ul.id = 'menue-liste'; }
    eintraege.forEach(function (eintrag) {
      var li = document.createElement('li');
      if (eintrag.unter) {
        li.className = 'hat-unter';
        var knopf = document.createElement('button');
        knopf.type = 'button';
        knopf.textContent = eintrag.text;
        knopf.setAttribute('aria-expanded', 'false');
        knopf.setAttribute('aria-haspopup', 'true');
        li.appendChild(knopf);
        li.appendChild(bauListe(eintrag.unter, tiefe + 1));
      } else {
        var a = document.createElement('a');
        a.href = eintrag.href;
        a.textContent = eintrag.text;
        li.appendChild(a);
      }
      ul.appendChild(li);
    });
    return ul;
  }

  function einbauen() {
    var nav = document.createElement('nav');
    nav.id = 'hauptmenue';
    nav.setAttribute('aria-label', 'Hauptmenü');

    var innen = document.createElement('div');
    innen.className = 'menue-innen';

    var burger = document.createElement('button');
    burger.type = 'button';
    burger.className = 'menue-burger';
    burger.textContent = 'Menü';
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-controls', 'menue-liste');

    innen.appendChild(burger);
    innen.appendChild(bauListe(struktur, 0));
    nav.appendChild(innen);

    document.body.insertBefore(nav, document.body.firstChild);
    document.body.classList.add('mit-menue');

    function schliesseAlle(ausser) {
      var offene = nav.querySelectorAll('li.offen');
      for (var i = 0; i < offene.length; i++) {
        var li = offene[i];
        if (ausser && (li === ausser || li.contains(ausser))) { continue; }
        li.classList.remove('offen');
        var knopf = li.firstElementChild;
        if (knopf && knopf.tagName === 'BUTTON') {
          knopf.setAttribute('aria-expanded', 'false');
        }
      }
    }

    function burgerZu() {
      nav.classList.remove('menue-offen');
      burger.setAttribute('aria-expanded', 'false');
    }

    nav.addEventListener('click', function (ev) {
      var knopf = ev.target.closest ? ev.target.closest('button') : null;
      if (!knopf || !nav.contains(knopf)) { return; }
      if (knopf === burger) {
        var offen = nav.classList.toggle('menue-offen');
        burger.setAttribute('aria-expanded', offen ? 'true' : 'false');
        if (!offen) { schliesseAlle(); }
        return;
      }
      var li = knopf.parentElement;
      var jetztOffen = !li.classList.contains('offen');
      schliesseAlle(li);
      li.classList.toggle('offen', jetztOffen);
      knopf.setAttribute('aria-expanded', jetztOffen ? 'true' : 'false');
    });

    /* Klick außerhalb schließt alles. */
    document.addEventListener('click', function (ev) {
      if (!nav.contains(ev.target)) {
        schliesseAlle();
        burgerZu();
      }
    });

    /* Escape schließt alles. */
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' || ev.key === 'Esc') {
        schliesseAlle();
        burgerZu();
      }
    });

    /* Dem Body genau so viel oberen Abstand geben, wie die Leiste hoch ist. */
    function abstand() {
      document.documentElement.style.setProperty('--menue-abstand', nav.offsetHeight + 'px');
    }
    abstand();
    window.addEventListener('resize', abstand);
    stilLink.addEventListener('load', abstand);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', einbauen);
  } else {
    einbauen();
  }
})();
