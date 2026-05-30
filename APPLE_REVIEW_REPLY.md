# Apple App Review — Reply to Guideline 2.1 (Information Needed)

Submission: iOS 1.0 — rejected "2.1.0 Performance: App Completeness" (info request)
Apple message received: 2026-05-29

---

## Multiplayer fix applied (2026-05-30)

Group Challenge (starting/joining a game with other players) was failing: the Firebase Realtime Database security rules had expired (the database was created in test mode, which grants public access for only ~30 days and then auto-locks). With the rules locked, every "create game" / "join game" request was denied, so multiplayer could not start.

Fixed by republishing non-expiring database rules granting access to the `games` node. Verified live with a full write/read/delete round-trip against the database. This is a server-side change — it takes effect immediately for the existing build, so **no new binary is required** for this fix.

---

## Reply text — paste into the App Review message thread AND the App Review Information → Notes field

Thank you for reviewing The Long Dunn Game. Please find the requested information below.

1. SCREEN RECORDING: Attached is a screen recording captured on a physical iPhone 16 Pro running iOS 26.3.1, beginning with app launch and showing the full core user flow (solo play and group multiplayer).
   - Account registration / login / deletion: Not applicable — the app has no user accounts or login. Players optionally type a display nickname for a game session; nothing is stored beyond the live game.
   - Paid content / purchases / subscriptions: Not applicable — the app is completely free with no in-app purchases.
   - User-generated content: In Group Challenge, players join a private, invite-only game via a share code and see each other's one-word game answers (e.g. a Town or Animal beginning with a given letter). There is no public feed, profile, messaging, or media upload.
   - Sensitive-data / device-capability prompts: None — the app requests no permissions (no location, contacts, camera, microphone, or App Tracking Transparency).

2. DEVICES/OS TESTED: iPhone 16 Pro on iOS 26.3.1, plus the iOS Simulator (iPhone 15/16 family).

3. PURPOSE & TARGET AUDIENCE: The Long Dunn Game is a family word game (similar in spirit to Scattergories). Players are given a random letter and race a five-minute timer to fill in a word starting with that letter for each of 14 categories (Town, Country, Fruit, Animal, River, etc.). It is aimed at families and casual word-game players of all ages who want a quick, social game to play solo or together.

4. SETUP & ACCESS: No login or credentials are required. On launch the player chooses Individual Challenge (solo vs. the clock) or Group Challenge (create a game to get a share code, or enter a friend's code to join, then everyone plays the same round live). No sample files or test accounts are needed.

5. EXTERNAL SERVICES: The app uses Google Firebase Realtime Database to synchronise live multiplayer game sessions (the shared game code, players' current answers, and scores during a round). Web fonts and background music are also loaded over the network. No analytics, advertising, payment, or AI services are used.

6. REGIONAL DIFFERENCES: None. The app functions identically in all regions; there is no region-locked or region-specific content.

7. REGULATED INDUSTRY / THIRD-PARTY MATERIAL: Not applicable. The app does not operate in a regulated industry and contains no protected third-party material. "The Long Dunn Game" is an original family word game.

---

## Screen recording checklist (record on the iPhone 16 Pro)

1. Control Center → tap Screen Recording, wait 3 sec.
2. Launch the app FROM THE HOME SCREEN icon (Apple wants the launch shown).
3. Splash → main menu.
4. Individual Challenge: start a round, type a couple of answers, show timer + scoring.
5. Back to menu → Group Challenge: create a game, SHOW the share code, then on a SECOND device (or a browser) join with that code so both player names appear in the lobby — this proves multiplayer works end-to-end (the previously-failing flow).
6. Stop recording. Keep under ~3 minutes.
7. Attach the video in the App Review message thread (or paste an unlisted Dropbox/YouTube link).

No new build is required — just reply in the thread with the text + recording.
