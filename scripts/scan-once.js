#!/usr/bin/env node
// One paper pass for GitHub Actions: settle what has ended, scan once, write RESULTATS.md, exit.
// Paper only: nothing here can arm a broker. Data goes to $BOTXRAY_DATA (papier/ in the workflow).
//   BOTXRAY_DATA=papier node scripts/scan-once.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as engine from "../lib/strategy/engine.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const usd = (x) => `${x < 0 ? "−" : ""}$${Math.abs(x).toFixed(2)}`;
const pct = (x) => (x === null ? "–" : `${(x * 100).toFixed(1)} %`);

await engine.settle();
const r = engine.config().running ? await engine.scan() : { opened: [], notes: ["Simulation en pause (running: false)."], ladders: [] };
const s = engine.stats();
const b = engine.book();

const lines = [
  "# Résultats de la simulation (papier)",
  "",
  `Dernier passage : ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC. Argent fictif uniquement, aucun ordre réel.`,
  "",
  "| Trades réglés | Gagnés | Gain fictif | Rendement | Gain attendu par le modèle | Positions ouvertes | Mise en jeu |",
  "|---|---|---|---|---|---|---|",
  `| ${s.closed} | ${s.won} | ${usd(s.pnl)} | ${pct(s.ret)} | ${usd(s.expectedPnl)} | ${s.open} | ${usd(s.atRisk)} |`,
  "",
  "## Positions ouvertes",
  "",
  b.open.length ? "| Ouvert le | Marché | Côté | Prix | Mise | Avantage estimé |\n|---|---|---|---|---|---|" : "Aucune.",
  ...b.open.map((p) => `| ${String(p.openedAt || p.at || "").slice(0, 16)} | ${p.label} | ${p.side} | ${p.ask ?? p.price ?? "–"} | ${usd(p.stake)} | ${p.edge != null ? (p.edge * 100).toFixed(1) + " ¢" : "–"} |`),
  "",
  "## 20 derniers trades réglés",
  "",
  b.closed.length ? "| Réglé le | Marché | Côté | Mise | Résultat |\n|---|---|---|---|---|" : "Aucun pour l'instant.",
  ...b.closed.slice(-20).reverse().map((p) => `| ${String(p.settledAt).slice(0, 16)} | ${p.label} | ${p.side} | ${usd(p.stake)} | ${usd(p.pnl)} |`),
  "",
  "## Ce passage",
  "",
  `${r.opened.length} nouvelle(s) position(s), ${r.ladders?.length ?? 0} échéance(s) lue(s).`,
  ...(r.notes || []).slice(0, 10).map((n) => `- ${n}`),
  "",
];
fs.writeFileSync(path.join(root, "RESULTATS.md"), lines.join("\n"));
console.log(`Paper pass: ${r.opened.length} opened, ${s.open} open, ${s.closed} settled, P&L ${usd(s.pnl)}`);
