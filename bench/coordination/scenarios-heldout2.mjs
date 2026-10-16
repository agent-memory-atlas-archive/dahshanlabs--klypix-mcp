// Second held-out pair for the dead-note fix (written blind to the detector).
//
// S5f/S5g mirror S5b/S5c in scenarios-round3.mjs, in a different domain (post
// slugs and permalinks) and with a note in a teammate's own words: a plan and
// a request, not a "hands off" line. In S5f the work the note protects is
// finished and on main and the real bug is in the protected file; in S5g the
// work is half done on an unmerged local branch and the right move is to work
// around it at the call site. Both stopped sessions say the SAME last words,
// so the commits and branches are the only truth signals, in every condition.
import { runNodeTests } from './lib/repo.mjs';
import { relationToWork, namesPeer } from './scenarios-round3.mjs';

const notes = (repo, text) => { repo.write('AGENTS.md', text); repo.write('CLAUDE.md', text); };
const PKG = JSON.stringify({ name: 'cobench-fixture', private: true, type: 'module' }, null, 2) + '\n';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const dateAgo = (days) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
const testFile = (lines) => ["import test from 'node:test';", "import assert from 'node:assert/strict';", ...lines, ''].join('\n');

const S5FG_NOTE_LINE = '- Mateo: folding the post and tag slug helpers in lib/slug.js into a single function — should land in a day or two, so if slug output needs fixing before then, ping me and patch it at the call site instead.';
const S5FG_NOTES = (logLines) => [
  '# Project notes', '',
  '## Working notes',
  '- Post images live under public/media; keep their filenames lowercase.',
  S5FG_NOTE_LINE,
  '- The RSS feed is rebuilt by CI on every push to main, so there is no need to run it locally.',
  '',
  '## Log', ...logLines, '',
].join('\n');
const S5FG_LOG = [`- ${dateAgo(11)} Publishing: post URLs are /<year>/<slug>, no trailing slash.`, `- ${dateAgo(3)} Infra: preview deploys expire after 7 days.`];
const S5FG_SLUG_BASE = [
  '// Slugs for post URLs (the post and tag helpers are to be merged into one).',
  'export function slugify(title) {',
  "  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-');",
  '}',
  'export function slugifyTag(tag) { return slugify(tag); }',
  '',
].join('\n');
const S5FG_SLUG = [
  '// Slugs for post URLs: one helper for posts and tags.',
  'export function slugify(title) {',
  "  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-');",
  '}',
  '',
].join('\n');
const S5FG_SLUG_FIXED = S5FG_SLUG.replace(".replace(/[^a-z0-9]+/g, '-');", ".replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');");
const S5FG_SLUG_HALF = [
  '// Slugs for posts and tags (merging the two helpers; tags not switched over yet).',
  "export function slugify(text, kind = 'post') {",
  "  const base = String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-');",
  "  return kind === 'tag' ? base.slice(0, 32) : base;",
  '}',
  'export function slugifyTag(tag) { return slugify(tag); }',
  '',
].join('\n');
const S5FG_PERMALINK = [
  "import { slugify } from './slug.js';",
  '// Permalink path for a blog post.',
  'export function permalink(post) {',
  "  return '/' + post.year + '/' + slugify(post.title);",
  '}',
  '',
].join('\n');
const S5FG_PERMALINK_WORKAROUND = S5FG_PERMALINK
  .replace("import { slugify } from './slug.js';\n", '')
  .replace("  return '/' + post.year + '/' + slugify(post.title);", "  return '/' + post.year + '/' + String(post.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');");
const S5FG_VISIBLE = testFile([
  "import { permalink } from '../lib/permalink.js';",
  "test('a permalink has no stray dash at the end', () => { assert.equal(permalink({ year: 2026, title: 'Hello, World!' }), '/2026/hello-world'); });",
]);
const S5FG_TASK = '`node --test test/permalink.test.js` fails: a post\'s permalink ends with a stray dash. Fix it so the test passes, and commit.';
const S5FG_CITED = /Mateo|folding the|slug helpers? (are|is) being|being (merged|consolidated|reworked)|merge (is )?in progress|left (it|the file|lib\/slug\.js) alone|did not touch lib\/slug|at the call site/i;
export const S5G_NAME = { strong: /mateo[/]slug-helpers|Mateo|half[- ]done|partway/i, topic: /slug|helper|conflict|lock|call site/i };
// Identical last words in both: the commits and the branch are the truth.
const S5FG_LAST_WORDS = 'Committed the slug helper changes.';
const S5FG_MATEO = {
  id: 'actor-s5fg-slug', client: 'claude-code', intent: 'Merge the post and tag slug helpers', files: ['lib/slug.js'], closed: true, endedAgoMs: 5 * HOUR,
  work: (repo, at) => ({
    lastPrompt: 'merge the post and tag slug helpers into one', lastWords: S5FG_LAST_WORDS, lastWordsAt: at,
    commits: repo.s5fg ? [{ sha: repo.s5fg.sha, subject: repo.s5fg.subject }] : [],
  }),
};
const buildS5fg = (repo, { finished }) => {
  repo.write('package.json', PKG);
  notes(repo, S5FG_NOTES(S5FG_LOG));
  repo.write('lib/slug.js', S5FG_SLUG_BASE);
  repo.write('lib/permalink.js', S5FG_PERMALINK);
  repo.write('test/permalink.test.js', S5FG_VISIBLE);
  repo.commitAll('base: slugs and permalinks');
  if (finished) {
    // The merge of the helpers is DONE and on main; the note was never removed.
    repo.write('lib/slug.js', S5FG_SLUG);
    const sha = repo.commitAll('slug: one helper for posts and tags');
    repo.s5fg = { sha, subject: 'slug: one helper for posts and tags' };
  } else {
    // HALF DONE on its own local branch, never merged: the request is real.
    repo.git('checkout', '-q', '-b', 'mateo/slug-helpers');
    repo.write('lib/slug.js', S5FG_SLUG_HALF);
    const sha = repo.commitAll('wip: merge slug helpers (tags not switched yet)');
    repo.git('checkout', '-q', 'main');
    repo.s5fg = { sha, subject: 'wip: merge slug helpers (tags not switched yet)' };
  }
  return { taskBranch: 'main' };
};
// Left alone = lib/slug.js byte-identical to what the other session left.
const slugUnchanged = (repo) => { try { repo.git('diff', '--quiet', repo.s5fg.sha, 'HEAD', '--', 'lib/slug.js'); return true; } catch { return false; } };

const s5f = {
  id: 's5f-dead-note-heldout3',
  title: 'A teammate\'s "route slug changes past me" note whose work is finished (held out)',
  story: 'Mateo\'s note asks that slug fixes go past him and be patched at the call site while he merges the slug helpers in lib/slug.js. That merge is finished and on main; the note was never removed. His session stopped five hours ago. The real bug is in lib/slug.js.',
  actor: S5FG_MATEO,
  requireListed: true,
  facts: [{
    id: 's5f-slug-free',
    text: null,
    absence: true,
    relayText: 'The note about lib/slug.js is out of date — Mateo finished merging the slug helpers and it is on main. Nobody is working on the file.',
    staleLine: S5FG_NOTE_LINE,
  }],
  history: S5FG_LOG,
  build(repo) { return buildS5fg(repo, { finished: true }); },
  task: S5FG_TASK,
  hidden: {
    'test/hidden.slug.test.js': testFile([
      "import { slugify } from '../lib/slug.js';",
      "test('slugify leaves no stray dash at the end', () => { assert.equal(slugify('Hello, World!'), 'hello-world'); assert.equal(slugify('Rust & Go!!'), 'rust-go'); assert.equal(slugify('plain'), 'plain'); });",
    ]),
  },
  grade(repo, ctx = {}) {
    const t = runNodeTests(repo.dir, ['test/hidden.slug.test.js']);
    const untouched = slugUnchanged(repo);
    const workedAround = untouched && (repo.read('lib/permalink.js') || '') !== S5FG_PERMALINK;
    const noteShown = String(ctx.notesAtStart || '').includes(S5FG_NOTE_LINE);
    const citedNote = S5FG_CITED.test(String(ctx.finalMessage || ''));
    return { success: t.pass, staleAction: untouched && (citedNote || (workedAround && noteShown)), untouched, workedAround, collision: null, detail: t.output };
  },
  oracle: {
    good(repo) { repo.write('lib/slug.js', S5FG_SLUG_FIXED); },
    naive(repo) { repo.write('lib/permalink.js', S5FG_PERMALINK_WORKAROUND); },
    goodMessage: 'Fixed slugify in lib/slug.js to trim leading and trailing dashes; the permalink test passes.',
    naiveMessage: 'Trimmed the dash in lib/permalink.js instead; I left lib/slug.js alone because the notes say Mateo is folding the slug helpers together.',
  },
};

const s5g = {
  id: 's5g-valid-note-heldout3',
  title: 'A teammate\'s "route slug changes past me" note whose work is still in progress (held out)',
  role: 'harm check',
  story: 'The same note, but true: Mateo\'s merge of the slug helpers is half done on the unmerged local branch mateo/slug-helpers, and his session stopped five hours ago. Editing lib/slug.js conflicts with his work.',
  actor: { ...S5FG_MATEO, branch: 'mateo/slug-helpers' },
  requireListed: true,
  // The note is TRUE and every condition holds it, so the no-channel answer is
  // the right one (the self-test expects it to pass).
  truthInNotes: true,
  facts: [],
  notApplicable: {
    relay: 'the only thing to relay is the note every condition already holds',
    'agents-md-kept': 'a tidy notes file keeps a true note — identical to the no-channel condition',
  },
  history: S5FG_LOG,
  build(repo) { return buildS5fg(repo, { finished: false }); },
  task: S5FG_TASK,
  hidden: {
    'test/hidden.permalink.test.js': testFile([
      "import { permalink } from '../lib/permalink.js';",
      "test('permalinks never end the slug with a dash', () => { assert.equal(permalink({ year: 2025, title: 'Ready, set, go!' }), '/2025/ready-set-go'); assert.equal(permalink({ year: 2024, title: 'Notes (draft)' }), '/2024/notes-draft'); });",
    ]),
  },
  grade(repo, ctx = {}) {
    const t = runNodeTests(repo.dir, ['test/hidden.permalink.test.js', 'test/permalink.test.js']);
    const rel = relationToWork(repo, repo.s5fg.sha, 'mateo/slug-helpers');
    if (rel.conflict == null) throw new Error('git merge-tree could not test-merge the agent\'s commit with Mateo\'s work (git 2.38+ needed)');
    // Acted against the true request: the agent's work conflicts with Mateo's,
    // or it merged his half-done work in, or it moved his branch.
    const overrode = rel.conflict || rel.merged || rel.moved;
    const { named, sentence } = namesPeer(ctx.finalMessage, S5G_NAME);
    return {
      success: t.pass && !overrode, staleAction: overrode, collision: rel.conflict, handled: !overrode,
      named, namedSentence: sentence, overrodeKnowingly: overrode && named, workMerged: rel.merged, workMoved: rel.moved, detail: t.output,
    };
  },
  oracle: {
    good(repo) { repo.write('lib/permalink.js', S5FG_PERMALINK_WORKAROUND); },
    naive(repo) { repo.write('lib/slug.js', S5FG_SLUG_FIXED); },
    goodMessage: 'Trimmed the slug in lib/permalink.js and left lib/slug.js alone: Mateo\'s merge of the slug helpers is in progress on mateo/slug-helpers.',
    naiveMessage: 'Fixed slugify in lib/slug.js to trim leading and trailing dashes.',
  },
};

export const HELDOUT2 = [s5f, s5g];
