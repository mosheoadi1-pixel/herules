# HER RULES Android shell

This is a native Android WebView shell around the deployed HER RULES web app. It is **not** a local Node/PostgreSQL server: the APK loads the same-origin HTTPS site at `https://herules.onrender.com`, which owns the API, database and sessions.

The URL is normalized to the exact origin without a trailing slash. The server must be started with `APP_ORIGIN=https://herules.onrender.com` (no `/` at the end), otherwise its startup validation rejects the configuration.

## What the shell provides

- Full-screen WebView with JavaScript, DOM storage, cookies and SSE/polling support.
- Android back button drives WebView history back before exiting.
- Same-host sign-in callbacks stay in the WebView; unrelated links open in the system browser.
- Camera permission bridging for `getUserMedia` and the verification selfie flow.
- Image file chooser for `<input type="file" capture="environment">` (camera or gallery).
- Brand colors and launcher icons, including adaptive icons on Android 8+.
- No third-party Android libraries; no npm install is required for the APK.

## Build a debug APK

### GitHub Actions

Push to the `apk` branch or run the **Android debug APK** workflow manually. The workflow installs JDK 17, the Android SDK and Gradle 8.11.1, then uploads `app-debug.apk` as an artifact. That APK is installable but unsigned with a debug key and is not suitable for Play Store release.

### Local build

With Android Studio/SDK + JDK 17 installed:

```bash
gradle -p android assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`.

Android Studio can also open the `android/` directory directly. There is no Gradle wrapper jar in this branch, so use a locally installed Gradle (8.11.1 is the version used in CI).

## Change the server URL

Update both places in `android/app/build.gradle` and `android/app/src/main/AndroidManifest.xml`:

- `buildConfigField 'String', 'APP_URL', '"https://..."'`
- `buildConfigField 'String', 'APP_HOST', '"host.example"'`
- `<data android:host="host.example" ...>` in the browsable intent filter

Keep the URL an exact HTTPS origin. Any change must also be reflected in the deployed server's `APP_ORIGIN` and Google OAuth callback configuration.

## Known limits

- Google/Apple sign-in inside a WebView can be blocked by the identity provider for security reasons. If sign-in fails, use the site in a normal browser/PWA. A follow-up can move OAuth to Android Custom Tabs plus verified App Links and sync the callback cookie into the WebView.
- The debug build uses application id `com.herules.app.debug` and is not App-Link verified, so an external sign-in callback may show a chooser.
- Web push is not implemented by the app itself; notifications only work while a page/tab is active. The APK does not add a native push bridge.
- A signed release APK still needs a keystore. The recommended next step is a release workflow using GitHub Secrets for the keystore, passwords and alias; never commit the keystore.
- No Android build or device test was run in the Linux container used to create this branch. CI and local verification are required before relying on the artifact.
