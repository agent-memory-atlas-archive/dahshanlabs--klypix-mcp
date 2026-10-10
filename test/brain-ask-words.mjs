// brain_ask — the caller's `Also:` words (1.96.0).
// The last line `Also: <words>` joins the MEANING query only; the question
// keeps the keyword anchor test, the status shape and the rendered header.
// The end-to-end half runs opBrainAsk in a child with HOME/USERPROFILE in a
// temp dir and a fake embedder, so no model, no network and never the live
// ~/.claude/project-brain cache.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

if (process.env.KLYPIX_ASK_WORDS_CHILD === '1') {
  const { buildKlypix } = await import('../src/klypix-format.mjs');
  const semantic = await import('../src/semantic-memory.mjs');
  const { opBrainAsk } = await import('../src/klypix-core.mjs');
  const brain = process.env.KLYPIX_ASK_WORDS_BRAIN;
  fs.writeFileSync(brain, await buildKlypix({
    title: 'brain',
    cards: [
      { text: 'Canvas navigation: the zoom buttons moved to the bottom-right toolbar' },
      { text: 'Magnification of pasted images is out of scope for now' },
      { text: 'Weekly lunch menu for the team' },
    ],
  }));
  const queries = [];
  // Three directions, picked by the first word family a text contains.
  const pipe = async (texts) => {
    const rows = texts.map((text) => {
      if (text.startsWith(semantic.EMBEDDING_QUERY_PREFIX)) queries.push(text);
      return /zoom/i.test(text) ? [1, 0, 0] : /magnif/i.test(text) ? [0, 1, 0] : [0, 0, 1];
    });
    return { dims: [texts.length, 3], data: Float32Array.from(rows.flat()), dispose() {} };
  };
  semantic.__semanticMemoryTest.installModels({ embedder: pipe });
  const ask = async (question) => {
    const r = await opBrainAsk({ vault: path.dirname(brain), canvas: brain, question, k: 3 });
    return r.blocks.map(b => b.text || '').join('\n');
  };
  const withWords = await ask('Where did the magnification controls end up?\nAlso: zoom buttons toolbar');
  const queriesWithWords = queries.splice(0);
  const plain = await ask('Where did the magnification controls end up?');
  process.stdout.write(JSON.stringify({ withWords, plain, queriesWithWords, queriesPlain: queries, prefix: semantic.EMBEDDING_QUERY_PREFIX }));
  process.exit(0);
}

let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? '✓' : '✗'} ${label}`); if (!cond) failures++; };
const { splitAskWords, ASK_WORDS_MAX } = await import('../src/klypix-format.mjs');

// ── The splitter ────────────────────────────────────────────────────────────
ok(JSON.stringify(splitAskWords('What did we decide about zoom?')) === JSON.stringify({ question: 'What did we decide about zoom?', words: '' }), 'split: a plain question is the question, no words');
ok(JSON.stringify(splitAskWords('Where are the controls?\nAlso: zoom  toolbar\n\n')) === JSON.stringify({ question: 'Where are the controls?', words: 'zoom toolbar' }), 'split: the last line `Also:` becomes the words (spaces collapsed, trailing blank lines ignored)');
ok(splitAskWords('Where?\r\nALSO : zoom').words === 'zoom', 'split: case and CRLF do not matter');
ok(splitAskWords('Also: zoom toolbar').question === 'Also: zoom toolbar' && splitAskWords('Also: zoom toolbar').words === '', 'split: a lone `Also:` line is the question itself, never an empty question');
ok(JSON.stringify(splitAskWords('Where?\nAlso:')) === JSON.stringify({ question: 'Where?', words: '' }), 'split: an empty `Also:` line is dropped');
ok(splitAskWords('Where are we on zoom?\nAlso: where are we on ZOOM?').words === '', 'split: words equal to the question add nothing');
ok(splitAskWords('Plan:\nalso: we keep zoom\nWhat changed?').words === '', 'split: an `also:` line in the middle is part of the question');
ok(splitAskWords(`Where?\nAlso: ${'x'.repeat(500)}`).words.length === ASK_WORDS_MAX, 'split: the words are capped');

// ── opBrainAsk end to end, sandboxed ────────────────────────────────────────
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'klypix-ask-words-'));
const brain = path.join(root, 'project', 'brain.klypix');
fs.mkdirSync(path.dirname(brain), { recursive: true });
const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
  env: { ...process.env, HOME: root, USERPROFILE: root, KLYPIX_AUTO_UPDATE: '0', KLYPIX_ASK_WORDS_CHILD: '1', KLYPIX_ASK_WORDS_BRAIN: brain },
  encoding: 'utf8',
  timeout: 180_000,
  maxBuffer: 16 * 1024 * 1024,
});
let out = null;
try { out = JSON.parse(child.stdout); } catch { console.error({ status: child.status, signal: child.signal, error: child.error?.message, stderr: String(child.stderr || '').slice(-2000) }); }
ok(!!out, 'the sandboxed opBrainAsk run completed');
if (out) {
  const q = 'Where did the magnification controls end up?';
  ok(out.queriesWithWords.length === 1 && out.queriesWithWords[0] === `${out.prefix}${q}\nzoom buttons toolbar`, 'the meaning query is ONE vector: the question, then the words');
  ok(out.queriesPlain.length === 1 && out.queriesPlain[0] === `${out.prefix}${q}`, 'without a words line the meaning query is the question alone, byte for byte');
  ok(!/Also:/.test(out.withWords) && out.withWords.includes(q), 'the rendered answer quotes the question, never the words line');
  ok(/your Also words/.test(out.withWords) && !/your Also words/.test(out.plain), 'the ranking line says when the words were used');
  const pos = (text, needle) => text.indexOf(needle);
  ok(pos(out.withWords, 'zoom buttons moved') >= 0 && pos(out.withWords, 'zoom buttons moved') < pos(out.withWords, 'Magnification of pasted'), 'with the words, the card worded differently (zoom) ranks first');
  const magnifyAt = pos(out.plain, 'Magnification of pasted'), zoomAt = pos(out.plain, 'zoom buttons moved');
  ok(magnifyAt >= 0 && (zoomAt < 0 || magnifyAt < zoomAt), 'without them, the question\'s own wording leads');
}
fs.rmSync(root, { recursive: true, force: true });

console.log(failures ? `\n✗ ${failures} assertion(s) failed` : '\n✓ brain-ask-words: all assertions passed');
process.exit(failures ? 1 : 0);
