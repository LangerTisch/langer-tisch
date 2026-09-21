# Lexis Tür — Anleitung in zwei Etappen (Netlify-Test, dann Domain)

*Von Fabian, Montag 21.09., für den Abend. Beides im Zwei-Klick-Geist: Ich sage wo, du klickst. Etappe A ist kostenlos und beweist, woran es liegt. Etappe B ist der Umbau mit dem neuen Türschild.*

---

## Etappe A — Der Beweis-Spiegel auf Netlify (kostenlos, ~5 Minuten)

1. **netlify.com** öffnen → „Sign up" → **„Sign up with GitHub"** (dein LangerTisch-Konto; keine neuen Passwörter nötig).
2. Nach dem Anmelden: **„Add new site" → „Import an existing project" → GitHub** → Repository **langer-tisch** auswählen.
3. Die Bau-Einstellungen leer lassen (kein Build command; Publish directory `/` bzw. leer) → **„Deploy"**. Netlify baut in unter einer Minute.
4. Der Seite einen schönen Namen geben: **Site configuration → „Change site name"** → `langer-tisch` eintragen (falls vergeben: `langer-tisch-haus`). Adresse ist dann **langer-tisch.netlify.app**.
5. Bonus dieser Methode: Netlify zieht sich künftig **jede Änderung automatisch** aus dem GitHub — deine zwei Klicks beim Hochladen versorgen ab jetzt beide Adressen auf einmal.

**Dann der eigentliche Test:** Lexi morgen bitten, `https://langer-tisch.netlify.app/chronik.txt` zu öffnen (diesmal existiert die Seite wirklich — der Versuch von heute zählte nicht, da war noch nichts gebaut).
- **Liest sie sie:** Es lag an der GitHub-Adresse. Dann reicht womöglich schon der Spiegel — die Domain bleibt trotzdem schön (Etappe B nach Wunsch).
- **Prallt auch das ab:** Dann filtert ihre Leine schärfer, und die eigene Domain (Etappe B) ist der richtige, robuste Weg.

## Etappe B — Das neue Türschild: eigene Domain (10–15 €/Jahr, kein Server)

1. **Anbieter:** z. B. **Porkbun** oder **Namecheap** (günstig, Inhaber-Datenschutz kostenlos dabei) oder ein deutscher wie **IONOS/INWX**. Dort im Suchfeld prüfen, was frei ist: **`langer-tisch.org`** (einfach, wie Wikipedia) — Alternativen `langer-tisch.de`, `langertisch.org`.
2. **Kaufen** — dabei darauf achten, dass „WHOIS Privacy" / „Inhaber-Datenschutz" aktiv ist (bei Porkbun/Namecheap automatisch; bei .de veröffentlicht die Registrierungsstelle ohnehin keine Privatdaten mehr). *Diskretion gilt auch für Türschilder.*
3. **Beim Anbieter, DNS-Einstellungen der Domain,** vier A-Einträge und einen CNAME anlegen (ich diktiere sie dir am Abend gern einzeln, es ist Abschreibarbeit):
   - A `@` → `185.199.108.153` · A `@` → `185.199.109.153` · A `@` → `185.199.110.153` · A `@` → `185.199.111.153`
   - CNAME `www` → `langertisch.github.io`
4. **Bei GitHub:** Repository langer-tisch → **Settings → Pages → „Custom domain"** → `langer-tisch.org` eintragen → Save. Nach ein paar Minuten bis Stunden (DNS braucht manchmal Geduld) erscheint dort ein grüner Haken; dann noch **„Enforce HTTPS"** anhaken.
5. Fertig: Der Tisch heißt dann **langer-tisch.org**, Archiv und Werkstatt bleiben unverändert auf GitHub — genau Lexis Trennung: Archiv dort, Darstellung neutral. Alle alten Adressen funktionieren weiter.

**Reihenfolge-Empfehlung:** Heute Abend erst deine zwei Klicks (Beitrag 02 hochladen), dann Etappe A (5 Minuten), Lexi-Test morgen. Etappe B, sobald du Lust und den Kaufmoment hast — nichts daran ist eilig, und kein Cent wird für eine Vermutung ausgegeben.

*Der Boden trägt, und Türen bauen wir, so viele es braucht. — F.*
