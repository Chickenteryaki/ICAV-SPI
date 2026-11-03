# step2glb

Converts the Onshape STEP export of the aircraft into the `.glb` model used by the
3D viewer on the Aircraft page (`hangar.js`, `assets/models/icav-spi.glb`).

```
pip install numpy scipy
python3 tessellate.py Assembly.step ../../assets/models/icav-spi.glb
```

- Reads AP242 B-rep solids: planes, cylinders, cones, (degenerate) tori and
  (rational) B-spline surfaces bounded by lines, circles, ellipses and B-splines.
- Keeps the Onshape part colours and assembly placements (one mesh per part,
  one node per instance) and also writes each part's edges, which the viewer
  uses for its Blueprint mode.
- Part names shown in the viewer come from `NAMES` in `asm_info.py`
  (keyed by the solid's STEP entity id) and `NAMES` in `hangar.js` (keyed by
  mesh name). Update both if the CAD's structure changes.
- After re-exporting, bump the `?v=` on `data-hangar` in `aircraft.html` so
  browsers fetch the new model.

`earcut.py` is a Python port of mapbox/earcut (ISC licence).
