/**
 * Shared eval runner. Loops through scenarios, calls generate+judge for each,
 * prints a test-runner-style report, and returns structured results.
 *
 * @param {Object} params
 * @param {string} params.evalName - Name used for logging (e.g. 'coherence')
 * @param {Array} params.scenarios - Array of test case objects
 * @param {Function} params.generate - async (scenario) => { outfits, rawResponse, systemPrompt }
 * @param {Function} params.judge - async (scenario, outfit) => { dimensions, overall_pass }
 * @param {Function} params.log - (runData) => void — called with full run data for persistence
 * @returns {Object} { results, passRate, runId }
 */
export async function runEval({ evalName, scenarios, generate, judge, log }) {
  const runId = `${evalName}-${Date.now()}`;
  const results = [];

  console.log('\n' + '='.repeat(60));
  console.log(`${evalName.toUpperCase()} EVAL  [${new Date().toISOString()}]`);
  console.log('='.repeat(60) + '\n');

  for (const scenario of scenarios) {
    process.stdout.write(`  [ ] ${scenario.id} ...`);

    let generated;
    try {
      generated = await generate(scenario);
    } catch (err) {
      process.stdout.write(`\r  [E] ${scenario.id}\n`);
      console.log(`      ERROR generating: ${err.message}\n`);
      results.push({ id: scenario.id, error: err.message, pass: false, judgments: [] });
      continue;
    }

    const { outfits, rawResponse, systemPrompt } = generated;

    // Judge each outfit
    const judgments = [];
    for (const outfit of outfits) {
      try {
        const judgment = await judge(scenario, outfit);
        judgments.push({ outfit, judgment });
      } catch (err) {
        judgments.push({ outfit, judgment: { overall_pass: false, error: err.message } });
      }
    }

    // Scenario passes if every outfit passes
    const allPass = judgments.length > 0 && judgments.every(j => j.judgment.overall_pass);
    const icon = allPass ? '+' : 'X';
    process.stdout.write(`\r  [${icon}] ${scenario.id}\n`);

    // Print details for failing scenarios
    if (!allPass) {
      for (const { outfit, judgment } of judgments) {
        if (!judgment.overall_pass) {
          console.log(`      Outfit: "${outfit.vibe}" — FAIL`);
          const dims = judgment.dimensions || {};
          for (const [dim, result] of Object.entries(dims)) {
            if (!result.pass) {
              console.log(`        ${dim}: FAIL — ${result.reason}`);
            }
          }
        }
      }
    }

    console.log();

    results.push({
      id: scenario.id,
      tags: scenario.tags || [],
      pass: allPass,
      outfitCount: outfits.length,
      judgments,
      rawResponse,
      systemPrompt,
      wardrobeItems: scenario.wardrobeItems,
      request: scenario.request,
    });
  }

  // Summary
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  const passRate = total > 0 ? passed / total : 0;

  console.log('-'.repeat(60));
  console.log(`Passed: ${passed}/${total}  (${Math.round(passRate * 100)}%)`);
  console.log('-'.repeat(60));

  if (passRate < 0.8) {
    console.log('\nWARNING: Pass rate below 80%. Review failures above.\n');
  } else {
    console.log('\nLooking good. Eval passed threshold.\n');
  }

  const runData = { runId, evalName, passRate, passed, total, results };

  if (log) {
    log(runData);
  }

  return runData;
}
