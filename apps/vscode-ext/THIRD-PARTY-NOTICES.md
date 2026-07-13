# Third-Party Notices

OMX Viewer is licensed under the MIT License (see [LICENSE](LICENSE)). It embeds or
bundles the following third-party software, reproduced here to satisfy their
license terms.

---

## h5wasm (HDF5 compiled to WebAssembly)

Used for all HDF5/OMX file parsing. The compiled WebAssembly binary embeds the
HDF5 C library. Source: https://github.com/usnistgov/h5wasm

```
h5wasm license statement:

NIST-developed software is provided by NIST as a public service. You may use,
copy, and distribute copies of the software in any medium, provided that you
keep intact this entire notice. You may improve, modify, and create derivative
works of the software or any portion of the software, and you may copy and
distribute such modifications or works. Modified works should carry a notice
stating that you changed the software and should note the date and nature of
any such change. Please explicitly acknowledge the National Institute of
Standards and Technology as the source of the software.

NIST-developed software is expressly provided "AS IS." NIST MAKES NO WARRANTY
OF ANY KIND, EXPRESS, IMPLIED, IN FACT, OR ARISING BY OPERATION OF LAW,
INCLUDING, WITHOUT LIMITATION, THE IMPLIED WARRANTY OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND DATA ACCURACY. NIST
NEITHER REPRESENTS NOR WARRANTS THAT THE OPERATION OF THE SOFTWARE WILL BE
UNINTERRUPTED OR ERROR-FREE, OR THAT ANY DEFECTS WILL BE CORRECTED. NIST DOES
NOT WARRANT OR MAKE ANY REPRESENTATIONS REGARDING THE USE OF THE SOFTWARE OR
THE RESULTS THEREOF, INCLUDING BUT NOT LIMITED TO THE CORRECTNESS, ACCURACY,
RELIABILITY, OR USEFULNESS OF THE SOFTWARE.

You are solely responsible for determining the appropriateness of using and
distributing the software and you assume all risks associated with its use,
including but not limited to the risks and costs of program errors, compliance
with applicable laws, damage to or loss of data, programs or equipment,
and the unavailability or interruption of operation. This software is not
intended to be used in any situation where a failure could cause risk of
injury or damage to property. The software developed by NIST employees is not
subject to copyright protection within the United States.


Built using the HDF5 library. HDF5 Copyright statement is included below:

Copyright Notice and License Terms for
HDF5 (Hierarchical Data Format 5) Software Library and Utilities
-----------------------------------------------------------------------------

HDF5 (Hierarchical Data Format 5) Software Library and Utilities
Copyright 2006 by The HDF Group.

NCSA HDF5 (Hierarchical Data Format 5) Software Library and Utilities
Copyright 1998-2006 by The Board of Trustees of the University of Illinois.

All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted for any purpose (including commercial purposes)
provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions, and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions, and the following disclaimer in the documentation
   and/or materials provided with the distribution.

3. Neither the name of The HDF Group, the name of the University, nor the
   name of any Contributor may be used to endorse or promote products derived
   from this software without specific prior written permission from
   The HDF Group, the University, or the Contributor, respectively.

DISCLAIMER:
THIS SOFTWARE IS PROVIDED BY THE HDF GROUP AND THE CONTRIBUTORS
"AS IS" WITH NO WARRANTY OF ANY KIND, EITHER EXPRESSED OR IMPLIED. IN NO
EVENT SHALL THE HDF GROUP OR THE CONTRIBUTORS BE LIABLE FOR ANY DAMAGES
SUFFERED BY THE USERS ARISING OUT OF THE USE OF THIS SOFTWARE, EVEN IF
ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

You are under no obligation whatsoever to provide any bug fixes, patches, or
upgrades to the features, functionality or performance of the source code
("Enhancements") to anyone; however, if you choose to make your Enhancements
available either publicly, or directly to The HDF Group, without imposing a
separate written license agreement for such Enhancements, then you hereby
grant the following license: a non-exclusive, royalty-free perpetual license
to install, use, modify, prepare derivative works, incorporate into other
computer software, distribute, and sublicense such enhancements or derivative
works thereof, in binary and source code form.
```

---

## Codicons (icon font)

This extension bundles `codicon.ttf` and `codicon.css` from
[@vscode/codicons](https://github.com/microsoft/vscode-codicons), copied
unmodified into the packaged extension.

> Codicons are licensed under the [Creative Commons Attribution 4.0
> International License (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/).
>
> Copyright (c) Microsoft Corporation

---

## Fonts (SIL Open Font License 1.1)

- **Inter** — https://github.com/rsms/inter — bundled via `@fontsource/inter`
- **JetBrains Mono** — https://www.jetbrains.com/lp/mono/ — bundled via `@fontsource/jetbrains-mono`

Both are licensed under the [SIL Open Font License, Version 1.1](https://openfontlicense.org/),
which permits bundling, embedding, and redistributing fonts in software without
royalty. No modifications have been made to either font.

---

## Other MIT-licensed dependencies

The following are used under the MIT License. Each retains its own copyright
notice within its published package.

| Package | Purpose | Source |
|---|---|---|
| svelte | UI framework | https://github.com/sveltejs/svelte |
| @tanstack/svelte-virtual, @tanstack/virtual-core | Grid virtualization | https://github.com/TanStack/virtual |

---

*This file is a compliance notice, not a modification of the license terms
above. See each project's own repository for authoritative license text.*
