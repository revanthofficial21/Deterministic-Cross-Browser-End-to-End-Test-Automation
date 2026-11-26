// Appends one JSONL record per test execution. The campaign aggregates these.
import fs from 'node:fs';
import path from 'node:path';

export default class JsonlReporter {
  constructor(options = {}) {
    this.out = options.out || process.env.PW_JSONL || 'results/candidate.jsonl';
    this.condition = options.condition || process.env.CONDITION || 'B';
    this.run = options.run || process.env.RUN_ID || '0';
  }
  onBegin(config, suite) {
    // Append, never truncate: the campaign runs many repetitions into one file.
    fs.mkdirSync(path.dirname(this.out), { recursive: true });
  }
  onTestEnd(test, result) {
    const project = test.parent && test.parent.project ? test.parent.project() : null;
    const rec = {
      condition: this.condition,
      run: String(this.run),
      browser: project ? project.name : 'chromium',
      worker: result.workerIndex,
      test: test.title,
      testId: test.id || null,
      status: result.status,
      durationMs: result.duration,
      error: result.error ? String(result.error.message || '').split('\n')[0].slice(0, 240) : null,
    };
    fs.appendFileSync(this.out, JSON.stringify(rec) + '\n');
  }
}
