import React, { useState, useEffect } from 'react';
import { usePelada, Player, formatPosition } from '../hooks/usePelada';
import { useAuth } from './AuthProvider';
import { Shuffle, Users, Trophy, AlertCircle, Settings as SettingsIcon, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';

export default function TeamDraw() {
  const { players, matches, setMatchTeams } = usePelada();
  const { user, role } = useAuth();
  const isAdmin = role === 'ADMIN' || 
    user?.email?.trim().toLowerCase() === 'ramoncxavier88@gmail.com';

  // Helper to get adjusted level
  const getAdjustedLevel = (player: Player) => {
    const lvl = Number(player.level);
    if (isNaN(lvl)) return 3;
    return Math.max(1, Math.min(5, Math.round(lvl)));
  };

  const now = new Date();
  const nextMatch = matches.find(m => {
    if (m.status !== 'OPEN') return false;
    const matchDate = m.date?.toDate?.() || new Date();
    const dayAfterMatch = new Date(matchDate);
    dayAfterMatch.setDate(dayAfterMatch.getDate() + 1);
    dayAfterMatch.setHours(0, 0, 0, 0);
    return now < dayAfterMatch;
  });
  const confirmedPlayers = nextMatch ? players.filter(p => nextMatch.confirmedIds?.includes(p.id)) : [];

  // Detectar duplicatas de número nos jogadores confirmados
  const duplicatedNumbers = confirmedPlayers.reduce((acc, p) => {
    if (p.number !== undefined && p.number !== null) {
      const count = confirmedPlayers.filter(hp => hp.number === p.number).length;
      if (count > 1) acc.add(p.number);
    }
    return acc;
  }, new Set<number>());

  const [teams, setTeams] = useState<Player[][]>([]);
  const [drawOrder, setDrawOrder] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [playersPerTeamSelected, setPlayersPerTeamSelected] = useState(6);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingStep, setDrawingStep] = useState(0);

  const drawingPhrases = [
    "Misturando as chuteiras...",
    "Analisando nível dos atletas...",
    "Equilibrando as posições...",
    "Dividindo os coletes..."
  ];

  // Cycle through messages during sorting
  useEffect(() => {
    if (!isDrawing) {
      setDrawingStep(0);
      return;
    }
    const interval = setInterval(() => {
      setDrawingStep(prev => prev + 1);
    }, 750); // 4 steps over 3 seconds
    return () => clearInterval(interval);
  }, [isDrawing]);

  const shuffle = <T,>(array: T[]): T[] => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  };

  const confirmTeams = async () => {
    if (!nextMatch) return;
    setSaving(true);
    try {
      const teamsIds = teams.map(team => team.map(p => p.id));
      await setMatchTeams(nextMatch.id, teamsIds, {
        playersPerTeam: playersPerTeamSelected,
        drawOrder: drawOrder
      });
      alert("Times definidos com sucesso! Vá para a aba 'Ao Vivo' para gerenciar os jogos.");
      setTeams([]);
      setDrawOrder({});
    } catch (error) {
      console.error("Erro ao salvar times:", error);
      alert("Erro ao salvar times.");
    } finally {
      setSaving(false);
    }
  };

  const drawTeams = () => {
    if (confirmedPlayers.length < 2) return;
    setIsDrawing(true);

    setTimeout(() => {
      // 1. Calculate target sizes and number of teams
      const limit = playersPerTeamSelected;
      const totalPlayers = confirmedPlayers.length;
      const numTeams = Math.ceil(totalPlayers / limit);
      
      // Define exact sizes for each team: e.g. 15 players with limit 6 -> [6, 6, 3]
      const targetSizes = new Array(numTeams).fill(0);
      let remainingToAssign = totalPlayers;
      for (let i = 0; i < numTeams; i++) {
        const size = Math.min(remainingToAssign, limit);
        targetSizes[i] = size;
        remainingToAssign -= size;
      }

      // 2. Calculate average match level and ideal target sums per team
      const totalLevelOfAll = confirmedPlayers.reduce((sum, p) => sum + getAdjustedLevel(p), 0);
      const avgMatchLevel = totalPlayers > 0 ? totalLevelOfAll / totalPlayers : 3;
      const targetSums = targetSizes.map(size => size * avgMatchLevel);

      const result: Player[][] = Array.from({ length: numTeams }, () => []);

      // 3. Group and distribute players level by level (from 5 down to 1) for perfect skill/tier balancing
      const levels = [5, 4, 3, 2, 1];
      levels.forEach(L => {
        const levelPlayers = confirmedPlayers.filter(p => getAdjustedLevel(p) === L);
        
        // Ignoramos posições e embaralhamos os jogadores diretamente para dividir puramente por nível de forma aleatória
        const sortedLevelPlayers = shuffle<Player>(levelPlayers);

        sortedLevelPlayers.forEach(player => {
          let eligibleTeams: number[] = [];
          for (let i = 0; i < numTeams; i++) {
            if (result[i].length < targetSizes[i]) {
              eligibleTeams.push(i);
            }
          }

          // Embaralhar as equipes qualificadas primeiro para que as decisões de desempate sejam totalmente aleatórias.
          // Isso impede qualquer viés sistemático em relação a qualquer equipe específica (como o último time).
          const shuffledEligible = shuffle<number>(eligibleTeams);
          shuffledEligible.sort((idxA, idxB) => {
            // 1. Equilibrar a quantidade de jogadores de nível L em cada equipe
            const countLA = result[idxA].filter(p => getAdjustedLevel(p) === L).length;
            const countLB = result[idxB].filter(p => getAdjustedLevel(p) === L).length;
            if (countLA !== countLB) {
              return countLA - countLB;
            }

            // 2. Equilibrar o déficit médio de nível técnico da equipe (normalizado pelo tamanho planejado de cada equipe)
            // Usamos déficit normalizado (médio) para não penalizar equipes com tamanhos planejados menores (como o último time)
            const sumA = result[idxA].reduce((sum, p) => sum + getAdjustedLevel(p), 0);
            const sumB = result[idxB].reduce((sum, p) => sum + getAdjustedLevel(p), 0);

            const deficitA = (targetSums[idxA] - sumA) / targetSizes[idxA];
            const deficitB = (targetSums[idxB] - sumB) / targetSizes[idxB];

            if (deficitA !== deficitB) {
              return deficitB - deficitA;
            }

            return 0;
          });

          const chosenTeamIdx = shuffledEligible[0];
          if (chosenTeamIdx !== undefined) {
            result[chosenTeamIdx].push(player);
          }
        });
      });

      // 4. Otimizador de busca local para garantir equilíbrio matemático absoluto das somas dos times
      let bestTeams = result.map(team => [...team]);
      const getTeamSum = (team: Player[]) => team.reduce((sum, p) => sum + getAdjustedLevel(p), 0);
      const calculateCost = (currentTeams: Player[][]) => {
        let totalCost = 0;
        for (let i = 0; i < numTeams; i++) {
          const currentSum = getTeamSum(currentTeams[i]);
          const error = currentSum - targetSums[i];
          totalCost += error * error;
        }
        return totalCost;
      };

      let bestCost = calculateCost(bestTeams);

      // Rodar 2000 iterações de busca local para encontrar a melhor combinação de jogadores por soma de nível técnica
      for (let step = 0; step < 2000; step++) {
        const idxA = Math.floor(Math.random() * numTeams);
        const idxB = Math.floor(Math.random() * numTeams);
        if (idxA === idxB) continue;

        const teamA = bestTeams[idxA];
        const teamB = bestTeams[idxB];
        if (teamA.length === 0 || teamB.length === 0) continue;

        const pIdxA = Math.floor(Math.random() * teamA.length);
        const pIdxB = Math.floor(Math.random() * teamB.length);

        const playerA = teamA[pIdxA];
        const playerB = teamB[pIdxB];

        if (getAdjustedLevel(playerA) === getAdjustedLevel(playerB)) continue;

        const newTeamA = [...teamA];
        const newTeamB = [...teamB];
        newTeamA[pIdxA] = playerB;
        newTeamB[pIdxB] = playerA;

        const candidateTeams = [...bestTeams];
        candidateTeams[idxA] = newTeamA;
        candidateTeams[idxB] = newTeamB;

        const newCost = calculateCost(candidateTeams);
        if (newCost < bestCost) {
          bestTeams = candidateTeams;
          bestCost = newCost;
        }
      }

      // Substituir o resultado final pelo melhor conjunto de times otimizados
      for (let i = 0; i < numTeams; i++) {
        result[i] = bestTeams[i];
      }

      const POSITION_ORDER: Record<string, number> = {
        'GOLEIRO': 0,
        'ZAGUEIRO': 1,
        'LATERAL': 2,
        'VOLANTE': 3,
        'MEIA': 4,
        'ATACANTE': 5
      };

      // Sort each final team by standard tactical order for display listing
      result.forEach(team => {
        team.sort((a, b) => {
          const posA = a.position || 'ATACANTE';
          const posB = b.position || 'ATACANTE';
          return (POSITION_ORDER[posA] ?? 99) - (POSITION_ORDER[posB] ?? 99);
        });
      });

      // Generate draw classification order based on final rosters
      const newDrawOrder: Record<string, number> = {};
      let orderNum = 1;
      result.forEach(team => {
        team.forEach(player => {
          newDrawOrder[player.id] = orderNum++;
        });
      });
      setDrawOrder(newDrawOrder);

      setTeams(result);
      setIsDrawing(false);
    }, 3000);
  };

  return (
    <div className="space-y-6">
      <div className="bg-primary/10 border border-primary/20 p-4 rounded-3xl mb-4">
        <p className="text-secondary text-xs text-center font-medium">
          Sorteio baseado em <span className="font-bold">{confirmedPlayers.length}</span> jogadores.
          <br/>
          <span className="opacity-70 mt-1 block">As equipes são preenchidas sequencialmente até o limite definido, equilibrando o nível técnico.</span>
        </p>
      </div>

      {isDrawing ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-8 animate-in fade-in duration-300">
          {/* The virtual grass field/path */}
          <div className="relative w-full max-w-[320px] h-32 bg-emerald-950/40 rounded-3xl border border-emerald-500/20 overflow-hidden flex items-center justify-center px-4">
            {/* Center line */}
            <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-emerald-500/10" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-emerald-500/10" />
            
            {/* Ball container with rolling/bouncing animation */}
            <motion.div
              initial={{ x: -120, rotate: 0 }}
              animate={{ 
                x: [ -120, 120, -120, 0 ],
                rotate: [ 0, 720, 1440, 2160 ],
                y: [ 0, -25, 0, -25, 0, -15, 0 ]
              }}
              transition={{ 
                duration: 3,
                ease: "easeInOut"
              }}
              className="relative z-10 cursor-pointer"
            >
              {/* Dynamic shadow under the ball */}
              <motion.div 
                animate={{
                  scale: [1, 0.5, 1, 0.5, 1, 0.6, 1],
                  opacity: [0.4, 0.1, 0.4, 0.1, 0.4, 0.15, 0.4]
                }}
                transition={{
                  duration: 3,
                  ease: "easeInOut"
                }}
                className="absolute -bottom-1 left-3 right-3 h-1 bg-black/60 rounded-full blur-[2px] z-0"
              />
              
              {/* High-Fidelity Vector Classic Black-and-White Soccer Ball, reduced by 20% to w-13 h-13 */}
              <svg viewBox="0 0 100 100" className="w-13 h-13 relative z-10 drop-shadow-2xl">
                <defs>
                  {/* 3D Sphere Shading for classic white leather base */}
                  <radialGradient id="classicBallBase" cx="30%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="60%" stopColor="#f8fafc" />
                    <stop offset="85%" stopColor="#e2e8f0" />
                    <stop offset="100%" stopColor="#94a3b8" />
                  </radialGradient>
                  
                  {/* 3D Glass Specular Highlight Overlay */}
                  <radialGradient id="classicBallGloss" cx="28%" cy="28%" r="45%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
                    <stop offset="40%" stopColor="#ffffff" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </radialGradient>

                  {/* Clip path to keep all elements perfectly inside the sphere */}
                  <clipPath id="ballClip">
                    <circle cx="50" cy="50" r="46" />
                  </clipPath>
                </defs>

                {/* Outer Seam/Outline with base sphere shading */}
                <circle cx="50" cy="50" r="46" fill="url(#classicBallBase)" stroke="#94a3b8" strokeWidth="1" />

                {/* Clipped Soccer Ball Pattern */}
                <g clipPath="url(#ballClip)">
                  {/* 1. Central Pentagon */}
                  <polygon points="50,35 64.3,45.4 58.8,62.1 41.2,62.1 35.7,45.4" fill="#111827" />

                  {/* 2. Surrounded Outer Pentagons (perfectly symmetric & Telstar-style alignment) */}
                  {/* Top Outer */}
                  <polygon points="50,20 63,10 58,-5 42,-5 37,10" fill="#111827" />
                  {/* Top-Right Outer */}
                  <polygon points="74.3,38.4 83.3,51.4 98.3,47.4 98.3,31.4 83.3,25.4" fill="#111827" />
                  {/* Bottom-Right Outer */}
                  <polygon points="66.8,74.1 81.8,70.1 89.8,83.1 79.8,95.1 65.8,89.1" fill="#111827" />
                  {/* Bottom-Left Outer */}
                  <polygon points="33.2,74.1 18.2,70.1 10.2,83.1 20.2,95.1 34.2,89.1" fill="#111827" />
                  {/* Top-Left Outer */}
                  <polygon points="25.7,38.4 16.7,51.4 1.7,47.4 1.7,31.4 16.7,25.4" fill="#111827" />

                  {/* 3. Seams / Stitch Lines to connect pentagons and form hexagons */}
                  <g stroke="#374151" strokeWidth="1" strokeLinecap="round" opacity="0.85">
                    {/* Inner Radial Lines */}
                    <line x1="50" y1="35" x2="50" y2="20" />
                    <line x1="64.3" y1="45.4" x2="74.3" y2="38.4" />
                    <line x1="58.8" y1="62.1" x2="66.8" y2="74.1" />
                    <line x1="41.2" y1="62.1" x2="33.2" y2="74.1" />
                    <line x1="35.7" y1="45.4" x2="25.7" y2="38.4" />

                    {/* Outer Circumferential Connecting Lines */}
                    <line x1="63" y1="10" x2="83.3" y2="25.4" />
                    <line x1="83.3" y1="51.4" x2="81.8" y2="70.1" />
                    <line x1="65.8" y1="89.1" x2="34.2" y2="89.1" />
                    <line x1="18.2" y1="70.1" x2="16.7" y2="51.4" />
                    <line x1="16.7" y1="25.4" x2="37" y2="10" />
                  </g>
                </g>

                {/* Gloss/Highlight overlay for perfect 3D shiny leather appearance */}
                <circle cx="50" cy="50" r="46" fill="url(#classicBallGloss)" pointerEvents="none" />
              </svg>
            </motion.div>
          </div>

          <div className="space-y-3 text-center">
            {/* Rotating phrases */}
            <motion.p 
              key={drawingStep}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="text-primary text-sm font-black uppercase tracking-widest italic"
            >
              {drawingPhrases[Math.min(drawingStep, drawingPhrases.length - 1)]}
            </motion.p>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">
              Organizando os {confirmedPlayers.length} atletas confirmados...
            </p>
          </div>
        </div>
      ) : teams.length === 0 ? (
        <>
          {isAdmin && (
            <div className="bg-card border border-border/50 p-6 rounded-[2.5rem] space-y-6 shadow-xl animate-in fade-in zoom-in duration-300 mb-6">
              <div className="flex items-center space-x-3 mb-2">
                <SettingsIcon className="text-primary" size={20} />
                <h3 className="text-sm font-black uppercase tracking-widest text-white">Configurações do Jogo</h3>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-2">Jogadores por Time</label>
                  <select 
                    value={playersPerTeamSelected}
                    onChange={(e) => setPlayersPerTeamSelected(Number(e.target.value))}
                    className="w-full bg-bg border border-border p-4 rounded-2xl text-sm font-bold appearance-none text-white focus:border-primary outline-none"
                  >
                    {[4, 5, 6, 7, 8, 9, 10, 11].map(n => (
                      <option key={n} value={n}>{n} vs {n}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col items-center justify-center p-12 text-center space-y-6">
            <div className="w-24 h-24 rounded-full bg-card border border-border flex items-center justify-center">
              <Shuffle size={40} className="text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold">Pronto para o Jogo?</h3>
              <p className="text-gray-500 text-sm max-w-[240px]">
                {isAdmin 
                  ? "O algoritmo irá equilibrar os times por nível técnico e posição."
                  : "Aguarde o administrador realizar o sorteio dos times para a partida."}
              </p>
            </div>
            {isAdmin ? (
              <button 
                onClick={drawTeams}
                disabled={confirmedPlayers.length < 2}
                className="bg-primary text-bg px-8 py-4 rounded-2xl font-black uppercase tracking-widest disabled:opacity-50 disabled:grayscale transition-all"
              >
                Sortear Times
              </button>
            ) : (
              <div className="px-6 py-3 bg-primary/10 border border-primary/20 rounded-2xl">
                <span className="text-primary text-[10px] font-black uppercase tracking-widest">
                  Aguardando Administrador...
                </span>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
          {teams.map((team, idx) => (
            <div key={idx} className="space-y-4">
              <div className="flex items-center space-x-2 px-2">
                <div className="w-8 h-8 rounded-lg bg-primary text-bg flex items-center justify-center font-black text-sm">
                  {idx + 1}
                </div>
                <h3 className="text-lg font-bold">Time {idx + 1}</h3>
                <div className="h-[1px] flex-1 bg-border/50 ml-2" />
                {isAdmin && <span className="text-[10px] font-bold text-gray-500 uppercase">Level: {team.reduce((acc, p) => acc + p.level, 0)}</span>}
              </div>
              
              <div className="grid grid-cols-1 gap-2">
                {team.map((player, pIdx) => (
                  <div key={`${player.id}-${pIdx}`} className="bg-card p-3 rounded-2xl border border-border/50 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full bg-bg border border-border flex items-center justify-center text-[10px] font-bold overflow-hidden ${
                        player.position === 'GOLEIRO' ? 'text-yellow-500' : 'text-gray-500'
                      }`}>
                        {player.photoUrl ? (
                          <img src={player.photoUrl} alt={player.displayName || player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          (player.displayName || player.name).charAt(0)
                        )}
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm">{player.displayName || player.name}</h4>
                          {player.number && (
                            <span className={`text-[10px] font-black px-1 rounded ${duplicatedNumbers.has(player.number) ? 'bg-danger text-white animate-pulse' : 'bg-primary/20 text-primary border border-primary/20'} flex items-center gap-0.5`}>
                              {duplicatedNumbers.has(player.number) && <AlertCircle size={7} />}
                              #{player.number}
                            </span>
                          )}
                          {drawOrder[player.id] !== undefined && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-0.5 whitespace-nowrap">
                              Seq. #{drawOrder[player.id]}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">{formatPosition(player.position)}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {isAdmin && (
                        <div className="flex flex-col items-end">
                          <div className="flex space-x-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <div key={i} className={`w-1 h-1 rounded-full ${i < player.level ? 'bg-primary' : 'bg-gray-800'}`} />
                            ))}
                          </div>
                        </div>
                      )}
                      {isAdmin && (
                        <select 
                          className="bg-bg border border-border rounded-lg text-[10px] font-bold uppercase p-1 text-gray-400 outline-none"
                          value={idx}
                          onChange={(e) => {
                            const toIdx = Number(e.target.value);
                            if (toIdx === idx) return;
                            const newTeams = [...teams];
                            newTeams[idx] = newTeams[idx].filter(p => p.id !== player.id);
                            newTeams[toIdx] = [...newTeams[toIdx], player];
                            setTeams(newTeams);
                          }}
                        >
                          {teams.map((_, tIdx) => (
                            <option key={tIdx} value={tIdx}>Para Time {tIdx + 1}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          
          {isAdmin && (
            <div className="flex gap-4">
              <button 
                onClick={() => {
                  setTeams([]);
                  // Trigger redraw immediately for better UX
                  setTimeout(() => drawTeams(), 50);
                }}
                className="flex-1 py-4 bg-white/5 border border-border text-gray-500 font-bold uppercase tracking-widest text-[11px] rounded-2xl active:scale-95 transition-all flex items-center justify-center space-x-2"
              >
                <Shuffle size={14} />
                <span>Refazer Sorteio</span>
              </button>
              <button 
                onClick={confirmTeams}
                className="flex-1 py-4 bg-primary text-bg font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-lg shadow-primary/20 active:scale-95 transition-all"
              >
                Definir Times
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
