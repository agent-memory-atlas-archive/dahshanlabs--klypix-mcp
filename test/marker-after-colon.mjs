// A capture marker written AFTER the colon — the 2026-10-12 raw-marker bug.
//
// "🧠 BRAIN [Drive]: ! Drive storage enforcement switched ON" matched MARKER
// with an empty type, so the card landed as a plain decision whose text began
// with a literal "! " (166 such cards on the KLYPIX brain). Milestones read as
// decisions, questions never counted as open, and Catch up showed "! …" as a
// headline. The same text through brain_note with no marker did the same.
//
//   MC1  liftLeadingMarker: a bare glyph + space at the start IS the marker;
//        an explicit marker wins; a glyph without a space, or mid-text, is prose.
//   MC2  noteToCaptureInput (brain_note, CLI) turns "! …" into a 🏁 card,
//        "? …" into ❓, "+ …" into 🛠️, "~ …" into an update, "✓ …" into a resolve.
//   MC3  the real hook: "[Area]: ! …" lands as a milestone, "[Area]: ? …" as
//        an open question, neither carries the raw glyph, and the classic
//        "[Area] !: …" form is unchanged.
//   MC4  a line an earlier hook already landed (keyed as a plain decision) is
//        seen, not captured a second time.
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  liftLeadingMarker, repairRawMarker, tidyBrain, noteToCaptureInput, buildKlypixMap, parseKlypix, isMilestoneCard, isOpenCard,
} from '../src/klypix-format.mjs';

let failures = 0;
const ok = (condition, label) => {
  console.log(`${condition ? '[ok]' : '[x]'} ${label}`);
  if (!condition) failures++;
};
const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'global-brain-hook.mjs');
const B = String.fromCodePoint(0x1F9E0) + ' BRAIN';   // never a literal marker in this file's source

// ── MC1 — the helper ─────────────────────────────────────────────────────────
ok(JSON.stringify(liftLeadingMarker('', '! Drive storage enforcement')) === JSON.stringify({ marker: '!', text: 'Drive storage enforcement' }), 'MC1 "! text" lifts to marker !');
ok(liftLeadingMarker('', '  ? is the gate still open').marker === '?', 'MC1 leading whitespace before the glyph is fine');
ok(liftLeadingMarker('', '✓ the release shipped').marker === '✓' && liftLeadingMarker('', '~ amended').marker === '~' && liftLeadingMarker('', '+ always dedup').marker === '+', 'MC1 every marker glyph lifts');
ok(JSON.stringify(liftLeadingMarker('?', '! loud question')) === JSON.stringify({ marker: '?', text: '! loud question' }), 'MC1 an explicit marker wins and the text is untouched');
ok(liftLeadingMarker('', '!important flag stays').marker === '', 'MC1 a glyph without a following space is prose');
ok(liftLeadingMarker('', 'Wow ! not a marker').marker === '', 'MC1 a mid-text glyph is prose');
ok(liftLeadingMarker('', '! ').marker === '', 'MC1 a glyph with nothing after it is not a marker');

// ── MC2 — brain_note / CLI path ──────────────────────────────────────────────
const mile = noteToCaptureInput({ text: '! Drive storage enforcement switched ON', area: 'Drive' });
ok(mile.cards[0]?.text.startsWith('Drive: 🏁 Drive storage enforcement'), 'MC2 "! …" becomes a 🏁 card with no raw glyph');
ok(noteToCaptureInput({ text: '? FOUNDER REMINDER cut free Drive', area: 'Pricing' }).cards[0]?.text.startsWith('Pricing: ❓ FOUNDER REMINDER'), 'MC2 "? …" becomes ❓');
ok(noteToCaptureInput({ text: '+ always dedup zKeys', area: 'Canvas' }).cards[0]?.text.startsWith('Canvas: 🛠️ always dedup'), 'MC2 "+ …" becomes 🛠️');
ok(noteToCaptureInput({ text: '~ Delete from cloud is now complete', area: 'Drive' }).updates[0]?.text === 'Delete from cloud is now complete', 'MC2 "~ …" becomes an update');
ok(noteToCaptureInput({ text: '✓ payment rail picked', area: 'Billing' }).resolutions[0]?.text === 'payment rail picked', 'MC2 "✓ …" becomes a resolve');

// ── MC5 — healing cards captured before the fix ──────────────────────────────
// Real cards from the KLYPIX brain, as stored (hard-wrapped at 37 columns).
const oldMile = "Drive: ! Drive storage enforcement\nswitched ON in production 2026-10-12\n(~00:10 Riyadh) by the founder.\n#drive";
const healed = repairRawMarker(oldMile);
ok(healed.startsWith('Drive: 🏁 Drive storage'), `MC5 "! " becomes 🏁 (${JSON.stringify(healed.split('\n')[0])})`);
ok(healed.replace(/\s+/g, ' ').includes('🏁 Drive storage enforcement switched ON in production 2026-10-12 (~00:10 Riyadh) by the founder.'), 'MC5 the paragraph is rewrapped whole, no orphaned word');
ok(healed.split('\n').every((l) => l.length <= 37) && healed.endsWith('\n#drive'), 'MC5 every line still fits the card and the tag line is kept');
ok(repairRawMarker('Capabilities: + Every user-facing\nship must update its pillar card').startsWith('Capabilities: 🛠️ Every'), 'MC5 "+ " becomes 🛠️');
ok(repairRawMarker('Pricing: ? FOUNDER REMINDER (asked\n2026-10-12): cut it').startsWith('Pricing: ❓ FOUNDER'), 'MC5 "? " becomes ❓');
const resolveCard = 'Release: ✓ 1.3.39 arc 100% CLOSED —\nrollout row registered';
const updateCard = 'Release: ~ v1.3.52 is LIVE (published\n by peer at 100% rollout';
ok(repairRawMarker(resolveCard) === resolveCard && repairRawMarker(updateCard) === updateCard, 'MC5 ✓ and ~ cards are left as written (their action targeted another card)');
ok(repairRawMarker('Drive: 🏁 already fine') === 'Drive: 🏁 already fine', 'MC5 a healthy card is untouched');
{
  const buf = await buildKlypixMap({ title: 'brain', areas: [{ title: 'Drive', cards: [{ text: oldMile }, { text: resolveCard }] }] });
  const { struct } = await parseKlypix((await tidyBrain(buf)).buffer);
  const mileCard = struct.cards.find((c) => /Drive storage/.test(c.text || ''));
  const resCard = struct.cards.find((c) => /1\.3\.39/.test(c.text || ''));
  ok(mileCard && isMilestoneCard(mileCard), 'MC5 tidyBrain heals a stored "! " card into a milestone');
  ok(resCard && /: ✓ /.test(resCard.text), 'MC5 tidyBrain leaves a ✓ card as written');
}

// ── MC3/MC4 — the real hook ──────────────────────────────────────────────────
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'klypix-mc-home-'));
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'klypix-mc-proj-'));
fs.mkdirSync(path.join(home, '.claude', 'project-brain'), { recursive: true });
fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
const brainFile = path.join(proj, 'brain.klypix');
fs.writeFileSync(brainFile, await buildKlypixMap({ title: 'brain', areas: [{ title: 'Goal', cards: [{ text: 'seed card' }] }] }));
const env = { ...process.env, HOME: home, USERPROFILE: home, KLYPIX_BRAIN_DIR: path.join(home, '.claude', 'project-brain') };
delete env.KLYPIX_BRAIN_NO_MAIN;
const TXT = (text) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
let runN = 0;
function runStop(lines, sessionId) {
  const tp = path.join(home, `t-${runN++}.jsonl`);
  fs.writeFileSync(tp, JSON.stringify(TXT(lines.join('\n'))) + '\n');   // one turn, as a session writes them
  return spawnSync(process.execPath, [HOOK, '--capture'], {
    cwd: proj, env, encoding: 'utf8', input: JSON.stringify({ session_id: sessionId, transcript_path: tp, stop_hook_active: true }),
  });
}
const cards = async () => (await parseKlypix(fs.readFileSync(brainFile))).struct.cards.filter((c) => c.type !== 'container');
try {
  runStop([
    `${B} [Drive]: ! Drive storage enforcement switched ON in production for the beta`,
    `${B} [Pricing]: ? Should the free Drive allowance drop to two hundred megabytes later`,
    `${B} [Release] !: Classic form milestone still lands as before for the release`,
  ], 's-mc-1');
  const all = await cards();
  // Cards are stored hard-wrapped, so compare with whitespace flattened.
  const find = (s) => all.find((c) => String(c.text || '').replace(/\s+/g, ' ').includes(s));
  const drive = find('Drive storage enforcement switched ON');
  const pricing = find('free Drive allowance drop');
  const classic = find('Classic form milestone');
  ok(drive && isMilestoneCard(drive), `MC3 "[Drive]: ! …" lands as a milestone (${JSON.stringify(drive?.text?.split('\n')[0])})`);
  ok(drive && !/: ! /.test(drive.text), 'MC3 the milestone carries no raw "! "');
  ok(pricing && isOpenCard(pricing), `MC3 "[Pricing]: ? …" lands as an open question (${JSON.stringify(pricing?.text?.split('\n')[0])})`);
  ok(pricing && !/: \? /.test(pricing.text), 'MC3 the question carries no raw "? "');
  ok(classic && isMilestoneCard(classic), 'MC3 the classic "[Area] !:" form is unchanged');

  // MC4: a line an earlier hook keyed as a plain decision ("|area|! body").
  const statePath = path.join(proj, '.claude', 'brain-capture-state.json');
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
  const oldBody = '! Older hook already landed this note about the lock file';
  const oldKey = crypto.createHash('sha1').update(('|' + 'locks' + '|' + oldBody).toLowerCase()).digest('hex').slice(0, 16);
  const seenField = Object.keys(state).find((k) => Array.isArray(state[k]) && state[k].every((x) => typeof x === 'string' && /^[0-9a-f]{16}$/.test(x)));
  if (seenField) {
    state[seenField].push(oldKey);
    fs.writeFileSync(statePath, JSON.stringify(state));
    const before = (await cards()).length;
    runStop([`${B} [Locks]: ${oldBody}`], 's-mc-2');
    ok((await cards()).length === before, 'MC4 a line an earlier hook already landed is not captured again');
  } else {
    ok(false, `MC4 could not find the hook's seen-key list in ${JSON.stringify(Object.keys(state))}`);
  }
} finally {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(proj, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} failure(s)` : '\nall marker-after-colon checks passed');
process.exit(failures ? 1 : 0);
