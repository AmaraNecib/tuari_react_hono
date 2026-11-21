import { resolve } from "node:path"
import { realpathSync } from "node:fs"
import { mergeConfig } from "vite"
import base from "./vite.config"
export default mergeConfig(base, {
  resolve: { alias: { "@tuari/contracts": resolve(__dirname, "../../packages/contracts/src/index.ts") } },
  server: { fs: { allow: [resolve(__dirname, "../.."), realpathSync(resolve(__dirname, "../../node_modules"))] } },
  cacheDir: resolve(process.env.CONNECTED_EXACT_RUN!, "vite-cache"),
})
