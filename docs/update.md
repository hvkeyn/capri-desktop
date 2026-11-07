# Updates

She reads the newest release of this fork on GitHub and offers it on her panel. No account, no token,
no extra dependency: `src/main/update.js` is a hundred lines of `fetch` and one PowerShell helper.

## How it decides

1. **Once, 20 s after she starts** (and whenever you pick **Updates › Check for updates…** in her menu),
   she asks `https://api.github.com/repos/hvkeyn/capri-desktop/releases/latest`.
2. The answer is **cached for 12 hours** in `<userData>/update.json` — the GitHub API allows 60 requests
   an hour per address, and an update a day late is not a problem. A failed check is cached for one hour,
   so a machine with no network doesn't hammer it at every start.
3. The cached copy holds the *release*, not the verdict: "is this newer than me?" is computed every time
   from the version asking, so the same cache can't tell two versions the same thing.
4. If the tag is newer than `app.getVersion()`, the panel says so, with **Download** and **Later**.

## What it downloads

The **portable exe** for that exact version (`Capri-x.y.z-portable.exe`), else any `*-portable.exe`, else
nothing (the zip is the fallback only if there is no portable build at all). It streams to
`<userData>/updates/` with a progress bar, and a failed download leaves no `.part` behind.

## How it installs

A running `.exe` cannot replace itself on Windows, so **Restart and update** writes a small PowerShell
helper to `%TEMP%` and quits:

1. the helper waits for this process to end (a minute at most, then the copy is tried anyway);
2. it copies the downloaded exe over the one you double-clicked — `PORTABLE_EXECUTABLE_FILE`, because the
   portable build runs from a temp folder and `process.execPath` is not the file on your disk;
3. it starts the new exe and deletes itself.

It is refused while a **work order is running** (that work is on disk but not finished), and it refuses
to run from source (`electron .`), where there is no portable exe to replace.

## What it does not do

- **No signature check.** The releases are unsigned, so the download is verified by GitHub's TLS and by
  the asset name, not by a certificate. That is the same trust you give the release page when you click
  the exe yourself — but it is not a signed update, and it isn't going to pretend otherwise.
- **No silent install.** Nothing downloads or restarts until you press the button.
- **No zip self-update.** The zip target is unpacked wherever you like, so it can't be swapped in place;
  the update path is the portable exe.

## Turning it off

`"checkUpdates": false` in `%APPDATA%\capri-desktop\config.json`. The menu item still checks when you
press it.
