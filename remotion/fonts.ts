import { continueRender, delayRender, staticFile } from "remotion";

// Poppins (identidade RBTech), servida de remotion/public/fonts — sem internet no render.
const WEIGHTS = [400, 600, 700, 800, 900];
if (typeof document !== "undefined" && typeof FontFace !== "undefined") {
  const handle = delayRender("Carregando Poppins");
  Promise.all(
    WEIGHTS.map((w) =>
      new FontFace("Poppins", `url(${staticFile(`fonts/poppins-latin-${w}-normal.woff2`)}) format("woff2")`, { weight: String(w) })
        .load()
        .then((f) => document.fonts.add(f)),
    ),
  )
    .catch((e) => console.warn("Poppins não carregou:", e))
    .finally(() => continueRender(handle));
}
