PDF.js 5.6.205, official legacy/build files from pdfjs-dist.
The core and worker are the same version. Legacy includes compatibility for modern APIs absent in some browsers.
Original TOPIK PDF/MP3 bytes are not modified.
Source: https://www.npmjs.com/package/pdfjs-dist/v/5.6.205
License: Apache 2.0, see LICENSE.
v9 also includes the matching official OpenJPEG wasm decoder, JavaScript fallback
and BSD license files. They are required by the untouched round-64 TOPIK II
listening transcript's JPEG 2000 images. wasmUrl points to the local wasm folder;
no third-party CDN request is required at runtime.
