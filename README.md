# LiveSim — vMix Training Simulator

Browser-based live production training tool. Looks and works like vMix. No install, no license needed. Runs on any device with a browser.

## Deploy to GitHub Pages (3 minutes)

1. Create a new GitHub repo (e.g. `livesim`)
2. Upload `index.html`, `style.css`, `app.js` to the root
3. Go to **Settings → Pages → Source: main branch / root**
4. Live at `https://yourusername.github.io/livesim`

## Features

- vMix-accurate dark UI layout with Preview / Program monitors
- Add YouTube videos, local video files, image stills, lower thirds, colour inputs
- Cut, Fade, Wipe, Slide, Zoom transitions with duration control
- Simulated audio meters
- Replay controller: mark in/out, play, loop, speed control
- Stream Deck button map (shows your crew how to configure the physical device)
- Full keyboard shortcuts matching real vMix workflow
- Event log

## YouTube Note

YouTube embeds autoplay muted in most browsers without needing a click, because `mute=1` satisfies browser autoplay policy. For training, muted is totally fine — your crew is practising switching, not audio mixing. If a video doesn't autoplay, clicking once anywhere on the page and reloading fixes it.

For guaranteed no-click playback, use local `.mp4` files or host your own video files on GitHub/any server and paste the direct URL.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| 1–9 | Preview input |
| Shift+1–9 | Cut direct to output |
| Space | Cut / Transition |
| A | Auto transition |
| B | Fade to black |
| F1–F4 | Transition type |
| I / O | Mark In / Out |
| P | Play replay |
| L | Loop replay |
| R | Return to live |
| [ / ] | Speed 0.5x / 1x |
| Esc | Close modal |

## Stream Deck Integration

The Stream Deck connects to real vMix via the Stream Deck software and vMix's built-in shortcuts. In this sim, keyboard shortcuts replicate those exact mappings. Open **Stream Deck Map** in the app to see how to configure your physical device to match.
