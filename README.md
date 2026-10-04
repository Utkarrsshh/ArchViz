# WebArchViz Master

Reusable web runtime for Blender-authored architectural visualisation: React 19, React Three Fiber,
three.js, Vite. The Master contains the engine only; each client project adds its own
Blender-generated scene package.

Runtime features: camera system (waypoints, transitions, FOV, reset), property pins driven by
Blender `PIN_*` / `CAM_*` markers, wave-based environment streaming, instanced plants with
per-variant LOD and per-cell frustum culling, instanced fence parts, KTX2 textures with PNG
fallback, manifest-driven shadows, a Blender-driven sun, per-asset error boundaries and a
loading/developer status panel.

## New project

1. Copy the whole Master into a new repository (`git lfs install` once per machine).
2. Export the Blender scene into `public/environments/<id>/` - see [docs/SCENE_PACKAGE.md](docs/SCENE_PACKAGE.md).
3. `npm ci`, then `npm run optimize:textures -- public/environments/<id>` (needs KTX-Software).
4. Set the package id: `VITE_ENVIRONMENT_ID=<id>` in `.env.local` and in the Vercel project
   settings (or edit the default in `src/config/environment.ts`).
5. Optional per-project tuning in `src/config/`:
   - `camera.ts` - `HOME_CAMERA_ID` (a Blender camera marker as the start/reset view) and behaviour limits
   - `lighting.ts` - background, fill light, sun intensity, shadow map, shadow volume height
   - `plants.ts` - corrections for a plant card bake (off by default)
   - pin colours in `src/components/pins/PropertyPin.css`; title in `index.html`
6. `npm run dev`, check the developer panel, then `npm run build`.

Pins and cameras are never written in TypeScript: add, move or remove `PIN_*` / `CAM_*` objects
in Blender and re-export. Without a package, the app shows "No environment package" and nothing else.

## Scripts

| Command | |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc -b`) and production build to `dist/` |
| `npm run lint` | ESLint |
| `npm run optimize:textures -- <packageDir> [--dry-run]` | Derive KTX2 GLBs and record them in `layout.json` |

## Layout

```
src/config/        per-project settings (environment id, camera, lighting, plant cards, fallback pins)
src/systems/       camera, pins, environment runtime (loader, streaming, LOD, culling, KTX2, lighting, shadows)
src/components/    R3F/React components (viewport, scene, camera controller, pins, environment parts, status UI)
scripts/           build-time tooling
docs/              scene package contract
public/environments/<id>/   the project's Blender export (Git LFS)
```
