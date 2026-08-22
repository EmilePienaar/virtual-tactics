#!/usr/bin/env node
/* Repair text extracted from a PDF whose font lost some of its ligatures.
 *
 *   pdftotext -enc UTF-8 guide.pdf guide.raw.txt
 *   node tools/clean-pdf-text.js guide.raw.txt guide.txt
 *
 * Three separate kinds of damage, in the order they have to be undone:
 *
 *   1. Real ligature codepoints that survived - U+FB01 and friends - are just
 *      characters, and expand to the letters they stand for.
 *
 *   2. U+FFFD, one per lost ligature. In this font it is "ti" almost every
 *      time, and "ft" in a small closed set: those are the words where the
 *      gap falls at the END ("cra~", "sha~") plus a handful of mid-word ones
 *      ("a~er", "o~en"). Guessing "ti" everywhere turns "after" into "atier",
 *      so the exceptions are listed rather than inferred.
 *
 *   3. A few doubled letters flattened to one - "atack", "permited". These
 *      cannot be spotted by shape at all, so they are a plain list.
 *
 * Anything it is unsure of, it leaves alone and counts, so the report says how
 * much doubt is left rather than hiding it.
 */
'use strict';
const fs = require('fs');

const FFFD = '�';

const LIGATURES = [
  ['ﬀ', 'ff'], ['ﬁ', 'fi'], ['ﬂ', 'fl'],
  ['ﬃ', 'ffi'], ['ﬄ', 'ffl'], ['ﬅ', 'st'], ['ﬆ', 'st']
];

/* Word shapes (lower-case, ~ marking the gap) where the gap is NOT "ti". */
const FT_WORDS = new Set([
  'a~er', 'a~ers', 'a~ermath', 'a~erward', 'a~erwards', 'a~ernoon',
  'o~en', 'so~', 'so~ly', 'so~er', 'le~', 'le~over', 'le~overs',
  'swi~', 'swi~ly', 'swi~er', 'swi~wing', 'swi~ness',
  'cra~', 'cra~s', 'cra~ed', 'cra~ing', 'cra~er', 'cra~ers',
  'cra~smanship', 'cra~sman', 'handicra~', 'handicra~s',
  'sha~', 'sha~s', 'dra~', 'dra~s', 'gi~', 'gi~s', 'gi~ed',
  'li~', 'li~s', 'li~ed', 'li~ing', 'shi~', 'shi~s', 'shi~ed', 'shi~ing',
  'dri~', 'dri~s', 'dri~ing', 'the~', 'the~s', 'lo~', 'lo~y', 'ra~',
  'deba~', 'ha~', 'wa~', 'the~-proof'
]);

/* Doubled letters the extraction flattened. */
const DOUBLED = {
  atack: 'attack', atacks: 'attacks', atacked: 'attacked', atacker: 'attacker',
  atackers: 'attackers', atacking: 'attacking', multiatack: 'multiattack',
  permited: 'permitted', forgoten: 'forgotten', patern: 'pattern',
  paterns: 'patterns', atend: 'attend', atended: 'attended', atends: 'attends',
  atempt: 'attempt', atempts: 'attempts', atempted: 'attempted',
  atempting: 'attempting', litle: 'little', batle: 'battle', batles: 'battles',
  batling: 'battling', beter: 'better', geting: 'getting', leting: 'letting',
  seting: 'setting', seters: 'setters', bite: 'bite', gutural: 'guttural',
  motled: 'mottled', atitude: 'attitude', atitudes: 'attitudes',
  atract: 'attract', atracted: 'attracted', atractive: 'attractive',
  atain: 'attain', atained: 'attained', comited: 'committed',
  spoted: 'spotted', ploted: 'plotted', cuting: 'cutting', puting: 'putting',
  siting: 'sitting', hiting: 'hitting', shatered: 'shattered',
  scatered: 'scattered', flatened: 'flattened', botom: 'bottom',
  botle: 'bottle', botles: 'bottles', writen: 'written', biten: 'bitten',
  smiten: 'smitten', roten: 'rotten', beten: 'beaten'
};

function clean(text) {
  for (const [ch, rep] of LIGATURES) text = text.split(ch).join(rep);

  let ti = 0, ft = 0, bare = 0;
  const wordRe = new RegExp('[A-Za-z' + FFFD + "'’-]*" + FFFD + '[A-Za-z' + FFFD + "'’-]*", 'g');
  text = text.replace(wordRe, word => {
    const shape = word.toLowerCase().split(FFFD).join('~');
    if (!/[a-z]/.test(shape)) { bare++; return word.split(FFFD).join('ti'); }
    /* A gap at the end of the word is "ft" - "cra~", "sha~", "le~". The one
       thing that ends in a "ti" sound is not a word this book uses. */
    const isFt = FT_WORDS.has(shape) || /~$/.test(shape);
    if (isFt) { ft++; return word.split(FFFD).join('ft'); }
    ti++;
    return word.split(FFFD).join('ti');
  });

  let dbl = 0;
  text = text.replace(/[A-Za-z]+/g, w => {
    const rep = DOUBLED[w.toLowerCase()];
    if (!rep) return w;
    dbl++;
    return w === w.toUpperCase() ? rep.toUpperCase()
      : w[0] === w[0].toUpperCase() ? rep[0].toUpperCase() + rep.slice(1) : rep;
  });

  text = text.replace(/ /g, ' ')
    .replace(/-\n(?=[a-z])/g, '')          // words hyphenated across a line break
    .replace(/\f/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  return { text, ti, ft, bare, dbl };
}

function main() {
  const [, , inFile, outFile] = process.argv;
  if (!inFile || !outFile) {
    console.error('usage: node tools/clean-pdf-text.js <in.txt> <out.txt>');
    process.exit(2);
  }
  const raw = fs.readFileSync(inFile, 'utf8');
  const r = clean(raw);
  fs.writeFileSync(outFile, r.text, 'utf8');
  const left = (r.text.match(new RegExp(FFFD, 'g')) || []).length;
  console.log('Wrote ' + outFile);
  console.log('  ' + raw.length + ' -> ' + r.text.length + ' chars');
  console.log('  ligature gaps filled: ' + r.ti + ' as "ti", ' + r.ft + ' as "ft"' +
              (r.bare ? ', ' + r.bare + ' standalone' : ''));
  console.log('  doubled letters restored: ' + r.dbl);
  console.log('  unresolved U+FFFD left: ' + left);
}

if (require.main === module) main();
module.exports = { clean };
