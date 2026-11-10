# Icarus Verilog for the browser (WebAssembly)

These files run BitFlow's in-browser simulator (lib/sim/). They are **Icarus Verilog**, © Stephen Williams and
contributors, licensed under the **GNU General Public License, version 2 or later** (LICENSE in this folder).
They are separate programs: BitFlow passes them source files and reads back their output through an in-memory
file system, and does not link to them.

| File | Program | SHA-256 |
| --- | --- | --- |
| `ivlpp.js` / `ivlpp.wasm` | preprocessor | `97d41e9c…` / `039bfd9a34d5fb527f1309a680a8361c259bd4d6d4d1e6e91020e28da39487c0` |
| `ivl.js` / `ivl.wasm` | compiler (with the `vvp` code generator linked in) | `a2f56ba8…` / `8e909e2d9c7e7ee7a59c25694fa923eae3d60b78993b6e42cc2f53701dc42cea` |
| `vvp.js` / `vvp.wasm` | simulation runtime (with `system.vpi` linked in) | `7bb37621…` / `c38bf14a399b66a226fecc90285f35f465eeb759bf37aee59f6aed9cb7e948bd` |

## Corresponding source

- **Icarus Verilog** 14.0 (devel), upstream commit `c7530db` (master, 2026-05-31):
  https://github.com/steveicarus/iverilog/tree/c7530db
- **WebAssembly build** (Emscripten; static linking of `tgt-vvp` into `ivl` and of `system.vpi` into `vvp`), copied
  unmodified from VeriSim by Şenol Gülgönül at commit `72a89d69db323b6bb25f8a065627467800aa59a8`:
  https://github.com/senolgulgonul/verisim/tree/72a89d69db323b6bb25f8a065627467800aa59a8

To get the source or report a problem with these builds, open the links above or contact BitFlow through /contact.
