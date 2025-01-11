import * as Babel from "@babel/standalone";
import exampleSnippet from "./example-snippet.string";
import { rollup } from "@rollup/browser";
import prettier from "prettier";

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

		// Any third-party or local modules you see in the snippet:
		// e.g. "@tsci/seveibar.custom-led", "@tscircuit/core"
		if (source.startsWith("@tsci/seveibar.custom-led")) return source;
		if (source.startsWith("@tscircuit/core")) return source;

		// If we don't recognize it, we can still return null,
		// but be aware that Rollup might attempt default FS resolution next.
		// If that's going to fail, you'll need to handle it here too.
		return null;
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
		if (id.startsWith("@tscircuit/core")) {
			return `export default {}; export const createUseComponent = (...args) => null;`;
		}

		// For anything else, just provide a dummy export or mark as external
		return `export default {};`;
	},
};

// Replace imports via rollup
console.log("------------- STAGE 2 ESM ROLLUP --------------\n\n");

const bundle = await rollup({
	input: "entry.js",
	plugins: [virtualModulesPlugin],
});

const rollupResult = await bundle.generate({
	format: "esm",
	name: "MyBundle",
});

console.log(
	await prettier.format(rollupResult.output[0].code, {
		parser: "typescript",
	}),
);
console.log("\n");

console.log("------------- STAGE 3 BLOB AND EVAL --------------\n\n");

const blob = new Blob([rollupResult.output[0].code], {
	type: "application/javascript",
});
const url = URL.createObjectURL(blob);
const module = await import(url);

console.log(module);
console.log(<module.MySnippet />);
console.log("\n");
