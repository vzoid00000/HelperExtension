# OSDP – Verbindliches Handbuch zur Tagvergabe für Newsartikel

**Stand:** 8. Oktober 2026  
**Version:** 1.0 (Grundregeln + kombinierter HTML-Tagbestand)  
**Zweck:** konsequente, systematische und unter verschiedenen Artikeln konsistente Vergabe ausschließlich vorhandener Dashboard-Tags.

> **Wichtig zur Datenqualität:** Dieses Dokument enthält die vollständig **sichtbaren** Tag-Namen und ihre Hierarchie aus zwei HTML-Exporten. Die im HTML enthaltenen Tooltip-Attribute (`ng-reflect-message`) sind **ausnahmslos auf 30 Zeichen abgeschnitten**. Im Katalog wird für **jeden** der 673 Tags der tatsächlich vorhandene **Originalausschnitt** dokumentiert; vollständige Tooltip-Definitionen lassen sich daraus nicht rekonstruieren. Die nachstehenden redaktionellen Regeln sind von den unvollständigen Original-Tooltips klar zu unterscheiden. **Es werden keine Tooltip-Texte erfunden oder stillschweigend vervollständigt.**

## 1. Quellen, Reichweite und Rangfolge

- **Redaktionelle Vorgaben:** die vom Auftraggeber im Gespräch festgelegten Regeln und Beispiele. Sie sind für die Tagvergabe maßgeblich, auch wenn im Dashboard weitere, redaktionell ausgeschlossene Tags existieren.
- **HTML-Export 1:** `Eingefügter Text(1).txt`; liefert den ausführlichen Baum für Struktur, Cyber, KriMiSi, InnoTech, Allgemeine Tags, Newsinfo (außer ergänzter Geografie) und Auftragstags.
- **HTML-Export 2:** `Eingefügter Text(2).txt`; ersetzt den Teilbaum `Newsinfo → geographische Lokationen` durch den aufgeklappten Länderkatalog.
- **Bestand:** 673 eindeutige Tag-Pfade, davon 293 innerhalb der geografischen Lokationen. Ein Name an anderer Baumposition ist nicht automatisch derselbe Tag: Entscheidend ist immer der **vollständige Pfad**.
- **Keine freien Tags:** Es dürfen nur Bezeichnungen aus dem Katalog verwendet werden. Beispiel: `Bitcoin` ist im Katalog kein eigenes Tag; dafür ist `Cyber → Kryptographie → Blockchain → Kryptowährung` vorhanden.
- **Original-Tooltip-Ausschnitte:** stehen unter Abschnitt 12 hinter jedem Tag. `\t` steht dort für einen originalen Tabulator im HTML-Attribut; die Ausschnitte sind jeweils 30 Zeichen lang.

## 2. Pflicht-Tags bei **jedem** Newsartikel

1. **Genau ein Struktur-Tag** aus `Struktur → [S]1 Cyber`, `Struktur → [S]2 KriMiSi` oder – soweit inhaltlich zutreffend, siehe offene Frage – `Struktur → [S]3 InnoTech`. **Nie zwei gleichzeitig**; den bloßen Kategorie-Überpunkt `Struktur` nicht zusätzlich verwenden.
2. **Immer:** `Newsinfo → Dokumententyp → News`.
3. **Immer einen passenden Quellentyp:** `Newsinfo → Quellentyp → ...`; meistens `Nachrichtenseite`, sofern es tatsächlich ein redaktionelles Nachrichtenmedium ist. Andere Quellentypen sind bei Behörde, Unternehmen, Blog, Fachzeitschrift usw. zu verwenden, nicht allein wegen des textlichen Stils „Nachrichtenseite“.
4. **Immer mindestens eine sachlich passende geografische Zuordnung** unter `Newsinfo → geographische Lokationen`, nötigenfalls `kein Standort` bei wirklich nicht lokalisierbarem Inhalt. Länder/Regionen nur auswählen, wenn sie für den Gegenstand, den Ort des Ereignisses, die unmittelbar Beteiligten oder die direkten Auswirkungen relevant sind.
5. **Alle weiteren inhaltlich zutreffenden Tags** aus Cyber, KriMiSi, InnoTech und Allgemeinen Tags ergänzen, unabhängig vom gewählten Struktur-Tag; nicht pauschal übertaggen.
6. **Auftragstags nur nach den Sonderregeln** in Abschnitt 7; ein WB-Auftragstag ist **nicht** bei jedem Artikel obligatorisch.

## 3. Entscheidungsprozess für konsistentes Tagging

1. **Artikel lesen:** Was ist geschehen? Wer ist betroffen? Welche Technik/Methode und welche Folgen sind belegt? Welcher Zeitraum/Ort und welche Quelle?
2. **Schwerpunkt bestimmen:** Nur **einen** Struktur-Tag vergeben. Ein militärisches Umfeld macht einen technisch-zentrierten Cyberangriff nicht automatisch zum KriMiSi-Schwerpunkt und umgekehrt.
3. **Pflichtfelder festlegen:** News, Quellentyp, geografische Lokationen.
4. **Inhaltliche Themen zuordnen:** Gefahrenart, eingesetzte Technologie, militärischer/sicherheitspolitischer Sachverhalt, Akteure, Rechts- oder Gesellschaftsaspekte, sofern relevant.
5. **Hierarchie anwenden:** passenden **spezifischen Untertag bevorzugen**. Existiert kein zutreffender Untertag, fachlich zutreffenden **Übertag** nehmen. Über- und Untertag nur in einer **inhaltlich begründeten Ausnahme** gemeinsam auswählen.
6. **KI-Sonderregel prüfen:** Wenn KI tatsächlich Thema des Artikels ist, stets zusätzlich `Auftragstags → HSC → HSC-KI → [KI_]Tools und Usecases`.
7. **WB-Relevanz prüfen:** Eine besonders wichtige Nachricht bekommt im Ermessen `WB-Cyber` oder `WB-KriMiSi`, sonst keinen WB-Tag.
8. **Ausschlüsse kontrollieren:** niemals verbotene Kategorien aus Abschnitt 8 oder sonstige ausgeschlossene Auftragstags auswählen.
9. **Qualität sichern:** Exaktheit der Namen, genau eine Struktur, alle Pflichtfelder, korrekte geografische Reichweite, keine unbegründeten Doppeltags, keine erfundenen Tags oder Fakten.

## 4. Struktur: **genau eine** Auswahl

- `Struktur → [S]1 Cyber`: Der Kern des Artikels ist ein Cybervorfall, eine digitale Bedrohung, Informationssicherheit, technische Cyberabwehr oder ein thematisch Cyber-zentriertes Ereignis. Militärische oder politische Aspekte dürfen als zusätzliche **thematische** Tags auftauchen.
- `Struktur → [S]2 KriMiSi`: Der Kern liegt auf Krisen, Konflikten, Militär, Sicherheit, Verteidigung oder entsprechendem strategischem/politischem Geschehen. Cyberaspekte dürfen als weitere **thematische** Tags auftauchen.
- `Struktur → [S]3 InnoTech`: Diese dritte auswählbare Struktur existiert im HTML. Der genaue redaktionelle Einsatz im Verhältnis zu den beiden anderen **ist noch nicht ausdrücklich geklärt**. Bis zur Klärung bei eigenständigen Innovationsmeldungen als mögliche Struktur berücksichtigen; jedenfalls **niemals parallel** zu einer anderen Struktur auswählen.

**Abgrenzung:** Ein Cyberangriff auf ein militärisches Ziel kann Struktur Cyber und zusätzlich KriMiSi-Tags haben; eine sicherheitspolitische Entscheidung über Cyberstreitkräfte kann Struktur KriMiSi und zusätzlich Cyber-Tags haben. Maßgeblich ist jeweils der **berichtete Schwerpunkt**, nicht ein Schlüsselwort oder die bloße Erwähnung.

## 5. Über- und Untertags: Grundregel plus Ausnahme

**Normalfall (Priorität):**

1. Wenn der **spezifische Untertag passt**, diesen wählen und den zugehörigen Übertag normalerweise **nicht** noch einmal setzen.
2. Wenn sich der Sachverhalt eindeutig auf einen Themenbereich bezieht, aber **kein Untertag passt**, den **passenden Übertag** setzen; die Information darf nicht verloren gehen.
3. **Seltene Ausnahme:** Über- **und** Untertag, wenn beide aufgrund des eigentlichen Artikelinhalts eine gesonderte Aussage tragen. Nicht allein wegen einer mathematischen Ober-/Unterordnung automatisch beide setzen.
4. Über **verschiedene** Themenbereiche hinweg dürfen alle unabhängig passenden Tags kombiniert werden.

**Beispiel Schadsoftware / RAT:** Ein Remote-Access-Trojaner ist Schadsoftware. Unter `Cyber → Cyberangriff → Schadsoftware` gibt es `Computervirus`, `Ransomware`, `Spyware`, aber **keinen allgemeinen „Trojaner“- oder „RAT“-Tag**. Deshalb **`Schadsoftware`** statt eines unzutreffenden speziellen Untertags setzen. `Cyberangriff` nur zusätzlich, wenn der Sachverhalt dies eigenständig begründet.

**Beispiel Blockchain/Kryptowährung:** Wird Bitcoin als Zahlungsmittel bei einer Erpressung erwähnt und Chainalysis untersucht die Blockchain-Transaktionsspuren als wesentlichen Teil der Geschichte, können **`Blockchain` und `Kryptowährung` gemeinsam** sinnvoll sein. Ist nur die konkrete Kryptowährung relevant, genügt normalerweise `Kryptowährung`. Einen Tag `Bitcoin` oder `Chainalysis` **nicht erfinden**.

**Keine mechanische Vollvererbung:** Die Auswahl eines Untertags bedeutet für die **Ausgabe** nicht, dass sämtliche Vorfahren zusätzlich einzeln zu setzen sind. Die Pfadangabe dient der Orientierung in der UI; sie ist nicht mit der zu klickenden Tagliste gleichzusetzen.

## 6. Geografische Lokationen

- **Pflicht:** geografischer Bezug muss bei jedem Artikel gekennzeichnet sein.
- **Priorität:** die **unmittelbar relevanten Länder oder Regionen**. Beteiligung kann Ereignisort, direkt beteiligter Staat, angegriffener Staat, zentral handelnder Staat oder ausdrücklich betroffener Staat sein.
- Eine bloße Erwähnung, die Nationalität einer unbeteiligten Person, der Sitz eines Mediums oder eines zufällig genannten Unternehmens rechtfertigt **nicht automatisch** ein weiteres Länder-Tag.
- **Mehr als ca. fünf/sechs Länder:** `Global` in Betracht ziehen, aber **nicht automatisch** verwenden. Entscheidend ist die reale Reichweite und der regionale Zusammenhang.
- **Regionaler Mehrstaatenfall:** Ein Beschluss zu Nahost mit beispielsweise sieben arabischen Staaten sowie USA und Russland bleibt in erster Linie eine **regionale Entwicklung mit konkreten Beteiligten**; relevante Staaten/regionale Tags wählen, **nicht** allein wegen der Anzahl `Global`.
- **Wirklich weltweite Betroffenheit:** `Global` verwenden, wenn die Entwicklung die Welt insgesamt oder zahlreiche Regionen ohne sinnvolle lokale Eingrenzung betrifft.
- **Kontinent/Region vs. Staat:** nach fachlicher Aussagekraft; spezifische Länder bevorzugen, bei regionalem Schwerpunkt kann ein übergeordneter Gebietstag sinnvoller sein. Eine Region oder ein Meer nur setzen, wenn inhaltlich betroffen; nicht als dekorative Ergänzung.
- **Sonderfälle:** eigene vorhandene Tags für `Nicht/Eingeschränkt anerkannt` (z. B. Taiwan, Kosovo, Palästina), Überseegebiete, Welt-/Randmeere, Arktis, Antarktis, Weltraum, Luftraum und Hoheitsgewässer können je nach Artikel passend sein. Die **Tag-Namen** aus dem Dashboard übernehmen, ohne durch die Zuordnung eine völkerrechtliche Aussage zu behaupten.
- `kein Standort` ist nur die sachlich begründete Rückfalloption, wenn überhaupt keine geografische Zuordnung möglich ist; **nicht** zusammen mit klaren Länder- oder globalen Bezügen verwenden.

## 7. Auftragstags, KI und wöchentliche Berichte

### 7.1 WB-Tags

- Es gibt pro Woche einen Cyber- und einen KriMiSi-Bericht. Für **besonders wichtige** Nachrichten nach redaktionellem Ermessen darf **`Auftragstags → WB-Cyber`** beziehungsweise **`Auftragstags → WB-KriMiSi`** ausgewählt werden.
- **WB-Cyber ausschließlich als übergeordneter Tag**: keine Untertags `[WB-C]1 Cyber International`, `[WB-C]2 Cyber Österreich`, `[WB-C]3 Cyberinnovationen International`, `[WB-C]4 Cyberinnovationen Österreich`.
- Bei den WB-Tags geht es um **Relevanz für den Wochenbericht**, nicht um eine Pflicht, alle Artikel aufzunehmen. Regelmäßig relevant können z. B. größere Cyberkampagnen, Vorfälle mit strategischen Folgen, entscheidende Sicherheitsänderungen, große Konflikteskalationen und bedeutende militärische Maßnahmen sein. Dies sind **redaktionelle Orientierungskriterien**, keine vom HTML definierten Schwellenwerte.
- **Andere Auftragstags nicht benutzen**, insbesondere nicht `WB-InnoTech`, `HET-EU Verteidigungspolitik`, allgemeine `HSC`-Tags oder entsprechende Länder-Ö-Tags.

### 7.2 **Verpflichtende KI-Ausnahme**

- **Immer wenn KI ein Thema des Artikels ist** (KI-Entwicklung, KI-Einsatz, KI-Risiko, KI-Tool oder KI-Usecase), **zusätzlich** den exakten Tag `Auftragstags → HSC → HSC-KI → [KI_]Tools und Usecases` setzen.
- Diese Pflicht gilt **auch**, wenn die Meldung als Struktur Cyber oder KriMiSi eingestuft wird, und neben ggf. `Cyber → Künstliche Intelligenz` oder InnoTech-Tags.
- Andere HSC-KI-Untertags (`[KI_]Grundlagendokument`, `[KI_]Ausbildung`) **nicht** verwenden, sofern keine neue ausdrückliche Regel vereinbart wird.
- Der KI-Sondertag ist die **einzige zusätzlich festgelegte Ausnahme** von der sonstigen Beschränkung auf die beiden WB-Auftragstags.
- Eine bloß beiläufige Nennung von KI ohne sachlichen KI-Themenbezug ist kein Grund, den Artikel künstlich zum KI-Artikel zu machen.

## 8. Niemals zu vergebende Tagbereiche

Folgende vorhandene Dashboard-Zweige **einschließlich aller Untertags** sind ausdrücklich ausgeschlossen:

- `Newsinfo → zeitlicher Aspekt`
- `Newsinfo → Informationsverschmutzung`
- `Newsinfo → Social Media Post`

**Achtung:** Der Ausschluss des Metadatenzweigs `Informationsverschmutzung` verbietet **nicht** thematisch anders eingeordnete vorhandene Tags wie `KriMiSi → Krisen & Konflikte → Informationskrieg`, falls der Inhalt tatsächlich passt. Dasselbe gilt für allgemeine Social-Media-Themen-Tags: Der ausgeschlossene Zweig heißt **`Newsinfo → Social Media Post`**, nicht jede Erwähnung sozialer Medien.

Im Bereich `Auftragstags` sind ausschließlich **`WB-Cyber`, `WB-KriMiSi` und der verpflichtende KI-Sondertag `[KI_]Tools und Usecases`** zugelassen. Alle anderen Auftragstags bleiben im Referenzkatalog sichtbar, werden jedoch **nicht vergeben**.

## 9. InnoTech: enges redaktionelles Kriterium

- InnoTech bedeutet *Innovational Technology* und soll nur bei **wirklich bedeutsamen** neuen Technologien, Innovationen oder Entwicklungen mit **relevantem militärischem oder Cyber-Nutzen** verwendet werden.
- Keine automatische Vergabe für gewöhnliche Produktzyklen, beispielsweise einen neuen Laptop, ein kleines Software-Update oder andere technisch alltägliche Meldungen.
- Die Kategorien `Cyber`, `KriMiSi`, `InnoTech`, `Allgemeine Tags` können bei sachlichem Bezug **nebeneinander** genutzt werden. Nur die **Struktur** bleibt exklusiv.
- Die vorhandenen Kategorien `InnoTech → Technologie` oder `Forschung & Entwicklung` sind keine Aufforderung, jeden technologischen Bezug als Innovation zu taggen.

## 10. Beispielentscheidungen

| Inhalt | Typische Tagentscheidung | Abgrenzung |
|---|---|---|
| RAT kompromittiert Systeme | `Cyber → Cyberangriff → Schadsoftware` (als zu klickender Tag: `Schadsoftware`); ergänzende Tags nach Belegen | kein erfundener RAT-/Trojaner-Tag, nicht fälschlich `Computervirus` oder `Spyware` |
| Ransomware-Angriff | `Cyber → Cyberangriff → Schadsoftware → Ransomware` | `Schadsoftware` zusätzlich nur bei eigens begründetem Mehrwert |
| Erpressung mit Bitcoin und Chainalysis-Analyse | `Blockchain` + `Kryptowährung` **können** beide passend sein | Dual-Tagging ist begründete Ausnahme, kein neuer `Bitcoin`-Tag |
| Militärisches Cyberereignis | eine Struktur nach Schwerpunkt, dazu passende Cyber- und Militär-Tags | nicht beide Struktur-Tags |
| Wesentliche KI-Anwendung | neben fachlichen Tags **immer** `[KI_]Tools und Usecases` | kein `HSC`-Obertag als Auftrags-Duplikat |
| Sieben Staaten einer Nahost-Region + USA/Russland | relevante Länder/Regionen | nicht aufgrund der Anzahl automatisch `Global` |
| weltweite, geografisch nicht sinnvoll eingrenzbare Entwicklung | `Global` | `Global` ist eine inhaltliche Bedeutung, keine reine Zählregel |
| gewöhnliche neue Hardware ohne wesentlichen Sprung | i. d. R. **kein** InnoTech-Tag | Alltagsneuheit ist keine relevante Innovation |

Diese Beispiele sind **Regelillustrationen**, keine automatisch zu kopierenden vollständigen Taglisten; jeder echte Artikel wird anhand seiner konkreten Aussagen bewertet.

## 11. Ausgabeformat für künftige Artikel und Qualitätsprüfung

**Empfohlene kompakte Ausgabe je Artikel:**

```text
Artikel: [Titel / Link / Datum / Medium]
Struktur (genau 1): [exakter Tagname]
Newsinfo – Dokumententyp: News
Newsinfo – Quellentyp: [exakter Tagname]
Newsinfo – geografische Lokationen: [Land/Region(en) bzw. Global/kein Standort]
Cyber: [nur tatsächlich zu klickende Tagnamen]
KriMiSi: [nur tatsächlich zu klickende Tagnamen]
InnoTech: [nur tatsächlich zu klickende Tagnamen]
Allgemeine Tags: [nur tatsächlich zu klickende Tagnamen]
Auftragstags: [WB-Cyber oder WB-KriMiSi, falls wichtig; plus [KI_]Tools und Usecases bei KI-Thema]
Begründung: [nur bei Grenzfällen, Doppelvergabe oder WB-Relevanz]
```

**Checkliste:**

- [ ] Genau **ein** Struktur-Tag, niemals Oberpunkt „Struktur“ als zusätzlicher Klick
- [ ] `News` ausgewählt
- [ ] Quellentyp aufgrund der **tatsächlichen Quelle** gewählt
- [ ] Mindestens ein sachlich begründeter geografischer Tag vorhanden
- [ ] Sämtliche thematisch bedeutsamen Aspekte berücksichtigt, nicht bloß Schlüsselwörter
- [ ] Untertag gewählt, wenn er exakt passt; ansonsten geeigneter Übertag
- [ ] Über- und Untertag nur ausnahmsweise zusammen und mit Mehrwert
- [ ] KI-Sondertag bei KI-Thema gesetzt
- [ ] WB-Cyber / WB-KriMiSi nur bei entsprechender Bedeutung; keine weiteren WB-Untertags
- [ ] Ausgeschlossene Newsinfo-Zweige und Auftragstags ausgeschlossen
- [ ] Keine frei erfundenen Tags, Titel oder Tatsachen

## 11a. Noch ausdrücklich zu klärende Punkte

1. **Struktur `[S]3 InnoTech`:** Die UI bietet sie an; ursprünglich wurde die Struktur als Cyber-vs.-KriMiSi-Auswahl erklärt. Soll die dritte Auswahl für innovationszentrierte Artikel **eigenständig** verwendet werden? Bis zur Klärung offen dokumentieren, nicht stillschweigend eine neue zwingende Regel behaupten.
2. **Vollständige Tooltips:** Die übermittelten HTML-Dateien enthalten nur 30 Zeichen pro `ng-reflect-message`. Ein vollständiger Tooltip-Export oder die ursprüngliche Tagdatenquelle würde die exakten Detaildefinitionen ergänzen. Solange diese fehlen, **nie behaupten**, die abgeschnittene Zeichenfolge sei die vollständige Beschreibung.
3. **Grenzfälle:** Bei unklarer inhaltlicher Bedeutung eines Tags kann der Auftraggeber um die vollständige Tooltip-Definition dieses spezifischen Tags gebeten werden; die übrigen Regeln gelten unverändert.

## 12. Vollständiger Tag-Katalog mit HTML-Tooltip-Ausschnitten

**Leseschlüssel:** Jedes Listenelement ist ein **existierender auswählbarer Tag**. Die Einrückung zeigt seine Verschachtelung. Hinter `HTML-Tooltip (30 Z.)` steht der **wortgetreue, aber abgeschnittene** Attributwert mit als `\t` sichtbaren Tabulatoren. **Keine** der folgenden Zeilen darf als vollständiger Tooltip interpretiert werden. Auch **nicht erlaubte** Tags sind aus Gründen der Vollständigkeit aufgeführt; die Verbote aus Abschnitt 8 bleiben bestehen.

### 12.1 `Struktur`

- `Struktur` — HTML-Tooltip (30 Z.): `Tags\tStruktur | NUR EINEN! UID`
  - `[S]1 Cyber` **[SIEHE PFLICHT-/SONDERREGEL]** — HTML-Tooltip (30 Z.): `Tags\tStruktur\t[S]1 Cyber | NUR`
  - `[S]2 KriMiSi` **[SIEHE PFLICHT-/SONDERREGEL]** — HTML-Tooltip (30 Z.): `Tags\tStruktur\t[S]2 KriMiSi | N`
  - `[S]3 InnoTech` **[SIEHE PFLICHT-/SONDERREGEL]** — HTML-Tooltip (30 Z.): `Tags\tStruktur\t[S]3 InnoTech | `

### 12.2 `Cyber`

- `Cyber` — HTML-Tooltip (30 Z.): `Tags\tCyber | Auf Datenebene ve`
  - `Big Data` — HTML-Tooltip (30 Z.): `Tags\tCyber\tBig Data | Datenmen`
  - `Cloud` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCloud | Rechnerverb`
  - `Datenschutz` — HTML-Tooltip (30 Z.): `Tags\tCyber\tDatenschutz | Je na`
  - `IoT` — HTML-Tooltip (30 Z.): `Tags\tCyber\tIoT | Internet of T`
  - `Künstliche Intelligenz` — HTML-Tooltip (30 Z.): `Tags\tCyber\tKünstliche Intellig`
  - `Metaverse` — HTML-Tooltip (30 Z.): `Tags\tCyber\tMetaverse | Ein kon`
  - `Cyber Security` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Security | Cy`
    - `Antivirenprogramm` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Security\tAnti`
    - `Authentifizierung` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Security\tAuth`
    - `Backups` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Security\tBack`
    - `Cyberverteidigung` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Security\tCybe`
    - `Datenleck` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Security\tDate`
    - `Firewall` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Security\tFire`
    - `Sicherheitslücke` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Security\tSich`
    - `VPN` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Security\tVPN `
    - `Resilienz` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Security\tResi`
    - `Pen-Testing` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Security\tPen-`
    - `Fuzzing` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Security\tFuzz`
    - `Virtualisierung` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Security\tVirt`
    - `Netzwerksegmentierung` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Security\tNetz`
  - `Cyber Infrastruktur` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Infrastruktur`
    - `Botnet` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Infrastruktur`
    - `Server` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Infrastruktur`
    - `Hardware` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Infrastruktur`
      - `Bauteil` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Infrastruktur`
      - `Mobilgerät` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Infrastruktur`
      - `Personal Computer` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Infrastruktur`
      - `Supercomputer` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Infrastruktur`
    - `Netzwerk` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Infrastruktur`
      - `Darknet` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Infrastruktur`
      - `TOR-Netzwerk` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Infrastruktur`
    - `Rechenzentrum` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyber Infrastruktur`
  - `Cyberangriff` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyberangriff | Gezi`
    - `Brute-Force-Angriff` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyberangriff\tBrute-`
    - `DoS bzw. DDoS` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyberangriff\tDoS bz`
    - `Social Engineering` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyberangriff\tSocial`
    - `Schadsoftware` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyberangriff\tSchads`
      - `Computervirus` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyberangriff\tSchads`
      - `Ransomware` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyberangriff\tSchads`
      - `Spyware` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyberangriff\tSchads`
    - `APT` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyberangriff\tAPT | `
    - `Phishing` — HTML-Tooltip (30 Z.): `Tags\tCyber\tCyberangriff\tPhishi`
  - `Kryptographie` — HTML-Tooltip (30 Z.): `Tags\tCyber\tKryptographie | Wis`
    - `Verschlüsselung` — HTML-Tooltip (30 Z.): `Tags\tCyber\tKryptographie\tVersc`
    - `Blockchain` — HTML-Tooltip (30 Z.): `Tags\tCyber\tKryptographie\tBlock`
      - `Kryptowährung` — HTML-Tooltip (30 Z.): `Tags\tCyber\tKryptographie\tBlock`
      - `NFT` — HTML-Tooltip (30 Z.): `Tags\tCyber\tKryptographie\tBlock`
  - `Software` — HTML-Tooltip (30 Z.): `Tags\tCyber\tSoftware | Einzelne`
    - `Open Source Software` — HTML-Tooltip (30 Z.): `Tags\tCyber\tSoftware\tOpen Sourc`
    - `Betriebssystem` — HTML-Tooltip (30 Z.): `Tags\tCyber\tSoftware\tBetriebssy`
      - `Android` — HTML-Tooltip (30 Z.): `Tags\tCyber\tSoftware\tBetriebssy`
      - `Linux` — HTML-Tooltip (30 Z.): `Tags\tCyber\tSoftware\tBetriebssy`
      - `Mac OS` — HTML-Tooltip (30 Z.): `Tags\tCyber\tSoftware\tBetriebssy`
      - `Microsoft Windows` — HTML-Tooltip (30 Z.): `Tags\tCyber\tSoftware\tBetriebssy`
      - `iOS` — HTML-Tooltip (30 Z.): `Tags\tCyber\tSoftware\tBetriebssy`
    - `Update` — HTML-Tooltip (30 Z.): `Tags\tCyber\tSoftware\tUpdate | E`
    - `Upgrade` — HTML-Tooltip (30 Z.): `Tags\tCyber\tSoftware\tUpgrade | `

### 12.3 `KriMiSi`

- `KriMiSi` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi | Krisen, Militär`
  - `Konfliktgebiet` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKonfliktgebiet | `
  - `Krisen & Konflikte` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
    - `Atomarer Konflikt` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
    - `Blackout` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
    - `Bürgerkrieg` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
    - `Cyberkrieg` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
    - `Epidemie & Pandemie` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
    - `Grenzkonflikt` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
    - `Hybrider Krieg` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
    - `Informationskrieg` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
    - `innerstaatlicher Konflikt` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
    - `Klimawandel` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
    - `Krieg` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
    - `Naturkatastrophe` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
    - `Religionskrieg` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
    - `Terrorismus` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
    - `Wirtschaftskonflikt` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
      - `Wirtschaftssanktion` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
    - `Wirtschaftskrise` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
    - `zwischenstaatlicher Konflikt` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
    - `Zivilschutz` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tKrisen & Konflikt`
  - `Militär` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitär | Ein vie`
    - `ABC-Abwehr` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitär\tABC-Abweh`
    - `Artillerie` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitär\tArtilleri`
    - `Aufklärung` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitär\tAufklärun`
    - `CBRN` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitär\tCBRN | Si`
    - `CiMil` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitär\tCiMil | D`
    - `Cyberstreitkräfte` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitär\tCyberstre`
    - `Landstreitkräfte` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitär\tLandstrei`
    - `Luftstreitkräfte` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitär\tLuftstrei`
    - `mil. Ausbildung` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitär\tmil. Ausb`
    - `mil. Budget und Kosten` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitär\tmil. Budg`
    - `mil. Fähigkeiten` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitär\tmil. Fähi`
    - `mil. Logistik` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitär\tmil. Logi`
    - `Raketenstreitkräfte` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitär\tRaketenst`
    - `Seestreitkräfte` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitär\tSeestreit`
    - `Spezialkräfte` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitär\tSpezialkr`
    - `Weltraumstreitkräfte` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitär\tWeltraums`
    - `Flugabwehr` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitär\tFlugabweh`
  - `militärische Infrastruktur` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tmilitärische Infr`
    - `Hafenanlage` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tmilitärische Infr`
    - `Militärbasis` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tmilitärische Infr`
    - `Militärflugplatz` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tmilitärische Infr`
    - `Radarstation` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tmilitärische Infr`
  - `Militärische Handlung` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitärische Hand`
    - `Angriff` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitärische Hand`
      - `Artillerieangriff` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitärische Hand`
      - `Bodenangriff` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitärische Hand`
      - `Luftangriff` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitärische Hand`
      - `Raketenangriff` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitärische Hand`
      - `Weltraumangriff` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitärische Hand`
    - `Gefecht` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitärische Hand`
    - `Manöver` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitärische Hand`
    - `Mobilmachung` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitärische Hand`
    - `Truppenbewegung` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitärische Hand`
    - `Verteidigung` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitärische Hand`
    - `Waffenstillstand` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tMilitärische Hand`
  - `Rüstungsmaterial` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tRüstungsmaterial `
    - `Waffe` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tRüstungsmaterial\t`
      - `Atomwaffe` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tRüstungsmaterial\t`
      - `IED` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tRüstungsmaterial\t`
      - `Raketenwaffe` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tRüstungsmaterial\t`
      - `unkonventionelle Waffe` — HTML-Tooltip (30 Z.): `Tags\tKriMiSi\tRüstungsmaterial\t`

### 12.4 `InnoTech`

- `InnoTech` — HTML-Tooltip (30 Z.): `Tags\tInnoTech | Innovation und`
  - `Innovationen` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tInnovationen | n`
    - `mil. Innovation` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tInnovationen\tmil`
  - `Gesellschaftlicher Wandel` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tGesellschaftlich`
    - `Dekarbonisierung` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tGesellschaftlich`
    - `Demografischer Wandel` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tGesellschaftlich`
    - `Digitalisierung und digitale Kultur` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tGesellschaftlich`
    - `Food` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tGesellschaftlich`
    - `New Economic Patterns` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tGesellschaftlich`
    - `Öffentliche Fürsorge und Wohlfahrt` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tGesellschaftlich`
    - `Urbaner Wandel` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tGesellschaftlich`
  - `Technologie` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tTechnologie | Wi`
    - `3D-Druck` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tTechnologie\t3D-D`
    - `Autonomes System` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tTechnologie\tAuto`
    - `Biotechnologie` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tTechnologie\tBiot`
    - `Biowerkstoff` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tTechnologie\tBiow`
    - `Erweiterte Realität (AR)` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tTechnologie\tErwe`
    - `Human Enhancement` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tTechnologie\tHuma`
    - `Luft- und Raumfahrttechnik` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tTechnologie\tLuft`
    - `Materialforschung` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tTechnologie\tMate`
    - `Mobilität` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tTechnologie\tMobi`
    - `Nachhaltige Technologie` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tTechnologie\tNach`
    - `Nanotechnologie` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tTechnologie\tNano`
    - `Quantentechnologie` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tTechnologie\tQuan`
    - `Robotik` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tTechnologie\tRobo`
    - `Simulation` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tTechnologie\tSimu`
    - `Virtuelle Realität (VR)` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tTechnologie\tVirt`
    - `Weltraumtechnologie` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tTechnologie\tWelt`
    - `Biometrie` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tTechnologie\tBiom`
  - `Forschung & Entwicklung` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tForschung & Entw`
    - `Forschungsprogramm` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tForschung & Entw`
    - `Öffentliche Forschung` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tForschung & Entw`
    - `Private Forschung` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tForschung & Entw`
    - `Stressforschung` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tForschung & Entw`
    - `mil. Forschung` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tForschung & Entw`
      - `Operations Research` — HTML-Tooltip (30 Z.): `Tags\tInnoTech\tForschung & Entw`

### 12.5 `Allgemeine Tags`

- `Allgemeine Tags` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags | Tags zu`
  - `Ausbildung` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAusbildun`
  - `Int. Zusammenarbeit` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInt. Zusa`
    - `Humanitäre Hilfe` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInt. Zusa`
  - `Navigation` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tNavigatio`
  - `Recht` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tRecht | G`
    - `Menschenrechte` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tRecht\tMen`
  - `Soziale Medien` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tSoziale M`
  - `Spionage` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tSpionage `
  - `Strategie` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tStrategie`
  - `Ereignis` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tEreignis `
    - `Anschlag` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tEreignis\t`
    - `Demonstration` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tEreignis\t`
    - `Staatsstreich` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tEreignis\t`
    - `Todesfall` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tEreignis\t`
    - `Unfall` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tEreignis\t`
    - `Wahl` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tEreignis\t`
    - `Souveränitätsverletzung` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tEreignis\t`
  - `Gesellschaft` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tGesellsch`
    - `Extremismus und Radikalismus` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tGesellsch`
    - `Gesellschaftliche Spaltung` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tGesellsch`
    - `Gesundheit` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tGesellsch`
    - `Migration` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tGesellsch`
    - `Privatsphäre` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tGesellsch`
    - `Sport` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tGesellsch`
  - `Kriminalität` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tKriminali`
    - `Erpressung` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tKriminali`
    - `Korruption` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tKriminali`
    - `Piraterie` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tKriminali`
    - `Schusswaffengebrauch` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tKriminali`
    - `Hochverrat` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tKriminali`
    - `Gewalt` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tKriminali`
  - `Umwelt` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tUmwelt | `
    - `Rohstoffe` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tUmwelt\tRo`
  - `Wirtschaft` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tWirtschaf`
    - `Rüstungswirtschaft` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tWirtschaf`
    - `Handel` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tWirtschaf`
  - `Akteur` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur | `
    - `Forschungsorganisation` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tFo`
    - `Hacker` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tHa`
    - `paramilitärische Organisation` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tpa`
    - `Privatperson` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tPr`
    - `Unternehmen` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tUn`
    - `Internationale Organisation` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `Afrikanische Union` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `Arabische Liga` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `ASEAN` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `ECOWAS` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `EU` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
        - `EUROPOL` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
        - `FRONTEX` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
        - `GSVP` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
        - `PESCO` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `G7` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `Golf-Kooperationsrat` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `GUS` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `IAEO` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `MERCOSUR` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `NAFTA` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `NATO` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `OIC` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `OPEC` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `OSZE` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `OVKS` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `SCO` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `UNICEF` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `UNO` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
        - `UNHCR` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
        - `UNSC` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `WHO` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `INTERPOL` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `OPCW` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
      - `IStGH` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIn`
    - `Irreguläre Kräfte` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIr`
      - `Terrorgruppe` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tIr`
    - `Kriminelle Organisation` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tKr`
      - `Hackergruppe` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tKr`
      - `Organisierte Kriminalität` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tKr`
    - `staatliche Organisation` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tst`
      - `Feuerwehr` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tst`
      - `Geheim- und Nachrichtendienst` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tst`
      - `Justiz` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tst`
      - `Polizei` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tst`
      - `Rettungsdienst` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tst`
      - `Verwaltung` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\tst`
    - `öffentliche Person` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tAkteur\töf`
  - `Fahrzeug` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tFahrzeug `
    - `Bodenfahrzeug` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tFahrzeug\t`
      - `Eisenbahn` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tFahrzeug\t`
      - `gepanzertes Fahrzeug` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tFahrzeug\t`
    - `Luftfahrzeug` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tFahrzeug\t`
      - `Flugzeug` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tFahrzeug\t`
      - `Hubschrauber` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tFahrzeug\t`
    - `Raumfahrzeug` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tFahrzeug\t`
      - `Raumstation` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tFahrzeug\t`
      - `Satellit` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tFahrzeug\t`
    - `Unbemanntes Fahrzeug` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tFahrzeug\t`
      - `UAV` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tFahrzeug\t`
      - `UGV` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tFahrzeug\t`
      - `USV` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tFahrzeug\t`
      - `UUV` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tFahrzeug\t`
    - `Wasserfahrzeug` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tFahrzeug\t`
      - `Schiff` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tFahrzeug\t`
      - `Uboot` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tFahrzeug\t`
  - `Infrastruktur` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInfrastru`
    - `Energieversorgung` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInfrastru`
    - `Finanzsystem` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInfrastru`
    - `Gesundheitsversorgung` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInfrastru`
    - `Kommunikation` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInfrastru`
    - `Konnektivität` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInfrastru`
    - `Kritische Infrastruktur` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInfrastru`
    - `Kulturgüter` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInfrastru`
    - `Lebensmittelversorgung` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInfrastru`
    - `Medien` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInfrastru`
    - `Wasserversorgung` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInfrastru`
    - `Industrie` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInfrastru`
      - `Chemie` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInfrastru`
      - `Erdölwesen` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInfrastru`
    - `Transport` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInfrastru`
      - `Luftfahrt` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInfrastru`
    - `Bildungseinrichtung` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInfrastru`
    - `Lieferketten` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tInfrastru`
  - `Politik` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tPolitik |`
    - `Außenpolitik` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tPolitik\tA`
    - `Diplomatie` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tPolitik\tD`
    - `Innenpolitik` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tPolitik\tI`
    - `Militärpolitik` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tPolitik\tM`
    - `Rüstungspolitik` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tPolitik\tR`
    - `Sicherheitspolitik` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tPolitik\tS`
      - `Friedensbemühungen` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tPolitik\tS`
      - `Proliferation` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tPolitik\tS`
      - `Resilienz` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tPolitik\tS`
      - `Verteidigungsmaßnahmen` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tPolitik\tS`
    - `AI Act` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tPolitik\tA`
    - `NIS` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tPolitik\tN`
    - `DSGVO` — HTML-Tooltip (30 Z.): `Tags\tAllgemeine Tags\tPolitik\tD`

### 12.6 `Newsinfo`

- `Newsinfo` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo | Metadaten bezü`
  - `Audio` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tAudio | Die Nach`
  - `Video` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tVideo | Die Nach`
  - `Werbung` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tWerbung | Wird a`
  - `Dokumententyp` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tDokumententyp | `
    - `Abstract` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tDokumententyp\tAb`
    - `Ausbildungsmittel` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tDokumententyp\tAu`
    - `Ausschreibung` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tDokumententyp\tAu`
    - `Dissertation` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tDokumententyp\tDi`
    - `Konferenzpublikation` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tDokumententyp\tKo`
    - `Meinungsäußerung` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tDokumententyp\tMe`
    - `News` **[SIEHE PFLICHT-/SONDERREGEL]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tDokumententyp\tNe`
    - `Patent` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tDokumententyp\tPa`
    - `Strategische Info` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tDokumententyp\tSt`
    - `Studie` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tDokumententyp\tSt`
  - `Informationsverschmutzung` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tInformationsvers`
    - `Deepfake` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tInformationsvers`
    - `Desinformation` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tInformationsvers`
    - `Faktencheck` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tInformationsvers`
    - `Verschwörungstheorie` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tInformationsvers`
    - `Propaganda` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tInformationsvers`
    - `Zensur` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tInformationsvers`
  - `zeitlicher Aspekt` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tzeitlicher Aspek`
    - `2021-2025` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tzeitlicher Aspek`
    - `2026-2030` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tzeitlicher Aspek`
    - `2031-2040` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tzeitlicher Aspek`
    - `2041-2050` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tzeitlicher Aspek`
    - `2051-später` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tzeitlicher Aspek`
    - `State of the Art` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tzeitlicher Aspek`
    - `Trendbrüche` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tzeitlicher Aspek`
    - `Weak Signals` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tzeitlicher Aspek`
  - `geographische Lokationen` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
    - `Antarktis` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
    - `Arktis` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
    - `Global` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
    - `kein Standort` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
    - `Weltraum` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
    - `Nicht/Eingeschränkt anerkannt` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Abchasien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Bergkarabach` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Cookinseln` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Donezk und Lugansk (Donbass)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Kosovo` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Niue` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Nordzypern` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Palästina` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Somaliland` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Südossetien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Taiwan` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Transnistrien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Westsahara` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
    - `Kontinente und Staaten` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Afrika` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Ägypten` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Algerien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Angola` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Äquatorialguinea` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Äthiopien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Benin` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Botsuana` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Burkina Faso` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Burundi` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Cabo Verde` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Cote d'Ivoire (Elfenbeinküste)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Dschibuti` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Eritrea` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Eswatini` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Gabun` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Gambia` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Ghana` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Guinea` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Guinea-Bissau` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Kamerun` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Kenia` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Komoren` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Kongo, Demokratische Republik` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Kongo, Republik der` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Lesotho` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Liberia` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Libyen` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Madagaskar` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Malawi` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Mali` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Marokko` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Mauretanien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Mauritius` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Mosambik` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Namibia` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Niger` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Nigeria` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Ruanda` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Sambia` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Sao Tome und Principe` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Senegal` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Seychellen` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Sierra Leone` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Simbabwe` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Somalia` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Südafrika` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Sudan` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Südsudan` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Tansania` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Togo` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Tschad` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Tunesien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Uganda` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Zentralafrikanische Republik` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Asien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Afghanistan` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Armenien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Aserbaidschan` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Bahrain` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Bangladesch` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Bhutan` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Brunei` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `China` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Georgien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Indien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Indonesien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Irak` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Iran` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Israel` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Japan` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Jemen` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Jordanien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Kambodscha` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Kasachstan` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Katar` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Kirgisistan` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Südkorea` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Kuwait` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Laos` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Libanon` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Malaysia` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Malediven` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Mongolei` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Myanmar (Burma)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Nepal` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Nordkorea` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Oman` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Pakistan` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Philippinen` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Russland` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Saudi Arabien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Singapur` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Sri Lanka` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Syrien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Tadschikistan` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Thailand` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Timor-Leste` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Türkei` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Turkmenistan` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Usbekistan` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Vereinigte Arabische Emirate` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Vietnam` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Zypern` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Australien und Ozeanien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Australien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Fidschi` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Kiribati` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Marshallinseln` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Mikronesien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Nauru` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Neuseeland` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Palau` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Papua Neuguinea` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Salomonen` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Samoa` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Tonga` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Tuvalu` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Vanuatu` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Europa` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Albanien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Andorra` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Belarus (Weißrussland)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Belgien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Bosnien und Herzegowina` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Bulgarien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Dänemark` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Deutschland` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Estland` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Finnland` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Frankreich` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Griechenland` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Irland` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Island` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Italien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Kroatien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Lettland` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Liechtenstein` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Litauen` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Luxemburg` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Malta` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Moldau` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Monaco` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Montenegro` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Niederlande` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Nordmazedonien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Norwegen` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Österreich` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Polen` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Portugal` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Rumänien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `San Marino` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Schweden` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Schweiz` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Serbien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Slowakei` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Slowenien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Spanien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Tschechien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Ukraine` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Ungarn` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Vereinigtes Königreich` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Vatikanstadt (Heiliger Stuhl)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Nordamerika` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Antigua und Barbuda` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Bahamas` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Barbados` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Belize` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Costa Rica` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Dominica` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Dominikanische Republik` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `El Salvador` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Grenada` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Guatemala` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Haiti` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Honduras` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Jamaika` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Kanada` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Kuba` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Mexiko` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Nicaragua` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Panama` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `St. Kitts und Nevis` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `St. Lucia` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `St. Vincent und die Grenadinen` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `USA` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Südamerika` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Argentinien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Bolivien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Brasilien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Chile` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Ecuador` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Guyana` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Kolumbien` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Paraguay` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Peru` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Suriname` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Trinidad und Tobago` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Uruguay` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
        - `Venezuela` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
    - `Übersee- & Extraterritoriale Gebiete` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Amerikanisch-Samoa (USA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Anguilla (GBR)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Aruba (NLD)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Ashmore- und Cartier-Inseln (AUS)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Baker- und Howlandinseln (USA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Bermudas (GBR)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Bouvetinsel (NOR)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Britische Jungferninseln (GBR)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Britisches Territorium im Indischen Ozean (GBR)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Falklandinseln (GBR)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Färöer (DNK)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Französisch-Guayana (FRA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Französisch-Polynesien (FRA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Gibraltar (GBR)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Grönland (DNK)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Guadeloupe (FRA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Guam (USA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Guernsey (GBR)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Heard & McDonaldinseln (AUS)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Hongkong (CHN)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Isle of Man (GBR)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Jan Mayen (NOR)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Jarvis-Insel (USA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Jersey (GBR)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Johnston-Atoll (USA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Jungferninseln (USA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Kaimaninseln (GBR)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Kaliningrad (RUS)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Kingman-Riff (USA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Kokosinseln (AUS)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Korallenmeerinseln (AUS)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Macau (CHN)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Martinique (FRA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Mayotte (FRA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Midway-Inseln (USA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Monteserrat (GBR)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Navassa-Insel (USA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Neukaledonien (FRA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Niederländische Antillen (NLD)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Nördliche Marianen (USA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Norfolkinsel (AUS)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Palmyra-Atoll (USA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Pitcairninseln (GBR)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Puerto Rico (USA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Réunion (FRA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Spitzbergen (NOR)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `St. Helena, Ascension und Tristan da Cunha (GBR)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `St. Pierre & Miquelon (FRA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Südgeorgien & Südliche Sandwichinseln (GBR)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Tokelau (NZL)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Turks- und Caicosinseln (GBR)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Wake Island (USA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Wallis & Futuna (FRA)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Weihnachtsinsel (AUS)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
    - `Welt- und Randmeere` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Baltisches Meer (Ostsee)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Indischer Ozean` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Karibisches Meer` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Kaspisches Meer` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Mittelmeer` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Nordatlantik` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Ostchinesisches Meer` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Ostpazifik` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Persischer Golf` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Rotes Meer` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Schwarzes Meer` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Südatlantik` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Südchinesisches Meer` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
      - `Westpazifik` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
    - `Luftraum` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
    - `Hoheitsgewässer` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tgeographische Lo`
  - `Quellentyp` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp | Art`
    - `Behördenseite` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tBehör`
    - `Blog` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tBlog `
    - `Nachrichtenseite` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tNachr`
    - `Unternehmens- oder Vereinsseite` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tUnter`
    - `wissenschaftliche Fachzeitschrift` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\twisse`
    - `Konferenz` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tKonfe`
      - `34C3 Konferenz` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tKonfe`
      - `Blackhat Europa` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tKonfe`
      - `Blackhat USA` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tKonfe`
      - `Chaos Computer Club` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tKonfe`
      - `CyCon (International Conference on Cyber Conflict)` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tKonfe`
      - `DLD` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tKonfe`
      - `Infrachain` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tKonfe`
      - `International Conference on Cyber Conflict` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tKonfe`
      - `International Conference on Knowledge Technologies and Data-Driven Business` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tKonfe`
      - `Kommune 5.0: Wenn Algorithmen reagieren und verwalten` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tKonfe`
      - `Msc` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tKonfe`
      - `MSI` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tKonfe`
      - `No-Spy Konferenz` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tKonfe`
      - `Re:publica` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tKonfe`
      - `Semantics` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tKonfe`
      - `Stuttgarter Wissensmanagement` — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tQuellentyp\tKonfe`
  - `Social Media Post` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tSocial Media Pos`
    - `Post-Twitter` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tSocial Media Pos`
    - `Post-Facebook` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tSocial Media Pos`
    - `Post-Telegram` **[AUSGESCHLOSSEN]** — HTML-Tooltip (30 Z.): `Tags\tNewsinfo\tSocial Media Pos`

### 12.7 `Auftragstags`

- `Auftragstags` — HTML-Tooltip (30 Z.): `Tags\tAuftragstags | Auftragsta`
  - `WB-Cyber` — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tWB-Cyber | D`
    - `[WB-C]1 Cyber International` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tWB-Cyber\t[WB`
    - `[WB-C]2 Cyber Österreich` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tWB-Cyber\t[WB`
    - `[WB-C]3 Cyberinnovationen International` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tWB-Cyber\t[WB`
    - `[WB-C]4 Cyberinnovationen Österreich` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tWB-Cyber\t[WB`
  - `WB-KriMiSi` — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tWB-KriMiSi |`
  - `WB-InnoTech` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tWB-InnoTech `
  - `HET-EU Verteidigungspolitik` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tHET-EU Verte`
  - `HSC` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tHSC | Die Na`
    - `HSC-Ö` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tHSC\tHSC-Ö | `
      - `China-Ö` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tHSC\tHSC-Ö\tCh`
      - `Katar-Ö` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tHSC\tHSC-Ö\tKa`
      - `Kuwait-Ö` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tHSC\tHSC-Ö\tKu`
      - `Oman-Ö` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tHSC\tHSC-Ö\tOm`
      - `Russland-Ö` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tHSC\tHSC-Ö\tRu`
      - `Saudi-Arabien-Ö` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tHSC\tHSC-Ö\tSa`
      - `Türkei-Ö` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tHSC\tHSC-Ö\tTü`
      - `USA-Ö` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tHSC\tHSC-Ö\tUS`
      - `VAE-Ö` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tHSC\tHSC-Ö\tVA`
    - `HSC-KI` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tHSC\tHSC-KI |`
      - `[KI_]Grundlagendokument` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tHSC\tHSC-KI\t[`
      - `[KI_]Tools und Usecases` **[SIEHE PFLICHT-/SONDERREGEL]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tHSC\tHSC-KI\t[`
      - `[KI_]Ausbildung` **[NICHT VERGEBEN]** — HTML-Tooltip (30 Z.): `Tags\tAuftragstags\tHSC\tHSC-KI\t[`

---

## 13. Änderungsprotokoll und künftige Tooltip-Ergänzungen

| Version | Datum | Änderung |
|---|---|---|
| 1.0 | 2026-10-08 | Redaktionelle Tagging-Regeln sowie beide HTML-Exporte zusammengeführt; alle sichtbar verfügbaren Länder und alle 30-Zeichen-Tooltip-Ausschnitte aufgenommen. |

**Zum Ergänzen vollständiger Tooltips:** Bei Lieferung einer ungekürzten Originalbeschreibung den entsprechenden Tag im Abschnitt 12 anhand seines **vollständigen Pfades** aktualisieren. Den 30-Zeichen-Originalauszug zur Nachvollziehbarkeit beibehalten und die vollständige Beschreibung als gesondertes Feld „Vollständiger Original-Tooltip“ einfügen. Den Ursprung und das Aktualisierungsdatum notieren; redaktionelle Interpretationen immer separat kennzeichnen.

---

**Archivierungs-/Änderungshinweis:** Diese Version dokumentiert den Tagbestand aus den bereitgestellten DOM-Auszügen, nicht eine Live-Synchronisation mit dem Dashboard. Bei Veränderungen an Tags oder vollständigen Tooltip-Definitionen eine neue Version des Handbuchs erstellen und den Status im Änderungsprotokoll ergänzen. **Neue Tag-Namen dürfen nicht aus freiem Wissen hinzugedichtet werden.**
