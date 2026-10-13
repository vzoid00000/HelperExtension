# Tests

Alle Tests laufen mit Node ≥ 20 ohne Build-Schritt. Die Browser-Tests brauchen das npm-Paket
`playwright` (global oder im Projekt) mit installiertem Chromium.

```
node tests/catalog.test.mjs          # Tag-Katalog: Regeln, Auflösung, Validierung (ohne Browser)
node tests/har-tools.test.mjs        # redact-har, har-to-mock, mock-osdp-server (ohne Browser)
node tests/bridge.test.mjs           # Claude-Code-Brücke mit CLI-Attrappe (ohne Browser)
node tests/extension-v2.test.mjs     # Extension laden, Extractor, Filler gegen Nachbau-Fixture
node tests/extension-v3.test.mjs     # Tag-Baum (applyTags, exportTagTree), lokaler LLM-Client, Verlauf
```

End-to-End gegen die echte OSDP-Oberfläche (aus dem HAR-Export):

```
node tools/har-to-mock.mjs site-dump/osdp.redacted.har       # einmalig: mock-osdp/ erzeugen
node tools/mock-osdp-server.mjs &                              # http://localhost:4300
node tests/e2e-mock.mjs                                        # füllt einen Artikel aus und prüft POST /api/news
```
