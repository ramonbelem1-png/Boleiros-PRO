import React, { useState } from 'react';
import { usePelada, Player } from '../hooks/usePelada';
import { useAuth } from './AuthProvider';
import { Shuffle, Users, Trophy, AlertCircle, Settings as SettingsIcon, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';

export default function TeamDraw() {
  const { players, matches, setMatchTeams } = usePelada();
  const { user, role } = useAuth();
  const isAdmin = role === 'ADMIN' || user?.email?.trim().toLowerCase() === 'ramonbelem1@gmail.com';

  // Helper to get adjusted level
  const getAdjustedLevel = (player: Player) => {
    return player.level;
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

    const result: Player[][] = Array.from({ length: numTeams }, () => []);

    // 2. Separate Goalkeepers and Field Players
    const goalkeepers = confirmedPlayers.filter(p => p.position === 'GOLEIRO' || p.secondaryPosition === 'GOLEIRO');
    const fieldPlayers = confirmedPlayers.filter(p => !goalkeepers.find(gk => gk.id === p.id));

    // 3. Shuffle first, then sort by level (descending)
    // Shuffling first ensures that players with the SAME adjusted level will have random relative order
    const shuffledGKs = shuffle<Player>(goalkeepers);
    const sortedGKs = shuffledGKs.sort((a: Player, b: Player) => getAdjustedLevel(b) - getAdjustedLevel(a));
    
    // For field players, we'll use a slightly more "elastic" sort to allow close levels to swap for variety
    const shuffledField = shuffle<Player>(fieldPlayers);
    const sortedField = shuffledField.sort((a: Player, b: Player) => {
      const scoreA = getAdjustedLevel(a);
      const scoreB = getAdjustedLevel(b);
      // If levels are very close (within 0.3), introduce 50% chance of swapping
      if (Math.abs(scoreA - scoreB) < 0.3) {
        return Math.random() - 0.5;
      }
      return scoreB - scoreA;
    });

    // 4. Distribute Goalkeepers (max 1 per team, fill sequentially)
    let currentGKIdx = 0;
    for (let i = 0; i < numTeams && currentGKIdx < sortedGKs.length; i++) {
      if (result[i].length < targetSizes[i]) {
        result[i].push(sortedGKs[currentGKIdx]);
        currentGKIdx++;
      }
    }
    // If there are more GKs than teams, distribute the rest greedily
    while (currentGKIdx < sortedGKs.length) {
      let targetIdx = -1;
      for (let i = 0; i < numTeams; i++) {
        if (result[i].length < targetSizes[i]) {
          targetIdx = i;
          break;
        }
      }
      if (targetIdx !== -1) {
        result[targetIdx].push(sortedGKs[currentGKIdx]);
      }
      currentGKIdx++;
    }

    // 5. Distribute Field Players (fill teams sequentially while balancing level)
    // To ensure Team 1 and 2 are filled before Team 3, we fill by "available slots" in order
    sortedField.forEach((player) => {
      let targetTeamIdx = -1;
      let minLevel = Infinity;

      // Find teams that are not yet at their target size
      const teamsWithSpace = [];
      for (let i = 0; i < numTeams; i++) {
        if (result[i].length < targetSizes[i]) {
          teamsWithSpace.push(i);
        }
      }

      // Among teams with space, we want to balance level, 
      // but prioritize filling the "next" game teams (lower indexes)
      const priorityTeams = teamsWithSpace.slice(0, 2); 
      
      // If we have two options and their levels are identical or very close, pick randomly
      if (priorityTeams.length === 2) {
        const level0 = result[priorityTeams[0]].reduce((sum, p: Player) => sum + getAdjustedLevel(p), 0);
        const level1 = result[priorityTeams[1]].reduce((sum, p: Player) => sum + getAdjustedLevel(p), 0);
        
        if (Math.abs(level0 - level1) < 0.1) {
          targetTeamIdx = priorityTeams[Math.random() > 0.5 ? 0 : 1];
        } else if (level0 < level1) {
          targetTeamIdx = priorityTeams[0];
        } else {
          targetTeamIdx = priorityTeams[1];
        }
      } else if (priorityTeams.length === 1) {
        targetTeamIdx = priorityTeams[0];
      }

      if (targetTeamIdx !== -1) {
        result[targetTeamIdx].push(player);
      }
    });

    const POSITION_ORDER: Record<string, number> = {
      'GOLEIRO': 0,
      'ZAGUEIRO': 1,
      'LATERAL': 2,
      'VOLANTE': 3,
      'MEIA': 4,
      'ATACANTE': 5
    };

    // Sort each team by position
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

      {isAdmin && teams.length === 0 && (
        <div className="bg-card border border-border/50 p-6 rounded-[2.5rem] space-y-6 shadow-xl animate-in fade-in zoom-in duration-300">
          <div className="flex items-center space-x-3 mb-2">
            <SettingsIcon className="text-primary" size={20} />
            <h3 className="text-sm font-black uppercase tracking-widest text-white">Configurações do Jogo</h3>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-2">Jogadores por Time (Incluindo Goleiro)</label>
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

      {teams.length === 0 ? (
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
                {team.map(player => (
                  <div key={player.id} className="bg-card p-3 rounded-2xl border border-border/50 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full bg-bg border border-border flex items-center justify-center text-[10px] font-bold overflow-hidden ${
                        player.position === 'GOLEIRO' ? 'text-yellow-500' : 'text-gray-500'
                      }`}>
                        {player.photoUrl ? (
                          <img src={player.photoUrl} alt={player.displayName || player.name} className="w-full h-full object-cover" />
                        ) : (
                          (player.displayName || player.name).charAt(0)
                        )}
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm">{player.displayName || player.name}</h4>
                          {player.number && (
                            <span className={`text-[9px] font-black px-1 rounded ${duplicatedNumbers.has(player.number) ? 'bg-danger text-white animate-pulse' : 'bg-primary/20 text-primary border border-primary/20'} flex items-center gap-0.5`}>
                              {duplicatedNumbers.has(player.number) && <AlertCircle size={7} />}
                              #{player.number}
                            </span>
                          )}
                          {drawOrder[player.id] !== undefined && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-0.5 whitespace-nowrap">
                              Seq. #{drawOrder[player.id]}
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-tighter">{player.position}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="flex flex-col items-end">
                        <div className="flex space-x-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className={`w-1 h-1 rounded-full ${i < player.level ? 'bg-primary' : 'bg-gray-800'}`} />
                          ))}
                        </div>
                      </div>
                      {isAdmin && (
                        <select 
                          className="bg-bg border border-border rounded-lg text-[9px] font-bold uppercase p-1 text-gray-400 outline-none"
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
