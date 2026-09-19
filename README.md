# ICAV SPI website

Static, five-page website deployed to GitHub Pages by `.github/workflows/deploy.yml` whenever `main` changes.

- Edit page content in the five root HTML files.
- Shared layout and typography: `site.css`.
- Flight visual: `loiter.css`; interactions: `site.js`.
- Preview locally with `python -m http.server 8765`.

## Photography

The ten photographs in use are original downloads from the team's public LinkedIn page. `image-sources.json` records the source URL and native dimensions for each. Files retain the downloaded bytes; no AI reconstruction, sharpening, upscaling or recompression was applied. Most publicly available source photos are 800 pixels wide. Larger originals supplied by the team would improve the fullscreen slideshow on high-density screens.

Each photograph is used once across all five pages. Preserve this when adding or replacing pictures. Use descriptive alternative text and retain width/height attributes. Keep editorial photos at their natural aspect ratio.

## Content and interaction

The 100-hour flight is an ambition and the scroll animation is illustrative, not recorded or live telemetry. The January 2026 demonstrator was battery powered. Avoid presenting plans as completed flights. Update the aircraft status from team-confirmed information.

The slideshow has a pause button, pauses while the tab is hidden, and starts paused when reduced motion is requested. The mobile menu supports Escape and exposes its expanded state.
