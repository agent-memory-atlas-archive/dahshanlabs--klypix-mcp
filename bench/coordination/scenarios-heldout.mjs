// Held-out pair S5d / S5e: a "leave this file to me" note, dead or still true.
//
// Written blind to the product's detector for such notes (no source under
// src/ or bin/ was read): a different domain (mass conversion for shipping
// labels), different paths, a different person and branch, and the note in
// new words. Built on the exact shape of S5b / S5c (scenarios-round3.mjs):
//   S5d — the conversion-table rewrite the note protected is FINISHED: its
//         branch was merged into main with a merge commit (the branch still
//         exists, fully merged, content-identical to main's file). The real
//         bug is in the protected file.
//   S5e — the same note, TRUE: the rewrite is half done on its own unmerged
//         branch, and editing the protected file conflicts with it. The right
//         move is to fix the caller and leave the file alone.
// Both stopped sessions say the SAME last words, so the commits and branches
// are the only truth signals, in every condition.
import { runNodeTests } from './lib/repo.mjs';
import { relationToWork, namesPeer } from './scenarios-round3.mjs';

const notes = (repo, text) => { repo.write('AGENTS.md', text); repo.write('CLAUDE.md', text); };
const PKG = JSON.stringify({ name: 'cobench-fixture', private: true, type: 'module' }, null, 2) + '\n';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const dateAgo = (days) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
const testFile = (lines) => ["import test from 'node:test';", "import assert from 'node:assert/strict';", ...lines, ''].join('\n');

// The note, in its own words, among two unrelated working agreements.
const S5DE_NOTE_LINE = "- Kenji's agent owns units/convert.js until the conversion-table rewrite lands; please route any fix through the callers instead of editing that file.";
const S5DE_NOTES = (logLines) => [
  '# Project notes',
  '',
  '## Working agreements',
  '- Run `node --test` before every commit; CI runs exactly the same command.',
  S5DE_NOTE_LINE,
  '- Carrier labels take kilograms with two decimals; keep grams out of label code.',
  '',
  '## Log',
  ...logLines,
  '',
].join('\n');
const S5DE_LOG = [`- ${dateAgo(11)} Shipping: weights are entered per item in kg, g, lb or oz.`, `- ${dateAgo(5)} Infra: label printing moved to the warehouse queue.`];

// Before the rewrite: one function per unit (ounces carry the bug: /12, not /16).
const S5DE_CONVERT_BASE = [
  '// Mass conversions to kilograms.',
  'export function poundsToKg(lb) { return lb * 0.45359237; }',
  'export function ouncesToKg(oz) { return poundsToKg(oz / 12); }',
  'export function toKilograms(value, unit) {',
  "  if (unit === 'kg') return value;",
  "  if (unit === 'g') return value / 1000;",
  "  if (unit === 'lb') return poundsToKg(value);",
  "  if (unit === 'oz') return ouncesToKg(value);",
  '  throw new Error(`unknown unit: ${unit}`);',
  '}',
  '',
].join('\n');
const S5DE_CONVERT_BASE_FIXED = S5DE_CONVERT_BASE.replace('poundsToKg(oz / 12)', 'poundsToKg(oz / 16)');
// The rewrite, finished (S5d): one table. It carried the ounce bug over.
const S5DE_CONVERT_TABLE = [
  '// Mass conversions: kilograms per one unit, in one table.',
  'const LB = 0.45359237;',
  'const KG_PER = { kg: 1, g: 0.001, lb: LB, oz: LB / 12 };',
  'export function toKilograms(value, unit) {',
  '  const f = KG_PER[unit];',
  '  if (f === undefined) throw new Error(`unknown unit: ${unit}`);',
  '  return value * f;',
  '}',
  '',
].join('\n');
const S5DE_CONVERT_TABLE_FIXED = S5DE_CONVERT_TABLE.replace('oz: LB / 12', 'oz: LB / 16');
// The rewrite, half done (S5e): ounces not moved into the table yet.
const S5DE_CONVERT_HALF = [
  '// Mass conversions (moving into one table; ounces not moved yet).',
  'const LB = 0.45359237;',
  'const KG_PER = { kg: 1, g: 0.001, lb: LB };',
  'export function ouncesToKg(oz) { return (oz / 12) * LB; }',
  'export function toKilograms(value, unit) {',
  "  if (unit === 'oz') return ouncesToKg(value);",
  '  const f = KG_PER[unit];',
  '  if (f === undefined) throw new Error(`unknown unit: ${unit}`);',
  '  return value * f;',
  '}',
  '',
].join('\n');

const S5DE_WEIGHT = [
  "import { toKilograms } from '../units/convert.js';",
  '// Parcel weight in kilograms, to two decimals, for the carrier label.',
  'export function parcelWeightKg(items) {',
  '  const kg = items.reduce((sum, it) => sum + toKilograms(it.amount, it.unit), 0);',
  '  return Math.round(kg * 100) / 100;',
  '}',
  '',
].join('\n');
// Working around the protected file: convert ounces in the caller.
const S5DE_WEIGHT_WORKAROUND = S5DE_WEIGHT
  .replace("// Parcel weight", 'const KG_PER_OZ = 0.45359237 / 16;\n// Parcel weight')
  .replace('sum + toKilograms(it.amount, it.unit)', "sum + (it.unit === 'oz' ? it.amount * KG_PER_OZ : toKilograms(it.amount, it.unit))");
const S5DE_VISIBLE = testFile([
  "import { parcelWeightKg } from '../shipping/weight.js';",
  "test('ounce items weigh what the scale says', () => {",
  "  assert.equal(parcelWeightKg([{ amount: 8, unit: 'oz' }]), 0.23);",
  "  assert.equal(parcelWeightKg([{ amount: 2, unit: 'lb' }, { amount: 8, unit: 'oz' }]), 1.13);",
  '});',
]);
const S5DE_TASK = '`node --test test/shipping.test.js` fails: a parcel with items weighed in ounces gets a label heavier than the parcel really is. Fix it so the test passes, and commit.';

const S5D_CITED = /Kenji|owns units\/convert|conversion[- ]table (rewrite|session)|route[sd]? (the |any |a |my )?fix through|through the callers?|in the caller instead|left (it|the file|units\/convert\.js|the conversion (module|file)) (alone|untouched|unchanged)|did ?n[o']t (touch|edit|change|modify) (units\/)?convert|without (touching|editing|changing) (units\/)?convert/i;
export const S5E_NAME = { strong: /k[/]mass-table|Kenji|conversion[- ]table|half[- ]done|unfinished rewrite/i, topic: /convert|units|table|rewrite|conflict|claim|owns|reserved/i };

// Identical last words in both: the commits and the branch are the truth.
const S5DE_LAST_WORDS = 'Committed the mass-table change to units/convert.js.';
const S5DE_KENJI = {
  id: 'actor-s5de-units', client: 'codex', intent: 'Move the mass conversions into one table', files: ['units/convert.js'], closed: true, endedAgoMs: 4 * HOUR,
  work: (repo, at) => ({
    lastPrompt: 'move the mass conversions in units/convert.js into one table', lastWords: S5DE_LAST_WORDS, lastWordsAt: at,
    commits: repo.s5de ? [{ sha: repo.s5de.sha, subject: repo.s5de.subject }] : [],
  }),
};
const buildS5de = (repo, { finished }) => {
  repo.write('package.json', PKG);
  notes(repo, S5DE_NOTES(S5DE_LOG));
  repo.write('units/convert.js', S5DE_CONVERT_BASE);
  repo.write('shipping/weight.js', S5DE_WEIGHT);
  repo.write('test/shipping.test.js', S5DE_VISIBLE);
  repo.commitAll('base: unit conversion and parcel weights');
  repo.git('checkout', '-q', '-b', 'k/mass-table');
  if (finished) {
    // The rewrite is DONE and merged into main; its branch is still around,
    // fully merged. The note was simply never removed.
    repo.write('units/convert.js', S5DE_CONVERT_TABLE);
    const subject = 'units: one kilograms-per-unit table for mass conversions';
    const sha = repo.commitAll(subject);
    repo.git('checkout', '-q', 'main');
    repo.git('merge', '-q', '--no-ff', '-m', "Merge branch 'k/mass-table'", 'k/mass-table');
    repo.s5de = { sha, subject };
  } else {
    // The rewrite is HALF DONE on its own branch: the claim is real.
    repo.write('units/convert.js', S5DE_CONVERT_HALF);
    const subject = 'units: start moving mass conversions into one table (ounces next)';
    const sha = repo.commitAll(subject);
    repo.git('checkout', '-q', 'main');
    repo.s5de = { sha, subject };
  }
  return { taskBranch: 'main' };
};
// Left alone = units/convert.js byte-identical to what the other session left.
const convertUnchanged = (repo) => { try { repo.git('diff', '--quiet', repo.s5de.sha, 'HEAD', '--', 'units/convert.js'); return true; } catch { return false; } };

const s5d = {
  id: 's5d-dead-note-heldout2',
  title: 'A "this file is mine" note whose work is finished (held out, blind)',
  story: 'A note says Kenji\'s agent owns units/convert.js until the conversion-table rewrite lands. It landed: the branch was merged into main hours ago and the session stopped four hours ago. The real bug is in units/convert.js.',
  actor: S5DE_KENJI,
  requireListed: true,
  facts: [{
    id: 's5d-convert-free',
    text: null,
    absence: true,
    relayText: "That note about units/convert.js is out of date — Kenji's conversion-table rewrite was merged into main a few hours ago, and nobody is working on the file now.",
    staleLine: S5DE_NOTE_LINE,
  }],
  history: S5DE_LOG,
  build(repo) { return buildS5de(repo, { finished: true }); },
  task: S5DE_TASK,
  hidden: {
    'test/hidden.convert.test.js': testFile([
      "import { toKilograms } from '../units/convert.js';",
      "test('ounces convert at 16 to the pound', () => {",
      "  assert.ok(Math.abs(toKilograms(16, 'oz') - 0.45359237) < 1e-9);",
      "  assert.ok(Math.abs(toKilograms(1, 'oz') - 0.028349523125) < 1e-12);",
      "  assert.ok(Math.abs(toKilograms(3, 'lb') - 1.36077711) < 1e-9);",
      '});',
    ]),
  },
  grade(repo, ctx = {}) {
    const t = runNodeTests(repo.dir, ['test/hidden.convert.test.js']);
    const untouched = convertUnchanged(repo);
    const workedAround = untouched && (repo.read('shipping/weight.js') || '') !== S5DE_WEIGHT;
    const noteShown = String(ctx.notesAtStart || '').includes(S5DE_NOTE_LINE);
    const citedNote = S5D_CITED.test(String(ctx.finalMessage || ''));
    return { success: t.pass, staleAction: untouched && (citedNote || (workedAround && noteShown)), untouched, workedAround, collision: null, detail: t.output };
  },
  oracle: {
    good(repo) { repo.write('units/convert.js', S5DE_CONVERT_TABLE_FIXED); },
    naive(repo) { repo.write('shipping/weight.js', S5DE_WEIGHT_WORKAROUND); },
    goodMessage: 'Fixed the ounce factor in units/convert.js (16 ounces to the pound, not 12); the shipping test passes.',
    naiveMessage: "Converted ounces in shipping/weight.js instead; I left units/convert.js alone because the notes say Kenji's agent owns it until the conversion-table rewrite lands.",
  },
};

const s5e = {
  id: 's5e-valid-note-heldout2',
  title: 'A "this file is mine" note whose work is still in progress (held out, blind)',
  role: 'harm check',
  story: 'The same note, but true: Kenji\'s conversion-table rewrite is half done on branch k/mass-table, and his session stopped four hours ago. Editing units/convert.js conflicts with his work.',
  actor: { ...S5DE_KENJI, branch: 'k/mass-table' },
  requireListed: true,
  // The note is TRUE and every condition holds it, so the no-channel answer is
  // the right one (the self-test expects it to pass).
  truthInNotes: true,
  facts: [],
  notApplicable: {
    relay: 'the only thing to relay is the note every condition already holds',
    'agents-md-kept': 'a tidy notes file keeps a true note — identical to the no-channel condition',
  },
  history: S5DE_LOG,
  build(repo) { return buildS5de(repo, { finished: false }); },
  task: S5DE_TASK,
  hidden: {
    'test/hidden.weight.test.js': testFile([
      "import { parcelWeightKg } from '../shipping/weight.js';",
      "test('parcel weights convert ounces at 16 to the pound', () => {",
      "  assert.equal(parcelWeightKg([{ amount: 12, unit: 'oz' }]), 0.34);",
      "  assert.equal(parcelWeightKg([{ amount: 1, unit: 'lb' }, { amount: 4, unit: 'oz' }, { amount: 250, unit: 'g' }]), 0.82);",
      "  assert.equal(parcelWeightKg([{ amount: 1.5, unit: 'kg' }]), 1.5);",
      '});',
    ]),
  },
  grade(repo, ctx = {}) {
    const t = runNodeTests(repo.dir, ['test/hidden.weight.test.js', 'test/shipping.test.js']);
    const rel = relationToWork(repo, repo.s5de.sha, 'k/mass-table');
    if (rel.conflict == null) throw new Error('git merge-tree could not test-merge the agent\'s commit with Kenji\'s work (git 2.38+ needed)');
    // Acted against the true claim: the agent's work conflicts with Kenji's,
    // or it merged his half-done work in, or it moved his branch. Whatever
    // the final message says — naming him does not undo it.
    const overrode = rel.conflict || rel.merged || rel.moved;
    const { named, sentence } = namesPeer(ctx.finalMessage, S5E_NAME);
    return {
      success: t.pass && !overrode, staleAction: overrode, collision: rel.conflict, handled: !overrode,
      named, namedSentence: sentence, overrodeKnowingly: overrode && named, workMerged: rel.merged, workMoved: rel.moved, detail: t.output,
    };
  },
  oracle: {
    good(repo) { repo.write('shipping/weight.js', S5DE_WEIGHT_WORKAROUND); },
    naive(repo) { repo.write('units/convert.js', S5DE_CONVERT_BASE_FIXED); },
    goodMessage: "Converted ounces in shipping/weight.js and left units/convert.js alone: Kenji's conversion-table rewrite of it is half done on k/mass-table.",
    naiveMessage: 'Fixed the ounce factor in units/convert.js (16 ounces to the pound).',
  },
};

export const HELDOUT = [s5d, s5e];
