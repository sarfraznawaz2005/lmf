import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "LMF Generator",
		identifier: "com.lmf.generator",
		version: "1.0.0",
		fileAssociations: [
			{
				ext: "lmf",
				name: "LMF File",
				description: "LLM Markup Format File",
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
			"src/mainview/settings.css": "views/mainview/settings.css",
			"system-prompt.md": "system-prompt.md",
			"src/bun/lmf.py": "lmf.py",
			"assets/icon.ico": "app.ico",
		},
		win: {
			bundleCEF: false,
			icon: "assets/icon.ico",
		},
	},
} satisfies ElectrobunConfig;
