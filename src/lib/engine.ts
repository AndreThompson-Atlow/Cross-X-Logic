import { WORDS } from './wordList';

export type ArithOperator = '+' | '-' | '*' | '/';
export type CompOperator = '=' | '<' | '>';
export type Operator = ArithOperator | CompOperator;

export interface GridPuzzle {
  size: number;
  letters: string[][]; // Correct letters
  operators: {
    rows: Operator[][]; // size rows, each has size-1 operators
    cols: Operator[][]; // size cols, each has size-1 operators
  };
  masterCypher: Record<string, number>;
  uniqueLetters: string[];
  definitions: {
    rows: string[];
    cols: string[];
  };
}

export function evaluatePart(parts: (number | ArithOperator)[]): number | null {
  if (parts.length === 1) return parts[0] as number;
  
  const side = [...parts];
  // Process * and /
  let i = 0;
  while (i < side.length) {
    if (side[i] === '*' || side[i] === '/') {
      const op = side[i] as ArithOperator;
      const left = side[i - 1] as number;
      const right = side[i + 1] as number;
      let result: number;
      if (op === '*') result = left * right;
      else {
        if (right === 0) return null;
        if (left % right !== 0) return null; // Integer division
        result = left / right;
      }
      side.splice(i - 1, 3, result);
      i--;
    }
    i++;
  }

  // Process + and -
  let result = side[0] as number;
  for (let j = 1; j < side.length; j += 2) {
    const op = side[j] as ArithOperator;
    const val = side[j + 1] as number;
    if (op === '+') result += val;
    if (op === '-') result -= val;
  }
  return result;
}

let globalDictionary: string[] | null = null;
async function getFullDictionary(size: number): Promise<string[]> {
  if (!globalDictionary) {
    try {
      const res = await fetch('https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt');
      const text = await res.text();
      globalDictionary = text.split('\n').map(w => w.trim().toUpperCase()).filter(w => w.length > 0);
    } catch (e) {
      console.warn("Failed to fetch full dictionary, falling back to basic list", e);
      return WORDS[size] || [];
    }
  }
  return globalDictionary.filter(w => w.length === size);
}

export class AxiomEngine {
  private size: number;
  private topic: string;
  private wordDictionary: string[];
  private topicDictionary: string[] = [];

  constructor(size: number, topic: string = 'None') {
    this.size = size;
    this.topic = topic;
    this.wordDictionary = WORDS[size] || [];
  }

  async generate(): Promise<GridPuzzle> {
    // Expand dictionary dynamically to full scrabble-level list
    const extendedDict = await getFullDictionary(this.size);
    if (extendedDict.length > 0) {
      this.wordDictionary = extendedDict;
    }

    if (this.topic && this.topic !== 'None') {
      try {
        const qmarks = '?'.repeat(this.size);
        const encodedTopic = encodeURIComponent(this.topic.toLowerCase());
        const res = await fetch(`https://api.datamuse.com/words?topics=${encodedTopic}&sp=${qmarks}&max=1000`);
        if (res.ok) {
          const data = await res.json();
          const words = data.map((d: any) => d.word.toUpperCase()).filter((w: string) => w.length === this.size);
          this.topicDictionary = words;
        }
      } catch (e) {
        console.warn("Failed to fetch topic dictionary", e);
      }
    }

    let attempts = 0;
    while (attempts < 50) {
      attempts++;
      const grid = this.generateLexicalGrid();
      if (!grid) continue;

      const uniqueLetters = Array.from(new Set(grid.flat()));
      
      let cypher: Record<string, number> = {};
      let operators: any = null;

      // Try multiple cyphers on the current lexical grid
      for (let cypherAttempts = 0; cypherAttempts < 5000; cypherAttempts++) {
        const testCypher: Record<string, number> = {};
        for (let i = 0; i < 26; i++) {
          testCypher[String.fromCharCode(65 + i)] = Math.floor(Math.random() * 10);
        }

        const testOps = this.generateScaffoldingBalanced(grid, testCypher);
        if (testOps) {
          cypher = testCypher;
          operators = testOps;
          break;
        }
      }

      if (!operators) continue; // Need a new lexical grid if cypher loop failed

      const definitions = await this.fetchDefinitions(grid);
      if (!definitions) continue; // If any word lacks a definition, reject and retry!

      return {
        size: this.size,
        letters: grid,
        operators,
        masterCypher: cypher,
        uniqueLetters,
        definitions
      };
    }
    throw new Error("Failed to generate a valid Axiom Grid. Please try again.");
  }

  private generateLexicalGrid(): string[][] | null {
    const validPrefixes = new Set<string>();
    for (const w of this.wordDictionary) {
      for (let i = 1; i <= this.size; i++) {
        validPrefixes.add(w.substring(0, i));
      }
    }

    let attempts = 0;
    const rows: string[] = [];
    
    const findSquare = (): string[][] | null => {
      if (attempts++ > 10000) return null;
      
      if (rows.length === this.size) {
        return rows.map(r => r.split(''));
      }

      const useTopic = (this.topicDictionary.length > 0 && Math.random() < 0.7);
      const dict = useTopic ? this.topicDictionary : this.wordDictionary;
      const offset = Math.floor(Math.random() * dict.length);
      
      for (let i = 0; i < dict.length; i++) {
        const word = dict[(i + offset) % dict.length];
        
        let canUse = true;
        for (let c = 0; c < this.size; c++) {
          let prefix = "";
          for (let r = 0; r < rows.length; r++) {
             prefix += rows[r][c];
          }
          prefix += word[c];
          
          if (!validPrefixes.has(prefix)) {
             canUse = false;
             break;
          }
        }

        if (canUse) {
           rows.push(word);
           const result = findSquare();
           if (result) return result;
           rows.pop();
        }
      }
      
      return null;
    }

    return findSquare();
  }

  private determineComparator(values: number[], ops: Operator[], compPos: number): CompOperator | null {
    const leftValues = values.slice(0, compPos + 1);
    const leftOps = ops.slice(0, compPos) as ArithOperator[];
    const rightValues = values.slice(compPos + 1);
    const rightOps = ops.slice(compPos + 1) as ArithOperator[];

    const leftParts: (number | ArithOperator)[] = [];
    leftValues.forEach((v, i) => {
      leftParts.push(v);
      if (i < leftOps.length) leftParts.push(leftOps[i]);
    });

    const rightParts: (number | ArithOperator)[] = [];
    rightValues.forEach((v, i) => {
      rightParts.push(v);
      if (i < rightOps.length) rightParts.push(rightOps[i]);
    });

    const leftRes = evaluatePart(leftParts);
    const rightRes = evaluatePart(rightParts);

    if (leftRes === null || rightRes === null) return null;

    if (leftRes === rightRes) return '=';
    if (leftRes < rightRes) return '<';
    return '>';
  }

  private generateScaffoldingBalanced(grid: string[][], cypher: Record<string, number>) {
    const arithOps: ArithOperator[] = ['+', '-', '*', '/'];
    const compPos = Math.floor((this.size - 1) / 2);

    const getEquationOps = (values: number[], targetComp?: CompOperator): Operator[] | null => {
      const possibleOps: Operator[][] = [];
      
      const generateOps = (idx: number, currentOps: Operator[]) => {
        if (idx === this.size - 1) {
          const comp = this.determineComparator(values, currentOps, compPos);
          if (comp) {
            if (!targetComp || comp === targetComp) {
              const finalOps = [...currentOps];
              finalOps[compPos] = comp;
              possibleOps.push(finalOps);
            }
          }
          return;
        }

        if (idx === compPos) {
          currentOps[idx] = '='; // placeholder
          generateOps(idx + 1, currentOps);
        } else {
          for (const op of arithOps) {
            currentOps[idx] = op;
            generateOps(idx + 1, currentOps);
          }
        }
      };

      generateOps(0, Array(this.size - 1).fill('+'));

      if (possibleOps.length === 0) return null;
      return possibleOps[Math.floor(Math.random() * possibleOps.length)];
    };

    const targetRow = Math.floor(Math.random() * this.size);
    const targetCol = Math.floor(Math.random() * this.size);

    const rowOps: Operator[][] = [];
    for (let i = 0; i < this.size; i++) {
        const ops = getEquationOps(grid[i].map(l => cypher[l]), i === targetRow ? '=' : undefined);
        if (!ops) return null;
        rowOps.push(ops);
    }

    const colOps: Operator[][] = [];
    for (let j = 0; j < this.size; j++) {
        const ops = getEquationOps(grid.map(r => r[j]).map(l => cypher[l]), j === targetCol ? '=' : undefined);
        if (!ops) return null;
        colOps.push(ops);
    }

    return { rows: rowOps, cols: colOps };
  }

  private async fetchDefinitions(grid: string[][]) {
    const rows = grid.map(r => r.join(''));
    const cols = Array(this.size).fill(0).map((_, i) => grid.map(r => r[i]).join(''));
    
    const fetchDef = async (word: string) => {
      let part = '';
      let def = '';
      
      const isBadDef = (d: string) => {
        const l = d.toLowerCase();
        return l.includes('initialism') || l.includes('abbreviation') || l.includes('plural of') || l.includes('acronym') || l.includes('alternative spelling');
      };

      try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data[0]?.meanings?.[0]?.definitions?.[0]?.definition) {
            part = data[0].meanings[0].partOfSpeech;
            def = data[0].meanings[0].definitions[0].definition;
            if (isBadDef(def)) {
               def = '';
               part = '';
            }
          }
        }
      } catch (e) {
        // silent fail
      }

      // Fallback to Datamuse API
      if (!def) {
        try {
          const res = await fetch(`https://api.datamuse.com/words?sp=${word}&md=d&max=1`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0 && data[0].defs && data[0].defs.length > 0) {
              const defStr = data[0].defs[0] as string;
              // Datamuse format is typically "n\tA common, round fruit..."
              const parts = defStr.split('\t');
              if (parts.length === 2) {
                part = parts[0];
                def = parts[1];
              } else {
                def = defStr;
              }
              if (isBadDef(def)) {
                 def = '';
                 part = '';
              }
            }
          }
        } catch (e) {
          // silent fail
        }
      }

      if (!def) {
        return null; // Missing definition means this word/grid is invalid
      }

      // Mask the word itself from the definition to avoid spoiling it
      const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedWord = escapeRegExp(word);
      
      // Replace the word (case insensitive), and basic suffixes
      const regexes = [
        new RegExp(`\\b${escapedWord}\\b`, 'gi'),
        new RegExp(`\\b${escapedWord}s\\b`, 'gi'),
        new RegExp(`\\b${escapedWord}es\\b`, 'gi'),
        new RegExp(`\\b${escapedWord}ed\\b`, 'gi'),
        new RegExp(`\\b${escapedWord}ing\\b`, 'gi')
      ];

      let maskedDef = def;
      for (const rx of regexes) {
        maskedDef = maskedDef.replace(rx, '****');
      }

      return part ? `(${part}) ${maskedDef}` : maskedDef;
    };

    // Use Promise.all but if any fail, we reject the whole grid.
    const rowDefs = await Promise.all(rows.map(fetchDef));
    if (rowDefs.includes(null)) return null;

    const colDefs = await Promise.all(cols.map(fetchDef));
    if (colDefs.includes(null)) return null;

    return { rows: rowDefs as string[], cols: colDefs as string[] };
  }
}
