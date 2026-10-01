// SPDX-License-Identifier: GPL-2.0-or-later
// Static-link integration for the pinned Icarus compiler/runtime. All language
// parsing, elaboration, event scheduling and VCD output remain upstream code.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const source = resolve(process.argv[2] ?? '.tmp/icarus-build/source');
const edit = (file, update) => { const path = join(source, file); writeFileSync(path, update(readFileSync(path, 'utf8'))); };
function replace(text, before, after) {
  assert.equal(text.split(before).length, 2, `Pinned Icarus patch anchor changed: ${before.slice(0, 100)}`);
  return text.replace(before, after);
}
function replaceFunction(text, signature, body) {
  const start = text.indexOf(signature), end = text.indexOf('\n}', start);
  assert(start >= 0 && end > start, `Pinned Icarus function changed: ${signature}`);
  return text.slice(0, start) + signature + '\n{\n' + body + '\n}' + text.slice(end + 2);
}
edit('t-dll.cc', (text) => {
  const start = text.indexOf('      const char*dll_path_ = des->get_flag("DLL");');
  const end = text.indexOf('      stmt_cur_ = 0;', start);
  assert(start > 0 && end > start);
  text = text.slice(0, start) + `      // AnaCode: this browser compiler has exactly one statically linked target.
      const char*dll_path_ = des->get_flag("DLL");
      if (!dll_path_ || strcmp(dll_path_, "vvp.tgt") != 0) {
          cerr << "Only the built-in vvp target is supported." << endl;
          return false;
      }
      dll_ = 0;

` + text.slice(end);
  text = replace(text, 'target_ = reinterpret_cast<target_design_f>(ivl_dlsym(dll_, LU "target_design" TU));', 'target_ = &target_design;');
  text = replace(text, '      ivl_dlclose(dll_);\n      return rc;', '      // The statically linked target has no dynamic library handle.\n      return rc;');
  return replaceFunction(text, 'void dll_target::test_version(const char*target_name)', '      const char*version = target_query("version");\n      cout << target_name << ": " << (version ? version : "built-in vvp") << endl;');
});

// Keep each module's original registration table and functions. Renaming the
// four public tables permits static linking without symbol collisions.
for (const [file, table] of [['sys_table.c', 'system'], ['v2005_math.c', 'v2005'], ['v2009_table.c', 'v2009'], ['va_math.c', 'vams']]) {
  edit(`vpi/${file}`, (text) => replace(text, 'void (*vlog_startup_routines[])(void)', `void (*anacode_${table}_startup[])(void)`));
}
writeFileSync(join(source, 'anacode_static_vpi.h'), `// SPDX-License-Identifier: GPL-2.0-or-later
// AnaCode static VPI registration adapter; uses upstream registration tables.
#include <cstring>
extern "C" {
extern void (*anacode_system_startup[])(void);
extern void (*anacode_v2005_startup[])(void);
extern void (*anacode_v2009_startup[])(void);
extern void (*anacode_vams_startup[])(void);
}
static bool anacode_register_static_vpi(const char* name) {
    const char* base = std::strrchr(name, '/'); base = base ? base + 1 : name;
    if (std::strcmp(base, "system.vpi") && std::strcmp(base, "system") &&
        std::strcmp(base, "v2005_math.vpi") && std::strcmp(base, "v2005_math") &&
        std::strcmp(base, "v2009.vpi") && std::strcmp(base, "v2009") &&
        std::strcmp(base, "va_math.vpi") && std::strcmp(base, "va_math")) return false;
    static bool registered = false;
    if (registered) return true;
    registered = true;
    typedef void (*startup)(void);
    startup* tables[] = {anacode_system_startup, anacode_v2005_startup, anacode_v2009_startup, anacode_vams_startup};
    for (unsigned table = 0; table < 4; ++table)
        for (unsigned i = 0; tables[table][i]; ++i) tables[table][i]();
    return true;
}
`);
edit('vpi_modules.cc', (text) => {
  text = replace(text, '#include "ivl_dlfcn.h"', '#include "ivl_dlfcn.h"\n#include "anacode_static_vpi.h"');
  return replaceFunction(text, 'bool load_vpi_module(const char*path)', `    if (anacode_register_static_vpi(path)) return true;
    cerr << "Unsupported external VPI module in browser: " << path << endl;
    return false;`);
});
edit('vvp/vpi_modules.cc', (text) => {
  text = '#include "../anacode_static_vpi.h"\n' + text;
  return replaceFunction(text, 'void vpip_load_module(const char*name)', `    vpi_mode_flag = VPI_MODE_REGISTER;
    bool loaded = anacode_register_static_vpi(name);
    vpi_mode_flag = VPI_MODE_NONE;
    if (!loaded) { fprintf(stderr, "Unsupported external VPI module in browser: %s\\n", name); exit(1); }`);
});

// Extra targets reuse the upstream object lists, generators and dependencies.
// Emscripten options apply only to final browser links, never native generators.
const flags = '-O2 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sDYNAMIC_EXECUTION=0 -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=268435456 -sSTACK_SIZE=5242880 -sEXIT_RUNTIME=1 -sINVOKE_RUN=0 -sEXPORTED_RUNTIME_METHODS=FS,callMain -sFILESYSTEM=1';
const append = (file, text) => edit(file, (old) => old + '\n# AnaCode browser build targets (GPL-2.0-or-later).\n' + text);
append('tgt-vvp/Makefile.in', 'anacode-target.a: $(O)\n\temar rcs $@ $^\n');
append('vpi/Makefile.in', 'anacode-system.a: $(O) $(OPP) $(V2005) $(V2009) $(VA_MATH)\n\t$(AR) rcs $@ $^\n');
append('ivlpp/Makefile.in', `anacode-ivlpp.js: $(O)\n\t$(CC) ${flags} -o $@ $(O)\n`);
append('Makefile.in', `anacode-ivl.js: $(O) tgt-vvp/anacode-target.a vpi/anacode-system.a\n\t$(CXX) ${flags} -o $@ $(O) tgt-vvp/anacode-target.a vpi/anacode-system.a\n`);
append('vvp/Makefile.in', `anacode-vvp.js: $(VVP_OBJ) ../vpi/anacode-system.a\n\t$(CXX) ${flags} -o $@ $(VVP_OBJ) ../vpi/anacode-system.a $(LIBS)\n`);
console.log('Applied static Icarus target/VPI and browser build integration.');
