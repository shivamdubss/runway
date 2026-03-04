import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, '..', 'results');

/**
 * Write a timestamped eval run JSON file to evals/results/.
 * Creates the directory if it doesn't exist.
 *
 * @param {Object} runData - Full run data from the runner
 * @param {string} runData.runId
 * @param {string} runData.evalName
 * @param {string} runData.model
 * @param {number} runData.passRate
 * @param {number} runData.passed
 * @param {number} runData.total
 * @param {Array} runData.results
 * @returns {string} Path to the written file
 */
export function logResults(runData) {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${runData.evalName}-${timestamp}.json`;
  const filepath = path.join(RESULTS_DIR, filename);

  const payload = {
    runId: runData.runId,
    evalName: runData.evalName,
    model: runData.model || 'unknown',
    timestamp: new Date().toISOString(),
    summary: {
      total: runData.total,
      passed: runData.passed,
      failed: runData.total - runData.passed,
      passRate: runData.passRate,
    },
    scenarios: runData.results.map(r => ({
      id: r.id,
      tags: r.tags,
      pass: r.pass,
      outfitCount: r.outfitCount,
      error: r.error || null,
      request: r.request,
      // Full inputs for review
      wardrobeItemCount: r.wardrobeItems?.length || 0,
      wardrobeItems: r.wardrobeItems || [],
      systemPromptLength: r.systemPrompt?.length || 0,
      systemPrompt: r.systemPrompt || null,
      rawResponse: r.rawResponse || null,
      // Per-outfit judgment details
      judgments: (r.judgments || []).map(j => ({
        outfit: {
          vibe: j.outfit?.vibe,
          reasoning: j.outfit?.reasoning,
          items: j.outfit?.items?.map(i => (typeof i === 'string' ? i : i.name)),
        },
        pass: j.judgment?.overall_pass,
        dimensions: j.judgment?.dimensions,
      })),
    })),
  };

  fs.writeFileSync(filepath, JSON.stringify(payload, null, 2));
  console.log(`Results saved to: ${filepath}\n`);
  return filepath;
}
