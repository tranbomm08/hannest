# Third-party files for HANNEST Campus LV1

## Three.js 0.186.1 (r186)

- Source: https://registry.npmjs.org/three/-/three-0.186.1.tgz
- Official project: https://github.com/mrdoob/three.js
- Registry metadata: https://registry.npmjs.org/three/0.186.1
- Version pinned from the official npm `latest` record checked on 2026-10-04.
- License: MIT; the original copyright and permission notice are preserved in `LICENSE` and the source headers.
- The three copied files are byte-for-byte files from the official npm archive; no minification or source changes were applied.
- Archive integrity checked against npm metadata: `sha512-blFeqb49wRCSGUGj7gtpfnSGHy2lwDk94RhUmS1c/hTby70kvChbWpkJ4Pm1390LqzzvTmzgXKHPEafJwCb8jA==`.
- Archive SHA-1 checked against npm metadata: `6d50f70c2c437f844179bbb56d6f5b774e1ca38a`.
- Archive SHA-256: `8cd068708ea44f2c73c944b1cead2ba2f0d5c15c8fc194e5700f4e4f4a033fe7`.

| Local file | Bytes | SHA-256 |
| --- | ---: | --- |
| `three.module.js` | 662772 | `9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea` |
| `three.core.js` | 1458113 | `9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6` |
| `LICENSE` | 1081 | `8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc` |

Import the pinned local module with `import * as THREE from './vendor/three.module.js';`. It imports the matching `./three.core.js` from this folder. The game does not load Three.js from a CDN and does not alter the Flutter project's package.json or renderer.

Official references consulted for implementation:

- Installation: https://threejs.org/manual/pages/installation.html — ES modules and matching dependency versions.
- Disposal: https://threejs.org/manual/pages/how-to-dispose-of-objects.html — explicitly dispose geometry, material, texture, render target and renderer resources; removing scene objects alone does not free them.

When updating, obtain a single official pinned release, verify archive integrity, replace both module files together, preserve the license, record new hashes, and rerun the LV1 tests and both Flutter web base builds.


Room 101 patch 2026-10-05: GLTFLoader.js, BufferGeometryUtils.js and SkeletonUtils.js
come from the same pinned Three.js 0.186.1 npm archive and retain its MIT license.
Only module import paths were changed to use the existing local three.module.js
and sibling helpers. Core/module files, renderer and global package.json are unchanged.
Original source: https://registry.npmjs.org/three/-/three-0.186.1.tgz
GLB asset source and attribution: ../models/CREDITS_LV1.txt.
