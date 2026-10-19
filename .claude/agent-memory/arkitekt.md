# Arkitekt-hukommelse (TactiVAR)

- Søsterprojekt med samme setup: /home/user/smagning (deploy.yml med
  nøgle-diagnose, e2e-harness med check(), CDN-routing af Firebase-SDK i tests
  — sidstnævnte først relevant i trin 2).
- Kilden (Gemini v2.5b) har en stabil datamodel: generateTeam
  {id,name,isBot,ownerUid,cashBalance,tactics,tacticPresets,squad},
  sanitizeLeagueData, ratingSheet, updateStandingsAfterMatch. Overtag
  formen, ikke koden (linjerne er afskåret i PDF'en).
- Hvem-ser-hvad skal ligge ét sted (engine/visibility.js), så trin 2's
  Firestore-split public/private/secrets kan bygges uden omskrivning.
- Motoren må aldrig mutere holdene; auto-indskiftning sker i en kamplokal kopi.
