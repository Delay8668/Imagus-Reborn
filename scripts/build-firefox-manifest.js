#!/usr/bin/env node

const fs = require("fs/promises");
const { createWriteStream } = require("fs"); 
const path = require("path");
const archiver = require("archiver"); 

async function loadManifest(manifestPath) {
    const raw = await fs.readFile(manifestPath, "utf8");
    return JSON.parse(raw);
}

function clone(data) {
    return JSON.parse(JSON.stringify(data));
}



async function writeManifest(outputPath, manifest) {
    const formatted = JSON.stringify(manifest, null, 2);
    await fs.writeFile(outputPath, formatted, "utf8");
}

async function createZip(sourceDir, zipPath) {
    await fs.rm(zipPath, { force: true });
    await new Promise((resolve, reject) => {
        const output = createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 9 } });

        output.on("close", resolve);
        output.on("error", reject);
        archive.on("error", reject);

        archive.pipe(output);
        archive.glob("**/*", { cwd: sourceDir, dot: true });
        archive.finalize().catch(reject);
    });
}

function convertBackgroundForFirefox(manifest) {
  const serviceWorker = manifest.background?.service_worker;
  if (!serviceWorker) return;
  
  // Firefox doesn't support service_worker yet, use scripts instead
  // Both can coexist since Firefox 121+ and Chrome 121+
  manifest.background = {
    scripts: [serviceWorker]
    // Remove service_worker and type: "module" for Firefox
  };
}

function removeUnsupportedPermissions(manifest) {
  if (!manifest.permissions) return;
  
  // Firefox doesn't support these permissions in MV3
  const unsupported = ['userScripts'];
  manifest.permissions = manifest.permissions.filter(
    perm => !unsupported.includes(perm)
  );
}


async function main() {
    const projectRoot = path.resolve(__dirname, "..");
    
    // Read from 'dist', which is our clean V3 build
    const srcDir = path.join(projectRoot, "dist"); 
    const srcManifestPath = path.join(srcDir, "manifest.json"); 
    
    const outputRoot = path.join(projectRoot, "build");
    const outputDir = path.join(outputRoot, "firefox"); // Final Firefox files
    const firefoxManifestPath = path.join(outputDir, "manifest.json");
    const zipPath = path.join(outputRoot, "imagus-reborn-firefox.xpi");

    console.log("Starting Firefox MV3 build...");


    const baseManifest = await loadManifest(srcManifestPath); 
    const firefoxManifest = clone(baseManifest);
convertBackgroundForFirefox(firefoxManifest); 


    // 3. Prepare output directory (copy from 'dist' to 'build/firefox')
    await fs.rm(outputDir, { recursive: true, force: true }); 
    await fs.mkdir(outputDir, { recursive: true }); 
    await fs.cp(srcDir, outputDir, { recursive: true }); 

    // 4. Write the new, patched manifest.json
    await writeManifest(firefoxManifestPath, firefoxManifest); 

    // 5. Zip the final Firefox directory
    await createZip(outputDir, zipPath); 

    console.log(`✅ Firefox bundle ready at ${path.relative(projectRoot, outputDir)}`); 
    console.log(`✅ Firefox zip created at ${path.relative(projectRoot, zipPath)}`); 
}

main().catch((error) => {
    console.error("❌ Failed to build Firefox manifest:", error);
    process.exitCode = 1;
});