# Third-party notices

## FPZIP 1.3.0 WebAssembly decoder

The local Draw Things connector contains an FPZIP decoder because Draw Things can return
FPZIP-compressed NNC tensors when **Response Compression** is enabled.

- FPZIP source: <https://github.com/weiyanlin117/swift-fpzip-support/tree/0ec6d4668c9c83bc3da0f8b2d6dfc46da0b98609>
- Source revision: `0ec6d4668c9c83bc3da0f8b2d6dfc46da0b98609` (`fpzip` 1.3.0)
- Prebuilt Emscripten artifact provenance: <https://github.com/kcjerrell/dt-grpc-ts/blob/60c843d1d3bb0b3993c987d3826c2755d15c1aae/src/fpzip/fpzip_wasm.wasm>
- Artifact revision: `60c843d1d3bb0b3993c987d3826c2755d15c1aae`
- Original `fpzip_wasm.wasm` size: 86,086 bytes
- Original SHA-256: `9bad25087f8f94a22c0d7320f1c280ac8df92f25be8d4be96dff7b1517a09eee`

Packaging method: the prebuilt WASM bytes are kept unchanged, gzip-compressed to 11,660 bytes,
Base64-encoded, and embedded in `bridge/fpzip.ts`. The connector decompresses and instantiates
those bytes through Node's built-in `zlib` and `WebAssembly` APIs. The generated connector is one
JavaScript file; it does not fetch a `.wasm` file and adds no npm runtime dependency. The artifact's
upstream repository identifies it as Emscripten output, but does not include the original Emscripten
compiler command, so that prebuilt artifact is pinned and verified by its SHA-256 rather than claimed
as a reproducible local compilation.

FPZIP is licensed under the BSD 3-Clause License:

```text
BSD 3-Clause License

Copyright (c) 2018-2019, Lawrence Livermore National Security, LLC
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

FPZIP notice:

```text
This work was produced under the auspices of the U.S. Department of
Energy by Lawrence Livermore National Laboratory under Contract
DE-AC52-07NA27344.

This work was prepared as an account of work sponsored by an agency of
the United States Government. Neither the United States Government nor
Lawrence Livermore National Security, LLC, nor any of their employees
makes any warranty, expressed or implied, or assumes any legal liability
or responsibility for the accuracy, completeness, or usefulness of any
information, apparatus, product, or process disclosed, or represents that
its use would not infringe privately owned rights.

Reference herein to any specific commercial product, process, or service
by trade name, trademark, manufacturer, or otherwise does not necessarily
constitute or imply its endorsement, recommendation, or favoring by the
United States Government or Lawrence Livermore National Security, LLC.

The views and opinions of authors expressed herein do not necessarily
state or reflect those of the United States Government or Lawrence
Livermore National Security, LLC, and shall not be used for advertising
or product endorsement purposes.
```

The `dt-grpc-ts` package metadata declares the reference artifact repository as MIT licensed.
No JavaScript loader code from that package is included; the connector uses its own minimal loader.
