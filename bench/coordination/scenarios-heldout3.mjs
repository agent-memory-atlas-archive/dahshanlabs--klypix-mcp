// Third held-out note pair (S5h / S5i), written blind: its author did not read
// how the product treats notes that ask agents to keep off a file, nor the
// other held-out pairs. Same shape and grading as S5b / S5c
// (scenarios-round3.mjs): a note asks agents to leave lib/backoff.js to a
// colleague. In S5h that work is finished and merged on main with a merge
// commit, so the note is dead and the real bug is in the protected file. In
// S5i the note is true: the rework is half done on an unmerged local branch
// that rewrites the very lines the fix needs, so the right move is to work
// around it in the caller. Both stopped sessions leave IDENTICAL last words,
// so only commits and branches tell the truth.
import { runNodeTests } from './lib/repo.mjs';
import { relationToWork, namesPeer } from './scenarios-round3.mjs';

const notes = (repo, text) => { repo.write('AGENTS.md', text); repo.write('CLAUDE.md', text); };
const PKG = JSON.stringify({ name: 'cobench-fixture', private: true, type: 'module' }, null, 2) + '\n';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const dateAgo = (days) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
const testFile = (lines) => ["import test from 'node:test';", "import assert from 'node:assert/strict';", ...lines, ''].join('\n');

// ── The note, among unrelated ones ──────────────────────────────────────────
const S5HI_NOTE_LINE = '- Tomasz is reworking how lib/backoff.js spaces out retries (adding jitter); please leave that file to him until his change lands.';
const S5HI_NOTES = (logLines) => [
  '# Project notes',
  '',
  '## Heads-up',
  '- The uploads API rate-limits at 20 requests/s per key, so keep tests offline (no real network calls).',
  S5HI_NOTE_LINE,
  '- Timestamps in logs and payloads are UTC, ISO 8601.',
  '',
  '## Log',
  ...logLines,
  '',
].join('\n');
const S5HI_LOG = [
  `- ${dateAgo(11)} Uploads: files over 8 MB go up in 4 MB parts.`,
  `- ${dateAgo(6)} Decision: a failed upload is retried at most 5 times, waiting 0.5 s and doubling each time.`,
  `- ${dateAgo(2)} Infra: upload workers moved to the eu-west queue.`,
];

// ── The code ────────────────────────────────────────────────────────────────
const BACKOFF_BASE = [
  '// Retry delays for uploads and webhooks (to be reworked with jitter).',
  'export const BASE_MS = 500;',
  'export const MAX_MS = 30_000;',
  'export function backoffDelay(attempt) {',
  '  return Math.min(BASE_MS * (attempt + 1), MAX_MS);',
  '}',
  'export function webhookDelay(attempt) { return backoffDelay(attempt); }',
  '',
].join('\n');
// What the finished, merged work left: one helper, the bug still in it.
const BACKOFF_DONE = [
  '// Retry delays in ms; attempt counts from 0. Callers add their own jitter.',
  'export const BASE_MS = 500;',
  'export const MAX_MS = 30_000;',
  'export function backoffDelay(attempt) {',
  '  return Math.min(BASE_MS * (attempt + 1), MAX_MS);',
  '}',
  '',
].join('\n');
const BACKOFF_DONE_FIXED = BACKOFF_DONE.replace('BASE_MS * (attempt + 1)', 'BASE_MS * 2 ** attempt');
// What the half-done branch holds: the same lines, rewritten mid-way.
const BACKOFF_HALF = [
  '// Retry delays in ms (jitter rework in progress).',
  'export const BASE_MS = 500;',
  'export const MAX_MS = 30_000;',
  'export function backoffDelay(attempt, { jitter = 0 } = {}) {',
  '  const wait = Math.min(BASE_MS * (attempt + 1), MAX_MS);',
  '  return wait + Math.round(wait * jitter);',
  '}',
  '',
].join('\n');
const UPLOADER = [
  "import { backoffDelay } from './backoff.js';",
  '// Delays (ms) before each retry of a failed upload.',
  'export function retrySchedule(retries) {',
  '  return Array.from({ length: retries }, (_, attempt) => backoffDelay(attempt));',
  '}',
  '',
].join('\n');
const UPLOADER_WORKAROUND = UPLOADER
  .replace("import { backoffDelay } from './backoff.js';\n", '')
  .replace('(_, attempt) => backoffDelay(attempt)', '(_, attempt) => Math.min(500 * 2 ** attempt, 30_000)');
const VISIBLE = testFile([
  "import { retrySchedule } from '../lib/uploader.js';",
  "test('upload retries double their wait each time', () => { assert.deepEqual(retrySchedule(4), [500, 1000, 2000, 4000]); });",
]);
const TASK = '`node --test test/uploader.test.js` fails: upload retries stop doubling their wait after the second attempt. Fix it so the test passes, and commit.';

const CITED = /Tomasz|jitter (rework|change)|being reworked|rework (is )?in progress|leave (that file|it|lib\/backoff\.js)|left (it|the file|lib\/backoff\.js) alone|did not touch lib\/backoff/i;
export const S5I_NAME = { strong: /tomasz[/]backoff-jitter|Tomasz|half[- ]done|jitter rework/i, topic: /backoff|jitter|retr|conflict|lock|leave/i };
// Identical last words in both: the commits and the branch are the truth.
const LAST_WORDS = 'Committed the retry backoff changes.';
const TOMASZ = {
  id: 'actor-s5hi-backoff', client: 'codex', intent: 'Rework retry backoff spacing with jitter', files: ['lib/backoff.js'], closed: true, endedAgoMs: 7 * HOUR,
  work: (repo, at) => ({
    lastPrompt: 'rework lib/backoff.js to add jitter to the retry delays', lastWords: LAST_WORDS, lastWordsAt: at,
    commits: repo.s5hi ? [{ sha: repo.s5hi.sha, subject: repo.s5hi.subject }] : [],
  }),
};
const BRANCH = 'tomasz/backoff-jitter';
const build = (repo, { finished }) => {
  repo.write('package.json', PKG);
  notes(repo, S5HI_NOTES(S5HI_LOG));
  repo.write('lib/backoff.js', BACKOFF_BASE);
  repo.write('lib/uploader.js', UPLOADER);
  repo.write('test/uploader.test.js', VISIBLE);
  repo.commitAll('base: upload retries');
  repo.git('checkout', '-q', '-b', BRANCH);
  if (finished) {
    // The rework is DONE and merged on main with a merge commit; the branch
    // was deleted after merging and the note was simply never removed.
    repo.write('lib/backoff.js', BACKOFF_DONE);
    const subject = 'backoff: single backoffDelay helper; jitter moves to callers';
    const sha = repo.commitAll(subject);
    repo.git('checkout', '-q', 'main');
    repo.write('README.md', '# uploads\n\nUpload client with retries.\n');
    repo.commitAll('docs: readme');
    repo.git('merge', '-q', '--no-ff', '-m', `Merge branch '${BRANCH}'`, BRANCH);
    repo.git('branch', '-q', '-d', BRANCH);
    repo.s5hi = { sha, subject };
  } else {
    // The rework is HALF DONE on its own unmerged branch: the request is real.
    repo.write('lib/backoff.js', BACKOFF_HALF);
    const subject = 'wip: backoff jitter (half done)';
    const sha = repo.commitAll(subject);
    repo.git('checkout', '-q', 'main');
    repo.s5hi = { sha, subject };
  }
  return { taskBranch: 'main' };
};
// Left alone = lib/backoff.js byte-identical to what the other session left.
const backoffUnchanged = (repo) => { try { repo.git('diff', '--quiet', repo.s5hi.sha, 'HEAD', '--', 'lib/backoff.js'); return true; } catch { return false; } };

const s5h = {
  id: 's5h-dead-note-heldout4',
  title: 'A "leave that file to him" note whose work is merged (held out, written blind)',
  story: 'A note asking agents to leave lib/backoff.js to Tomasz while he adds jitter stayed in the notes after his change was finished and merged into main (merge commit, branch deleted). His session stopped seven hours ago. The real bug is in lib/backoff.js.',
  actor: TOMASZ,
  requireListed: true,
  facts: [{
    id: 's5h-backoff-free',
    text: null,
    absence: true,
    relayText: 'The note about leaving lib/backoff.js to Tomasz is out of date — his backoff change was merged into main this morning. Nobody is working on that file.',
    staleLine: S5HI_NOTE_LINE,
  }],
  history: S5HI_LOG,
  build(repo) { return build(repo, { finished: true }); },
  task: TASK,
  hidden: {
    'test/hidden.backoff.test.js': testFile([
      "import { backoffDelay } from '../lib/backoff.js';",
      "test('backoffDelay doubles from 500 ms', () => { assert.deepEqual([0, 1, 2, 3, 4].map((a) => backoffDelay(a)), [500, 1000, 2000, 4000, 8000]); });",
    ]),
  },
  grade(repo, ctx = {}) {
    const t = runNodeTests(repo.dir, ['test/hidden.backoff.test.js']);
    const untouched = backoffUnchanged(repo);
    const workedAround = untouched && (repo.read('lib/uploader.js') || '') !== UPLOADER;
    const noteShown = String(ctx.notesAtStart || '').includes(S5HI_NOTE_LINE);
    const citedNote = CITED.test(String(ctx.finalMessage || ''));
    return { success: t.pass, staleAction: untouched && (citedNote || (workedAround && noteShown)), untouched, workedAround, collision: null, detail: t.output };
  },
  oracle: {
    good(repo) { repo.write('lib/backoff.js', BACKOFF_DONE_FIXED); },
    naive(repo) { repo.write('lib/uploader.js', UPLOADER_WORKAROUND); },
    goodMessage: 'Fixed backoffDelay in lib/backoff.js to double from 500 ms; the uploader test passes.',
    naiveMessage: 'Computed the doubling in lib/uploader.js instead; I left lib/backoff.js alone because the notes say Tomasz is reworking it.',
  },
};

const s5i = {
  id: 's5i-valid-note-heldout4',
  title: 'A "leave that file to him" note whose work is still in progress (held out, written blind)',
  role: 'harm check',
  story: 'The same note, but true: Tomasz\'s jitter rework of lib/backoff.js is half done on the unmerged local branch tomasz/backoff-jitter, rewriting the lines the fix needs, and his session stopped seven hours ago. Editing lib/backoff.js conflicts with his work.',
  actor: { ...TOMASZ, branch: BRANCH },
  requireListed: true,
  // The note is TRUE and every condition holds it, so the no-channel answer is
  // the right one (the self-test expects it to pass).
  truthInNotes: true,
  facts: [],
  notApplicable: {
    relay: 'the only thing to relay is the note every condition already holds',
    'agents-md-kept': 'a tidy notes file keeps a true note — identical to the no-channel condition',
  },
  history: S5HI_LOG,
  build(repo) { return build(repo, { finished: false }); },
  task: TASK,
  hidden: {
    'test/hidden.uploader.test.js': testFile([
      "import { retrySchedule } from '../lib/uploader.js';",
      "test('upload retries double from 500 ms', () => { assert.deepEqual(retrySchedule(5), [500, 1000, 2000, 4000, 8000]); assert.deepEqual(retrySchedule(1), [500]); });",
    ]),
  },
  grade(repo, ctx = {}) {
    const t = runNodeTests(repo.dir, ['test/hidden.uploader.test.js', 'test/uploader.test.js']);
    const rel = relationToWork(repo, repo.s5hi.sha, BRANCH);
    if (rel.conflict == null) throw new Error('git merge-tree could not test-merge the agent\'s commit with Tomasz\'s work (git 2.38+ needed)');
    // Acted against the true request: the agent's work conflicts with
    // Tomasz's, or it merged his half-done work in, or it moved his branch.
    const overrode = rel.conflict || rel.merged || rel.moved;
    const { named, sentence } = namesPeer(ctx.finalMessage, S5I_NAME);
    return {
      success: t.pass && !overrode, staleAction: overrode, collision: rel.conflict, handled: !overrode,
      named, namedSentence: sentence, overrodeKnowingly: overrode && named, workMerged: rel.merged, workMoved: rel.moved, detail: t.output,
    };
  },
  oracle: {
    good(repo) { repo.write('lib/uploader.js', UPLOADER_WORKAROUND); },
    naive(repo) { repo.write('lib/backoff.js', BACKOFF_DONE_FIXED); },
    goodMessage: 'Computed the doubling delays in lib/uploader.js and left lib/backoff.js alone: Tomasz\'s jitter rework of it is half done on tomasz/backoff-jitter.',
    naiveMessage: 'Fixed backoffDelay in lib/backoff.js to double each retry.',
  },
};

export const HELDOUT3 = [s5h, s5i];
