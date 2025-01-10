# Registry Transpilation and Bundling

The Javascript Ecosystem has not settled on a single strategy for packaging javascript modules,
there are [ES Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) and
[CommonJS Modules](https://wiki.commonjs.org/wiki/CommonJS), and mixed/limited support for importing
inside the browser.

tscircuit supports rendering circuits on both servers and server-javascript runtimes like Deno, Bun
and NodeJS. However, the code that users use to create tscircuit often uses `tsx`, React, and Typescript-
these features require transpilation.

The tscircuit registry exposes many different file types to accomodate for these different runtimes.
