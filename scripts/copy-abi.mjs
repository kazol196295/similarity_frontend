import { mkdir, readFile, writeFile } from "fs/promises";
import { resolve } from "path";

async function main() {
    const src = resolve(process.cwd(), "../artifacts/contracts/AdvancedPostManager.sol/AdvancedPostManager.json");
    const destDir = resolve(process.cwd(), "lib/abi");
    await mkdir(destDir, { recursive: true });

    const raw = await readFile(src, "utf8");
    const json = JSON.parse(raw);
    // keep only ABI to keep bundle small
    await writeFile(resolve(destDir, "AdvancedPostManager.json"), JSON.stringify(json.abi, null, 2));
    console.log("✅ ABI copied to lib/abi/AdvancedPostManager.json");
}

main().catch((e) => {
    console.error("❌ Failed to copy ABI:", e.message);
    process.exit(1);
});
