# LiveSim — vMix Production Training Simulator

A browser-based live production training tool for tech crews. Simulates a vMix-style switcher and Stream Deck replay controller. No install needed — runs entirely in the browser.

## Features

- **vMix-style live switcher** — Preview/Program monitors, cut and transition controls
- **YouTube + local video inputs** — Add any YouTube video or local file as a camera input
- **Stream Deck replay simulator** — Mark in/out, play, loop, speed control
- **Full keyboard shortcuts** — Matches real vMix workflow
- **Event log** — Every production action is timestamped

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1–9` | Send input to Preview |
| `Shift + 1–9` | Cut input directly to Program |
| `Space` | Cut / Transition |
| `A` | Auto transition |
| `F1–F4` | Select transition (Cut/Fade/Wipe/Zoom) |
| `I` | Mark In |
| `O` | Mark Out |
| `P` | Play replay |
| `L` | Loop replay |
| `R` | Return to live |
| `[ / ]` | Speed 0.5x / 1x |
| `Esc` | Close modal |

## Deploy to GitHub Pages

1. Create a new GitHub repository (e.g. `livesim`)
2. Upload `index.html`, `style.css`, and `app.js` to the root
3. Go to **Settings → Pages**
4. Set source to `main` branch, root folder
5. Your sim will be live at `https://yourusername.github.io/livesim`

## Adding Inputs for Training

### YouTube videos
Use any public YouTube sports broadcast or match replay. Paste the URL in **Manage Inputs → YouTube / URL**.

Good sources for multi-sport training footage:
- Search YouTube for "basketball game livestream" or "football match full game"
- Any public sports channel replay works

### Local files
Any `.mp4`, `.mov`, or `.webm` file on your machine. Great for using your own past event recordings as training material.

## Tips for Crew Training

- **Director drill**: Play a match on one input, have the director call shots verbally while the TD switches
- **Replay drill**: Time how fast the replay operator can mark in/out and get a replay to air after a key moment
- **Keyboard only**: Challenge experienced crew to do a full session without touching the mouse
