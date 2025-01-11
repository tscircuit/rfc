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

## tscircuit snippets

An example tscircuit snippet will repeatedly be used in this document, it represents
a fairly complex transpilation scenario, though it's purpose is very simple.

```tsx
import manualEdits from "./manual-edits.json"
import { CustomLed } from "@tsci/seveibar.custom-led"

export const MySnippet = () => (
  <subcircuit manualEdits={manualEdits}>
    <CustomLed name="LED1" gnd="net.GND" v5="net.V5" />
    <CustomLed name="LED2" gnd="net.GND" v5="net.V5" />
  </subcircuit>
)
```

This snippet simply represents two custom leds and some connections to a larger
trace net. Perhaps the `manual-edits.json` file contains some placement data.

## 2024 Pipeline `p2024`

<!-- The CommonJS Build and Eval pipline describes a process of compiling a snippet
into a single javascript file that can be `eval`'d in any runtime. When `eval`'d,
it returns all of the exports of the module.

This format does not support async modules. CommonJS is considered an old and -->

### Stage 1: Strip Typescript, Convert to CommonJS

```tsx
import * as Babel from "@babel/standalone"

Babel.transform(fileContent, {
  presets: ["react", "typescript"],
  plugins: ["transform-modules-commonjs"],
  filename: "virtual.tsx",
})
```
