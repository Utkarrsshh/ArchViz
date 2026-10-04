# Scene package contract (`webarchviz-layout/1`)

A scene package is the Blender-generated folder the runtime loads. It lives at
`public/environments/<id>/` and is selected by `VITE_ENVIRONMENT_ID` (`src/config/environment.ts`).
The authoritative definition is `src/systems/environment/environmentTypes.ts` (types) and
`environmentLoader.ts` (validation). This page summarises it.

```
public/environments/<id>/
├── layout.json                  manifest (required)
├── scene/
│   ├── shell.glb                required - static environment (ground included)
│   ├── plants.glb               optional - variant-instanced vegetation
│   ├── fence.glb                optional - single-node instanced parts
│   ├── props.glb                optional - unique static meshes
│   └── optimized/*.ktx.glb      optional - written by `npm run optimize:textures`
└── data/
    ├── *_matrices.bin           float32, 16 per instance, column-major 4x4, glTF Y-up, little-endian
    └── plant_variants.bin       uint8 per plant instance (variant index), same order
```

Source textures are embedded in the GLBs and are **not** needed at runtime. Everything under
`public/` is deployed, so keep a source `textures/` folder out of the package (or accept the size).

## layout.json

| Key | Required | Meaning |
|---|---|---|
| `schema` | yes | `"webarchviz-layout/1"` |
| `units` / `upAxis` | yes | `"metres"` / `"Y"` |
| `site.min`, `site.max` | yes | Site rectangle on the **Blender ground plane (x, y)**; runtime maps to glTF `(x, -y)`. Drives camera framing/bounds and the sun's shadow camera |
| `scene.shell` | yes | Package-relative path. Paths must be relative and stay inside the package |
| `scene.plants` / `scene.fence` / `scene.props` | no | Package-relative paths |
| `instanced.<key>` with `variantNodes` | with plants | Exactly one set whose `glb` is `scene.plants`: `count`, `stride: 16`, `matrices`, `variants`, `variantNodes[lod][variant]`, `lod[] {level, maxDistance (null on last), tris}` |
| `instanced.<key>` with `node` | with fence | Sets whose `glb` is `scene.fence`: `node`, `count`, `matrices`, `tris`. Nodes must sit at the origin with identity transforms |
| `cells[]` | with plants | `{id, start, count, min, max}` - contiguous ranges over plant instances (in matrix order), ground-plane rectangles |
| `shadows` | no | `cast[]`, `receiveOnly[]`, `neither[]` (glTF node names; unlisted = receive only), `castPlantsWithin` (metres) |
| `lighting.sun.direction` | no | Direction the light travels, glTF space |
| `markers` | no | See below. Without it, the fallbacks in `src/config/camera.ts` / `pins.ts` are used |
| `optimized.ktx2.<part>` | no | Written by the optimize script; PNG GLBs remain the fallback |
| `package`, `textures`, `runtimeNotes`, `warning`, `matrixOrder` | no | Informational |

## Markers (Blender `WEB_MARKERS` collection)

Already converted to glTF space by the exporter: Blender `(x, y, z)` → `(x, z, -y)`.

```jsonc
"markers": {
  "pinMarkers": [
    { "id": "entrance", "label": "Entrance", "description": "...", "position": [x, y, z],
      "waypointId": "cam-entrance", "enabled": true }          // from PIN_Entrance
  ],
  "cameraMarkers": [
    { "id": "cam-entrance", "pinId": "entrance", "position": [x, y, z], "target": [x, y, z],
      "fov": 50, "duration": 2 }                                // from CAM_Entrance; name defaults to the pin label
  ]
}
```

- Every pin's `waypointId` must be a camera marker `id`; otherwise the pin is skipped with a warning.
- Ids must be unique per kind. `fov` must be within `CAMERA_SETTINGS.minFov..maxFov` (20-90 by default).
- A camera marker can be the start/reset view: set `HOME_CAMERA_ID` in `src/config/camera.ts` (e.g. a `CAM_Home` exported as `"cam-home"`).
- The older array names `pins` / `cameras` are still accepted.

## Re-export checklist

1. Export from Blender into `public/environments/<id>/` (GLBs, `data/`, `layout.json` with markers).
2. `npm run optimize:textures -- public/environments/<id>` - the export rewrites `layout.json` without `optimized`.
3. `npm run dev` and check the developer panel: all parts Ready, KTX2 on, cameras listed with source `blender`.
