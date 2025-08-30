/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
"use strict";

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

const path = require("path");
const webpack = require("webpack");

/** @type WebpackConfig */
const baseConfig = {
	mode: "none", // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
	module: {
		rules: [{
			test: /\.ts$/,
			exclude: /node_modules/,
			use: [{
				loader: "ts-loader",
			}],
		}],
	},
	externals: {
		vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
		// modules added here also need to be added in the .vscodeignore file
	},
	devtool: "nosources-source-map",
	infrastructureLogging: {
		level: "log", // enables logging required for problem matchers
	},
};


/** @type WebpackConfig */
const webExtensionConfig = {
	...baseConfig,
	target: "webworker", // extensions run in a webworker context
	entry: {
		"extension": "./src/web/extension.ts",
		"test/suite/index": "./src/web/test/suite/index.ts",
	},
	output: {
		filename: "[name].js",
		path: path.join(__dirname, "./dist/web"),
		libraryTarget: "commonjs",
		devtoolModuleFilenameTemplate: "../../[resource-path]",
	},
	resolve: {
		mainFields: ["browser", "module", "main"], // look for `browser` entry point in imported node modules
		extensions: [".ts", ".js"], // support ts-files and js-files
		alias: {
			// provides alternate implementation for node module and source files
		},
		fallback: {
			// Webpack 5 no longer polyfills Node.js core modules automatically.
			// see https://webpack.js.org/configuration/resolve/#resolvefallback
			// for the list of Node.js core module polyfills.
			"assert": require.resolve("assert"),
		},
	},
	plugins: [
		new webpack.optimize.LimitChunkCountPlugin({
			maxChunks: 1, // disable chunks by default since web extensions must be a single bundle
		}),
		new webpack.ProvidePlugin({
			process: "process/browser", // provide a shim for the global `process` variable
		}),
	],
	performance: {
		hints: false,
	},
};


// Config for webview source code (to be run in a web-based context)
/** @type WebpackConfig */
const webviewConfig = {
	...baseConfig,
	target: ["web", "es2020"],
	entry: "./src/web/webview/main.ts",
	output: {
		filename: "webview.js",
		path: path.join(__dirname, "./dist/web"),
		libraryTarget: "module",
		chunkFormat: "module",
		module: true,
	},
	experiments: {
		outputModule: true,
	},
	resolve: {
		extensions: [".ts", ".js"],
	},
};

module.exports = [webExtensionConfig, webviewConfig];
