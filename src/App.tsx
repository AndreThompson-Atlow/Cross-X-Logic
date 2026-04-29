import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AxiomEngine, GridPuzzle, evaluatePart, Operator, ArithOperator, CompOperator } from './lib/engine';
import { Grid, SelectionState } from './components/Grid';
import { RefreshCw, Zap, Search, ScanLine, Activity } from 'lucide-react';

type HistoryItem = {
  guess: string;
  symbolic: boolean;
  structural: ('perfect'|'partial'|'wrong')[];
};

function evaluateEquation(guessLetters: string[], operators: Operator[], cypher: Record<string, number>): boolean {
  const values = guessLetters.map(l => cypher[l.toUpperCase()]);
  if (values.some(v => v === undefined)) return false; 

  let compPos = -1;
  let compOp: CompOperator | null = null;
  for (let i = 0; i < operators.length; i++) {
    if (['=', '<', '>'].includes(operators[i] as string)) {
      compPos = i;
      compOp = operators[i] as CompOperator;
      break;
    }
  }
  
  if (compPos === -1) return false;

  const leftValues = values.slice(0, compPos + 1);
  const leftOps = operators.slice(0, compPos) as ArithOperator[];
  const rightValues = values.slice(compPos + 1);
  const rightOps = operators.slice(compPos + 1) as ArithOperator[];

  const leftParts: (number | ArithOperator)[] = [];
  leftValues.forEach((v, i) => { leftParts.push(v); if(i < leftOps.length) leftParts.push(leftOps[i]); });
  
  const rightParts: (number | ArithOperator)[] = [];
  rightValues.forEach((v, i) => { rightParts.push(v); if(i < rightOps.length) rightParts.push(rightOps[i]); });

  const leftRes = evaluatePart(leftParts);
  const rightRes = evaluatePart(rightParts);

  if (leftRes === null || rightRes === null) return false;

  if (compOp === '=') return leftRes === rightRes;
  if (compOp === '<') return leftRes < rightRes;
  if (compOp === '>') return leftRes > rightRes;
  return false;
}

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';

const TOPICS_ORDER = [
  "History", "Science", "Math", "Computer Science", "Physics", 
  "Chemistry", "Biology", "Astronomy", "Geology", "Neuroscience", 
  "Genetics", "Meteorology", "Topology", "Literature", "Logic", 
  "Law", "Politics", "Philosophy", "Psychology", "Economics", 
  "Linguistics", "Sociology", "Archaeology", "Anthropology", "Theology", 
  "Game Theory", "Cryptography", "Criminology", "Strategic Studies", "Ethics", 
  "Epistemology", "Rhetoric", "Semiotics", "Engineering", "Robotics", 
  "Cyber Security", "Data Science", "Aviation", "Cartography", "Architecture", 
  "Mythology", "Classical Music", "Aesthetics", "Film Theory", "Diplomacy", 
  "Epidemiology", "Horology", "Gastronomy", "Paleontology", "Ecological Theory",
  "None"
];

export default function App() {
  const [size, setSize] = useState(4);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [puzzle, setPuzzle] = useState<GridPuzzle | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Game State
  const [energy, setEnergy] = useState(0);
  const [initialEnergy, setInitialEnergy] = useState(0);
  const [status, setStatus] = useState<'menu' | 'level_select' | 'custom_select' | 'playing' | 'won' | 'lost'>('menu');
  const [activeMode, setActiveMode] = useState<'custom' | 'levels'>('custom');
  const [levelSize, setLevelSize] = useState<3 | 4 | 5>(3);
  const [levelIndex, setLevelIndex] = useState(0);
  const [levelProgress, setLevelProgress] = useState<Record<string, Record<number, Record<number, number>>>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem('crossLogicProgress');
      if (saved) {
        setLevelProgress(JSON.parse(saved));
      }
    } catch (e) {
      // ignore
    }
  }, []);
  const [discoveredCells, setDiscoveredCells] = useState<boolean[][]>([]);
  const [revealedCypher, setRevealedCypher] = useState<Record<string, number>>({});
  const [discoveredLetters, setDiscoveredLetters] = useState<string[]>([]);
  
  const [selection, setSelection] = useState<SelectionState>(null);
  const [experiments, setExperiments] = useState<Record<string, HistoryItem[]>>({});
  
  // Settings
  const [topic, setTopic] = useState<string>('None');

  // Inputs
  const [experimentInput, setExperimentInput] = useState('');
  const [deduceInputs, setDeduceInputs] = useState<Record<string, string>>({});
  const [deduceFeedback, setDeduceFeedback] = useState<Record<string, 'success' | 'error' | null>>({});

  const [cellDeduceInput, setCellDeduceInput] = useState('');

  const handleCellDeduce = () => {
    if (!puzzle || status !== 'playing' || energy < 3 || selection?.type !== 'cell') return;
    
    const r = selection.r;
    const c = selection.c;
    const letter = puzzle.letters[r][c];
    
    const guessLetter = cellDeduceInput.toUpperCase();
    if (!guessLetter || guessLetter.length !== 1) return;

    if (guessLetter === letter) {
      // Correct!
      setRevealedCypher(prev => ({ ...prev, [letter]: puzzle.masterCypher[letter] }));
      setDeduceFeedback(prev => ({ ...prev, [letter]: 'success' }));
      
      setDiscoveredLetters(prev => prev.includes(letter) ? prev : [...prev, letter]);

      setDiscoveredCells(prev => {
        const next = prev.map(row => [...row]);
        for (let rowIdx = 0; rowIdx < size; rowIdx++) {
          for (let colIdx = 0; colIdx < size; colIdx++) {
            if (puzzle.letters[rowIdx][colIdx] === letter) {
              next[rowIdx][colIdx] = true;
            }
          }
        }
        checkWinCondition(next);
        return next;
      });
      setCellDeduceInput('');
    } else {
      // Incorrect!
      setEnergy(prev => {
        const next = prev - 3;
        if (next <= 0 && status === 'playing') setStatus('lost');
        return next;
      });
      setCellDeduceInput('');
    }
  };

  const startNewGame = useCallback(async (newSize: number = size, newDiff: Difficulty = difficulty, newTopic: string = topic) => {
    setLoading(true);
    setStatus('playing');
    setSelection(null);
    setExperiments({});
    setRevealedCypher({});
    setDiscoveredLetters([]);
    setExperimentInput('');
    setDeduceInputs({});
    setDeduceFeedback({});
    
    try {
      const engine = new AxiomEngine(newSize, newTopic);
      const newPuzzle = await engine.generate();
      setPuzzle(newPuzzle);
      
      setDiscoveredCells(Array(newSize).fill(null).map(() => Array(newSize).fill(false)));
      
      if (newDiff === 'master') {
        setEnergy(3);
        setInitialEnergy(3);
      } else {
        const multipliers = { easy: 4, medium: 3, hard: 2, expert: 1 };
        const totalLevelEnergy = newSize * newSize * multipliers[newDiff];
        setEnergy(totalLevelEnergy);
        setInitialEnergy(totalLevelEnergy);
      }
    } catch (error) {
      console.error("Game generation failed:", error);
      setStatus('menu');
      alert("Failed to generate a puzzle. Try a different size or topic.");
    } finally {
      setLoading(false);
    }
  }, [size, difficulty, topic]);

  const cancelGame = () => {
    setStatus('menu');
  };

  const checkWinCondition = (cells: boolean[][]) => {
    if (cells.every(row => row.every(cell => cell))) {
      setStatus('won');

      const spent = initialEnergy - energy;
      const pct = spent / initialEnergy;
      let stars = 1;
      if (pct < 0.25) stars = 3;
      else if (pct < 0.50) stars = 2;

      if (activeMode === 'levels') {
        const key = difficulty;
        const diffData = levelProgress[key] || {};
        const sizeData = diffData[size] || {};
        const prevStars = sizeData[levelIndex] || 0;
        
        if (stars > prevStars) {
          const nextProg = {
            ...levelProgress,
            [key]: {
              ...diffData,
              [size]: {
                ...sizeData,
                [levelIndex]: stars
              }
            }
          };
          setLevelProgress(nextProg);
          localStorage.setItem('crossLogicProgress', JSON.stringify(nextProg));
        }
      }
    }
  };

  const handleInvestigate = () => {
    if (!puzzle || status !== 'playing' || energy < 5 || selection?.type !== 'cell') return;
    
    const r = selection.r;
    const c = selection.c;
    const letter = puzzle.letters[r][c];

    setEnergy(prev => {
        const next = prev - 5;
        if (next <= 0) setStatus('lost');
        return next;
    });

    setDiscoveredCells(prev => {
      const next = prev.map(row => [...row]);
      next[r][c] = true;
      checkWinCondition(next);
      return next;
    });

    setRevealedCypher(prev => ({
      ...prev,
      [letter]: puzzle.masterCypher[letter]
    }));

    setDiscoveredLetters(prev => prev.includes(letter) ? prev : [...prev, letter]);
  };

  const handleExperimentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!puzzle || status !== 'playing' || energy < 1 || !experimentInput) return;
    if (selection?.type === 'cell' || !selection) return;

    const guess = experimentInput.toUpperCase();
    if (guess.length !== size) return;

    const isRow = selection.type === 'row';
    const selIdx = selection.index;
    const key = `${selection.type}-${selIdx}`;

    let correctWord = '';
    const operators = isRow ? puzzle.operators.rows[selIdx] : puzzle.operators.cols[selIdx];

    if (isRow) {
      correctWord = puzzle.letters[selIdx].join('');
    } else {
      correctWord = puzzle.letters.map(row => row[selIdx]).join('');
    }

    const structural: ('perfect'|'partial'|'wrong')[] = [];
    const guessChars = guess.split('');
    const targetChars = correctWord.split('');

    // Structural analysis
    for (let i = 0; i < size; i++) {
      if (guessChars[i] === targetChars[i]) {
        structural[i] = 'perfect';
        targetChars[i] = '_'; 
        guessChars[i] = '_';
      } else {
        structural[i] = 'wrong'; // Default
      }
    }
    for (let i = 0; i < size; i++) {
        if (guessChars[i] !== '_') {
            const matchIdx = targetChars.indexOf(guessChars[i]);
            if (matchIdx !== -1) {
                structural[i] = 'partial';
                targetChars[matchIdx] = '_';
            }
        }
    }

    const symbolic = evaluateEquation(guess.split(''), operators, puzzle.masterCypher);
    const isPerfect = guess === correctWord;

    if (isPerfect) {
       // Perfect guess
       setDiscoveredCells(prev => {
         const next = prev.map(row => [...row]);
         if (isRow) {
           for (let i = 0; i < size; i++) next[selIdx][i] = true;
         } else {
           for (let i = 0; i < size; i++) next[i][selIdx] = true;
         }
         checkWinCondition(next);
         return next;
       });

       setRevealedCypher(prev => {
         const next = { ...prev };
         for (let i = 0; i < size; i++) {
           const char = guess[i];
           next[char] = puzzle.masterCypher[char];
         }
         return next;
       });

       setDiscoveredLetters(prev => {
         const next = new Set(prev);
         for (let i = 0; i < size; i++) next.add(guess[i]);
         return Array.from(next);
       });
    } else {
       setEnergy(prev => {
         const next = prev - 1;
         if (next <= 0 && status === 'playing') setStatus('lost');
         return next;
       });

       // Reveal any perfect structurals correctly!
       const newlyDiscovered = guess.split('').filter((char, idx) => structural[idx] !== 'wrong');
       if (newlyDiscovered.length > 0) {
         setDiscoveredLetters(prev => {
           const next = new Set(prev);
           newlyDiscovered.forEach(c => next.add(c));
           return Array.from(next);
         });
       }

       let updatedCells = false;
       setDiscoveredCells(prev => {
         const next = prev.map(row => [...row]);
         for (let i = 0; i < size; i++) {
           if (structural[i] === 'perfect') {
             if (isRow) {
               if (!next[selIdx][i]) {
                 next[selIdx][i] = true;
                 updatedCells = true;
               }
             } else {
               if (!next[i][selIdx]) {
                 next[i][selIdx] = true;
                 updatedCells = true;
               }
             }
           }
         }
         if (updatedCells) {
           checkWinCondition(next);
         }
         return next;
       });
       
       setRevealedCypher(prev => {
         const next = { ...prev };
         for (let i = 0; i < size; i++) {
           if (structural[i] === 'perfect') {
             const char = guess[i];
             next[char] = puzzle.masterCypher[char];
           }
         }
         return next;
       });
    }

    setExperiments(prev => {
      const curList = prev[key] || [];
      return { ...prev, [key]: [{ guess, symbolic, structural }, ...curList] };
    });

    setExperimentInput('');
  };

  const handleDeduce = (letter: string) => {
    if (!puzzle || status !== 'playing' || energy < 3) return;
    const inputVal = deduceInputs[letter];
    if (inputVal === undefined || inputVal === '') return;
    
    const num = parseInt(inputVal, 10);
    if (isNaN(num)) return;

    if (puzzle.masterCypher[letter] === num) {
      // Correct!
      setRevealedCypher(prev => ({ ...prev, [letter]: num }));
      setDeduceFeedback(prev => ({ ...prev, [letter]: 'success' }));
      
      setDiscoveredCells(prev => {
        const next = prev.map(row => [...row]);
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            if (puzzle.letters[r][c] === letter) {
              next[r][c] = true;
            }
          }
        }
        checkWinCondition(next);
        return next;
      });
    } else {
      // Incorrect!
      setEnergy(prev => {
        const next = prev - 3;
        if (next <= 0 && status === 'playing') setStatus('lost');
        return next;
      });
      setDeduceFeedback(prev => ({ ...prev, [letter]: 'error' }));
      setTimeout(() => {
        setDeduceFeedback(prev => ({ ...prev, [letter]: null }));
      }, 1000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center space-y-4">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
          <RefreshCw className="w-12 h-12 text-accent" />
        </motion.div>
        <p className="font-mono text-text-dim animate-pulse tracking-widest">INITIALIZING CROSS X LOGIC</p>
      </div>
    );
  }

  if (status === 'menu' || status === 'level_select' || status === 'custom_select') {
    return (
      <div className="min-h-screen bg-bg text-text font-sans flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(to right, #00FF41 1px, transparent 1px), linear-gradient(to bottom, #00FF41 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        
        <div className="w-full max-w-md bg-panel border-2 border-accent relative z-10 p-8 shadow-[0_0_50px_rgba(0,255,65,0.1)] max-h-screen overflow-y-auto">
          <h1 className="text-3xl font-bold font-mono tracking-[0.2em] text-accent uppercase italic mb-8 text-center shrink-0">CROSS X LOGIC</h1>
          
          {status === 'menu' && (
            <div className="flex flex-col gap-4">
              <button 
                onClick={() => { setActiveMode('levels'); setStatus('level_select'); }} 
                className="w-full py-4 bg-accent/10 border-2 border-accent text-accent font-mono font-bold uppercase tracking-widest hover:bg-accent hover:text-black transition-all"
              >
                Campaign Levels
              </button>
              <button 
                onClick={() => { setActiveMode('custom'); setStatus('custom_select'); }} 
                className="w-full py-4 bg-black/50 border border-border text-text-dim font-mono uppercase tracking-widest hover:border-accent hover:text-accent transition-all"
              >
                Custom Game
              </button>
            </div>
          )}

          {status === 'custom_select' && (
            <div className="space-y-6">
              <button onClick={() => setStatus('menu')} className="text-xs font-mono text-text-dim hover:text-accent uppercase">{"< Back to Main Menu"}</button>
              
              <div className="space-y-2">
                <label className="font-mono text-text-dim uppercase text-xs">Difficulty</label>
                <select 
                  value={difficulty} 
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                  className="w-full bg-black/50 border border-border px-4 py-3 font-mono text-text uppercase focus:ring-1 focus:ring-accent outline-none cursor-pointer"
                >
                  <option value="easy">Easy (High Energy)</option>
                  <option value="medium">Medium (Standard)</option>
                  <option value="hard">Hard (Low Energy)</option>
                  <option value="expert">Expert (Single Mistake Allowed)</option>
                  <option value="master">Master (Zero Mistakes)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="font-mono text-text-dim uppercase text-xs">Grid Size</label>
                <select 
                  value={size} 
                  onChange={(e) => setSize(parseInt(e.target.value))}
                  className="w-full bg-black/50 border border-border px-4 py-3 font-mono text-text uppercase focus:ring-1 focus:ring-accent outline-none cursor-pointer"
                >
                  {[2, 3, 4, 5].map(s => (
                     <option key={s} value={s}>{s}x{s} Matrix</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="font-mono text-text-dim uppercase text-xs">Topic Focus (Optional)</label>
                <select 
                  value={topic} 
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full bg-black/50 border border-border px-4 py-3 font-mono text-text uppercase focus:ring-1 focus:ring-accent outline-none cursor-pointer"
                >
                  {TOPICS_ORDER.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <p className="text-[10px] font-mono text-text-dim/60 italic">Note: Academic topics may increase puzzle generation time or blend with general vocabulary if no exact matches exist.</p>
              </div>

              <button 
                onClick={() => startNewGame(size, difficulty, topic)}
                className="w-full mt-4 py-4 bg-accent/10 border-2 border-accent text-accent font-mono font-bold uppercase tracking-widest hover:bg-accent hover:text-black transition-all"
              >
                Initialize System
              </button>
            </div>
          )}

          {status === 'level_select' && (
            <div className="space-y-4">
              <button onClick={() => setStatus('menu')} className="text-xs font-mono text-text-dim hover:text-accent uppercase">{"< Back to Main Menu"}</button>
              
              <div className="space-y-2">
                <label className="font-mono text-text-dim uppercase text-xs">Difficulty</label>
                <select 
                  value={difficulty} 
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                  className="w-full bg-black/50 border border-border px-4 py-2 font-mono text-text uppercase outline-none cursor-pointer"
                >
                   <option value="easy">Easy</option>
                   <option value="medium">Medium</option>
                   <option value="hard">Hard</option>
                   <option value="expert">Expert</option>
                   <option value="master">Master</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="font-mono text-text-dim uppercase text-xs">Matrix Size (Zone)</label>
                <div className="flex gap-2">
                  {[3, 4, 5].map(s => (
                    <button 
                      key={s} 
                      onClick={() => setLevelSize(s as 3|4|5)} 
                      className={`flex-1 py-2 font-mono text-xs uppercase border ${levelSize === s ? 'bg-accent/20 border-accent text-accent' : 'bg-black/50 border-border text-text-dim hover:border-accent'}`}
                    >
                      {s}x{s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-64 overflow-y-auto pr-2 mt-4 space-y-2 scrollbar-thin scrollbar-thumb-accent scrollbar-track-border">
                {TOPICS_ORDER.map((t, idx) => {
                  const stars = levelProgress[difficulty]?.[levelSize]?.[idx] || 0;
                  const isUnlocked = idx === 0 || (levelProgress[difficulty]?.[levelSize]?.[idx - 1] || 0) > 0;
                  
                  return (
                    <div key={idx} className={`flex justify-between items-center border p-3 group transition-colors ${isUnlocked ? 'bg-black/30 border-border hover:border-accent' : 'bg-black/10 border-border/20 opacity-50'}`}>
                      <div className="font-mono text-xs uppercase flex items-center gap-2">
                        <span className={`opacity-50 ${isUnlocked ? 'text-accent' : 'text-text-dim'}`}>{String(idx + 1).padStart(2, '0')}</span>
                        <span className={isUnlocked ? 'group-hover:text-text text-text-dim' : 'text-text-dim/50'}>
                          {isUnlocked ? t : 'LOCKED'}
                        </span>
                      </div>
                      <div className="flex gap-4 items-center">
                        <div className={`flex text-[10px] tracking-widest ${isUnlocked ? 'text-accent' : 'text-text-dim'}`}>
                          {stars > 0 ? (
                            <>{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</>
                          ) : (
                            <span className="text-text-dim/30">☆☆☆</span>
                          )}
                        </div>
                        <button 
                          disabled={!isUnlocked}
                          onClick={() => {
                            if (!isUnlocked) return;
                            setLevelIndex(idx);
                            setSize(levelSize);
                            setTopic(t);
                            startNewGame(levelSize, difficulty, t);
                          }} 
                          className={`px-3 py-1 text-[10px] uppercase font-mono transition-colors ${isUnlocked ? 'bg-accent/10 border border-accent text-accent hover:bg-accent hover:text-black cursor-pointer' : 'bg-black border border-border/30 text-text-dim/30 cursor-not-allowed'}`}
                        >
                          {isUnlocked ? 'Play' : 'Locked'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

            </div>
          )}
        </div>
      </div>
    );
  }

  if (!puzzle) return <div className="bg-bg text-error p-8">Error loading system.</div>;

  return (
    <div className="min-h-screen bg-bg text-text font-sans flex flex-col overflow-x-hidden">
      <header className="h-[60px] flex-shrink-0 border-b border-border flex items-center justify-between px-6 bg-gradient-to-r from-panel to-bg sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold font-mono tracking-[0.2em] text-accent uppercase italic">CROSS X LOGIC</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-black/30 border border-border">
            <Zap className="w-4 h-4 text-[#00FF41]" />
            <span className="font-mono font-bold text-[#00FF41]">{energy} EN</span>
          </div>
          <button 
            onClick={() => startNewGame()}
            className="p-1.5 hover:text-accent transition-colors text-text-dim border border-border bg-black/30 px-3 cursor-pointer hidden sm:block font-mono text-[10px] uppercase"
          >
            Restart
          </button>
          <button 
            onClick={cancelGame}
            className="p-1.5 hover:text-error transition-colors text-text-dim border border-border bg-black/30 px-3 cursor-pointer font-mono text-[10px] uppercase"
          >
            Abort
          </button>
        </div>
      </header>

      {status !== 'playing' && (
        <div className={`p-4 font-mono font-bold text-center border-b ${status === 'won' ? 'bg-success/10 text-success border-success/30' : 'bg-error/10 text-error border-error/30'}`}>
          {status === 'won' ? 'SYSTEM_BYPASSED: ALL DATA RECOVERED' : 'SYSTEM_LOCKED: ENERGY DEPLETED.'}
        </div>
      )}

      <main className="flex-1 overflow-auto w-full max-w-[1600px] mx-auto flex flex-col xl:flex-row gap-4 p-4 lg:p-6 pb-20">
        
        {/* Rules Column (Left on Desktop, Bottom on Mobile) */}
        <div className="order-last xl:order-first xl:w-[280px] flex-shrink-0 flex flex-col gap-4">
           <div className="bg-panel border border-border flex flex-col shadow-lg">
              <div className="p-3 border-b border-border bg-black/40">
                 <h2 className="font-mono text-sm uppercase tracking-widest text-text">System Rules</h2>
              </div>
              <div className="p-4 space-y-4">
                  <div className="text-xs font-mono text-text-dim">
                      <strong className="text-accent block mb-1">1. GRID</strong> 
                      Every node contains a character mapped to a cypher value (0-9).
                  </div>
                  <div className="text-xs font-mono text-text-dim">
                      <strong className="text-accent block mb-1">2. INVESTIGATE</strong> 
                      Force decrypt a single node. Costs 5 Energy.
                  </div>
                  <div className="text-xs font-mono text-text-dim">
                      <strong className="text-accent block mb-1">3. EXPERIMENT</strong> 
                      Guess a word for a Row or Column. Perfect hits are green, partials are white. Costs 1 Energy (re-funds on success).
                  </div>
                  <div className="text-xs font-mono text-text-dim">
                      <strong className="text-accent block mb-1">4. EVALUATE</strong> 
                      Experiments also evaluate the mathematical operators. If a guess fits mathematically, it returns TRUE.
                  </div>
                  <div className="text-xs font-mono text-text-dim">
                      <strong className="text-accent block mb-1">5. DEDUCE</strong> 
                      If you know a variable's value, deduce it in the Codex to unlock every instance in the grid. Costs 3 Energy (re-funds on success).
                  </div>
              </div>
           </div>
        </div>

        {/* Center Column: Grid */}
        <div className="flex-1 flex flex-col items-center min-w-0">
            <Grid 
              puzzle={puzzle}
              discoveredCells={discoveredCells}
              revealedCypher={revealedCypher}
              selection={selection}
              onSelect={(s) => {
                  setSelection(s);
                  setExperimentInput('');
                  setCellDeduceInput('');
              }}
            />
            
            {/* Cypher Table */}
            <div className="mt-8 w-full max-w-3xl border border-border bg-panel">
                <div className="p-2 border-b border-border bg-black/40 flex items-center justify-between">
                   <h3 className="text-xs font-mono text-text-dim uppercase tracking-widest">Cypher Codex</h3>
                   <span className="text-[10px] font-mono text-text-dim">Deduce var (-3 EN)</span>
                </div>
                <div className="p-4 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                   {puzzle.uniqueLetters.every(l => !discoveredLetters.includes(l)) && (
                       <div className="col-span-full p-4 text-center font-mono text-xs text-text-dim/50 italic uppercase">
                           Cypher Codex is empty. Interrogate nodes or experiment to discover variables.
                       </div>
                   )}
                   {puzzle.uniqueLetters.sort().map(letter => {
                       if (!discoveredLetters.includes(letter)) return null;
                       const isRevealed = letter in revealedCypher;
                       const statusFeedback = deduceFeedback[letter];
                       return (
                           <div key={letter} className={`flex flex-col border ${statusFeedback === 'success' ? 'border-success' : statusFeedback === 'error' ? 'border-error' : isRevealed ? 'border-accent' : 'border-border'} bg-bg/50`}>
                               <div className="text-center font-mono font-bold py-1 bg-black/20 border-b border-border">{letter}</div>
                               <div className="flex">
                                  {isRevealed ? (
                                      <div className="flex-1 text-center font-mono py-1 text-accent font-bold">{revealedCypher[letter]}</div>
                                  ) : (
                                      <>
                                          <input 
                                             type="text"
                                             maxLength={1}
                                             value={deduceInputs[letter] || ''}
                                             onChange={(e) => setDeduceInputs(prev => ({...prev, [letter]: e.target.value.replace(/[^0-9]/g, '')}))}
                                             className="w-full min-w-0 text-center font-mono bg-transparent outline-none focus:bg-white/5 py-1 text-text"
                                             placeholder="?"
                                             disabled={status !== 'playing'}
                                          />
                                          <button 
                                             onClick={() => handleDeduce(letter)}
                                             disabled={status !== 'playing' || !deduceInputs[letter]}
                                             className="px-2 hover:bg-white/10 text-text-dim border-l border-border transition-colors disabled:opacity-30"
                                          >
                                             ✓
                                          </button>
                                      </>
                                  )}
                               </div>
                           </div>
                       );
                   })}
                </div>
            </div>
        </div>

        {/* Right Column: Inspector */}
        <div className="w-full xl:w-[400px] flex-shrink-0 flex flex-col gap-4">
           {/* Selection Inspector */}
           <div className="bg-panel border border-border flex-1 min-h-[500px] flex flex-col shadow-lg">
              <div className="p-3 border-b border-border bg-black/40 flex items-center gap-2">
                 <ScanLine className="w-4 h-4 text-accent" />
                 <h2 className="font-mono text-sm uppercase tracking-widest text-text">Inspector</h2>
              </div>
              
              <div className="p-4 flex-1 flex flex-col">
                  {!selection ? (
                      <div className="flex-1 flex items-center justify-center text-text-dim font-mono text-sm uppercase text-center p-8 opacity-50">
                          Select a Row, Column, or Cell to begin analysis.
                      </div>
                  ) : selection.type === 'cell' ? (
                      <div className="flex flex-col gap-6">
                           <div className="bg-black/30 border border-border p-4 rounded text-center">
                               <span className="font-mono text-text-dim uppercase text-xs block mb-2">Target Node</span>
                               <span className="font-mono text-xl text-accent">R{selection.r + 1} : C{selection.c + 1}</span>
                           </div>

                           <div className="flex flex-col gap-2">
                               {discoveredCells[selection.r][selection.c] ? (
                                   <div className="text-center p-4 border border-accent/30 bg-accent/5 text-accent font-mono">
                                       CELL PREVIOUSLY UNLOCKED.<br/>Value: {puzzle.letters[selection.r][selection.c]}
                                   </div>
                               ) : (
                                   <>
                                     <div className="border border-border p-3 bg-black/20 flex flex-col gap-2">
                                         <span className="font-mono text-text-dim text-[10px] uppercase">Deduce Node Letter (-3 EN)</span>
                                         <div className="flex gap-2">
                                             <input
                                               type="text"
                                               maxLength={1}
                                               value={cellDeduceInput}
                                               onChange={e => setCellDeduceInput(e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase())}
                                               disabled={status !== 'playing'}
                                               placeholder="?"
                                               className="flex-1 bg-black/50 border border-border px-3 py-2 font-mono text-center outline-none focus:border-accent text-sm"
                                             />
                                             <button 
                                                 onClick={handleCellDeduce}
                                                 disabled={status !== 'playing' || energy < 3 || !cellDeduceInput}
                                                 className="px-4 bg-white/5 border border-white/10 hover:bg-accent hover:border-accent hover:text-black transition-colors font-mono uppercase text-xs tracking-wider disabled:opacity-30 disabled:cursor-not-allowed"
                                             >
                                                 Deduce
                                             </button>
                                         </div>
                                     </div>
                                     <button 
                                         onClick={handleInvestigate}
                                         disabled={status !== 'playing' || energy < 5}
                                         className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 hover:border-accent hover:text-accent hover:bg-accent/10 transition-all font-mono uppercase tracking-wider text-sm disabled:opacity-50 disabled:cursor-not-allowed group mt-2"
                                     >
                                         <Search className="w-4 h-4" />
                                         Investigate (-5 EN)
                                     </button>
                                   </>
                               )}
                           </div>
                           <p className="text-xs font-mono text-text-dim leading-relaxed">
                               Investigation reveals the letter securely encrypted in this node and automatically decrypts its associated variable in the Master Cypher.
                           </p>
                      </div>
                  ) : (
                      <div className="flex flex-col gap-4 h-full">
                          <div className="bg-black/30 border border-border p-3 rounded">
                               <span className="font-mono text-accent uppercase text-xs font-bold block mb-1">
                                   {selection.type === 'row' ? 'Row' : 'Column'} {selection.index + 1} Analysis
                               </span>
                               <span className="font-serif italic text-text/90 text-sm">
                                   “{selection.type === 'row' ? puzzle.definitions.rows[selection.index] : puzzle.definitions.cols[selection.index]}”
                               </span>
                          </div>

                          {/* Experiment Input */}
                          <div className="border border-border p-3 bg-bg">
                              <span className="font-mono text-text-dim uppercase text-[10px] block mb-2">Lexical Experimentation (-1 EN)</span>
                              <form onSubmit={handleExperimentSubmit} className="flex gap-2">
                                  <input 
                                     type="text" 
                                     value={experimentInput}
                                     onChange={e => setExperimentInput(e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase())}
                                     maxLength={size}
                                     placeholder={`GUESS ${size} LETTERS`}
                                     disabled={status !== 'playing' || (selection.type === 'row' ? discoveredCells[selection.index].every(c => c) : discoveredCells.every(r => r[selection.index]))}
                                     className="flex-1 min-w-0 bg-black/50 border border-border px-3 py-2 font-mono text-center tracking-widest uppercase outline-none focus:border-accent text-sm"
                                  />
                                  <button 
                                     type="submit"
                                     disabled={status !== 'playing' || experimentInput.length !== size || energy < 1 || (selection.type === 'row' ? discoveredCells[selection.index].every(c => c) : discoveredCells.every(r => r[selection.index]))}
                                     className="px-4 bg-white/10 hover:bg-accent hover:text-bg font-mono font-bold transition-colors disabled:opacity-30 disabled:hover:bg-white/10 disabled:hover:text-text cursor-pointer"
                                  >
                                      RUN
                                  </button>
                              </form>
                          </div>

                          {/* Experiment History */}
                          <div className="flex-1 min-h-[200px] border border-border bg-black/20 flex flex-col">
                              <div className="p-2 border-b border-border bg-black/40 flex items-center gap-2">
                                 <Activity className="w-3 h-3 text-text-dim" />
                                 <h3 className="text-[10px] font-mono text-text-dim uppercase tracking-widest">Experiment Log</h3>
                              </div>
                              <div className="p-2 flex flex-col gap-2 overflow-y-auto">
                                  {experiments[`${selection.type}-${selection.index}`]?.map((exp, i) => (
                                      <div key={i} className="flex flex-col gap-1 p-2 border border-white/5 bg-white/5">
                                          <div className="flex items-center justify-between">
                                              <div className="flex gap-1 items-center">
                                                  {exp.guess.split('').map((char, charIdx) => {
                                                      const s = exp.structural[charIdx];
                                                      const color = s === 'perfect' ? 'bg-[#00FF41] text-black shadow-[0_0_10px_rgba(0,255,65,0.4)]' : s === 'partial' ? 'bg-white/20 text-text' : 'bg-error text-white shadow-[0_0_10px_rgba(255,49,49,0.4)]';
                                                      const op = charIdx < size - 1 ? (selection.type === 'row' ? puzzle.operators.rows[selection.index][charIdx] : puzzle.operators.cols[selection.index][charIdx]) : null;
                                                      return (
                                                          <React.Fragment key={charIdx}>
                                                              <div className={`w-6 h-6 flex items-center justify-center font-mono text-xs font-bold rounded-sm ${color}`}>
                                                                  {char}
                                                              </div>
                                                              {op && <div className="text-text-dim font-mono text-xs font-bold px-0.5">{op}</div>}
                                                          </React.Fragment>
                                                      );
                                                  })}
                                              </div>
                                              <div className={`font-mono text-xs font-bold flex items-center gap-1 ${exp.symbolic ? 'text-[#00FF41]' : 'text-error'}`}>
                                                  {exp.symbolic ? 'TRUE' : 'FALSE'}
                                              </div>
                                          </div>
                                      </div>
                                  ))}
                                  {(!experiments[`${selection.type}-${selection.index}`] || experiments[`${selection.type}-${selection.index}`].length === 0) && (
                                     <div className="p-4 text-center text-text-dim font-mono text-[10px] uppercase">No experiments run.</div>
                                  )}
                              </div>
                          </div>
                      </div>
                  )}
              </div>
           </div>
        </div>

      </main>
    </div>
  );
}
