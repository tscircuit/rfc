import * as Babel from "@babel/standalone";
import exampleSnippet from "./example-snippet.string";
import { rollup } from "@rollup/browser";
import prettier from "prettier";
import * as tscircuitCore from "@tscircuit/core";

const babelResult = Babel.transform(exampleSnippet, {
	presets: ["react", "typescript"],
	plugins: [],
	filename: "virtual.tsx",
});

console.log("------------- STAGE 1 ESM BABEL --------------\n\n");
console.log(
	await prettier.format(babelResult.code ?? "", { parser: "typescript" }),
);
console.log("\n");

// Fully custom plugin that intercepts every import
const virtualModulesPlugin = {
	name: "virtual-modules",
	// 1. Let Rollup know we can resolve these imports
	resolveId(source: string) {
		// Our "entry" module
		if (source === "entry.js") return source;

		// Local JSON file
		if (source === "./manual-edits.json") return source;

		if (source.startsWith("@tsci/")) {
			return source
		}

		return { id: source, external: true };
	},
	// 2. Provide the module source for each resolved import
	load(id: string) {
		if (id === "entry.js") {
			// Return the code we just transpiled with Babel
			return babelResult.code;
		}
		if (id === "./manual-edits.json") {
			// Example: we can inline an empty JSON for now
			return "export default {};";
		}

		if (id.startsWith("@tsci/seveibar.custom-led")) {
			// Provide minimal stubs or the actual code if you have it
			return `export const CustomLed = (props) => null;`;
		}

		return null
	},
};

// Replace imports via rollup
console.log("------------- STAGE 2 CJS ROLLUP --------------\n\n");

const bundle = await rollup({
	input: "entry.js",
	plugins: [virtualModulesPlugin],
});

const rollupResult = await bundle.generate({
	format: "cjs",
	name: "MyBundle",
});

console.log(
	await prettier.format(rollupResult.output[0].code, {
		parser: "typescript",
	}),
);
console.log("\n");

console.log("------------- STAGE 3 (Version 1) REQUIRE --------------\n\n");

const blob = new Blob([rollupResult.output[0].code], {
	type: "application/javascript",
});
const url = URL.createObjectURL(blob);
const module1 = require(url)

console.log(module1);
console.log(<module1.MySnippet />);
console.log("\n");

console.log("------------- STAGE 3 (Version 2) BROWSER-STYLE EVAL --------------\n\n");

const dependencies = {
	"@tscircuit/core": tscircuitCore
}


function createRequire(dependencies: Record<string, any>) {
  return function require(moduleName: string) {
    if (!dependencies[moduleName]) {
      throw new Error(`Module ${moduleName} not found`);
    }
    return dependencies[moduleName];
  }
}

const moduleCode = rollupResult.output[0].code

const requireFn = createRequire(dependencies);
const module2 = { exports: {} };
const fn = new Function('require', 'module', 'exports', moduleCode);
fn(requireFn, module2, module2.exports)

// Example: Using the component with CommonJS
console.log("CommonJS Usage Example:");
const { MySnippet } = module2.exports;

// Create a wrapper component to demonstrate usage
const ExampleUsage = () => {
    return (
        <div>
            <h2>Circuit Component (CommonJS):</h2>
            <MySnippet />
        </div>
    );
};

console.log(<ExampleUsage />);

// Example: Using with dependency injection
console.log("\nDependency Injection Example:");
const CircuitWrapper = () => {
    return (
        <div>
            <h3>With Injected Dependencies:</h3>
            <MySnippet 
                core={dependencies["@tscircuit/core"]}
            />
        </div>
    );
};

console.log(<CircuitWrapper />);
console.log("\n");
