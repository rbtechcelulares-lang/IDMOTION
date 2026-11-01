// Gera o bundle do Remotion uma vez (cacheado no GitHub Actions): REMOTION_BUNDLE=<pasta>
import path from "node:path";
import { bundle } from "@remotion/bundler";

const outDir = process.env.REMOTION_BUNDLE;
if (!outDir) throw new Error("defina REMOTION_BUNDLE");
bundle({ entryPoint: path.resolve(__dirname, "../../remotion/index.ts"), publicDir: path.resolve(__dirname, "../../remotion/public"), outDir }).then((d) => console.log("bundle pronto em", d));
