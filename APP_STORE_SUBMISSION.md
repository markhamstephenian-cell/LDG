# Long Dunn Game — iOS / App Store guide

The web app is now wrapped as a native iOS app using **Capacitor**. Your game code is
unchanged — it lives in the root files (`index.html`, `app.js`, `styles.css`) and is
copied into the native app whenever you sync.

- **App name:** Long Dunn Game
- **Bundle ID:** `com.longdunngame.app`  ← permanent App Store identifier; tell me if you want it changed
- **iOS project:** `ios/App/App.xcodeproj`

---

## Everyday workflow (after editing the game)

```bash
npm run sync       # copies the root web files into www/ and into the iOS app
npm run open:ios   # opens the project in Xcode
```

---

## One-time setup before the first build

### 0. Install the iOS platform component (needed to build/run)
Open the project in Xcode once (`npm run open:ios`). Xcode will prompt to download the
iOS platform/simulator support — accept it (multi-GB). Or from the terminal:
```bash
xcodebuild -downloadPlatform iOS
```

### 1. Signing
In Xcode: select the **App** target → **Signing & Capabilities** tab →
- Check **Automatically manage signing**
- **Team:** choose your Apple Developer Program team

### 2. Version numbers
App target → **General**:
- **Version** (e.g. `1.0.0`) — the public version users see
- **Build** (e.g. `1`) — must increase by 1 for every upload

---

## Test it

- **Simulator:** pick an iPhone simulator at the top of Xcode → press ▶︎.
- **Your iPhone:** plug it in, select it, press ▶︎ (with signing set up above).

Check: the splash screen shows then hides, the game loads, Firebase multiplayer works
(needs internet), audio plays, layout looks right in portrait.

---

## Submit to the App Store

### 1. Create the app record
Go to **App Store Connect → My Apps → +** → **New App**:
- Platform: iOS
- Name: **Long Dunn Game** (must be unique across the whole App Store)
- Primary language, and select the bundle ID `com.longdunngame.app`
- SKU: any string, e.g. `LDG001`

### 2. Archive & upload
In Xcode:
1. Select destination **Any iOS Device (arm64)** at the top (not a simulator).
2. **Product → Archive**.
3. When the Organizer opens: **Distribute App → App Store Connect → Upload**.
4. Wait for it to process (a few minutes to ~an hour) in App Store Connect.

### 3. Fill in the store listing (in App Store Connect)
Required before you can submit:
- **Screenshots** — at least one 6.7"/6.9" iPhone screenshot (take from the simulator
  with ⌘S, or your phone). Sizes Apple currently accepts are listed in the upload form.
- **Description**, **keywords**, **support URL**.
- **Privacy Policy URL** — *required*. Your app stores names/scores in Firebase, so you
  need one (a single hosted web page is fine; GitHub Pages works).
- **App Privacy** questionnaire — declare what data is collected. With Firebase Realtime
  Database you're typically collecting the player names/scores users type in. Be honest
  but it's minimal.
- **Age rating** questionnaire.
- **Category** — Games (e.g. Word / Family).
- Pick the build you uploaded.

### 4. Submit for review
Click **Add for Review → Submit**. Review usually takes 1–3 days.

---

## Heads-up on Apple review

- **Guideline 4.2 ("minimum functionality"):** Apple rejects apps that are just a website
  in a wrapper. A real multiplayer word game like this normally passes, but make the
  listing and screenshots show genuine interactive gameplay, not a static page.
- The app **requires internet** (Firebase, fonts, music load from the network). That's
  acceptable for an online multiplayer game.
- No special device permissions are requested (no camera/location), which keeps review simple.

## Already configured for you
- App icon generated from your LDG emblem (opaque, full-bleed — no transparency, which Apple requires).
- Splash screen on the cream background, auto-hides after the UI paints.
- Locked to **portrait** (matches the game's design).
- Status bar styled; rubber-band overscroll disabled for a native feel.
- `ITSAppUsesNonExemptEncryption = false` set, so you skip the export-compliance prompt each upload.
