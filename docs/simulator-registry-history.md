# Earlier registry simulator artifacts

These records apply only to the earlier npm artifacts. They do not identify the corresponding source of the current AnaCode source build.

| npm release | Wrapper Git head | Embedded WASM SHA-256 | Banner |
|---|---|---|---|
| 1.7.0 | `0ef17a488b2540efe5b48f7dd4c45b8ae6f1b910` | `0cf0c69ff4428a5fbb4ada25b4fb35ec1e35c9d1bc00a2fa5e082ad18fa6a6fa` | ngspice-45.2+, Tue Mar 24 02:02:56 UTC 2026 |
| 1.8.0 | `f4dab6458d3865a1db9766008480690d23410c3a` | `ed7995425b6f7af02db874539d13ea10d07759d5f2be6b79969343459ae886e4` | ngspice-45.2, Sat Sep 5 01:00:10 UTC 2026 |

For 1.7.0, timestamp correlation suggested ngspice commit `2d3e032a3f0ad0fde15bdec1836a8b9072c75df5` (`ngspice-45.2-149-g2d3e032a3`) and emsdk commit `56a2c6e3681497b04edfd0a7972e6d435b266114` / Emscripten 5.0.4. That was correlation, not proof of correspondence to the distributed bytes. Those candidates must not be carried into the 1.8.0 or source-built records.

The 1.8.0 npm tarball SHA-256 was `8b5e89e336e73f5517e7acc958c555147ef6ec67a2c511e81b801b752399a1bf`, with integrity `sha512-surzfC0ZZYRN9X3sRN4w5RqTUypoEArTyMQJTXnBLguH10G+QKLp2LveXHybxyTZPLZVPTfahVw6J8U2caf1vg==`. All fourteen mounted modelcard files and the additional GF180 payload were identical to 1.7.0. Both packages provided only the wrapper MIT license at their top level; complete source/build and model evidence was not supplied with their binaries.

The replacement build instead compiles an immutable ngspice source commit, provides corresponding source and notices, verifies the sole retained BSIM benchmark payload, and excludes unused model libraries. See [the current provenance record](simulator-provenance.md).
