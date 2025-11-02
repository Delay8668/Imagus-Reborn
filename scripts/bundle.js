#!/usr/bin/env node

const esbuild = require("esbuild");
const fs = require("fs/promises");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const srcDir = path.join(projectRoot, "src");
const distDir = path.join(projectRoot, "dist");

const ASSETS = [
    "options/options.html",
    "options/options.css",
    "common/img/",
    "lib/",
    "_locales/",
    "data/"
];

function stripSrcFromPaths(obj) {
    for (const key in obj) {
        if (typeof obj[key] === "string") {
            obj[key] = obj[key].replace(/^src\//, "");
        } else if (Array.isArray(obj[key])) {
            obj[key].forEach((item, index) => {
                if (typeof item === "string") {
                    obj[key][index] = item.replace(/^src\//, "");
                } else if (typeof item === 'object' && item !== null) {
                    stripSrcFromPaths(item);
                }
            });
        } else if (typeof obj[key] === "object" && obj[key] !== null) {
            stripSrcFromPaths(obj[key]);
        }
    }
    return obj;
}

async function bundle() {
    console.log("Starting bundle...");
    
    await fs.rm(distDir, { recursive: true, force: true });
    await fs.mkdir(distDir, { recursive: true });

await esbuild.build({
  entryPoints: [
    path.join(srcDir, 'main.js'),
    path.join(srcDir, 'background/service.js'),
    path.join(srcDir, 'options/options.js'),
  ],
  bundle: true,
  outdir: distDir,
  outbase: srcDir,
  minify: false,
  sourcemap: 'inline',
  format: 'iife',  // <-- CHANGE FROM 'esm' TO 'iife'
  logLevel: 'info',
});


    for (const asset of ASSETS) {
        const srcPath = path.join(srcDir, asset);
        const destPath = path.join(distDir, asset);
        try {
            await fs.mkdir(path.dirname(destPath), { recursive: true });
            await fs.cp(srcPath, destPath, { recursive: true });
        } catch (err) {
            console.warn(`Could not copy asset: ${asset}`);
        }
    }
    
    console.log("Transforming manifest.json for 'dist'...");
    const manifestPath = path.join(srcDir, "manifest.json");
    const manifestString = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestString);

    // This is the V3 manifest we fixed, with 'scripting'
    const distManifest = stripSrcFromPaths(manifest);

    await fs.writeFile(
        path.join(distDir, "manifest.json"),
        JSON.stringify(distManifest, null, 2)
    );

    console.log("✅ Bundling complete.");
}

bundle().catch((e) => {
    console.error(e);
    process.exit(1);
});