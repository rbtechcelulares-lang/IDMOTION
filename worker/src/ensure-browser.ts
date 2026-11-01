// Baixa o Chrome headless do Remotion (usado no Docker e no GitHub Actions).
import { ensureBrowser } from "@remotion/renderer";

ensureBrowser().then((s) => console.log("navegador do Remotion pronto:", JSON.stringify(s).slice(0, 200)));
