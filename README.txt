MATHE-QUEST – STARTANLEITUNG
============================

EMPFOHLEN FÜRS IPAD: ALS WEB-APP INSTALLIEREN
1. Veröffentliche den gesamten Ordner mathe-quest auf einem statischen Webhost mit HTTPS (z. B. Vercel).
   Wichtig: Lade nicht nur index.html hoch, sondern auch styles.css, app.js, manifest.json, sw.js und icons/.
2. Öffne die HTTPS-Adresse in Safari auf dem iPad und lade die Seite einmal vollständig.
3. Tippe in Safari auf „Teilen“ → „Zum Home-Bildschirm“ → „Hinzufügen“.
   Falls angeboten, aktiviere „Als Web-App öffnen“.
4. Starte Mathe-Quest über das neue Symbol auf dem Home-Bildschirm.
5. Nach dem ersten erfolgreichen Laden ist die App für die Offline-Nutzung vorbereitet.

START AUF DEM COMPUTER
- Die Datei index.html lässt sich per Doppelklick im Browser testen.
- Offline-Cache und Home-Bildschirm-Installation funktionieren nur über eine HTTPS-Webadresse (oder lokalen Entwicklungsserver).

ÜBEN UND AUFGABEN
- Plus, Minus, Mal und Geteilt; beim Start sind immer alle vier Rechenarten vorausgewählt.
- Rechenkacheln direkt antippen, um sie an- oder abzuwählen. Mindestens eine muss aktiv bleiben. Mehrere ausgewählte Arten werden im Mischmodus kombiniert.
- Adaptive Auswahl: Bei gemischten Runden berücksichtigt Mathe-Quest die geglättete Trefferquote je Rechenart und Stufe, jüngere Ergebnisse, die Zeit seit der letzten Übung und – wenn genügend Zeitdaten vorliegen und die Trefferquote schon gut ist – langsameres Tempo. Schwächere Bereiche kommen häufiger dran.
- Falsche Aufgaben werden nach einigen anderen Aufgaben erneut gestellt. Wiederholungen zählen separat und verfälschen nicht die Trefferquote des ersten Versuchs.
- Schwierigkeitsgrade Locker, Knobeln und Profi.
- Einstellbare Rundengröße: 5, 10 oder 20 Aufgaben.
- Einstellbares Tagesziel: 5, 10, 15, 20 oder 30 Aufgaben. Das Tagesziel motiviert, ist aber kein Zeitlimit.
- Optional: Zehnerübergang mit/ohne Einschränkung; Division mit Rest (Antwort z. B. „3 R 2“); negative Ergebnisse; Dezimalzahlen mit einer Nachkommastelle; Klammeraufgaben. Die Beschreibung der Schwierigkeitsstufe passt sich den aktivierten Optionen an.
- Vor jeder Runde erscheint „Runde starten“. Erst danach startet die Zeitmessung für die erste Aufgabe.
- Bei Wechsel zu einer anderen App/im Hintergrund wird die aktive Aufgabenzeit pausiert. Aufgabenzeiten werden bei fünf Minuten gedeckelt.
- Hinweise, verständliche Rückmeldungen, Sterne und Fehlerwiederholung.

FORTSCHRITT UND SICHERUNG
- „Dein Fortschritt“ umfasst Trefferquote, Zeit pro Aufgabe, Verlauf, Wochenvergleich, Fortschritt nach Schwierigkeitsgrad und persönliche Übungsvorschläge.
- Die letzten passenden Runden werden seitenweise angezeigt; die Summe berücksichtigt alle passenden gespeicherten Verlaufsrunden (maximal 1.500).
- Das Tagesziel zählt erste Antworten, keine Wiederholungen. Die Trefferquote im Fortschritt misst ebenfalls die erste Antwort; Wiederholungen werden separat gezeigt.
- Über „Sicherung exportieren“ wird eine JSON-Datei mit Lernfortschritt und Einstellungen heruntergeladen. Über „Sicherung importieren“ lässt sie sich auf diesem Gerät wiederherstellen. Der Import ersetzt nach Bestätigung die lokalen Daten.
- „Zurücksetzen“ löscht die lokale Lernstatistik und die Empfehlungen, nicht aber die Übungseinstellungen.
- Ein dunkles Farbschema lässt sich über das Mond-/Sonnensymbol umschalten.

DATENSCHUTZ
- Keine Anmeldung, keine Werbung, kein Backend und keine Cloud-Synchronisierung.
- Lernfortschritt und Einstellungen bleiben in localStorage auf dem jeweiligen Gerät und der jeweiligen Website-Adresse.
- Beim Löschen der Website-Daten kann der Lernstand verloren gehen. Exportiere deshalb gelegentlich eine Sicherungsdatei.
- Beim ersten Öffnen über HTTPS wird die App für die Offline-Nutzung zwischengespeichert. Nach Updates kann es nötig sein, die App einmal online neu zu öffnen.

PROJEKTSTRUKTUR
- index.html: Seitenstruktur
- styles.css: Darstellung, responsive Tablet-Bedienung und dunkles Farbschema
- app.js: Aufgaben-, Lern-, Zeitmessungs-, Statistik- und Sicherungslogik
- sw.js: Offline-Cache (bei Releases Cache-Version erhöhen)
- manifest.json und icons/: Installation auf dem Home-Bildschirm

Hinweis Division mit Rest:
Bei Aufgaben mit Rest erscheint unter dem Antwortfeld ein Tipp. Gib die Antwort als Quotient, R, Rest ein, z. B. 3 R 2.
