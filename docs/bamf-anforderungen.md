# BAMF-Anforderungen an die Plattform

Stand der Recherche: 10.11.2026 (ergänzt am selben Tag um die Recherche aus dem Bericht „BAMF-Software-Anforderungen-Recherche-2026-11-10“, siehe Abschnitt „Ergänzung“). Keine Rechtsberatung. Die Quellen sind Trägerrundschreiben (TRS) aus 2020 bis 2026; welche Fassung aktuell gilt, ist je Punkt vermerkt. Vor einem Pilotbetrieb muss ein Träger oder das BAMF diese Liste bestätigen.

## Anforderungen

| Nr. | Anforderung | Quelle | Umsetzung | Status |
| --- | --- | --- | --- | --- |
| A1 | Einwahlprotokolle müssen fälschungssicher sein: nur automatisiert vom System ausgelesene Dateien, kein nachträglicher Import in bearbeitbare Formate | BSK-Newsletter 11.03.2021; Anlage 2 zu TRS IK 22/22 | `connection_events` wird nur vom System geschrieben; Ändern und Löschen sperrt die Datenbank | Umgesetzt (Datenebene), Export fehlt |
| A2 | Protokoll identifiziert Teilnehmende und Lehrkraft mit Klarnamen in lateinischer Schrift | BSK-Newsletter 11.03.2021 | Ereignisse hängen an Personen mit Vor- und Nachname | Teilweise: Einwahl der Lehrkraft wird noch nicht erfasst |
| A3 | Protokoll erfasst Datum und Zeitpunkt des Ein- und Ausloggens exakt | BSK-Newsletter 11.03.2021 | `occurred_at` je JOIN/LEAVE | Umgesetzt |
| A4 | Aufbewahrung der Einwahlprotokolle fünf Jahre, elektronisch beim Träger, für unangekündigte Vor-Ort-Kontrollen | Anlage 2 zu TRS IK 22/22 | Protokolle sind nicht löschbar | Offen: Lösch- und Aufbewahrungskonzept (DSGVO) |
| A5 | Höchstens 4 UE pro Tag im virtuellen Klassenzimmer, bei einem virtuellen Kurstag pro Woche 5 UE (Berufssprachkurse) | Anlage 2 zu TRS BSK 06/22 | `findVirtualUeViolations()` | Umgesetzt als Prüfung, Regel nicht gegen aktuelle Fassung geprüft |
| A6 | Ausdrückliche Einwilligung aller Teilnehmenden für Bildaufnahmen und Übermittlung ans BAMF, beim Träger vorzuhalten | Anlage 2 zu TRS IK 26/20 | noch nichts | Offen |
| A7 | Einführungsveranstaltung vor Beginn des virtuellen Unterrichts, zählt nicht als Unterrichtszeit | Anlage 2 zu TRS IK 26/20 | noch nichts | Offen |
| A8 | Anbindung an BerD (Anwesenheiten Teilnehmende und Lehrpersonal, Teilnehmendendaten aus der Kursmeldung) nur mit vom BAMF abgenommener Software; Nutzung freiwillig | TRS BSK 05/26 mit Anlage 1 | noch nichts | Offen: Abnahmeverfahren beim BAMF anfragen |
| A9 | Zusätzliche Online-Zulassung der Schule für virtuellen Unterricht: Schule verpflichtet sich zur Umsetzung, Einzelbelege werden bei Antrag grundsätzlich nicht verlangt; das BAMF kontrolliert danach, bei Verstößen bis zum Widerruf (gilt für IK und BSK) | BAMF-Leitlinien, S. 34; Online-Zulassungsantrag, S. 2–3; IK- und BSK-Verfahren Jan. 2026 | Plattform muss prüffähige Nachweise liefern (Anwesenheit, Signaturen, Technik, Datenschutz) | Offen |
| A10 | Signaturliste bleibt auch bei Online-Unterricht ergänzend zu Einwahlprotokollen bzw. zulässigen Ersatznachweisen erforderlich; aktualisiert am 02.11.2026. Vorlage unterscheidet u. a. Online-Anwesenheit, entschuldigte Abwesenheit, Kurswechsel. Ein einfaches anwesend/abwesend genügt nicht | BAMF-Änderungserläuterung, aktuelle Excel-Vorlage (IK-Signaturliste) | Anwesenheitsstatus und Export müssen diese Fälle abbilden | Offen: Statusmodell und Export prüfen |
| A11 | IK und BSK sind getrennte Abläufe mit eigenen Vorgaben | Recherche 10.11.2026 | getrennte Abläufe nötig | Offen |
| A12 | InGe Online (Integrationskurse): eigenes Anschlussverfahren mit Freigabebescheinigung; Webmasken oder Webservices; aktuelle technische Unterlagen öffentlich nicht einsehbar | BAMF-Folgezulassungsformular, S. 1 | noch nichts | Offen: Unterlagen und Testumfang beim BAMF anfordern |
| A13 | Offizielle Prüfungen und digitale Einstufungstests/DTB: gesonderte Regeln für Prüfungsstellen und Prüfungssysteme | Recherchebericht 10.11.2026 | nicht geplant | Offen, Details im Bericht |

## Offene Fragen

1. Die BAMF-Leitlinien für digitales Lehren und Lernen (22.02.2023) konnten nicht gelesen werden. Sie sind vermutlich die maßgebliche aktuelle Fassung für A1 bis A7. Die neue Recherche zitiert sie (S. 34) für A9; Inhalt der übrigen Stellen noch gegen den Wortlaut prüfen.
2. Wie wird Teilanwesenheit abgerechnet (pro UE, pro Tag, ab welcher Dauer)? Der Schwellenwert in `proposeStatus()` ist eine Arbeitsannahme.
3. Welche Tagesgrenzen gelten für Integrationskurse und für Sonderfälle wie akademische Heilberufe?
4. Welches Format muss ein Einwahlprotokoll bei einer Vor-Ort-Kontrolle haben?
5. Technische Spezifikation der BerD-Schnittstelle (QuickStart Manual auf bamf.de) und Ablauf der Abnahme für neue Dienstleister (siehe Ergänzung: Testzugang, Implementierung, dokumentierte Fälle, Abnahme).
6. Nicht öffentlich zugängliche Zusatzanforderungen des BAMF; eine Anfrage an das BAMF ist noch nicht versendet.
7. Voller Testumfang von InGe Online (A12).

## Quellen

- BSK-Newsletter 11.03.2021: https://www.bamf.de/SharedDocs/Newsletter-BSK/DE/2021/_documents/2102-newsletter-bsk-meldung-00-allgemeines.html?nn=578398
- Anlage 2 zu TRS Integrationskurse 22/22: https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/Integrationskurse/Kurstraeger/Traegerrundschreiben/Anlagen/2022/traegerrundschreiben-20221230-22-anlage2.pdf?__blob=publicationFile&v=1
- Anlage 2 zu TRS Berufssprachkurse 06/22: https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/Berufsbezsprachf-ESF-BAMF/BSK-Rundschreiben/2022/220324-traegerrundschreiben-06-22-anl-2.pdf?__blob=publicationFile&v=4
- Anlage 2 zu TRS Integrationskurse 26/20: https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/Integrationskurse/Kurstraeger/Traegerrundschreiben/Anlagen/2020/traegerrundschreiben-20201218-26-anl-2.pdf?__blob=publicationFile&v=3
- TRS BSK 05/26, Anlage 1: https://www.bagarbeit.de/wp-content/uploads/2026/03/TRS-BSK_05-26_Anlage-1_Hinweise-zur-Anbindung-an-die-Kurstraegerdienstleister-Schnittstelle.pdf

## Ergänzung: Recherche vom 10.11.2026

Aus dem Recherchebericht (Fatih/Codex, 10.11.2026). Der Bericht selbst liegt in Notion und ist für uns ohne Anmeldung nicht lesbar; die Punkte unten stammen aus der Zusammenfassung davon und sind von uns nicht gegen die Primärquellen geprüft.

**Zulassung.** Eine allgemeine BAMF-Produktzulassung für Schulverwaltungssoftware oder Lernmanagementsysteme wurde nicht gefunden. Konkrete Freigaben gibt es nur für: virtuellen Unterricht (zusätzliche Online-Zulassung der Schule, A9), direkte BerD-Anbindung für Berufssprachkurse (technische und fachliche Abnahme, A8), InGe Online für Integrationskurse (Anschlussverfahren, A12), offizielle Prüfungen (A13).

**Folge für Werbung und Aussagen:** Nie „BAMF-zertifiziert“ oder „BAMF-konform“ ohne Angabe von Schnittstelle, Funktion und Version. Den heutigen Entwicklungsstand nicht als insgesamt BAMF-konform bewerben.

**Softwarewahl.** Schulen dürfen Videokonferenzsysteme frei wählen (mehrere möglich, im Online-Zulassungsantrag namentlich anzugeben, Änderungen dem BAMF melden). Ein LMS ist dort optional. Schulen müssen also nicht Seconos verwenden.

**BerD.** Die Schnittstelle ist freiwillig, setzt aber ein vom BAMF abgenommenes System voraus. Die Abnahme erfolgt zwischen BAMF und Dienstleister und wird für dieselbe Lösung nicht je Schule wiederholt; eigene Zugänge der Träger bzw. Standorte bleiben nötig. Weg: Testzugang erhalten, Schnittstelle implementieren, vorgegebene Fälle dokumentieren, abnehmen lassen. Kontakt laut Veröffentlichung: support@bamf.bund.de, Betreff „BerD IT-Dienstleisterschnittstelle – Anbindungswunsch“.

**Konsequenzen für die Entwicklung (Reihenfolge noch mit Fatih abzustimmen):**
1. Anwesenheitsmodell an die Signaturlisten-Vorlage vom 02.11.2026 anpassen (Online-Anwesenheit, entschuldigt, Kurswechsel) und Export bauen (A10).
2. IK- und BSK-Abläufe trennen (A11).
3. Nachweise, Datenschutz- und Sicherheitsunterlagen für die Online-Zulassung der Schulen vorbereiten (A9).
4. Vor echtem BAMF-Betrieb: Schnittstellenfreigaben (BerD, InGe) einholen; BAMF-Anfrage formulieren, aber nicht ohne Fatihs Freigabe versenden.
5. BAMF-Funktionen bleiben ein optionaler Teil der Plattform (Schalter je Schule, geplant).

## Weitere Quellen (Recherche 10.11.2026)

- BAMF-Leitlinien für digitales Lehren und Lernen, S. 34 (A9)
- Online-Zulassungsantrag, S. 2–3 (A9)
- IK- und BSK-Verfahren zur zusätzlichen Online-Zulassung, Stand Januar 2026 (A9)
- BAMF-Anbindungshinweise und BAMF-Testanleitung zur BerD-Schnittstelle (A8)
- BAMF-Folgezulassungsformular, S. 1 (A12)
- BAMF-Änderungserläuterung und aktuelle Excel-Vorlage zur IK-Signaturliste, 02.11.2026 (A10)
