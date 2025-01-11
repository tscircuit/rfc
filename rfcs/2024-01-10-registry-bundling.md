# Registry Transpilation and Bundling

The Javascript Ecosystem has not settled on a single strategy for packaging javascript modules,
there are [ES Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) and
[CommonJS Modules](https://wiki.commonjs.org/wiki/CommonJS), and mixed/limited support for importing
inside the browser.

tscircuit supports rendering circuits on both servers and server-javascript runtimes like Deno, Bun
and NodeJS. However, the code that users use to create tscircuit often uses `tsx`, React, and Typescript-
these features require transpilation.

The tscircuit registry exposes many different file types to accomodate for these different runtimes. This RFC
serves as a specification so that the correct files can be selected for different
contexts where someone might want to build circuits. Even in cases where you are
not using the tscircuit registry, the pipeline presented in this RFC can be used for
any dynamic evaluation of tscircuit snippets.

## Constraints, Features

- `dist/index.js` is generated for every snippet and is served for snippets that
  make requests to `esm.tscircuit.com`
  - esm versions of packages should be used when using Bun
  - `importSnippet("...")` should use `esm` modules
- `dist/index.cjs` is used by browsers
  - Browsers must use `dist/index.cjs` because otherwise singleton modules like
    `react` or `@tscircuit/core` can't be injected
  - `dist/index.cjs` is served by default for api calls made to
    `cjs.tscircuit.com`
- Snippets fully bundle any other snippets they use by default
- All transpilation can be done in browser, the main two dependencies are
  `@babel/standalone` and `@rollup/browser`

## tscircuit snippets

An example tscircuit snippet will repeatedly be used in this document, it represents
a fairly complex transpilation scenario, though it's purpose is very simple.

```tsx
import manualEdits from "./manual-edits.json"
import { CustomLed } from "@tsci/seveibar.custom-led"

export const MySnippet = () => (
  <subcircuit manualEdits={manualEdits}>
    <CustomLed name="LED1" gnd="net.GND" v5="net.V5" />
  </subcircuit>
)
```

This snippet simply represents two custom leds and some connections to a larger
trace net. Perhaps the `manual-edits.json` file contains some placement data.

## 1. ESM (ECMAScript Modules) Pipeline

> Check out the [example-esm-transpile.tsx script](../assets/2025-01-10-registry-bundling-and-transpilation/example-esm-transpile.tsx)

This approach is ideal for NodeJS and Bun that support ES Modules natively.

```tsx
// Stage 1: Babel Transpilation
const babelResult = Babel.transform(sourceCode, {
  presets: ["react", "typescript"],
  plugins: [],
  filename: "virtual.tsx",
})
```

This will output javascript without types, something that can be consumed in
non-javascript runtimes.

```
import manualEdits from "./manual-edits.json";
import { CustomLed } from "@tsci/seveibar.custom-led";
import { createUseComponent } from "@tscircuit/core";
const pinLabels = ["power"];
export const MySnippet = ({ power }) =>
  /*#__PURE__*/ React.createElement(
    "subcircuit",
    {
      manualEdits: manualEdits,
    },
    /*#__PURE__*/ React.createElement(CustomLed, {
      name: "LED1",
      gnd: "net.GND",
      v5: power,
    }),
  );
export const useMySnippet = () => createUseComponent(pinLabels, MySnippet);
```

```tsx
// Stage 2: Bundle with Rollup
const bundle = await rollup({
  input: "entry.js",
  plugins: [bundleTsciModulesPlugin],
})

const rollupResult = await bundle.generate({
  format: "esm",
  name: "MyBundle",
})

// Stage 3: Dynamic Import
const blob = new Blob([rollupResult.output[0].code], {
  type: "application/javascript",
})
const url = URL.createObjectURL(blob)
const module = await import(url)

console.log(<module.MySnippet />)
```

The rollup result will look like this, you can see the things like the
`import manualEdits from "./manual-edits.json"` have been replaced with
the actual content of the files. This happens for local imports as well
as any `@tsci/*` import.

```
import { createUseComponent } from "@tscircuit/core";

var manualEdits = {};

const CustomLed = (props) => <led {...props} />

const pinLabels = ["power"];
const MySnippet = ({ power }) =>
  /*#__PURE__*/ React.createElement(
    "subcircuit",
    {
      manualEdits: manualEdits,
    },
    /*#__PURE__*/ React.createElement(CustomLed, {
      name: "LED1",
      gnd: "net.GND",
      v5: power,
    }),
  );
const useMySnippet = () => createUseComponent(pinLabels, MySnippet);

export { MySnippet, useMySnippet };
```

### Computed Asset `dist/index.js`

The registry computes the bundled asset `dist/index.js` which contains the esm
version of the module (the output of rollup above)

## 2. CommonJS Browser Eval Pipeline

> Check out the [example-cjs-transpile.tsx script](../assets/2025-01-10-registry-bundling-and-transpilation/example-cjs-transpile.tsx)

```tsx
// Stage 1: Babel Transpilation
const babelResult = Babel.transform(sourceCode, {
  presets: ["react", "typescript"],
  plugins: [],
  filename: "virtual.tsx",
})

// Stage 2: Bundle with Rollup
const bundle = await rollup({
  input: "entry.js",
  plugins: [bundleTsciModulesPlugin],
})

const rollupResult = await bundle.generate({
  format: "cjs",
  name: "MyBundle",
})
```

The rollup result will now be CommonJS, it looks like this:

```
"use strict";

var core = require("@tscircuit/core");

var manualEdits = {};

const CustomLed = (props) => null;

const pinLabels = ["power"];
const MySnippet = ({ power }) =>
  /*#__PURE__*/ React.createElement(
    "subcircuit",
    {
      manualEdits: manualEdits,
    },
    /*#__PURE__*/ React.createElement(CustomLed, {
      name: "LED1",
      gnd: "net.GND",
      v5: power,
    }),
  );
const useMySnippet = () => core.createUseComponent(pinLabels, MySnippet);

exports.MySnippet = MySnippet;
exports.useMySnippet = useMySnippet;
```

```tsx
// Stage 3 (option 2) Custom Require Implementation (Most common!)
const dependencies = {
  "@tscircuit/core": tscircuitCore,
}

function createRequire(dependencies) {
  return function require(moduleName) {
    if (!dependencies[moduleName]) {
      throw new Error(`Module ${moduleName} not found`)
    }
    return dependencies[moduleName]
  }
}

const requireFn = createRequire(dependencies)
const module = { exports: {} }
const fn = new Function("require", "module", "exports", bundledCode)
fn(requireFn, module, module.exports)

console.log(<module.exports.MySnippet />)
```

### Computed Asset `dist/index.cjs`

The commonjs variant of the module is stored at `dist/index.cjs`

## The Rollup Plugin

This custom rollup plugin enables bundling of tsci modules. This is the basic
concept, you may need to modify in production. See the [example scripts](../assets/2025-01-10-registry-bundling-and-transpilation/) for more information about
usage.

```tsx
const bundleTsciModulesPlugin = {
  name: "virtual-modules",
  // 1. Let Rollup know we can resolve these imports
  resolveId(source: string) {
    // Our "entry" module
    if (source === "entry.js") return source

    // Local JSON file
    if (source === "./manual-edits.json") return source

    if (source.startsWith("@tsci/")) {
      return source
    }

    return { id: source, external: true }
  },
  // 2. Provide the module source for each resolved import
  async load(id: string) {
    if (id === "entry.js") {
      // Return the code we just transpiled with Babel
      return babelResult.code
    }
    if (id === "./manual-edits.json") {
      // Example: we can inline an empty JSON for now
      return "export default {};"
    }

    if (id.startsWith("@tsci/")) {
      // Dynamically load an ESM bundle here!
      return await fetch("https://esm.tscircuit.com/seveibar/usb-c-flashlight")
      // // Provide minimal stubs or the actual code if you have it
      // return `export const CustomLed = (props) => null;`
    }

    return null
  },
}
```
