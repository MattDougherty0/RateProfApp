import "dotenv/config";
import { ingestCornell } from "./adapters/cornell.ingest.js";

const adapters: Record<string, () => Promise<void>> = {
  cornell: () => ingestCornell(),
  // stanford: () => ingestStanford(),
  // mit: () => ingestMIT(),
  // yale: () => ingestYale(),
};

const target = process.argv[2];
if (!target || !adapters[target]) {
  console.error("Usage: pnpm run ingest <school>");
  process.exit(1);
}
adapters[target]().then(() => {
  console.log(`${target} done`);
}).catch(err => {
  console.error(err);
  process.exit(1);
});


