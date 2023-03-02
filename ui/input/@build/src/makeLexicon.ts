import * as ps from 'node:process';
import * as fs from 'node:fs';

// see ui/input/@build/README.md
const baseLexicon: Token[] = [
  { in: 'a', tok: 'a' },
  { in: 'b', tok: 'b' },
  { in: 'c', tok: 'c' },
  { in: 'd', tok: 'd' },
  { in: 'e', tok: 'e' },
  { in: 'f', tok: 'f' },
  { in: 'g', tok: 'g' },
  { in: 'h', tok: 'h' },
  { in: '1', tok: '1' },
  { in: 'one', tok: '1' },
  { in: '2', tok: '2' },
  { in: 'two', tok: '2' },
  { in: '3', tok: '3' },
  { in: 'three', tok: '3' },
  { in: '4', tok: '4' },
  { in: 'four', tok: '4' },
  { in: '5', tok: '5' },
  { in: 'five', tok: '5' },
  { in: '6', tok: '6' },
  { in: 'six', tok: '6' },
  { in: '7', tok: '7' },
  { in: 'seven', tok: '7' },
  { in: '8', tok: '8' },
  { in: 'eight', tok: '8' },
  { in: 'pawn', tok: 'P' },
  { in: 'knight', tok: 'N' },
  { in: 'bishop', tok: 'B' },
  { in: 'rook', tok: 'R' },
  { in: 'queen', tok: 'Q' },
  { in: 'king', tok: 'K' },

  { in: 'takes', tok: 'x', out: 'x' },
  { in: 'captures', out: 'x' },
  { in: 'castle', out: 'o-o' },
  { in: 'short castle', out: 'o-o' },
  { in: 'king side castle', out: 'o-o' },
  { in: 'castle king side', out: 'o-o' },
  { in: 'long castle', out: 'o-o-o' },
  { in: 'castle queen side', out: 'o-o-o' },
  { in: 'queen side castle', out: 'o-o-o' },
  { in: 'promote', tok: '=', out: '=' },
  { in: 'promotion', out: '=' },
  { in: 'promote two', out: '=' }, // we don't want to add 'to' to the vocabulary
  { in: 'promotes two', out: '=' },
  { in: 'mate', out: '' },
  { in: 'check', out: '' },
  { in: 'takeback', out: 'takeback' },
  { in: 'draw', out: 'draw' },
  { in: 'offer draw', out: 'draw' },
  { in: 'accept draw', out: 'draw' },
  { in: 'resign', out: 'resign' },
  { in: 'rematch', out: 'rematch' },

  { in: 'red', out: 'red' },
  { in: 'yellow', out: 'yellow' },
  { in: 'green', out: 'green' },
  { in: 'blue', out: 'blue' },
  { in: 'next', out: 'next' },
  { in: 'skip', out: 'next' },
  { in: 'continue', out: 'next' },
  { in: 'back', out: 'back' },
  { in: 'last', out: 'last' },
  { in: 'first', out: 'first' },
  { in: 'yes', out: 'yes' },
  { in: 'okay', out: 'yes' },
  { in: 'confirm', out: 'yes' },
  { in: 'no', out: 'no' },
  { in: 'cancel', out: 'no' },
  { in: 'abort', out: 'no' },
  { in: 'up vote', out: 'upv' },
  { in: 'down vote', out: 'downv' },
  { in: 'help', out: '?' },
  { in: 'clock', out: 'clock' },
  { in: 'opponent', out: 'who' },
  { in: 'puzzle', out: '' },
  { in: 'and', out: '' },
];

function buildCostMap(
  subMap: Map<string, SubInfo>, // the map of all valid substitutions within --ops
  freqThreshold: number, // minimum frequency of a substitution to be considered
  countThreshold: number // minimum count for a substitution to be considered
) {
  const costMax = 0.7;
  const subCostMin = 0.4;
  const delCostMin = subCostMin - 0.2;

  // we don't do anything with confs right now, don't trust em
  const costs = [...subMap.entries()]
    .filter(([_, e]) => e.freq >= freqThreshold && e.count >= countThreshold)
    .sort((a, b) => b[1].freq - a[1].freq);

  costs.forEach(([_, v], i) => {
    v.cost = ((costMax - subCostMin) * i) / costs.length + (v.tpe === 'del' ? delCostMin : subCostMin);
  });
  return new Map(costs);
}

function main() {
  const crowdvfile = getArg('in') ?? 'crowdv-27-02-2023.json';
  const opThreshold = parseInt(getArg('max-ops') ?? '1');
  const freqThreshold = parseFloat(getArg('freq') ?? '0.004');
  const countThreshold = parseInt(getArg('count') ?? '5');
  const lexfile = getArg('out') ?? '../src/voiceMoveLexicon.ts';
  const subMap = new Map<string, SubInfo>();
  const entries = (JSON.parse(fs.readFileSync(crowdvfile, 'utf-8')) as CrowdvData[])
    .map(data => makeLexEntry(data))
    .filter(x => x) as LexEntry[];

  for (const entry of entries) {
    if (entry.h !== entry.x)
      flattenTransforms(findTransforms(entry.h, entry.x, { del: true, sub: 2 }), entry, subMap, opThreshold);
  }
  subMap.forEach(v => (v.freq = v.count / v.all));

  buildCostMap(subMap, freqThreshold, countThreshold).forEach((sub, key) => {
    ppCost(key, sub);
    const [from, to] = key.split(' ');
    builder.addSub(from, { to: to, cost: sub.cost ?? 1 });
  });
  writeLexicon(lexfile);
}

function ppCost(key: string, e: SubInfo) {
  const grey = (s: string) => `\x1b[30m${s}\x1b[0m`;
  const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
  const name = (s: string) => `\x1b[36m${s}\x1b[0m`;
  const op = (s: string) => `\x1b[0m${s}\x1b[0m`;
  const value = (s: string) => `\x1b[0m${s}\x1b[0m`;
  const prettyPair = (k: string, v: string) => `${name(k)}${grey(':')} ${value(v)}`;
  const kpp = key.split(' ').map(x => builder.wordsOf(x));
  const v1 = kpp[1] === '<delete>' ? red(kpp[1]) : op(kpp[1]);
  console.log(
    `'${op(kpp[0])}${grey(' => ')}${v1}'${grey(':')} { ` +
      [
        prettyPair('count', `${e.count}`),
        prettyPair('all', `${e.all}`),
        prettyPair('conf', (e.conf / e.count).toFixed(2)),
        prettyPair('freq', e.freq.toFixed(3)),
        prettyPair('cost', e.cost?.toFixed(2) ?? '1'),
      ].join(grey(', ')) +
      ` }${grey(',')}`
  );
}

// flatten list of transforms into sub map
function flattenTransforms(xss: Transform[][], entry: LexEntry, subMap: Map<string, SubInfo>, opThreshold = 1) {
  return xss
    .filter(xss => xss.length <= opThreshold)
    .forEach(xs =>
      xs.forEach(x => {
        const cost = subMap.get(`${x.from} ${x.to}`) ?? {
          tpe: x.from === '' ? 'ins' : x.to === '' ? 'del' : 'sub',
          count: 0,
          all: builder.occurrences.get(x.from || x.to)!,
          conf: 0,
          freq: 0,
        };
        cost.count++;
        cost.conf += x.at < entry.c.length ? entry.c[x.at] : 0;
        subMap.set(`${x.from} ${x.to}`, cost);
      })
    );
}

// find transforms to turn h (heard) into x (exact)
function findTransforms(
  h: string,
  x: string,
  mode: SubRestriction,
  pos = 0, // for recursion
  line: Transform[] = [],
  lines: Transform[][] = [],
  crumbs = new Map<string, number>()
): Transform[][] {
  if (h === x) {
    return [line];
  }
  if ((pos >= x.length && !mode.del) || (crumbs.has(h + pos) && crumbs.get(h + pos)! <= line.length)) {
    return [];
  }
  crumbs.set(h + pos, line.length);
  return buildOps(h, x, pos, mode).flatMap(({ hnext, op }) =>
    findTransforms(
      hnext,
      x,
      mode,
      pos + (op === 'skip' ? 1 : op.to.length),
      op === 'skip' ? line : [...line, op],
      lines,
      crumbs
    )
  );
}

function buildOps(h: string, x: string, pos: number, mode: SubRestriction) {
  const validOps: { hnext: string; op: Transform | 'skip' }[] = [];
  if (h[pos] === x[pos]) validOps.push({ hnext: h, op: 'skip' });
  else {
    if (mode.del && pos < h.length)
      validOps.push({
        hnext: h.slice(0, pos) + h.slice(pos + 1),
        op: { from: h[pos], at: pos, to: '' }, // erasure of h[pos]
      });
    if (mode.ins && pos < x.length)
      validOps.push({
        hnext: h.slice(0, pos) + x[pos] + h.slice(pos),
        op: { from: '', at: pos, to: x[pos] }, // insertion of x[pos]
      });
  }
  let sliceLen = Math.min(mode.sub ?? 0, x.length - pos);
  while (sliceLen > 0) {
    const slice = x.slice(pos, pos + sliceLen);
    if (pos < h.length && !h.startsWith(slice, pos))
      validOps.push({
        hnext: h.slice(0, pos) + slice + h.slice(pos + 1),
        op: { from: h[pos], at: pos, to: slice }, // replace h[pos] with slice
      });

    sliceLen--;
  }
  return validOps;
}

function makeLexEntry(entry: CrowdvData): LexEntry | undefined {
  const xset = new Set([...builder.encode(entry.exact)]);
  const hunique = [...new Set([...builder.encode(entry.heard)])];
  if (hunique.filter(h => xset.has(h)).length < xset.size - 2) return undefined;
  if (entry.heard.endsWith(' next')) entry.heard = entry.heard.slice(0, -5);
  builder.addOccurrence(entry.heard); // for token frequency
  return {
    h: builder.encode(entry.heard),
    x: builder.encode(entry.exact),
    c: entry.data.map(x => x.conf),
  };
}

function writeLexicon(out: string) {
  fs.writeFileSync(
    out,
    '// this file is generated. see ui/input/@build/README.md\n\n' +
      'export type Sub = { to: string, cost: number };\n\n' +
      'export type Token = { in: string, tok?: string, out?: string, subs?: Sub[] };\n\n' +
      `export const lexicon: Token[] = ${JSON.stringify(baseLexicon, null, 2)};`
  );
}

function getArg(arg: string): string | undefined {
  return (
    ps.argv
      .filter(v => v.startsWith(`--${arg}`))
      .pop()
      ?.slice(3 + arg.length) ||
    ps.argv
      .filter(v => v.startsWith(`-${arg}`))
      .pop()
      ?.slice(2 + arg.length)
  );
}

type SubRestriction = { del?: boolean; sub?: number; ins?: boolean };

type LexEntry = {
  h: string;
  x: string;
  c: number[];
};

type Transform = {
  from: string; // single token, or empty string for insertion
  to: string; // one or more tokens, or empty string for erasure
  at: number; // index (for breadcrumbs)
};

type SubInfo = {
  tpe: 'del' | 'sub' | 'ins';
  all: number;
  count: number;
  freq: number;
  conf: number;
  cost?: number;
};

type CrowdvData = {
  heard: string;
  exact: string;
  round: number;
  ip: string;
  data: Array<{
    word: string;
    start: number;
    end: number;
    conf: number;
  }>;
};

type Sub = {
  to: string;
  cost: number;
};

type Token = {
  in: string; // the word or phrase recognized by kaldi, unique
  tok?: string; // single char token representation (or '' for ignored words)
  out?: string; // the string moveHandler receives, default is tok
  subs?: Sub[]; // allowable token transitions calculated by this script
};

const builder = new (class {
  occurrences = new Map<string, number>();
  tokenSubs = new Map<string, Sub[]>();
  tokenOut = new Map<string, string>();
  wordToken = new Map<string, string>();

  constructor() {
    const reserved = baseLexicon.map(t => t.tok ?? '').join('');
    const available = Array.from({ length: 93 }, (_, i) => String.fromCharCode(33 + i)).filter(
      x => !reserved.includes(x)
    );

    for (const e of baseLexicon) {
      if (e.tok !== undefined) {
        if (e.tok === ' ') throw new Error('invalid baseLexicon - space is reserved.');
      } else {
        if (reserved.includes(e.in)) e.tok = e.in;
        else e.tok = available.shift();
      }
      this.wordToken.set(e.in, e.tok ?? '');
      if (!e.tok) continue;
      if (e.out && !this.tokenOut.has(e.tok)) this.tokenOut.set(e.tok, e.out);
      if (e.subs && !this.tokenSubs.has(e.tok)) this.tokenSubs.set(e.tok, e.subs);
    }
    console.log(this.tokenSubs, this.tokenOut, this.wordToken);
  }
  addOccurrence(phrase: string) {
    this.encode(phrase)
      .split('')
      .forEach(token => this.occurrences.set(token, (this.occurrences.get(token) ?? 0) + 1));
  }
  addSub(token: string, sub: Sub) {
    const tok = baseLexicon.find(e => e.tok === token);
    if (tok) tok.subs = [...(tok.subs ?? []), sub];
  }
  get words() {
    return Array.from(this.wordToken.keys());
  }
  tokenOf(word: string) {
    return this.wordToken.get(word) ?? '';
  }
  fromToken(token: string) {
    return this.tokenOut.get(token) ?? token;
  }
  encode(phrase: string) {
    return this.wordToken.has(phrase)
      ? this.tokenOf(phrase)
      : phrase
          .split(' ')
          .map(word => this.tokenOf(word))
          .join('');
  }
  decode(tokens: string) {
    return tokens
      .split('')
      .map(token => this.fromToken(token))
      .join(' ');
  }
  wordsOf(tokens: string) {
    return tokens === ''
      ? '<delete>'
      : tokens
          .split('')
          .map(token => [...this.wordToken.entries()].find(([_, tok]) => tok === token)?.[0])
          .join(' ');
  }
})();

main();
