MATHE-QUEST – STARTANLEITUNG
============================

EMPFOHLEN FÜRS IPAD: ALS WEB-APP INSTALLIEREN
1. Veröffentliche den gesamten Ordner mathe-quest auf einem statischen Webhost mit HTTPS.
   Wichtig: Lade nicht nur index.html hoch, sondern auch manifest.json, sw.js und den Ordner icons.
2. Öffne die HTTPS-Adresse in Safari auf dem iPad und lade die Seite einmal vollständig.
3. Tippe in Safari auf „Teilen“ → „Zum Home-Bildschirm“ → „Hinzufügen“.
   Falls angeboten, aktiviere „Als Web-App öffnen“.
4. Starte Mathe-Quest über das neue Symbol auf dem Home-Bildschirm.
5. Nach dem ersten erfolgreichen Laden kann die App offline funktionieren.

START AUF DEM COMPUTER
- Die Datei index.html kann per Doppelklick im Browser geöffnet werden.
- Offline-Cache und Home-Bildschirm-Installation funktionieren nur über eine Webadresse mit HTTPS (oder lokalem Entwicklungsserver).

FORTSCHRITT UND DATENSCHUTZ
- Der Bereich heißt „Dein Fortschritt“ und zeigt Sterne, abgeschlossene Runden, beantwortete Aufgaben, Gesamt-Trefferquote und Trefferquoten für Plus, Minus, Mal und Geteilt. Vor jeder Runde muss „Runde starten“ angetippt werden; erst mit Anzeige der ersten Aufgabe läuft deren Zeitmessung.
- Die durchschnittliche Bearbeitungszeit wird je Rechenart und je Kombination aus Schwierigkeitsgrad/Rechenart gemessen. Zusätzlich zeichnet die App nach jeder abgeschlossenen Runde Trefferquote und Durchschnittszeit als Verlauf auf. Im Fortschrittsbereich lassen sich die letzten zehn passenden Runden nach Schwierigkeitsgrad und Rechenart vergleichen. Die Verlaufsmessung gilt ab dieser Version; alte Runden haben keine nachträglichen Zeit-/Verlaufsdaten. Beim Wechsel in eine andere App wird die Zeit pausiert; einzelne Aufgabenzeiten werden bei 5 Minuten gedeckelt.
- Der Lernstand wird lokal in localStorage gespeichert. Die Statistik unterscheidet jetzt zusätzlich zwischen den Stufen „Locker“, „Knobeln“ und „Profi“. Es gibt kein Konto, keine Cloud-Synchronisierung und keine Übermittlung an einen Server.
- Der Speicher ist an Website-Adresse und Browser-/Web-App-Kontext gebunden. Er wird nicht automatisch zwischen iPad und anderen Geräten übertragen.
- Beim Löschen der Website-Daten kann der Lernstand verloren gehen. Für eine spätere Sicherungs-/Exportfunktion könnte die App erweitert werden.
- Beim ersten Öffnen über HTTPS wird die App für Offline-Nutzung zwischengespeichert. Dafür müssen index.html, manifest.json, sw.js und der Ordner icons zusammen bereitgestellt werden.

ENTHALTEN
- Plus, Minus, Mal, Geteilt und gemischter Modus
- Alle vier Rechenarten sind beim Öffnen vorausgewählt. Die vier Kacheln dienen direkt zum An- und Abwählen; mindestens eine Rechenart muss ausgewählt bleiben. Mehrere ausgewählte Rechenarten ergeben automatisch einen Mischmodus, eine ausgewählte Rechenart startet eine Einzelübung.
- Drei Schwierigkeitsgrade, Tipps, direktes Feedback und Sterne
- 10 Aufgaben pro Runde; vor jeder Runde erscheint „Runde starten“. Erst nach dem Tippen wird die erste Aufgabe angezeigt und ihre Bearbeitungszeit gemessen.
- Separater Tab „Dein Fortschritt“ mit Zurücksetzen nach Bestätigung
- Auswertung je Schwierigkeitsstufe und Rechenart, inklusive durchschnittlicher Aufgabenzeit
- Zeitverlauf für Trefferquote und Bearbeitungsgeschwindigkeit über die letzten Runden, mit Filtern für Schwierigkeit und Rechenart
- Lernempfehlungen mit Schaltfläche zum direkten Start der Übung
- Anpassbare Rechenarten: Durch Antippen der Rechenkacheln eine oder mehrere Rechenarten auswählen (z. B. nur Plus und Mal); ausgewählte Kacheln sind hervorgehoben. Bei jedem neuen Laden der App sind automatisch alle vier Rechenarten ausgewählt.
- Adaptiver Mischmodus: Bei mehreren ausgewählten Rechenarten werden solche mit niedrigerer Trefferquote auf derselben Schwierigkeitsstufe häufiger ausgewählt; ab 3 Antworten pro Rechenart fließt die Trefferquote in die Gewichtung ein. Bei wenig Daten werden die ausgewählten Rechenarten zunächst gleichmäßig gewichtet.
- PWA-Manifest, iPad-Home-Bildschirm-Metadaten und Service Worker für Offline-Nutzung
- Keine externen Bibliotheken, Anmeldung oder Werbung


PROJEKTSTRUKTUR
- index.html: Seitenstruktur und Inhalte
- styles.css: Darstellung, Farben und Tablet-/Mobil-Layout
- app.js: Aufgabenlogik, Zeitmessung, Lernfortschritt und Ereignisse
- sw.js: Offline-Cache (Cache-Version wird bei Updates erhöht)
- manifest.json und icons/: Installation auf dem Home-Bildschirm
