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

// Example: Render the component in a React app
console.log("Example Usage in React:");
const MySnippet = module.MySnippet;

// Create a wrapper component to demonstrate usage
const ExampleUsage = () => {
    return (
        <div>
            <h2>Circuit Component:</h2>
            <MySnippet />
        </div>
    );
};

console.log(<ExampleUsage />);
console.log("\n");

// Example: Access the component directly
console.log("Direct Component Access:");
console.log(module.MySnippet);
console.log("\n");
