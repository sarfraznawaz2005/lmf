import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "LMF Viewer",
		identifier: "com.lmf.viewer",
		version: "1.0.0",
		fileAssociations: [
			{
				ext: "lmf",
				name: "LMF File",
				description: "LLM Markup Format File",
				mimeType: "text/plain",
			},
		],
	},
	build: {
		bun: {
			entrypoint: "src/bun/index.ts",
		},
		views: {
			mainview: {
				entrypoint: "src/mainview/index.ts",
			},
		},
		copy: {
			"src/mainview/index.html": "views/mainview/index.html",
			"src/mainview/index.css": "views/mainview/index.css",
		},
		win: {
			bundleCEF: false,
			icon: "assets/icon.ico",
		},
	},
} satisfies ElectrobunConfig;
