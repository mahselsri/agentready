import { runAudit } from "../lib/audit";

const url = process.argv[2];
const siteType = (process.argv[3] as "auto") || "auto";
if (!url) {
  console.error("Usage: npm run audit -- <url> [siteType]");
  process.exit(1);
}
runAudit({ url, siteType })
  .then((r) => {
    console.log(`\n${r.finalUrl}\nScore ${r.overall}/100 (${r.grade.label}) · potential ${r.potential} · ${r.siteType}/${r.pageKind}\n`);
    for (const c of r.categories) {
      console.log(`${c.label}: ${c.score}`);
      for (const k of c.checks) console.log(`  [${k.status.padEnd(4)}] ${k.title}\n         ${k.detail}`);
    }
    console.log("\nRecommendations:");
    for (const x of r.recommendations) console.log(`  +${x.pointsGain} ${x.priority.padEnd(6)} ${x.effort.padEnd(6)} ${x.title}`);
  })
  .catch((e) => {
    console.error("Audit error:", e.code ?? "", e.message);
    process.exit(1);
  });
