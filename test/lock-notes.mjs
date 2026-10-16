// Lock notes (1.102.0) — a "do not touch" / hands-off / WIP line in a
// project's instruction file is checked against the work KLYPIX can see.
//
// THE contract under test (coordination bench S5 / S5b, 2026-10-12/13: a dead
// "do not touch" note in AGENTS.md made Claude Code and Codex leave the file
// alone in 14 of 15 runs even with KLYPIX installed, because KLYPIX's lane
// said nothing about the file — an absence, not an answer):
//   A. DETECT — lock-shaped lines that name a file of the project are found
//      in AGENTS.md / CLAUDE.md / …; prose, code fences, KLYPIX's own managed
//      block and names that are not project files are not.
//   B. VERDICT — per file: IN USE (a live session other than me holds it),
//      WORK IN PROGRESS (an unmerged local branch, a stopped session's
//      unmerged commits, or uncommitted changes), NO WORK FOUND (none of
//      those — the note looks stale), UNKNOWN (not a git repo). A squash-merged
//      branch is not work in progress. The asking session never holds a file
//      against itself.
//   C. TEXT — the block says what to do for each verdict, and never tells the
//      agent to delete the note (the human decides).
//   D. SURFACES — the Claude SessionStart hook and brain_sync start (over MCP
//      stdio) both carry the block; brain_sync declaring a named file carries
//      it on a checkpoint too; structured.lockNotes is the machine twin.
//
// Run:  node test/lock-notes.mjs        (exit 0 = pass, 1 = fail)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { buildKlypixMap } from '../src/klypix-format.mjs';
import { findLockNotes, readLockNotes, assessLockNote, formatLockNotes, lockNotesData, createLockNoteProbe } from '../src/session-handoff.mjs';
import { BRAIN_INSTRUCTIONS } from '../src/agent-rules.mjs';
import { upsertSession, endSession } from '../src/agent-presence.mjs';
import { KLYPIX_MCP_INSTRUCTIONS } from '../src/mcp-presence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(__dirname, '..', 'src', 'global-brain-hook.mjs');
const WORKER = path.join(__dirname, '..', 'bin', 'klypix-worker.mjs');
let checks = 0;
const ok = (condition, label) => { checks++; assert.ok(condition, label); console.log(`[ok] ${label}`); };

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'klypix-locknotes-'));
const home = path.join(root, 'home');
fs.mkdirSync(home, { recursive: true });

const makeRepo = (name) => {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  const git = (args) => String(execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).trim();
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);
  const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  const commit = (msg) => { git(['add', '-A']); git(['commit', '-q', '-m', msg]); return git(['rev-parse', '--short=7', 'HEAD']); };
  return { dir, git, write, commit };
};
const NOTE = '- Hands off lib/ledger.js please — Priya is mid-refactor on it.';
const notesFile = (line) => ['# Project notes', '', '## Heads-up', line, '', '## Log', '- 2026-10-01 Billing: amounts are dollars with cents.', ''].join('\n');
const verdictOf = (assessed, file = 'lib/ledger.js') => assessed.files.find((f) => f.file === file)?.verdict;

try {
  // ── A. Detect ─────────────────────────────────────────────────────────────
  {
    const yes = [
      NOTE,
      '- 2026-10-11 WIP (session Q): rewriting lib/report.js top to bottom — please do not touch it until this note is gone.',
      'Please leave `src/auth/session.ts` alone for now.',
      "Don't edit config/routes.yaml — Sam is reworking the routing.",
      '* Keep out of api/handlers.go; it is being rewritten.',
      'lib/tax.js: Omar is currently refactoring this.',
      'The schema in db/schema.sql is locked until the migration lands.',
    ];
    for (const [i, line] of yes.entries()) {
      const found = findLockNotes(line);
      ok(found.length === 1 && found[0].files.length === 1, `A${i + 1} a lock line is found with its file: ${line.slice(0, 48)}…`);
    }
    const no = [
      'Run `npm test` before committing; tests live in test/ledger.test.js.',
      'When refactoring, keep helpers small (see docs/style.md).',
      'Do not touch production.',
      'Port 8080 is reserved for dev in config/dev.json.',
      'Amounts are rounded half up in lib/ledger.js.',
    ];
    for (const [i, line] of no.entries()) ok(findLockNotes(line).length === 0, `A${yes.length + i + 1} not a lock note: ${line.slice(0, 48)}…`);
    const fenced = ['```', 'do not touch lib/ledger.js', '```', '<!-- klypix-brain:start v1 -->', 'a "do not touch" note about lib/x.js', '<!-- klypix-brain:end -->'].join('\n');
    ok(findLockNotes(fenced).length === 0, 'A13 lines inside a code fence or KLYPIX\'s own managed block are skipped');
    const r = makeRepo('detect');
    r.write('lib/ledger.js', 'x\n');
    r.write('AGENTS.md', notesFile(NOTE + '\n- Also do not touch the Node.js setup.'));
    r.write('CLAUDE.md', notesFile(NOTE));
    r.commit('base');
    const notes = readLockNotes(r.dir);
    ok(notes.length === 1 && notes[0].source === 'AGENTS.md' && notes[0].alsoIn.join() === 'CLAUDE.md', 'A14 the same line in two instruction files is one note, citing both');
    ok(notes[0].files.join() === 'lib/ledger.js', 'A15 a name that is not a file of the project ("Node.js" in prose) is dropped');
    // Any wording: a line naming a DECLARED file is found as a mention.
    const plain = "- Mira's agent has lib/invoice.js this week; send fixes through the callers.";
    ok(findLockNotes(plain).length === 0, 'A16 without a declared file, an unkeyworded line is not a note');
    const m = findLockNotes(plain, { mentions: ['lib/invoice.js'] });
    ok(m.length === 1 && m[0].kind === 'mention' && m[0].files.join() === 'lib/invoice.js', 'A17 with the file declared, the same line is found as a mention, whatever its wording');
    ok(findLockNotes('see lib/invoice.json and xlib/invoice.js', { mentions: ['lib/invoice.js'] }).length === 0 && findLockNotes('edit ./lib/invoice.js.', { mentions: ['lib/invoice.js'] }).length === 1, 'A18 a mention must name the path itself, not a longer path or name');
  }

  // ── B. Verdict ────────────────────────────────────────────────────────────
  const base = (name) => {
    const r = makeRepo(name);
    r.write('AGENTS.md', notesFile(NOTE));
    r.write('lib/ledger.js', 'export const roundCents = (a) => Math.floor(a * 100) / 100;\n');
    r.write('lib/invoice.js', 'import { roundCents } from "./ledger.js";\n');
    r.commit('base: ledger and invoices');
    return r;
  };
  const priya = (commits) => ({ id: 'actor-priya-0001', client: 'claude-code', intent: 'Refactor the ledger rounding helpers', files: ['lib/ledger.js'], commits, lastSeen: Date.now() - 5 * 3600_000 });
  {
    // S5b: the refactor is finished and on main; the note was never removed.
    const r = base('stale');
    r.write('lib/ledger.js', 'export function roundCents(a) { return Math.floor(a * 100) / 100; }\n');
    const sha = r.commit('ledger: consolidate rounding helpers');
    const [note] = readLockNotes(r.dir);
    const a = assessLockNote(r.dir, note, { live: [], stopped: [priya([{ sha, subject: 'ledger: consolidate rounding helpers' }])] });
    ok(verdictOf(a) === 'no-work-found', 'B1 finished work on main, nobody live, no branch → NO WORK FOUND');
    const text = formatLockNotes([a]);
    ok(text.includes('NO WORK FOUND') && text.includes('If this note is a temporary reservation, the work it held has ended') && text.includes(`${sha} ledger: consolidate rounding helpers`) && text.includes('commits are merged'), 'B2 the text cites the stopped session and its merged commit');
    ok(/tell the human the note looks stale so they can remove it/.test(text) && !/delete (the|this) note/i.test(text), 'B3 the text says to tell the human — never to delete the note');
    ok(/cannot see other machines/.test(text), 'B4 the text states what KLYPIX cannot see');
    const d = lockNotesData([a]);
    ok(d[0].files[0].workFound === false && d[0].files[0].verdict === 'no-work-found', 'B5 structured: workFound:false');

    // A live session (not me) declares the file → IN USE; me declaring it → not.
    const live = [{ id: 'live-peer-0002', client: 'codex', intent: 'ledger audit', files: ['lib/ledger.js'] }, { id: 'me-0003', logicalSessionId: 'me-logical', client: 'claude-code', files: ['lib/ledger.js'] }];
    ok(verdictOf(assessLockNote(r.dir, note, { live, selfId: ['me-0003'] })) === 'in-use', 'B6 a live peer holding the file → IN USE');
    ok(verdictOf(assessLockNote(r.dir, note, { live: live.slice(1), selfId: ['me-logical'] })) === 'no-work-found', 'B7 the asking session (by any of its ids) never holds a file against itself');

    // Uncommitted changes to the file in this checkout → WORK IN PROGRESS.
    fs.appendFileSync(path.join(r.dir, 'lib/ledger.js'), '// half-done\n');
    ok(verdictOf(assessLockNote(r.dir, note, {})) === 'in-progress', 'B8 uncommitted changes to the file → WORK IN PROGRESS');
    r.git(['checkout', '--', 'lib/ledger.js']);
  }
  {
    // S5c: the refactor is half done on its own branch → the note is TRUE.
    const r = base('valid');
    r.git(['checkout', '-q', '-b', 'a/ledger-refactor']);
    r.write('lib/ledger.js', 'export function roundCents(a, mode = "floor") { return Math.floor(a * 100) / 100; }\n');
    const sha = r.commit('wip: ledger rounding refactor (half done)');
    r.git(['checkout', '-q', 'main']);
    const [note] = readLockNotes(r.dir);
    const a = assessLockNote(r.dir, note, { live: [], stopped: [priya([{ sha, subject: 'wip: ledger rounding refactor (half done)' }])] });
    ok(verdictOf(a) === 'in-progress', 'B9 an unmerged branch with commits on the file → WORK IN PROGRESS');
    const text = formatLockNotes([a]);
    ok(text.includes('WORK IN PROGRESS') && text.includes('branch a/ledger-refactor') && text.includes('Preserve this work; coordinate or isolate your changes'), 'B10 the text names existing work without turning it into authority');
    ok(lockNotesData([a])[0].files[0].workFound === true, 'B11 structured: workFound:true');
    // The branch deleted, but the stopped session's commit is not in HEAD → still in progress.
    r.git(['branch', '-q', '-D', 'a/ledger-refactor']);
    ok(verdictOf(assessLockNote(r.dir, note, { stopped: [priya([{ sha, subject: 'wip' }])] })) === 'in-progress', 'B12 a stopped session\'s unmerged commit (branch gone) → WORK IN PROGRESS');
    ok(verdictOf(assessLockNote(r.dir, note, { stopped: [priya([{ sha: 'deadbee', subject: 'from another clone' }])] })) === 'unknown', 'B13 an unknown sha (another clone, rebased away) is UNKNOWN');
  }
  {
    // A squash-merged branch still shows HEAD..branch commits, but its change is in HEAD.
    const r = base('squash');
    r.git(['checkout', '-q', '-b', 'b/ledger']);
    r.write('lib/ledger.js', 'export const roundCents = (a) => Math.round(a * 100) / 100;\n');
    r.commit('ledger: round half up');
    r.git(['checkout', '-q', 'main']);
    r.git(['merge', '-q', '--squash', 'b/ledger']);
    r.commit('ledger: round half up (#12)');
    const [note] = readLockNotes(r.dir);
    ok(verdictOf(assessLockNote(r.dir, note, {})) === 'no-work-found', 'B14 a squash-merged branch is not work in progress');
  }
  {
    const dir = path.join(root, 'nogit');
    fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'lib', 'ledger.js'), 'x');
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), notesFile(NOTE));
    const [note] = readLockNotes(dir);
    const a = assessLockNote(dir, note, {});
    ok(verdictOf(a) === 'unknown' && formatLockNotes([a]).includes('evidence check is incomplete'), 'B15 not a git repo → UNKNOWN, ask the human (never "no work found")');
    ok(formatLockNotes([]) === '', 'B16 no notes → no block');
  }

  // ── Review regressions: authority and incomplete/local evidence ───────────
  {
    const r = base('authority');
    const [note] = findLockNotes('Do not edit lib/ledger.js; it is generated and must only be changed through its generator.');
    const a = assessLockNote(r.dir, note);
    const text = formatLockNotes([a]);
    ok(verdictOf(a) === 'no-work-found' && text.includes('A PERMANENT rule') && text.includes('a generated-file policy') && text.includes('follow it whatever the evidence says'), 'R1 a clean generated file never gets permission to bypass its rule');
    ok(!text.includes('if your task needs lib/ledger.js, work on it') && lockNotesData([a])[0].files[0].canOverrideInstructions === false, 'R2 neither prose nor machine data grants an override');
    ok(findLockNotes('Do not edit ../outside.js').length === 0, 'R3 notes cannot target paths outside the project');
    ok(findLockNotes('~~~js\nDo not edit lib/ledger.js\n~~~').length === 0, 'R4 tilde code fences are not instructions');
    ok(findLockNotes('Do not edit lib\\ledger.js')[0]?.files[0] === 'lib/ledger.js', 'R5 Windows file separators are recognised');
    ok(findLockNotes('Do not edit `lib/my ledger.js`')[0]?.files.includes('lib/my ledger.js'), 'R5b quoted filenames may contain spaces');
    r.write('lib/ledger[1].js', 'clean\n');
    r.write('lib/ledger1.js', 'clean\n');
    r.commit('literal pathspec fixture');
    r.write('lib/ledger1.js', 'dirty unrelated file\n');
    const exact = { source: 'AGENTS.md', lineNo: 1, line: 'keep off literal filename', files: ['lib/ledger[1].js'] };
    ok(verdictOf(assessLockNote(r.dir, exact), 'lib/ledger[1].js') === 'no-work-found', 'R6 a literal filename is not expanded as a Git pathspec');
  }
  {
    const r = base('sibling');
    const peer = path.join(root, 'sibling checkout with spaces');
    r.git(['worktree', 'add', '-q', '-b', 'peer', peer]);
    fs.appendFileSync(path.join(peer, 'lib/ledger.js'), '// unfinished peer work\n');
    const [note] = readLockNotes(r.dir);
    const a = assessLockNote(r.dir, note);
    ok(verdictOf(a) === 'in-progress' && a.files[0].dirtyWorktrees.includes(peer.replace(/\\/g, '/')), 'R7 uncommitted sibling-worktree edits are preserved');
    // Detached commits also have no branch for for-each-ref to discover.
    execFileSync('git', ['add', 'lib/ledger.js'], { cwd: peer, stdio: 'pipe' });
    execFileSync('git', ['commit', '-qm', 'detached work'], { cwd: peer, stdio: 'pipe' });
    execFileSync('git', ['checkout', '--detach', '-q'], { cwd: peer, stdio: 'pipe' });
    r.git(['branch', '-D', 'peer']);
    ok(verdictOf(assessLockNote(r.dir, note)) === 'in-progress', 'R8 committed work on a detached sibling worktree is found');
    r.git(['worktree', 'remove', peer]);
  }
  {
    const r = base('incomplete');
    r.git(['branch', 'old-feature']);
    const [note] = readLockNotes(r.dir);
    for (const options of [{ maxBranches: 1 }, { maxWorktrees: 0 }, { budgetMs: 0 }]) {
      const probe = createLockNoteProbe(r.dir, options);
      const a = assessLockNote(r.dir, note, { probe });
      ok(verdictOf(a) === 'unknown' && a.files[0].incomplete.length > 0, `R9 bounded/incomplete search cannot claim absence: ${JSON.stringify(options)}`);
    }
    for (const fail of ['status', 'for-each-ref', 'worktree']) {
      const probe = createLockNoteProbe(r.dir, { runGit: (cwd, args, timeout) => {
        if (args[0] === fail) { const error = new Error('simulated timeout'); error.code = 'ETIMEDOUT'; throw error; }
        return execFileSync('git', ['--literal-pathspecs', ...args], { cwd, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] });
      } });
      ok(verdictOf(assessLockNote(r.dir, note, { probe })) === 'unknown', `R10 failed Git ${fail} cannot become NO WORK FOUND`);
    }
    let calls = 0;
    const probe = createLockNoteProbe(r.dir, { runGit: (cwd, args, timeout) => {
      calls++;
      return execFileSync('git', ['--literal-pathspecs', ...args], { cwd, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] });
    } });
    assessLockNote(r.dir, note, { probe });
    const before = calls;
    assessLockNote(r.dir, note, { probe });
    ok(calls === before, 'R11 multiple notes reuse one bounded Git snapshot');
  }
  {
    const r = base('failed-diff');
    r.git(['checkout', '-qb', 'peer']);
    r.write('lib/ledger.js', 'unfinished branch\n');
    r.commit('peer work');
    r.git(['checkout', '-q', 'main']);
    const [note] = readLockNotes(r.dir);
    for (const fail of ['log', 'diff']) {
      const probe = createLockNoteProbe(r.dir, { runGit: (cwd, args, timeout) => {
        if (args[0] === fail) throw new Error('simulated unavailable comparison');
        return execFileSync('git', ['--literal-pathspecs', ...args], { cwd, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] });
      } });
      const a = assessLockNote(r.dir, note, { probe });
      ok(verdictOf(a) === 'unknown' && lockNotesData([a])[0].files[0].workFound === null, `R12 failed Git ${fail} comparison remains unknown in text and JSON`);
    }
    r.write('lib/ledger.js', 'local unfinished edits\n');
    const a = assessLockNote(r.dir, note, { probe: createLockNoteProbe(r.dir, { maxBranches: 1 }) });
    ok(verdictOf(a) === 'in-progress', 'R13 positive dirty-work evidence survives an incomplete branch scan');
  }
  {
    const r = base('idle-connection');
    const [note] = readLockNotes(r.dir);
    const now = Date.now();
    const idle = { id: 'connected-but-idle', client: 'claude-code', files: ['lib/ledger.js'], hostStatus: 'busy', hostStatusAt: now - 3600_000, lastSeen: now };
    ok(verdictOf(assessLockNote(r.dir, note, { live: [idle], now })) === 'no-work-found', 'R14 a fresh heartbeat does not make an hour-old busy stamp a live holder');
    ok(verdictOf(assessLockNote(r.dir, note, { live: [{ ...idle, hostStatusAt: now }], now })) === 'in-use', 'R15 fresh host work still reports a live holder');
    r.git(['checkout', '-qb', 'idle-work']);
    r.write('lib/ledger.js', 'unfinished idle session work\n');
    const sha = r.commit('unfinished work');
    r.git(['checkout', '-q', 'main']);
    r.git(['branch', '-D', 'idle-work']);
    idle.work = { commits: [{ sha, subject: 'unfinished work' }] };
    ok(verdictOf(assessLockNote(r.dir, note, { live: [idle], now })) === 'in-progress', 'R16 idle connection history still protects its unmerged commits');
  }

  // ── C. The rule text ──────────────────────────────────────────────────────
  ok(!/no longer applies/.test(BRAIN_INSTRUCTIONS) && /Before you obey one, or before you edit the file\s+anyway, call `brain_sync` with that file in `files`/.test(BRAIN_INSTRUCTIONS) && /never delete the note yourself/.test(BRAIN_INSTRUCTIONS), 'C1 the rules carry the one-sentence check and never say a note "no longer applies"');
  ok(!/no longer applies/.test(KLYPIX_MCP_INSTRUCTIONS) && /before obeying one, call brain_sync with that file in files/.test(KLYPIX_MCP_INSTRUCTIONS), 'C2 the MCP server instructions carry the same rule');

  // ── D. Surfaces ───────────────────────────────────────────────────────────
  {
    const r = base('surfaces');
    r.write('lib/ledger.js', 'export function roundCents(a) { return Math.floor(a * 100) / 100; }\n');
    r.write('AGENTS.md', notesFile(NOTE + "\n- Mira's agent has lib/invoice.js this week; send fixes through the callers."));
    r.commit('ledger: consolidate rounding helpers');
    fs.writeFileSync(path.join(r.dir, 'brain.klypix'), await buildKlypixMap({ title: 'Lock-notes test brain', kind: 'brain', areas: [{ title: 'Billing', cards: [{ text: 'Billing: amounts are dollars with cents' }] }] }));
    const hookEnv = { ...process.env, HOME: home, USERPROFILE: home, CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', KLYPIX_AUTO_UPDATE: '0' };
    delete hookEnv.KLYPIX_SESSION_ID;
    const start = execFileSync(process.execPath, [HOOK], { cwd: r.dir, env: hookEnv, encoding: 'utf8', input: JSON.stringify({ session_id: 'lock-hook-0001', cwd: r.dir }), stdio: ['pipe', 'pipe', 'pipe'] });
    ok(start.includes('📌 Notes in this project') && start.includes('lib/ledger.js: NO WORK FOUND'), 'D1 the Claude SessionStart hook carries the 📌 block');

    const workerEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|CODEX|KLYPIX)/.test(k)));
    const codexHook = path.join(__dirname, '..', 'src', 'codex-brain-hook.mjs');
    const cx = execFileSync(process.execPath, [codexHook], { cwd: r.dir, env: { ...workerEnv, HOME: home, USERPROFILE: home }, encoding: 'utf8', input: JSON.stringify({ cwd: r.dir, session_id: 'lock-codex-0004', hook_event_name: 'SessionStart' }) });
    const cxOut = JSON.parse(cx || '{}');
    const cxText = cxOut.hookSpecificOutput?.additionalContext || cxOut.systemMessage || '';
    ok(cxText.includes('📌 Notes in this project') && cxText.includes('lib/ledger.js: NO WORK FOUND'), 'D1b the Codex SessionStart hook carries the 📌 block');
    const client = new Client({ name: 'lock-notes-test', version: '1.0.0' }, { capabilities: {} });
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [WORKER, '--vault', r.dir],
      env: { ...workerEnv, HOME: home, USERPROFILE: home, KLYPIX_AUTO_UPDATE: '0', KLYPIX_SESSION_ID: 'lock-mcp-0002', KLYPIX_APP_TOOLS: 'off' },
      stderr: 'ignore',
    }));
    try {
      const s = await client.callTool({ name: 'brain_sync', arguments: { project: r.dir, intent: 'Fix the invoice rounding test', files: ['lib/ledger.js'], phase: 'start' } });
      const text = s.content[0].text;
      ok(text.includes('📌 Notes in this project') && text.includes('lib/ledger.js: NO WORK FOUND'), 'D2 brain_sync start carries the 📌 block — and the session declaring the file does not hold it against itself');
      const lock = s.structuredContent?.lockNotes;
      ok(Array.isArray(lock) && lock[0].files[0].verdict === 'no-work-found' && lock[0].source === 'AGENTS.md', 'D3 structured.lockNotes is the machine twin');
      const cp = await client.callTool({ name: 'brain_sync', arguments: { project: r.dir, intent: 'Fix the invoice rounding test', files: ['lib/ledger.js'], phase: 'checkpoint' } });
      ok(cp.content[0].text.includes('📌 Notes in this project'), 'D4 a checkpoint that declares a file a note names carries it too');
      const other = await client.callTool({ name: 'brain_sync', arguments: { project: r.dir, intent: 'Docs only', files: ['README.md'], phase: 'checkpoint' } });
      ok(!other.content[0].text.includes('📌'), 'D5 a checkpoint about other files does not');
      const inv = await client.callTool({ name: 'brain_sync', arguments: { project: r.dir, intent: 'Fix invoice totals', files: ['lib/invoice.js'], phase: 'checkpoint' } });
      const invText = inv.content[0].text;
      ok(invText.includes("Mira's agent has lib/invoice.js") && invText.includes('names a file you declared') && invText.includes('lib/invoice.js: NO WORK FOUND') && invText.includes('If this note is a temporary reservation, the work it held has ended'), 'D6 declaring a file shows every instruction line naming it, whatever its wording, with the evidence');
      ok(inv.structuredContent?.lockNotes?.some((n) => n.kind === 'mention'), 'D7 structured: kind mention');
      const silent = await client.callTool({ name: 'brain_sync', arguments: { project: r.dir, intent: 'No context requested', files: ['lib/ledger.js'], phase: 'checkpoint', include_context: false } });
      ok(!silent.structuredContent?.lockNotes && !silent.content[0].text.includes('📌'), 'D7b include_context:false skips note checks');
      await client.callTool({ name: 'brain_sync', arguments: { project: r.dir, phase: 'complete' } });
    } finally {
      await client.close();
    }
    // A stopped session that worked on lib/invoice.js: the unkeyworded line
    // naming that file rides session start with no declaration (bench S5d/S5f:
    // with hooks installed, Claude never called brain_sync with the file).
    const brainPath = path.join(r.dir, 'brain.klypix');
    const t0 = Date.now() - 3 * 3600_000;
    upsertSession({ brainPath, home, now: t0, id: 'mira-session-0005', client: 'claude-code', channel: 'lifecycle', event: 'UserPromptSubmit', logicalSessionId: 'mira-session-0005', identitySource: 'claude-lifecycle', intent: 'Rework invoice totals', files: ['lib/invoice.js'], work: { lastWords: 'Committed the invoice changes.', lastWordsAt: t0 } });
    endSession({ brainPath, home, now: t0 + 1000, id: 'mira-session-0005' });
    const start2 = execFileSync(process.execPath, [HOOK], { cwd: r.dir, env: hookEnv, encoding: 'utf8', input: JSON.stringify({ session_id: 'lock-hook-0006', cwd: r.dir }), stdio: ['pipe', 'pipe', 'pipe'] });
    ok(start2.includes("Mira's agent has lib/invoice.js") && start2.includes('lib/invoice.js: NO WORK FOUND') && start2.includes('a stopped session worked on'), 'D8 Claude SessionStart shows a line naming a file a stopped session worked on, whatever its wording, with the evidence');
    const cx2 = JSON.parse(execFileSync(process.execPath, [codexHook], { cwd: r.dir, env: { ...workerEnv, HOME: home, USERPROFILE: home }, encoding: 'utf8', input: JSON.stringify({ cwd: r.dir, session_id: 'lock-codex-0007', hook_event_name: 'SessionStart' }) }) || '{}');
    ok((cx2.hookSpecificOutput?.additionalContext || cx2.systemMessage || '').includes("Mira's agent has lib/invoice.js"), 'D9 the Codex SessionStart hook does too');
  }
  console.log(`\nlock-notes: ${checks} checks passed`);
} finally {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* Windows may hold a handle */ }
}
