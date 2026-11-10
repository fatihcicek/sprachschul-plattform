# BAMF-Anforderungen an die Plattform

Stand der Recherche: 10.11.2026. Keine Rechtsberatung. Die Quellen sind Trägerrundschreiben (TRS) aus 2020 bis 2026; welche Fassung aktuell gilt, ist je Punkt vermerkt. Vor einem Pilotbetrieb muss ein Träger oder das BAMF diese Liste bestätigen.

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

## Offene Fragen

1. Die BAMF-Leitlinien für digitales Lehren und Lernen (22.02.2023) konnten nicht gelesen werden. Sie sind vermutlich die maßgebliche aktuelle Fassung für A1 bis A7.
2. Wie wird Teilanwesenheit abgerechnet (pro UE, pro Tag, ab welcher Dauer)? Der Schwellenwert in `proposeStatus()` ist eine Arbeitsannahme.
3. Welche Tagesgrenzen gelten für Integrationskurse und für Sonderfälle wie akademische Heilberufe?
4. Welches Format muss ein Einwahlprotokoll bei einer Vor-Ort-Kontrolle haben?
5. Technische Spezifikation der BerD-Schnittstelle (QuickStart Manual auf bamf.de) und Ablauf der Abnahme für neue Dienstleister.

## Quellen

- BSK-Newsletter 11.03.2021: https://www.bamf.de/SharedDocs/Newsletter-BSK/DE/2021/_documents/2102-newsletter-bsk-meldung-00-allgemeines.html?nn=578398
- Anlage 2 zu TRS Integrationskurse 22/22: https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/Integrationskurse/Kurstraeger/Traegerrundschreiben/Anlagen/2022/traegerrundschreiben-20221230-22-anlage2.pdf?__blob=publicationFile&v=1
- Anlage 2 zu TRS Berufssprachkurse 06/22: https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/Berufsbezsprachf-ESF-BAMF/BSK-Rundschreiben/2022/220324-traegerrundschreiben-06-22-anl-2.pdf?__blob=publicationFile&v=4
- Anlage 2 zu TRS Integrationskurse 26/20: https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/Integrationskurse/Kurstraeger/Traegerrundschreiben/Anlagen/2020/traegerrundschreiben-20201218-26-anl-2.pdf?__blob=publicationFile&v=3
- TRS BSK 05/26, Anlage 1: https://www.bagarbeit.de/wp-content/uploads/2026/03/TRS-BSK_05-26_Anlage-1_Hinweise-zur-Anbindung-an-die-Kurstraegerdienstleister-Schnittstelle.pdf
