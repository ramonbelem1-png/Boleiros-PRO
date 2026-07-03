import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePelada, Player, Game, formatPosition } from '../hooks/usePelada';
import { useAuth } from './AuthProvider';
import { Play, Pause, Square, Timer, Trophy, User, Plus, History, Circle, Edit, Edit2, Trash2, CheckCircle2, ArrowRight, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function LiveMatch() {
  const { 
    players, 
    matches, 
    liveGame, 
    activeGames, 
    startLiveGame, 
    startGame,
    createScheduledGame,
    addGameEvent, 
    updateGameEvent, 
    removeGameEvent, 
    finishGame,
    updateMatch,
    finishMatch,
    confirmPresence,
    markAbsent,
    deleteGame,
    pauseGame,
    resumeGame,
    deleteMatch
  } = usePelada();
  const { role, user } = useAuth();
  const isAdmin = role === 'ADMIN' || 
    user?.email?.trim().toLowerCase() === 'ramoncxavier88@gmail.com';

  const [confirmState, setConfirmState] = useState<{message: string, onConfirm: () => void} | null>(null);

  const confirmAction = (message: string, action: () => void) => {
    setConfirmState({ message, onConfirm: action });
  };

  console.log(`[LiveMatch] isAdmin: ${isAdmin}, role: ${role}, email: ${user?.email}`);
  const now = new Date();
  const activeMatch = matches.find(m => {
    if (m.status !== 'OPEN') return false;
    const matchDate = m.date?.toDate?.() || new Date();
    const dayAfterMatch = new Date(matchDate);
    dayAfterMatch.setDate(dayAfterMatch.getDate() + 1);
    dayAfterMatch.setHours(0, 0, 0, 0);
    return now < dayAfterMatch;
  }) || matches.find(m => m.status === 'OPEN');
  
  const [elapsed, setElapsed] = useState(0);
  const [showEventModal, setShowEventModal] = useState<{ type: 'GOAL'; teamSide: 'A' | 'B'; editIdx?: number } | null>(null);
  const [isOwnGoal, setIsOwnGoal] = useState(false);
  const [isGoalkeeperEvent, setIsGoalkeeperEvent] = useState(false);
  const [selectedScorer, setSelectedScorer] = useState<string>('');
  const [selectedAssister, setSelectedAssister] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [showConfirmFinishRound, setShowConfirmFinishRound] = useState(false);
  const [finishStatus, setFinishStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error', text: string }>({ type: 'idle', text: '' });
  
  const getTeamName = (teamIds: string[] | undefined, defaultLabel: string): string => {
    if (!teamIds || teamIds.length === 0) return defaultLabel;
    if (!activeMatch || !activeMatch.teams) return defaultLabel;

    let bestKey = '';
    let maxOverlap = 0;

    Object.entries(activeMatch.teams).forEach(([key, ids]) => {
      const idsArray = (ids || []) as string[];
      const overlap = teamIds.filter(id => idsArray.includes(id)).length;
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestKey = key;
      }
    });

    if (bestKey !== '' && maxOverlap > 0) {
      return `Time ${Number(bestKey) + 1}`;
    }

    return defaultLabel;
  };

  const getGameTeamNames = (game: any, defaultLabels: { A: string; B: string }): { teamA: string; teamB: string } => {
    if (!game) return { teamA: defaultLabels.A, teamB: defaultLabels.B };
    
    // 1. If explicit names are saved on the game, use them!
    if (game.teamA_name && game.teamB_name) {
      return { teamA: game.teamA_name, teamB: game.teamB_name };
    }
    
    const teamAIds = game.teamA_ids || [];
    const teamBIds = game.teamB_ids || [];
    
    const defaultA = game.teamA_name || defaultLabels.A;
    const defaultB = game.teamB_name || defaultLabels.B;

    if (!activeMatch || !activeMatch.teams) {
      return { teamA: defaultA, teamB: defaultB };
    }

    const teamEntries = Object.entries(activeMatch.teams);
    if (teamEntries.length === 0) {
      return { teamA: defaultA, teamB: defaultB };
    }

    // 2. Try finding the absolute best distinct pair (A belongs to team i, B belongs to team j)
    let bestA = -1;
    let bestB = -1;
    let maxTotalOverlap = -1;

    for (let i = 0; i < teamEntries.length; i++) {
      for (let j = 0; j < teamEntries.length; j++) {
        if (i === j) continue; // Must be distinct teams!

        const [keyA, idsA] = teamEntries[i];
        const [keyB, idsB] = teamEntries[j];

        const arrA = (idsA || []) as string[];
        const arrB = (idsB || []) as string[];

        const overlapA = teamAIds.filter((id: string) => arrA.includes(id)).length;
        const overlapB = teamBIds.filter((id: string) => arrB.includes(id)).length;

        const totalOverlap = overlapA + overlapB;
        if (totalOverlap > maxTotalOverlap) {
          maxTotalOverlap = totalOverlap;
          bestA = Number(keyA);
          bestB = Number(keyB);
        }
      }
    }

    if (maxTotalOverlap > 0 && bestA !== -1 && bestB !== -1) {
      return {
        teamA: `Time ${bestA + 1}`,
        teamB: `Time ${bestB + 1}`
      };
    }

    // Fallback: individual checks
    let singleBestA = -1;
    let maxOverlapA = 0;
    teamEntries.forEach(([key, ids]) => {
      const arr = (ids || []) as string[];
      const overlap = teamAIds.filter((id: string) => arr.includes(id)).length;
      if (overlap > maxOverlapA) {
        maxOverlapA = overlap;
        singleBestA = Number(key);
      }
    });

    let singleBestB = -1;
    let maxOverlapB = 0;
    teamEntries.forEach(([key, ids]) => {
      const arr = (ids || []) as string[];
      const overlap = teamBIds.filter((id: string) => arr.includes(id)).length;
      if (overlap > maxOverlapB) {
        maxOverlapB = overlap;
        singleBestB = Number(key);
      }
    });

    let finalAName = defaultA;
    let finalBName = defaultB;

    if (singleBestA !== -1 && maxOverlapA > 0) {
      finalAName = `Time ${singleBestA + 1}`;
    }
    if (singleBestB !== -1 && maxOverlapB > 0) {
      finalBName = `Time ${singleBestB + 1}`;
    }

    if (finalAName === finalBName && finalAName.startsWith('Time ')) {
      if (maxOverlapA >= maxOverlapB) {
        finalBName = defaultB;
      } else {
        finalAName = defaultA;
      }
    }

    return { teamA: finalAName, teamB: finalBName };
  };

  const resolveTeamIndex = (teamIds: string[] | undefined, teamName: string | undefined): number => {
    if (teamName && teamName.startsWith('Time ')) {
      const teamNum = parseInt(teamName.replace('Time ', ''), 10);
      if (!isNaN(teamNum)) {
        const teamIdx = teamNum - 1;
        if (activeMatch?.teams && activeMatch.teams[String(teamIdx)] !== undefined) {
          return teamIdx;
        }
      }
    }

    if (!teamIds || teamIds.length === 0 || !activeMatch?.teams) return -1;
    let bestKey = -1;
    let maxOverlap = 0;
    Object.entries(activeMatch.teams).forEach(([key, ids]) => {
      const idsArray = (ids || []) as string[];
      const overlap = teamIds.filter(id => idsArray.includes(id)).length;
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestKey = Number(key);
      }
    });
    return bestKey;
  };

  const getBandeirasFromTeam = (teamIdx: number) => {
    if (!activeMatch?.teams) return { teamIdx: -1, players: [] as Player[] };
    const teamPlayerIds = activeMatch.teams[String(teamIdx)] || [];
    if (teamPlayerIds.length === 0) return { teamIdx, players: [] as Player[] };

    // Conta quantas vezes cada jogador do time já atuou como Bandeira nesta pelada
    const counts: Record<string, number> = {};
    teamPlayerIds.forEach(id => {
      counts[id] = 0;
    });

    // Calcula de acordo com as partidas salvas de hoje (activeGames)
    activeGames.forEach(game => {
      if (game.bandeiras_ids) {
        game.bandeiras_ids.forEach(id => {
          if (counts[id] !== undefined) {
            counts[id]++;
          }
        });
      }
    });

    // Mapeia para os objetos correspondentes de jogador e remove nulos/indefinidos, garantindo que o jogador esteja confirmado na pelada
    const teamPlayers = teamPlayerIds
      .filter(id => (activeMatch.confirmedIds || []).includes(id))
      .map(id => players.find(p => p.id === id))
      .filter((p): p is Player => p !== undefined);

    // Ordena pelo menor número de aparições como Bandeira
    teamPlayers.sort((a, b) => {
      const countA = counts[a.id] || 0;
      const countB = counts[b.id] || 0;
      if (countA !== countB) {
        return countA - countB;
      }
      return a.id.localeCompare(b.id);
    });

    // Retorna os 2 com menos atuações
    return {
      teamIdx,
      players: teamPlayers.slice(0, 2)
    };
  };

  const getBandeirasForMatch = (teamAIdx: number, teamBIdx: number) => {
    if (!activeMatch?.teams || !queueState?.queue) return { teamIdx: -1, players: [] as Player[] };
    
    // Encontra o primeiro time da fila de espera que não seja o Time A nem o Time B
    const waitingTeamIdx = queueState.queue.find(idx => idx !== teamAIdx && idx !== teamBIdx);
    
    if (waitingTeamIdx === undefined) {
      // Se não houver, pega o primeiro time fora o A e B
      const allTeamIndices = Object.keys(activeMatch.teams).map(Number);
      const fallbackIdx = allTeamIndices.find(idx => idx !== teamAIdx && idx !== teamBIdx);
      if (fallbackIdx === undefined) {
        return { teamIdx: -1, players: [] as Player[] };
      }
      return getBandeirasFromTeam(fallbackIdx);
    }
    
    return getBandeirasFromTeam(waitingTeamIdx);
  };
  
  // New state for scheduling and editing
  const [scheduledTeamA, setScheduledTeamA] = useState<string>('0');
  const [scheduledTeamB, setScheduledTeamB] = useState<string>('1');
  const [customBandeiras, setCustomBandeiras] = useState<string[] | null>(null);

  // 1. Get finished games of the match, ordered chronologically (oldest to newest)
  const finishedGames = useMemo(() => {
    return [...activeGames]
      .filter((g) => g.status === 'FINISHED')
      .reverse();
  }, [activeGames]);

  // Mapping of each player's ID to their starting team key
  const playerHomeTeamKey = useMemo(() => {
    const mapping: Record<string, string> = {};
    if (!activeMatch?.teams) return mapping;
    Object.entries(activeMatch.teams).forEach(([key, ids]) => {
      const idsArray = (ids || []) as string[];
      idsArray.forEach(id => {
        mapping[id] = key;
      });
    });
    return mapping;
  }, [activeMatch?.teams]);

  // Calculate for each player their participation stats in finished games
  const playerStats = useMemo(() => {
    const stats: Record<string, { lastGamePlayedIndex: number; gamesPlayedCount: number }> = {};
    if (!players) return stats;
    
    // Initialize stats for all players
    players.forEach(p => {
      stats[p.id] = { lastGamePlayedIndex: -1, gamesPlayedCount: 0 };
    });
    
    // Process finished games in chronological order (oldest to newest)
    finishedGames.forEach((game, gameIdx) => {
      const pIds = new Set<string>();
      if (game.teamA_ids) game.teamA_ids.forEach(id => pIds.add(id));
      if (game.teamB_ids) game.teamB_ids.forEach(id => pIds.add(id));
      
      pIds.forEach(id => {
        if (!stats[id]) {
          stats[id] = { lastGamePlayedIndex: -1, gamesPlayedCount: 0 };
        }
        stats[id].lastGamePlayedIndex = gameIdx;
        stats[id].gamesPlayedCount++;
      });
    });
    
    return stats;
  }, [finishedGames, players]);

  // Construct dynamic/effective draw order to sequence late arrivals after drawn players
  const effectiveDrawOrder = useMemo(() => {
    const orders: Record<string, number> = {};
    if (!activeMatch) return orders;

    // 1. Copy existing drawOrders
    const baseDrawOrder = activeMatch.drawOrder || {};
    let maxBaseOrder = 0;
    Object.entries(baseDrawOrder).forEach(([pId, order]) => {
      const parsedOrder = Number(order);
      if (!isNaN(parsedOrder)) {
        orders[pId] = parsedOrder;
        if (parsedOrder > maxBaseOrder) {
          maxBaseOrder = parsedOrder;
        }
      }
    });

    // 2. Identify all player IDs involved in the match
    const confirmedIds = activeMatch.confirmedIds || [];
    const teamPlayerIds: string[] = [];
    if (activeMatch.teams) {
      Object.values(activeMatch.teams).forEach(ids => {
        if (Array.isArray(ids)) {
          teamPlayerIds.push(...ids);
        }
      });
    }

    // Combine and deduplicate
    const allMatchPlayerIds = Array.from(new Set([...confirmedIds, ...teamPlayerIds]));

    // Find those without a base drawOrder
    const latePlayerIds = allMatchPlayerIds.filter(id => baseDrawOrder[id] === undefined);

    // Sort late players by:
    // A) confirmation timestamp from activeMatch.confirmations
    // B) position in activeMatch.confirmedIds
    const confirmations = activeMatch.confirmations || {};
    latePlayerIds.sort((idA, idB) => {
      const parsedA = confirmations[idA] ? Date.parse(String(confirmations[idA])) : 0;
      const parsedB = confirmations[idB] ? Date.parse(String(confirmations[idB])) : 0;
      const timeA = isNaN(parsedA) ? 0 : parsedA;
      const timeB = isNaN(parsedB) ? 0 : parsedB;
      if (timeA && timeB) {
        return timeA - timeB;
      } else if (timeA) {
        return -1;
      } else if (timeB) {
        return 1;
      }
      
      const idxA = confirmedIds.indexOf(idA);
      const idxB = confirmedIds.indexOf(idB);
      if (idxA !== -1 && idxB !== -1) {
        return idxA - idxB;
      } else if (idxA !== -1) {
        return -1;
      } else if (idxB !== -1) {
        return 1;
      }
      return idA.localeCompare(idB);
    });

    // Assign sequential order numbers starting from maxBaseOrder + 1
    latePlayerIds.forEach((id, idx) => {
      orders[id] = maxBaseOrder + 1 + idx;
    });

    return orders;
  }, [activeMatch]);

  // 2. Identify the number of teams
  const teamsCount = Object.keys(activeMatch?.teams || {}).length;

  // 3. Compute suggested active state and waiting queue
  const queueState = useMemo(() => {
    if (!activeMatch?.teams || teamsCount < 2) {
      return { onField: [] as number[], queue: [] as number[], suggested: [] as number[] };
    }

    const getTeamIndexLocal = (teamIds: string[] | undefined, teamName: string | undefined): number => {
      if (teamName && teamName.startsWith('Time ')) {
        const teamNum = parseInt(teamName.replace('Time ', ''), 10);
        if (!isNaN(teamNum)) {
          const teamIdx = teamNum - 1;
          if (activeMatch?.teams && activeMatch.teams[String(teamIdx)] !== undefined) {
            return teamIdx;
          }
        }
      }

      if (!teamIds || teamIds.length === 0 || !activeMatch?.teams) return -1;
      let bestKey = -1;
      let maxOverlap = 0;
      Object.entries(activeMatch.teams).forEach(([key, ids]) => {
        const idsArray = (ids || []) as string[];
        const overlap = teamIds.filter(id => idsArray.includes(id)).length;
        if (overlap > maxOverlap) {
          maxOverlap = overlap;
          bestKey = Number(key);
        }
      });
      return bestKey;
    };

    // Map each finished game to its team indices
    const gameTeams = finishedGames.map(game => {
      const teamA = getTeamIndexLocal(game.teamA_ids, game.teamA_name);
      const teamB = getTeamIndexLocal(game.teamB_ids, game.teamB_name);
      return { teamA, teamB, scoreA: game.scoreA ?? 0, scoreB: game.scoreB ?? 0 };
    });

    // Determine who is currently on the field
    let currentOnField: number[] = [];
    if (liveGame) {
      const idxA = getTeamIndexLocal(liveGame.teamA_ids, liveGame.teamA_name);
      const idxB = getTeamIndexLocal(liveGame.teamB_ids, liveGame.teamB_name);
      if (idxA !== -1) currentOnField.push(idxA);
      if (idxB !== -1) currentOnField.push(idxB);
    } else if (gameTeams.length > 0) {
      const lastGame = gameTeams[gameTeams.length - 1];
      if (lastGame.teamA !== -1 && lastGame.teamB !== -1) {
        if (lastGame.scoreA === lastGame.scoreB) {
          // Draw -> both left the field
          currentOnField = [];
        } else {
          // Winner stays on field
          const winner = lastGame.scoreA > lastGame.scoreB ? lastGame.teamA : lastGame.teamB;
          currentOnField = [winner];
        }
      }
    } else {
      // No games played yet -> initially empty, suggesting Time 1 and Time 2 from waiting list
      currentOnField = [];
    }

    // Find the index of the most recent finished game where each team played (newest to oldest index)
    const validTeamKeys = Object.keys(activeMatch?.teams || {}).map(Number).sort((a, b) => a - b);
    const lastPlayedIndices: Record<number, number> = {};
    const gamesPlayedCount: Record<number, number> = {};
    validTeamKeys.forEach(key => {
      lastPlayedIndices[key] = -1;
      gamesPlayedCount[key] = 0;
    });

    gameTeams.forEach((gg, gameIdx) => {
      if (gg.teamA !== -1 && lastPlayedIndices[gg.teamA] !== undefined) {
        lastPlayedIndices[gg.teamA] = gameIdx;
        gamesPlayedCount[gg.teamA]++;
      }
      if (gg.teamB !== -1 && lastPlayedIndices[gg.teamB] !== undefined) {
        lastPlayedIndices[gg.teamB] = gameIdx;
        gamesPlayedCount[gg.teamB]++;
      }
    });

    // Build the wait list of all teams not currently on the field
    const waitingTeams: number[] = [];
    const onFieldIndices = new Set(currentOnField);
    validTeamKeys.forEach(key => {
      if (!onFieldIndices.has(key)) {
        waitingTeams.push(key);
      }
    });

    // Sort waiting teams:
    // Primary: lastPlayedIndex ascending (smallest first, which means played longest ago, or -1 for never played)
    // Tie-breaker 1: gamesPlayedCount ascending (fewer total games played has priority)
    // Tie-breaker 2: team index ascending (to preserve original sequence order)
    waitingTeams.sort((a, b) => {
      const lastA = lastPlayedIndices[a];
      const lastB = lastPlayedIndices[b];
      if (lastA !== lastB) {
        return lastA - lastB;
      }
      const countA = gamesPlayedCount[a] || 0;
      const countB = gamesPlayedCount[b] || 0;
      if (countA !== countB) {
        return countA - countB;
      }
      return a - b;
    });

    // Calculate suggestions for the next confront based on rule
    let suggested: number[] = [];
    if (currentOnField.length === 1) {
      suggested = [currentOnField[0]];
      if (waitingTeams.length > 0) {
        suggested.push(waitingTeams[0]);
      }
    } else if (currentOnField.length === 0) {
      if (waitingTeams.length >= 2) {
        suggested = [waitingTeams[0], waitingTeams[1]];
      } else if (waitingTeams.length === 1) {
        suggested = [waitingTeams[0]];
      }
    } else {
      // 2 teams currently on the field
      if (waitingTeams.length > 0) {
        suggested = [currentOnField[0] !== undefined ? currentOnField[0] : 0, waitingTeams[0]];
      } else {
        suggested = validTeamKeys.slice(0, 2);
      }
    }

    return {
      onField: currentOnField,
      queue: waitingTeams,
      suggested
    };
  }, [finishedGames, activeMatch?.teams, teamsCount, liveGame]);

  const orderedTeamKeys = useMemo(() => {
    if (!activeMatch?.teams) return [];
    const keysInQueue = (queueState?.queue || []).map(String);
    const keysOnField = (queueState?.onField || []).map(String);
    
    // Combine queue first, then on field
    const order = [...keysInQueue, ...keysOnField];
    
    // Just in case there are other teams not captured in queue or onField
    const allKeys = Object.keys(activeMatch.teams).sort((a, b) => Number(a) - Number(b));
    allKeys.forEach(k => {
      if (!order.includes(k)) {
        order.push(k);
      }
    });
    return order;
  }, [activeMatch?.teams, queueState?.queue, queueState?.onField]);

  // Sync customBandeiras when scheduled teams or queue changes
  useEffect(() => {
    if (activeMatch?.teams) {
      const bInfo = getBandeirasForMatch(Number(scheduledTeamA), Number(scheduledTeamB));
      setCustomBandeiras(bInfo.players.map(p => p.id));
    } else {
      setCustomBandeiras([]);
    }
  }, [scheduledTeamA, scheduledTeamB, activeMatch?.teams, queueState?.queue, activeGames]);

  // Helper comparator to sort players by wait time / "tempo de jogo"
  const comparePlayersByWaitTime = useCallback((idA: string, idB: string): number => {
    const lastA = playerStats[idA]?.lastGamePlayedIndex ?? -1;
    const lastB = playerStats[idB]?.lastGamePlayedIndex ?? -1;
    if (lastA !== lastB) return lastA - lastB;
    
    const countA = playerStats[idA]?.gamesPlayedCount ?? 0;
    const countB = playerStats[idB]?.gamesPlayedCount ?? 0;
    if (countA !== countB) return countA - countB;
    
    const teamAKey = playerHomeTeamKey[idA];
    const teamBKey = playerHomeTeamKey[idB];
    const qIdxA = queueState.queue.indexOf(Number(teamAKey));
    const qIdxB = queueState.queue.indexOf(Number(teamBKey));
    const valA = qIdxA !== -1 ? qIdxA : 9999;
    const valB = qIdxB !== -1 ? qIdxB : 9999;
    if (valA !== valB) return valA - valB;
    
    const orderA = effectiveDrawOrder[idA] ?? 9999;
    const orderB = effectiveDrawOrder[idB] ?? 9999;
    return orderA - orderB;
  }, [playerStats, playerHomeTeamKey, queueState.queue, effectiveDrawOrder]);

  // 4. Auto-update scheduledTeamA and scheduledTeamB to match suggestions by default
  useEffect(() => {
    if (liveGame) {
      // When a game is active, auto-suggest the first two waiting teams in the queue
      if (queueState.queue.length >= 2) {
        setScheduledTeamA(String(queueState.queue[0]));
        setScheduledTeamB(String(queueState.queue[1]));
      } else if (queueState.queue.length === 1) {
        setScheduledTeamA(String(queueState.queue[0]));
        const otherKey = Object.keys(activeMatch?.teams || {}).find(k => k !== String(queueState.queue[0]));
        if (otherKey !== undefined) {
          setScheduledTeamB(otherKey);
        }
      }
    } else {
      // Standard lobby behavior
      if (queueState.suggested.length >= 2) {
        setScheduledTeamA(String(queueState.suggested[0]));
        setScheduledTeamB(String(queueState.suggested[1]));
      } else if (queueState.suggested.length === 1) {
        setScheduledTeamA(String(queueState.suggested[0]));
        if (queueState.queue.length > 0) {
          const other = queueState.queue.find(q => q !== queueState.suggested[0]);
          if (other !== undefined) {
            setScheduledTeamB(String(other));
          } else {
            setScheduledTeamB('0');
          }
        } else {
          setScheduledTeamB('0');
        }
      }
    }
  }, [queueState.suggested, queueState.queue, liveGame, activeMatch?.teams]);

  // Auto-healing to detect and remove duplicate player assignments across static teams in real-time
  useEffect(() => {
    if (!activeMatch?.id || !activeMatch.teams) return;

    const seenPlayerIds = new Set<string>();
    const duplicatePlayerIds = new Set<string>();
    
    const teamKeys = Object.keys(activeMatch.teams).sort((a, b) => Number(a) - Number(b));
    
    teamKeys.forEach(key => {
      const playerIds = activeMatch.teams![key] || [];
      playerIds.forEach(id => {
        if (seenPlayerIds.has(id)) {
          duplicatePlayerIds.add(id);
        } else {
          seenPlayerIds.add(id);
        }
      });
    });

    if (duplicatePlayerIds.size > 0) {
      const cleanedTeams: Record<string, string[]> = {};
      const alreadyCheckedPlayerIds = new Set<string>();
      let changed = false;
      
      teamKeys.forEach(key => {
        const originalList = activeMatch.teams![key] || [];
        const cleanedList = originalList.filter(id => {
          if (alreadyCheckedPlayerIds.has(id)) {
            changed = true;
            return false;
          }
          alreadyCheckedPlayerIds.add(id);
          return true;
        });
        cleanedTeams[key] = cleanedList;
      });

      if (changed) {
        updateMatch(activeMatch.id, { teams: cleanedTeams }).catch((err) => {
          console.error("[LiveMatch] Erro ao corrigir duplicatas de jogadores:", err);
        });
      }
    }
  }, [activeMatch?.id, activeMatch?.teams, updateMatch]);

  const completedScheduledPlayers = useMemo(() => {
    if (!activeMatch?.teams) return { teamA: [], teamB: [] };
    
    const targetSize = activeMatch.playersPerTeam || 6;
    const teamAKey = scheduledTeamA;
    const teamBKey = scheduledTeamB;
    
    // Define a set of all valid existing player IDs currently present in the database to prevent orphaned/deleted IDs
    const existingPlayerIds = new Set(players.map(p => p.id));
    
    const originalAIds = (activeMatch.teams[teamAKey] || []).filter(id => existingPlayerIds.has(id));
    const originalBIds = (activeMatch.teams[teamBKey] || []).filter(id => existingPlayerIds.has(id));
    
    // Determine who is currently on the field in a DIFFERENT team
    const onFieldPlayerIds = new Set<string>();
    if (liveGame) {
      const getTeamIndexLocal = (teamIds: string[] | undefined, teamName: string | undefined): number => {
        if (teamName && teamName.startsWith('Time ')) {
          const teamNum = parseInt(teamName.replace('Time ', ''), 10);
          if (!isNaN(teamNum)) {
            const teamIdx = teamNum - 1;
            if (activeMatch?.teams && activeMatch.teams[String(teamIdx)] !== undefined) {
              return teamIdx;
            }
          }
        }

        if (!teamIds || teamIds.length === 0 || !activeMatch?.teams) return -1;
        let bestKey = -1;
        let maxOverlap = 0;
        Object.entries(activeMatch.teams).forEach(([key, ids]) => {
          const idsArray = (ids || []) as string[];
          const overlap = teamIds.filter(id => idsArray.includes(id)).length;
          if (overlap > maxOverlap) {
            maxOverlap = overlap;
            bestKey = Number(key);
          }
        });
        return bestKey;
      };
      
      const gameTeamAIdx = getTeamIndexLocal(liveGame.teamA_ids, liveGame.teamA_name);
      const gameTeamBIdx = getTeamIndexLocal(liveGame.teamB_ids, liveGame.teamB_name);
      
      const isTeamAPlaying = String(gameTeamAIdx) === String(teamAKey);
      const isTeamBPlaying = String(gameTeamBIdx) === String(teamBKey);
      
      if (!isTeamAPlaying && !isTeamBPlaying) {
        // Our teams are NOT playing, so anyone currently on the field is unavailable
        if (liveGame.teamA_ids) liveGame.teamA_ids.filter(id => existingPlayerIds.has(id)).forEach(id => onFieldPlayerIds.add(id));
        if (liveGame.teamB_ids) liveGame.teamB_ids.filter(id => existingPlayerIds.has(id)).forEach(id => onFieldPlayerIds.add(id));
      } else {
        // One of our teams is playing, exclude opponent's players or other active players
        const allOnField = new Set<string>();
        if (liveGame.teamA_ids) liveGame.teamA_ids.filter(id => existingPlayerIds.has(id)).forEach(id => allOnField.add(id));
        if (liveGame.teamB_ids) liveGame.teamB_ids.filter(id => existingPlayerIds.has(id)).forEach(id => allOnField.add(id));
        
        allOnField.forEach(id => {
          if (!originalAIds.includes(id) && !originalBIds.includes(id)) {
            onFieldPlayerIds.add(id);
          }
        });
      }
    }

    const confirmedIds = (activeMatch.confirmedIds || []).filter(id => existingPlayerIds.has(id));

    // Find players who are on the bench (meaning they are confirmed for the match,
    // but not registered in any team under activeMatch.teams at all)
    const allRegisteredTeamPlayerIds = new Set<string>();
    Object.values(activeMatch.teams).forEach((ids: any) => {
      if (Array.isArray(ids)) {
        ids.forEach(id => {
          if (existingPlayerIds.has(id)) {
            allRegisteredTeamPlayerIds.add(id);
          }
        });
      }
    });

    const benchedPlayerIds = confirmedIds.filter(id => !allRegisteredTeamPlayerIds.has(id));
    benchedPlayerIds.sort(comparePlayersByWaitTime);

    // Build the ordered team keys for cascading suggestion:
    // Use the queue priority order (orderedTeamKeys) so that higher-priority teams
    // get filled and completed first!
    const allTeamKeys = Object.keys(activeMatch.teams).sort((a, b) => Number(a) - Number(b));
    const orderedKeys = orderedTeamKeys;

    const completed: Record<string, string[]> = {};
    const committed = new Set<string>();

    // Initial state of each team filtering out active players in other games
    const initialTeams: Record<string, string[]> = {};
    orderedKeys.forEach(key => {
      const original = (activeMatch.teams![key] || []).filter(id => existingPlayerIds.has(id) && !onFieldPlayerIds.has(id));
      initialTeams[key] = original;
    });

    const availableBenched = benchedPlayerIds.filter(id => !onFieldPlayerIds.has(id));
    let benchedIdx = 0;

    // Run cascading suggestion logic
    for (let i = 0; i < orderedKeys.length; i++) {
      const currentKey = orderedKeys[i];
      const currentPlayers = initialTeams[currentKey].filter(id => !committed.has(id));
      
      const need = Math.max(0, targetSize - currentPlayers.length);
      const borrowed: string[] = [];

      // Find subsequent teams in circular order based on this team's natural position
      const currentIdxInAll = allTeamKeys.indexOf(currentKey);
      const nextKeys: string[] = [];
      for (let offset = 1; offset < allTeamKeys.length; offset++) {
        const nextIdx = (currentIdxInAll + offset) % allTeamKeys.length;
        nextKeys.push(allTeamKeys[nextIdx]);
      }

      // 1. Fill with subsequent teams' players FIRST (Team of the sequence)
      let nextKeysIdx = 0;
      while (borrowed.length < need && nextKeysIdx < nextKeys.length) {
        const nextKey = nextKeys[nextKeysIdx];
        const nextTeamPlayers = (initialTeams[nextKey] || []).filter(id => !committed.has(id));
        
        let pIdx = 0;
        while (borrowed.length < need && pIdx < nextTeamPlayers.length) {
          const idToBorrow = nextTeamPlayers[pIdx];
          borrowed.push(idToBorrow);
          pIdx++;
        }
        nextKeysIdx++;
      }

      // 2. Fill with available benched players LAST if we still need players
      while (borrowed.length < need && benchedIdx < availableBenched.length) {
        const benchedId = availableBenched[benchedIdx];
        if (!committed.has(benchedId)) {
          borrowed.push(benchedId);
        }
        benchedIdx++;
      }

      // 3. Form final roster
      const finalRoster = [...currentPlayers, ...borrowed].slice(0, targetSize);
      completed[currentKey] = finalRoster;

      // Mark all in final roster as committed
      finalRoster.forEach(id => committed.add(id));
    }

    return {
      teamA: completed[teamAKey] || [],
      teamB: completed[teamBKey] || [],
      allCompleted: completed
    };
  }, [
    scheduledTeamA,
    scheduledTeamB,
    activeMatch?.teams,
    activeMatch?.confirmedIds,
    activeMatch?.playersPerTeam,
    players,
    liveGame,
    orderedTeamKeys,
    comparePlayersByWaitTime
  ]);

  const manualSuggestions = useMemo(() => {
    if (!activeMatch?.teams) return { teamASuggestions: [], teamBSuggestions: [] };
    
    const existingPlayerIds = new Set(players.map(p => p.id));
    const originalAIds = (activeMatch.teams[scheduledTeamA] || []).filter(id => existingPlayerIds.has(id));
    const originalBIds = (activeMatch.teams[scheduledTeamB] || []).filter(id => existingPlayerIds.has(id));

    const teamASuggestions = completedScheduledPlayers.teamA.filter(id => !originalAIds.includes(id));
    const teamBSuggestions = completedScheduledPlayers.teamB.filter(id => !originalBIds.includes(id));

    return {
      teamASuggestions,
      teamBSuggestions
    };
  }, [completedScheduledPlayers, scheduledTeamA, scheduledTeamB, activeMatch?.teams, players]);

  const handleIncludeSuggestedPlayer = async (playerId: string, teamKey: string) => {
    if (!activeMatch?.teams) return;
    try {
      const currentTeams = { ...activeMatch.teams };
      
      Object.keys(currentTeams).forEach(k => {
        if (currentTeams[k]) {
          currentTeams[k] = currentTeams[k].filter(id => id !== playerId);
        }
      });
      
      let newTeamIds = [...(currentTeams[teamKey] || [])];
      newTeamIds.push(playerId);
      currentTeams[teamKey] = newTeamIds;
      
      await updateMatch(activeMatch.id, { teams: currentTeams });
    } catch (error) {
      console.error("Erro ao incluir jogador sugerido:", error);
    }
  };

  const playerQueue = useMemo(() => {
    if (!activeMatch) return [];
    
    const existingPlayerIds = new Set(players.map(p => p.id));
    const confirmedIds = (activeMatch.confirmedIds || []).filter(id => existingPlayerIds.has(id));

    // Determine who is currently on the field / playing
    const activeOnFieldIds = new Set<string>();
    
    if (liveGame) {
      if (liveGame.teamA_ids) {
        liveGame.teamA_ids.filter(id => existingPlayerIds.has(id)).forEach(id => activeOnFieldIds.add(id));
      }
      if (liveGame.teamB_ids) {
        liveGame.teamB_ids.filter(id => existingPlayerIds.has(id)).forEach(id => activeOnFieldIds.add(id));
      }
    } else {
      // In lobby/preparation, scheduled teams are active
      completedScheduledPlayers.teamA.forEach(id => activeOnFieldIds.add(id));
      completedScheduledPlayers.teamB.forEach(id => activeOnFieldIds.add(id));
    }

    // Waiting players are confirmed players who are NOT active on field
    const waiters = confirmedIds.filter(id => !activeOnFieldIds.has(id));

    // Sort using our precise wait time comparator
    waiters.sort(comparePlayersByWaitTime);

    return waiters;
  }, [
    activeMatch,
    players,
    liveGame,
    completedScheduledPlayers,
    comparePlayersByWaitTime
  ]);

  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [editingTeamIndex, setEditingTeamIndex] = useState<number | null>(null);
  const [swapTarget, setSwapTarget] = useState<{ type: 'PLAYER' | 'BENCH', teamSide: 'A' | 'B', replacedPlayerId?: string, mode: 'SWAP' | 'ADD' } | null>(null);

  const [isEditingRules, setIsEditingRules] = useState(false);
  const [editPlayersPerTeam, setEditPlayersPerTeam] = useState(6);
  const [savingRules, setSavingRules] = useState(false);

  const handleSaveRules = async () => {
    if (!activeMatch) return;
    setSavingRules(true);
    try {
      await updateMatch(activeMatch.id, {
        playersPerTeam: editPlayersPerTeam
      });
      setIsEditingRules(false);
    } catch (error) {
      console.error("Erro ao salvar regras:", error);
      alert("Erro ao salvar regras.");
    } finally {
      setSavingRules(false);
    }
  };

  // Limpa status ao trocar de jogo
  useEffect(() => {
    setShowConfirmFinish(false);
    setFinishStatus({ type: 'idle', text: '' });
  }, [liveGame?.id]);

  useEffect(() => {
    let interval: any;
    if (liveGame && liveGame.status === 'RUNNING') {
      // Capture initial time when effect runs to avoid 00:00 flickering while waiting for server timestamp
      const localStartTime = Date.now();
      
      interval = setInterval(() => {
        if (liveGame.isPaused) {
          setElapsed(Math.floor((liveGame.accumulatedTime || 0) / 1000));
        } else {
          // Use lastStartedAt, then startTime, then our stable localStartTime
          const lastStarted = liveGame.lastStartedAt?.toDate?.()?.getTime() || 
                             liveGame.startTime?.toDate?.()?.getTime() || 
                             localStartTime;
          
          const currentSession = Date.now() - lastStarted;
          const totalMs = (liveGame.accumulatedTime || 0) + currentSession;
          setElapsed(Math.max(0, Math.floor(totalMs / 1000)));
        }
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(interval);
  }, [liveGame?.id, liveGame?.status, liveGame?.isPaused, liveGame?.accumulatedTime, liveGame?.lastStartedAt, liveGame?.startTime]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };


  const currentTeamA = liveGame?.teamA_ids ? players.filter(p => liveGame.teamA_ids.includes(p.id)) : [];
  const currentTeamB = liveGame?.teamB_ids ? players.filter(p => liveGame.teamB_ids.includes(p.id)) : [];

  const liveTeamNames = useMemo(() => {
    return getGameTeamNames(liveGame, { A: 'Time Preto', B: 'Time Branco' });
  }, [liveGame, activeMatch?.teams]);

  const handleAddGoal = async () => {
    console.log("[LiveMatch] handleAddGoal called", { liveGame: liveGame?.id, showEventModal, selectedScorer, isOwnGoal });
    const scorerToSave = isGoalkeeperEvent ? (selectedScorer || 'goleiro') : selectedScorer;
    if (!liveGame || !activeMatch || !showEventModal || !scorerToSave || submitting) {
      console.log("[LiveMatch] handleAddGoal aborted: preconditions not met");
      return;
    }

    setSubmitting(true);
    try {
      if (showEventModal.editIdx !== undefined) {
        await updateGameEvent(activeMatch.id, liveGame.id, showEventModal.editIdx, {
          playerId: scorerToSave,
          assistId: isOwnGoal ? undefined : (selectedAssister || undefined),
          type: isOwnGoal ? 'OWN_GOAL' : 'GOAL',
          isGoalkeeperGoal: !isOwnGoal && isGoalkeeperEvent,
          isGoalkeeperOwnGoal: isOwnGoal && isGoalkeeperEvent,
        });
      } else {
        await addGameEvent(activeMatch.id, liveGame.id, {
          type: isOwnGoal ? 'OWN_GOAL' : 'GOAL',
          playerId: scorerToSave,
          assistId: isOwnGoal ? undefined : (selectedAssister || undefined),
          teamSide: showEventModal.teamSide,
          isGoalkeeperGoal: !isOwnGoal && isGoalkeeperEvent,
          isGoalkeeperOwnGoal: isOwnGoal && isGoalkeeperEvent,
        });
      }

      setShowEventModal(null);
      setSelectedScorer('');
      setSelectedAssister('');
      setIsOwnGoal(false);
      setIsGoalkeeperEvent(false);
      console.log("[LiveMatch] Goal added successfully");
    } catch (error) {
      console.error("Erro ao registrar/editar gol:", error);
      alert("Erro ao registrar gol. Verifique se você tem permissão e se todos os campos estão corretos.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveEvent = async (idx: number) => {
    confirmAction('Deseja excluir este gol? O placar será ajustado.', async () => {
      try {
        await removeGameEvent(activeMatch.id, liveGame.id, idx);
      } catch (error: any) {
        console.error("Erro ao remover gol:", error);
      }
    });
  };

  const handleFinish = async () => {
    setFinishStatus({ type: 'loading', text: 'Iniciando processo...' });
    console.log("[LiveMatch] Início da finalização da partida.");
    
    if (!liveGame || !activeMatch) {
      setFinishStatus({ type: 'error', text: 'ERRO: O jogo atual ou pelada ativa não foram carregados.' });
      return;
    }

    if (isFinishing) return;
    setIsFinishing(true);

    console.log("[LiveMatch] Parâmetros de finalização:", { 
      matchId: activeMatch.id,
      gameId: liveGame.id,
      scoreA: liveGame.scoreA,
      scoreB: liveGame.scoreB,
      isAdmin,
      userEmail: user?.email
    });

    try {
      setFinishStatus({ type: 'loading', text: 'Salvando estatísticas no servidor...' });
      await finishGame(activeMatch.id, liveGame.id, {
        scoreA: Number(liveGame.scoreA) || 0,
        scoreB: Number(liveGame.scoreB) || 0,
        teamA: liveGame.teamA_ids || [],
        teamB: liveGame.teamB_ids || []
      });
      console.log("[LiveMatch] Sucesso retornado da hook!");
      setFinishStatus({ type: 'success', text: 'PARTIDA FINALIZADA!\nEstatísticas atualizadas com sucesso.' });
      setShowConfirmFinish(false);
      
      // Auto show finish status logic
      setTimeout(() => {
        setFinishStatus({ type: 'idle', text: '' });
      }, 2000);
    } catch (error: any) {
      console.error("[LiveMatch] Erro capturado no handleFinish:", error);
      let errorMessage = "";
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.error) {
          errorMessage = `Acesso Negado: ${parsed.operationType} em ${parsed.path || 'documento'}`;
        }
      } catch (e) {
        errorMessage = error.message || "Erro desconhecido no servidor";
      }
      setFinishStatus({ type: 'error', text: `ERRO AO FINALIZAR: ${errorMessage}` });
    } finally {
      setIsFinishing(false);
    }
  };

  const handleRemovePlayerFromTeam = async (playerId: string) => {
    if ((!editingGame && editingTeamIndex === null) || !activeMatch) return;

    confirmAction('Deseja remover este jogador do time e da pelada? Ele irá para a lista "Fora da Pelada", mas você poderá incluí-lo de volta manualmente.', async () => {
      const getTeamIndexLocal = (teamIds: string[] | undefined, teamName: string | undefined): number => {
        if (teamName && teamName.startsWith('Time ')) {
          const teamNum = parseInt(teamName.replace('Time ', ''), 10);
          if (!isNaN(teamNum)) {
            const teamIdx = teamNum - 1;
            if (activeMatch?.teams && activeMatch.teams[String(teamIdx)] !== undefined) {
              return teamIdx;
            }
          }
        }

        if (!teamIds || teamIds.length === 0 || !activeMatch?.teams) return -1;
        let bestKey = -1;
        let maxOverlap = 0;
        Object.entries(activeMatch.teams).forEach(([key, ids]) => {
          const idsArray = (ids || []) as string[];
          const overlap = teamIds.filter(id => idsArray.includes(id)).length;
          if (overlap > maxOverlap) {
            maxOverlap = overlap;
            bestKey = Number(key);
          }
        });
        return bestKey;
      };

      const currentTeams = { ...activeMatch.teams };
      const sortedKeys = Object.keys(currentTeams).map(Number).sort((a, b) => a - b);
      
      // Step 1: Remove the selected player from whichever team they belong to, without auto-filling or shifting roles downstream
      const newTeams: Record<string, string[]> = {};
      for (const k of sortedKeys) {
        const keyStr = String(k);
        const playersInTeam = currentTeams[keyStr] || [];
        newTeams[keyStr] = playersInTeam.filter(id => id !== playerId);
      }

      // Step 4: Detect active game team indexes based on maximum overlap before shifting
      let liveGameTeamAKey: string | null = null;
      let liveGameTeamBKey: string | null = null;
      if (liveGame) {
        const idxA = getTeamIndexLocal(liveGame.teamA_ids, liveGame.teamA_name);
        const idxB = getTeamIndexLocal(liveGame.teamB_ids, liveGame.teamB_name);
        if (idxA !== -1) liveGameTeamAKey = String(idxA);
        if (idxB !== -1) liveGameTeamBKey = String(idxB);
      }

      // Step 5: Detect editing game team indexes if currently editing inside modal
      let editingGameTeamAKey: string | null = null;
      let editingGameTeamBKey: string | null = null;
      if (editingGame) {
        const idxA = getTeamIndexLocal(editingGame.teamA_ids, editingGame.teamA_name);
        const idxB = getTeamIndexLocal(editingGame.teamB_ids, editingGame.teamB_name);
        if (idxA !== -1) editingGameTeamAKey = String(idxA);
        if (idxB !== -1) editingGameTeamBKey = String(idxB);
      }

      const newConfirmedIds = (activeMatch.confirmedIds || []).filter(id => id !== playerId);
      const newWaitingIds = (activeMatch.waitingIds || []).filter(id => id !== playerId);

      try {
        // Redraw static matches on DB and remove from confirmed / waiting to place in "Fora da Pelada"
        await updateMatch(activeMatch.id, { 
          teams: newTeams,
          confirmedIds: newConfirmedIds,
          waitingIds: newWaitingIds
        });

        // Update liveGame if active
        if (liveGame && (liveGameTeamAKey !== null || liveGameTeamBKey !== null)) {
          const gameRef = doc(db, 'matches', activeMatch.id, 'games', liveGame.id);
          const updateData: any = {};
          if (liveGameTeamAKey !== null) {
            updateData.teamA_ids = newTeams[liveGameTeamAKey] || [];
          }
          if (liveGameTeamBKey !== null) {
            updateData.teamB_ids = newTeams[liveGameTeamBKey] || [];
          }
          await updateDoc(gameRef, updateData);
        }

        // Apply shift updates to editingGame overlay state if active
        if (editingGame) {
          const gameRef = doc(db, 'matches', activeMatch.id, 'games', editingGame.id);
          const updateData: any = {};
          let newTeamAList = editingGame.teamA_ids || [];
          let newTeamBList = editingGame.teamB_ids || [];

          if (editingGameTeamAKey !== null) {
            newTeamAList = newTeams[editingGameTeamAKey] || [];
            updateData.teamA_ids = newTeamAList;
          } else {
            newTeamAList = newTeamAList.filter(id => id !== playerId);
            updateData.teamA_ids = newTeamAList;
          }

          if (editingGameTeamBKey !== null) {
            newTeamBList = newTeams[editingGameTeamBKey] || [];
            updateData.teamB_ids = newTeamBList;
          } else {
            newTeamBList = newTeamBList.filter(id => id !== playerId);
            updateData.teamB_ids = newTeamBList;
          }

          await updateDoc(gameRef, updateData);
          setEditingGame({ ...editingGame, teamA_ids: newTeamAList, teamB_ids: newTeamBList });
        }
      } catch (error: any) {
        console.error("Erro ao remover jogador de equipe estática com deslocamento:", error);
      }
    });
  };

  const handleDeleteTeam = async (teamKey: string) => {
    if (!activeMatch) return;
    
    confirmAction(`Deseja excluir permanentemente a Equipe ${Number(teamKey) + 1}?\nIsso removerá todos os atletas vinculados a esta equipe.`, async () => {
      try {
        const currentTeams = { ...(activeMatch.teams || {}) };
        
        // Remove the team key
        delete currentTeams[teamKey];
        
        // Reindex remaining keys sequentially to avoid gaps
        const remainingKeys = Object.keys(currentTeams).map(Number).sort((a, b) => a - b);
        const reindexedTeams: Record<string, string[]> = {};
        remainingKeys.forEach((k, idx) => {
          reindexedTeams[String(idx)] = currentTeams[String(k)] || [];
        });
        
        await updateMatch(activeMatch.id, { teams: reindexedTeams });
        console.log("[LiveMatch] Equipe excluída com sucesso e reordenada");
      } catch (error: any) {
        console.error("Erro ao excluir equipe:", error);
      }
    });
  };

  const topWaitingPlayer = useMemo(() => {
    if (!activeMatch) return null;
    const confirmedIds = activeMatch.confirmedIds || [];
    const activePlayers = players.filter(p => p.active);
    const confirmed = activePlayers.filter(p => confirmedIds.includes(p.id));

    const onBench = confirmed.filter(p => {
      let found = false;
      const teams = activeMatch.teams || {};
      Object.values(teams).forEach((teamIds: any) => {
        if (Array.isArray(teamIds) && teamIds.includes(p.id)) found = true;
      });
      return !found;
    });

    if (onBench.length === 0) return null;

    return onBench.sort((a, b) => comparePlayersByWaitTime(a.id, b.id))[0];
  }, [activeMatch?.confirmedIds, activeMatch?.teams, players, comparePlayersByWaitTime]);

  const handleQuickAddNext = async (playerId: string, teamSide?: 'A' | 'B') => {
    if (!activeMatch) return;
    try {
      await confirmPresence(activeMatch.id, playerId);
    } catch (error) {
      console.error("Erro ao confirmar presença automática:", error);
    }

    if (editingGame && teamSide) {
      let newTeamA = (editingGame.teamA_ids || []).filter(id => id !== playerId);
      let newTeamB = (editingGame.teamB_ids || []).filter(id => id !== playerId);
      if (teamSide === 'A') newTeamA.push(playerId);
      else newTeamB.push(playerId);

      try {
        const gameRef = doc(db, 'matches', activeMatch.id, 'games', editingGame.id);
        await updateDoc(gameRef, { 
          teamA_ids: newTeamA,
          teamB_ids: newTeamB 
        });
        setEditingGame({ ...editingGame, teamA_ids: newTeamA, teamB_ids: newTeamB });
      } catch (error) {
        console.error("Erro ao atualizar jogador no jogo:", error);
      }
    } else if (editingTeamIndex !== null) {
      const currentTeams = { ...activeMatch.teams };
      const teamKey = String(editingTeamIndex);
      
      Object.keys(currentTeams).forEach(k => {
        if (currentTeams[k]) {
          currentTeams[k] = currentTeams[k].filter(id => id !== playerId);
        }
      });

      let newTeamIds = [...(currentTeams[teamKey] || [])];
      newTeamIds.push(playerId);
      currentTeams[teamKey] = newTeamIds;

      try {
        await updateMatch(activeMatch.id, { teams: currentTeams });
      } catch (error) {
        console.error("Erro ao atualizar time:", error);
      }
    }
  };

  const handleSelectPlayerForTeam = async (playerId: string) => {
    if ((!editingGame && editingTeamIndex === null) || !activeMatch || !swapTarget) return;

    // Ensure player is considered "confirmed" for this match
    try {
      await confirmPresence(activeMatch.id, playerId);
    } catch (error) {
      console.error("Erro ao confirmar presença automática:", error);
    }

    if (editingGame) {
      let newTeamA = (editingGame.teamA_ids || []).filter(id => id !== playerId);
      let newTeamB = (editingGame.teamB_ids || []).filter(id => id !== playerId);
      
      if (swapTarget.mode === 'SWAP' && swapTarget.replacedPlayerId !== undefined) {
        if (swapTarget.teamSide === 'A') {
          const idx = newTeamA.indexOf(swapTarget.replacedPlayerId);
          if (idx !== -1) {
            newTeamA[idx] = playerId;
          } else {
            newTeamA.push(playerId);
          }
        } else {
          const idx = newTeamB.indexOf(swapTarget.replacedPlayerId);
          if (idx !== -1) {
            newTeamB[idx] = playerId;
          } else {
            newTeamB.push(playerId);
          }
        }
      } else if (swapTarget.mode === 'ADD') {
        if (swapTarget.teamSide === 'A') newTeamA.push(playerId);
        else newTeamB.push(playerId);
      }

      try {
        const gameRef = doc(db, 'matches', activeMatch.id, 'games', editingGame.id);
        await updateDoc(gameRef, { 
          teamA_ids: newTeamA,
          teamB_ids: newTeamB 
        });
        setEditingGame({ ...editingGame, teamA_ids: newTeamA, teamB_ids: newTeamB });
        setSwapTarget(null);
      } catch (error) {
        console.error("Erro ao atualizar jogador no jogo:", error);
      }
    } else if (editingTeamIndex !== null) {
      const currentTeams = { ...activeMatch.teams };
      const teamKey = String(editingTeamIndex);
      
      // Remove the selected player from all teams first to prevent duplicate assignments across teams
      Object.keys(currentTeams).forEach(k => {
        if (currentTeams[k]) {
          currentTeams[k] = currentTeams[k].filter(id => id !== playerId);
        }
      });

      let newTeamIds = [...(currentTeams[teamKey] || [])];
      
      if (swapTarget.mode === 'SWAP' && swapTarget.replacedPlayerId !== undefined) {
        const idx = newTeamIds.indexOf(swapTarget.replacedPlayerId);
        if (idx !== -1) {
          newTeamIds[idx] = playerId;
        } else {
          newTeamIds.push(playerId);
        }
      } else if (swapTarget.mode === 'ADD') {
        newTeamIds.push(playerId);
      }
      
      currentTeams[teamKey] = newTeamIds;
      
      try {
        await updateMatch(activeMatch.id, { teams: currentTeams });
        setSwapTarget(null);
      } catch (error) {
        console.error("Erro ao atualizar jogador no time estático:", error);
      }
    }
  };

  const POSITION_ORDER: Record<string, number> = {
    'GOLEIRO': 0,
    'ZAGUEIRO': 1,
    'LATERAL': 2,
    'VOLANTE': 3,
    'MEIA': 4,
    'ATACANTE': 5
  };

  const sortPlayersByPosition = (playerIds: string[]) => {
    return [...playerIds].sort((a, b) => {
      // Prioritize draw order if available
      const orderA = effectiveDrawOrder[a] ?? 9999;
      const orderB = effectiveDrawOrder[b] ?? 9999;
      if (orderA !== orderB) {
        return orderA - orderB;
      }

      const pA = players.find(p => p.id === a);
      const pB = players.find(p => p.id === b);
      const posA = pA?.position || 'ATACANTE';
      const posB = pB?.position || 'ATACANTE';
      return (POSITION_ORDER[posA] ?? 99) - (POSITION_ORDER[posB] ?? 99);
    });
  };

  const handleAddNewTeam = async () => {
    if (!activeMatch) return;
    const currentTeams = { ...(activeMatch.teams || {}) };
    const keys = Object.keys(currentTeams).map(Number);
    const nextKeyNum = keys.length > 0 ? Math.max(...keys) + 1 : 0;
    const nextKey = String(nextKeyNum);
    currentTeams[nextKey] = [];
    
    try {
      await updateMatch(activeMatch.id, { teams: currentTeams });
      setEditingTeamIndex(nextKeyNum);
      setSwapTarget({ type: 'PLAYER', teamSide: 'A', mode: 'ADD' });
    } catch (error) {
      console.error("Erro ao adicionar novo time:", error);
    }
  };

  if (!activeMatch) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="w-20 h-20 rounded-full bg-card border border-border flex items-center justify-center mb-4">
          <Trophy size={32} className="text-gray-500" />
        </div>
        <h3 className="text-xl font-bold">Nenhuma Pelada Aberta</h3>
        <p className="text-gray-500 text-sm mt-2">Crie uma pelada primeiro na aba Lista.</p>
      </div>
    );
  }

  const teamAPlayers = liveGame ? (liveGame.teamA_ids || []).map(id => players.find(p => p.id === id)!).filter(Boolean) : [];
  const teamBPlayers = liveGame ? (liveGame.teamB_ids || []).map(id => players.find(p => p.id === id)!).filter(Boolean) : [];

  const handleFinishRound = async () => {
    if (!activeMatch) return;
    setIsFinishing(true);
    setShowConfirmFinishRound(false);
    setFinishStatus({ type: 'loading', text: 'Encerrando rodada...' });
    try {
      // 1. Finalize current live game if any
      if (liveGame && liveGame.status === 'RUNNING') {
        await finishGame(activeMatch.id, liveGame.id, {
          scoreA: liveGame.scoreA,
          scoreB: liveGame.scoreB,
          teamA: liveGame.teamA_ids,
          teamB: liveGame.teamB_ids
        });
      }

      // 2. Finalize the match/round
      await finishMatch(activeMatch.id);
      
      setFinishStatus({ type: 'success', text: 'RODADA FINALIZADA COM SUCESSO!' });
      setTimeout(() => {
        setFinishStatus({ type: 'idle', text: '' });
      }, 3000);
    } catch (error: any) {
      console.error("Erro ao finalizar rodada:", error);
      setFinishStatus({ type: 'error', text: 'Erro ao finalizar rodada: ' + error.message });
    } finally {
      setIsFinishing(false);
    }
  };

  const renderQueueSequence = () => {
    if (!activeMatch?.teams || teamsCount < 2) return null;

    return (
      <div className="bg-card border border-border rounded-[2rem] p-5 space-y-4 shadow-xl">
        <div className="flex items-center space-x-2 text-primary">
          <History size={16} />
          <h3 className="text-xs font-black uppercase tracking-widest italic">Sequência de Entrada</h3>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {/* Próximo Jogo (Oculto por enquanto a pedido do usuário)
          <div className="bg-bg p-3.5 rounded-2xl border border-border/50 space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">Sugerido Próximo Confronto</span>
            {liveGame ? (
              <div className="space-y-1.5 py-0.5">
                <div className="flex items-center space-x-2 text-sm font-black text-white">
                  <span className="text-primary italic">Vencedor Jogo Atual</span>
                  <span className="text-[10px] text-gray-500 font-bold uppercase italic">VS</span>
                  <span className="text-blue-400">Time {queueState.queue[0] !== undefined ? queueState.queue[0] + 1 : '?'}</span>
                </div>
                {queueState.queue.length >= 2 && (
                  <div className="flex items-center space-x-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    <span>* Se empatar entram:</span>
                    <span className="text-gray-300">Time {queueState.queue[0] + 1}</span>
                    <span>VS</span>
                    <span className="text-gray-300">Time {queueState.queue[1] + 1}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-3 text-sm font-extrabold text-white">
                <span className="text-primary truncate">Time {queueState.suggested[0] !== undefined ? queueState.suggested[0] + 1 : '?'}</span>
                <span className="text-[10px] text-gray-400 font-bold uppercase italic">VS</span>
                <span className="text-blue-400 truncate">Time {queueState.suggested[1] !== undefined ? queueState.suggested[1] + 1 : '?'}</span>
              </div>
            )}
            <span className="text-[10px] text-gray-500 block font-semibold leading-tight pt-1 pb-1.5 border-b border-white/5">
              * Regra: vencedor continua contra o próximo da fila. Nos empates, entram os dois seguintes.
            </span>
            {(() => {
              if (liveGame) {
                const nextWaitingTeamIdx = queueState.queue[1];
                if (nextWaitingTeamIdx !== undefined) {
                  const bInfo = getBandeirasFromTeam(nextWaitingTeamIdx);
                  if (bInfo.players.length > 0) {
                    return (
                      <div className="pt-2 space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-500 block">🚩 Bandeiras Próximo Jogo:</span>
                        <div className="flex gap-1.5 flex-row flex-nowrap overflow-x-auto scroller-none items-center py-0.5 max-w-full">
                          {bInfo.players.map(p => {
                            const name = p.displayName || p.name;
                            const truncated = name.length > 10 ? name.slice(0, 10).trim() + '.' : name;
                            return (
                              <span key={p.id} className="px-1.5 py-0.5 bg-white/5 border border-white/5 rounded text-[10px] font-bold text-gray-300 uppercase whitespace-nowrap">
                                {truncated}
                              </span>
                            );
                          })}
                          <span className="text-[10px] text-gray-500 italic whitespace-nowrap">(Equipe {bInfo.teamIdx + 1})</span>
                        </div>
                      </div>
                    );
                  }
                }
              } else {
                const bInfo = getBandeirasForMatch(
                  queueState.suggested[0] !== undefined ? queueState.suggested[0] : 0,
                  queueState.suggested[1] !== undefined ? queueState.suggested[1] : 1
                );
                if (bInfo.teamIdx !== -1 && bInfo.players.length > 0) {
                   return (
                    <div className="pt-2 space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-500 block">🚩 Bandeiras do Jogo:</span>
                      <div className="flex gap-1.5 flex-row flex-nowrap overflow-x-auto scroller-none items-center py-0.5 max-w-full">
                        {bInfo.players.map(p => {
                          const name = p.displayName || p.name;
                          const truncated = name.length > 10 ? name.slice(0, 10).trim() + '.' : name;
                          return (
                            <span key={p.id} className="px-1.5 py-0.5 bg-white/5 border border-white/5 rounded text-[10px] font-bold text-gray-300 uppercase whitespace-nowrap">
                              {truncated}
                            </span>
                          );
                        })}
                        <span className="text-[10px] text-gray-500 italic whitespace-nowrap">(Equipe {bInfo.teamIdx + 1})</span>
                      </div>
                    </div>
                  );
                }
              }
              return null;
            })()}
          </div>
          */}

          {/* Fila de espera */}
          <div className="bg-bg p-3.5 rounded-2xl border border-border/50 space-y-2 font-black">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">Fila de Espera (Mais tempo sem jogar)</span>
            {queueState.queue.length === 0 ? (
              <span className="text-xs font-semibold text-gray-500 block italic py-1">Nenhum time na fila de espera.</span>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5 py-1">
                {queueState.queue.map((teamIdx, index) => (
                  <React.Fragment key={teamIdx}>
                    <span className="px-2.5 py-1 bg-white/5 border border-white/5 rounded-xl text-[10px] font-bold text-gray-300 inline-flex items-center">
                      <span className="text-[10px] text-gray-500 font-bold mr-1">#{index + 1}</span>
                      <span>Time {teamIdx + 1}</span>
                    </span>
                    {index < queueState.queue.length - 1 && (
                      <ArrowRight size={10} className="text-gray-600 shrink-0 inline-block align-middle" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          {/* Fila de Jogadores (Oculto por enquanto a pedido do usuário)
          <div className="bg-bg p-3.5 rounded-2xl border border-border/50 space-y-2 font-black">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500 block">Fila de Jogadores (Sequência)</span>
            {playerQueue.length === 0 ? (
              <span className="text-xs font-semibold text-gray-500 block italic py-1">Nenhum jogador na fila de espera.</span>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5 py-1">
                {(() => {
                  const maxQueueToShow = 8;
                  return (
                    <>
                      {playerQueue.slice(0, maxQueueToShow).map((id, index) => {
                        const p = players.find(player => player.id === id);
                        if (!p) return null;
                        const name = p.displayName || p.name;
                        const games = playerStats[id]?.gamesPlayedCount ?? 0;
                        return (
                          <React.Fragment key={id}>
                            <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[10px] font-bold text-amber-500 inline-flex items-center gap-1 group/item">
                              <span className="text-[10px] text-amber-500/60 font-black mr-0.5">#{index + 1}</span>
                              <span className="truncate max-w-[70px] uppercase">{name}</span>
                              <span className="text-[10px] text-gray-500 font-normal">({games}j)</span>
                              {isAdmin && (
                                <button
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    confirmAction(`Marcar "${name}" como ausente (foi embora)? Ele será removido da pelada e da fila.`, async () => {
                                      try {
                                        await markAbsent(activeMatch.id, id, "Foi embora");
                                      } catch (err) {
                                        console.error("Erro ao marcar ausente:", err);
                                      }
                                    });
                                  }}
                                  className="ml-1 p-0.5 hover:bg-red-500/20 rounded text-red-400 hover:text-red-500 focus:outline-none transition-all cursor-pointer inline-flex items-center"
                                  title="Marcar como Ausente (Foi Embora)"
                                >
                                  <Plus size={8} className="rotate-45 shrink-0" />
                                </button>
                              )}
                            </span>
                            {index < Math.min(playerQueue.length, maxQueueToShow) - 1 && (
                              <ArrowRight size={10} className="text-gray-600 shrink-0 inline-block align-middle" />
                            )}
                          </React.Fragment>
                        );
                      })}
                      {playerQueue.length > maxQueueToShow && (
                        <span className="text-[10px] font-bold text-gray-500 whitespace-nowrap pl-1">
                          +{playerQueue.length - maxQueueToShow} mais
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
          */}
        </div>
      </div>
    );
  };

  const renderPrepareNextMatch = () => {
    if (!activeMatch?.teams || Object.keys(activeMatch.teams).length < 2) return null;

    const bInfo = getBandeirasForMatch(Number(scheduledTeamA), Number(scheduledTeamB));
    const flagTeamIdx = bInfo.teamIdx;
    const flagTeamPlayerIds = flagTeamIdx !== -1 && activeMatch.teams ? (activeMatch.teams[String(flagTeamIdx)] || []) : [];

    const availableBandeiras = players.filter(p => 
      flagTeamPlayerIds.includes(p.id) &&
      (activeMatch.confirmedIds || []).includes(p.id)
    );

    return (
      <div className="space-y-4">
        <div className="flex items-center space-x-2 px-2 mt-4">
          <Play size={18} className="text-primary" />
          <h2 className="text-xl font-black uppercase italic tracking-tighter">Preparar Próxima Partida</h2>
        </div>
        
        <div className="bg-card/50 border border-border p-6 rounded-[2.5rem] space-y-6 shadow-xl">
          <div className="grid grid-cols-2 gap-4">
            {/* Time A */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-2">Time Preto</label>
                <select 
                  value={scheduledTeamA}
                  onChange={(e) => setScheduledTeamA(e.target.value)}
                  className="w-full bg-bg border border-border p-4 rounded-2xl text-sm font-bold appearance-none text-primary"
                >
                  {Object.keys(activeMatch.teams!).map(key => (
                    <option key={key} value={key}>Time {Number(key) + 1}</option>
                  ))}
                </select>
              </div>
              <div className="bg-bg/50 rounded-2xl p-3 space-y-1.5 font-bold">
                {(() => {
                  const existingPlayerIds = new Set(players.map(p => p.id));
                  const targetSize = activeMatch.playersPerTeam || 6;
                  const originalIds = (activeMatch.teams![scheduledTeamA] || []).filter(id => existingPlayerIds.has(id));
                  
                  // Render actual players
                  const renderedActual = originalIds.map(id => {
                    const p = players.find(player => player.id === id);
                    return (
                      <div key={id} className="flex items-center justify-between py-0.5">
                        <div className="flex items-center space-x-2 min-w-0">
                          <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                          <span className="text-[10px] font-bold uppercase truncate text-gray-400">
                            {p?.displayName || p?.name || 'Vazio'}
                          </span>
                        </div>
                      </div>
                    );
                  });

                  // Render suggestions for vacant spots
                  const renderedVacancies = [];
                  const needCount = Math.max(0, targetSize - originalIds.length);
                  for (let i = 0; i < needCount; i++) {
                    const suggestedId = manualSuggestions.teamASuggestions[i];
                    if (suggestedId) {
                      const sPlayer = players.find(player => player.id === suggestedId);
                      if (sPlayer) {
                        renderedVacancies.push(
                          <div key={`sug-a-${suggestedId}-${i}`} className="flex items-center justify-between bg-primary/5 border border-dashed border-primary/20 rounded-xl p-1.5 px-2 animate-in fade-in duration-300">
                            <div className="flex items-center space-x-1.5 min-w-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[10px] font-black text-primary uppercase truncate leading-tight">
                                  {sPlayer.displayName || sPlayer.name}
                                </p>
                                <p className="text-[8px] text-gray-500 font-extrabold uppercase tracking-wider leading-none">
                                  Sugestão (Fila)
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                await handleIncludeSuggestedPlayer(suggestedId, scheduledTeamA);
                              }}
                              className="p-1 bg-primary/20 hover:bg-primary/35 text-primary border border-primary/30 rounded-lg transition-all shrink-0 cursor-pointer flex items-center justify-center"
                              title={`Incluir ${sPlayer.displayName || sPlayer.name} no Time Preto`}
                            >
                              <Plus size={10} className="stroke-[3]" />
                            </button>
                          </div>
                        );
                        continue;
                      }
                    }
                    renderedVacancies.push(
                      <div key={`vac-a-${i}`} className="flex items-center justify-between py-0.5 opacity-50">
                        <div className="flex items-center space-x-2 min-w-0">
                          <div className="w-1 h-1 rounded-full bg-gray-600" />
                          <span className="text-[10px] font-medium uppercase truncate text-gray-500">
                            Vaga
                          </span>
                        </div>
                      </div>
                    );
                  }

                  return [...renderedActual, ...renderedVacancies];
                })()}
              </div>
            </div>
            
            {/* Time B */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-2">Time Branco</label>
                <select 
                  value={scheduledTeamB}
                  onChange={(e) => setScheduledTeamB(e.target.value)}
                  className="w-full bg-bg border border-border p-4 rounded-2xl text-sm font-bold appearance-none text-white"
                >
                 {Object.keys(activeMatch.teams!).map(key => (
                    <option key={key} value={key}>Time {Number(key) + 1}</option>
                  ))}
                </select>
              </div>
              <div className="bg-bg/50 rounded-2xl p-3 space-y-1.5 font-bold">
                {(() => {
                  const existingPlayerIds = new Set(players.map(p => p.id));
                  const targetSize = activeMatch.playersPerTeam || 6;
                  const originalIds = (activeMatch.teams![scheduledTeamB] || []).filter(id => existingPlayerIds.has(id));
                  
                  // Render actual players
                  const renderedActual = originalIds.map(id => {
                    const p = players.find(player => player.id === id);
                    return (
                      <div key={id} className="flex items-center justify-between py-0.5">
                        <div className="flex items-center space-x-2 min-w-0">
                          <div className="w-1 h-1 rounded-full bg-white/30" />
                          <span className="text-[10px] font-bold uppercase truncate text-gray-400">
                            {p?.displayName || p?.name || 'Vazio'}
                          </span>
                        </div>
                      </div>
                    );
                  });

                  // Render suggestions for vacant spots
                  const renderedVacancies = [];
                  const needCount = Math.max(0, targetSize - originalIds.length);
                  for (let i = 0; i < needCount; i++) {
                    const suggestedId = manualSuggestions.teamBSuggestions[i];
                    if (suggestedId) {
                      const sPlayer = players.find(player => player.id === suggestedId);
                      if (sPlayer) {
                        renderedVacancies.push(
                          <div key={`sug-b-${suggestedId}-${i}`} className="flex items-center justify-between bg-primary/5 border border-dashed border-primary/20 rounded-xl p-1.5 px-2 animate-in fade-in duration-300">
                            <div className="flex items-center space-x-1.5 min-w-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[10px] font-black text-primary uppercase truncate leading-tight">
                                  {sPlayer.displayName || sPlayer.name}
                                </p>
                                <p className="text-[8px] text-gray-500 font-extrabold uppercase tracking-wider leading-none">
                                  Sugestão (Fila)
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                await handleIncludeSuggestedPlayer(suggestedId, scheduledTeamB);
                              }}
                              className="p-1 bg-primary/20 hover:bg-primary/35 text-primary border border-primary/30 rounded-lg transition-all shrink-0 cursor-pointer flex items-center justify-center"
                              title={`Incluir ${sPlayer.displayName || sPlayer.name} no Time Branco`}
                            >
                              <Plus size={10} className="stroke-[3]" />
                            </button>
                          </div>
                        );
                        continue;
                      }
                    }
                    renderedVacancies.push(
                      <div key={`vac-b-${i}`} className="flex items-center justify-between py-0.5 opacity-50">
                        <div className="flex items-center space-x-2 min-w-0">
                          <div className="w-1 h-1 rounded-full bg-gray-600" />
                          <span className="text-[10px] font-medium uppercase truncate text-gray-500">
                            Vaga
                          </span>
                        </div>
                      </div>
                    );
                  }

                  return [...renderedActual, ...renderedVacancies];
                })()}
              </div>
            </div>
          </div>

          {/* Bandeiras Substitution/Configuration */}
          <div className="space-y-2 pt-4 border-t border-white/5">
            <label className="text-[10px] font-black uppercase tracking-widest text-amber-500 ml-2 flex items-center gap-1">
              <span>🚩</span>
              <span>Bandeiras da Próxima Partida</span>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-tighter block ml-1">Bandeira 1</span>
                <select
                  value={customBandeiras?.[0] || ''}
                  onChange={(e) => {
                    const newB = [...(customBandeiras || [])];
                    newB[0] = e.target.value;
                    setCustomBandeiras(newB);
                  }}
                  className="w-full bg-bg border border-border p-3 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-primary cursor-pointer font-sans"
                >
                  <option value="">Selecione...</option>
                  {availableBandeiras.map(p => (
                    <option key={p.id} value={p.id}>
                      {(p.displayName || p.name).toUpperCase()} {p.number !== undefined ? `(Nº ${p.number})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-tighter block ml-1">Bandeira 2</span>
                <select
                  value={customBandeiras?.[1] || ''}
                  onChange={(e) => {
                    const newB = [...(customBandeiras || [])];
                    newB[1] = e.target.value;
                    setCustomBandeiras(newB);
                  }}
                  className="w-full bg-bg border border-border p-3 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-primary cursor-pointer font-sans"
                >
                  <option value="">Selecione...</option>
                  {availableBandeiras.map(p => (
                    <option key={p.id} value={p.id}>
                      {(p.displayName || p.name).toUpperCase()} {p.number !== undefined ? `(Nº ${p.number})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex space-x-3">
            {!liveGame && (
              <button 
                onClick={() => {
                  const nameA = `Time ${Number(scheduledTeamA) + 1}`;
                  const nameB = `Time ${Number(scheduledTeamB) + 1}`;
                  const bandeiraIds = (customBandeiras || [])
                    .filter(id => id && typeof id === 'string' && id !== '');
                  startLiveGame(
                    activeMatch.id, 
                    completedScheduledPlayers.teamA, 
                    completedScheduledPlayers.teamB, 
                    nameA, 
                    nameB,
                    bandeiraIds
                  );
                }}
                className="flex-1 py-4 bg-primary text-bg rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center space-x-2 shadow-lg shadow-primary/20 cursor-pointer"
              >
                <Play size={14} fill="currentColor" />
                <span>Iniciar Agora</span>
              </button>
            )}
            <button 
              onClick={() => {
                const nameA = `Time ${Number(scheduledTeamA) + 1}`;
                const nameB = `Time ${Number(scheduledTeamB) + 1}`;
                const bandeiraIds = (customBandeiras || [])
                  .filter(id => id && typeof id === 'string' && id !== '');
                createScheduledGame(
                  activeMatch.id, 
                  completedScheduledPlayers.teamA, 
                  completedScheduledPlayers.teamB, 
                  nameA, 
                  nameB,
                  bandeiraIds
                );
              }}
              className="flex-1 py-4 bg-white/5 border border-border text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center space-x-2 hover:bg-white/10 cursor-pointer"
            >
              <Plus size={14} />
              <span>Agendar Partida</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 w-full max-w-lg mx-auto transform-gpu">
      {!liveGame ? (
        <section className="space-y-6">
          {!activeMatch.teams || Object.keys(activeMatch.teams).length < 2 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="w-20 h-20 rounded-full bg-card border border-border flex items-center justify-center mb-4">
                <Play size={32} className="text-gray-500" />
              </div>
              <h3 className="text-xl font-bold">Sorteie os Times Primeiro</h3>
              <p className="text-gray-500 text-sm mt-2">Vá na aba "Sortear" e defina os times para começar um jogo.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {renderQueueSequence()}
              {isAdmin && renderPrepareNextMatch()}
              {!isAdmin && (
                <div className="bg-card rounded-[32px] p-10 border border-border/50 text-center space-y-4 shadow-2xl">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto border border-primary/20">
                    <Timer size={40} />
                  </div>
                  <h2 className="text-2xl font-black italic uppercase tracking-tighter">Sem Jogo em Andamento</h2>
                  <p className="text-gray-500 text-sm max-w-[240px] mx-auto font-medium">Aguarde o administrador iniciar a próxima partida para acompanhar em tempo real.</p>
                </div>
              )}
            </div>
          )}
        </section>
      ) : (
        <div className="bg-bg min-h-[100dvh] -mt-6 -mx-4 pb-20 relative overflow-hidden transform-gpu">
          {/* Header */}
          <div className="border-b border-white/5 p-6 mb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center text-primary">
                  <Timer size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase italic tracking-tighter text-white">Ao Vivo</h2>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-none">{activeMatch.name}</p>
                </div>
              </div>
              {isAdmin && (
                <button 
                  onClick={() => setEditingGame(liveGame)}
                  className="p-3 bg-white/5 border border-white/5 rounded-2xl text-gray-400 hover:text-white transition-all"
                >
                  <Edit2 size={18} />
                </button>
              )}
            </div>
          </div>

          {/* Time & Score Dashboard */}
          <div className="p-6">
            <div className="bg-card rounded-[2.5rem] border border-border p-8 relative overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between relative z-10">
                {/* Score Team A */}
                {isAdmin ? (
                  <button 
                    onClick={() => {
                      setShowEventModal({ type: 'GOAL', teamSide: 'A' });
                      setSelectedScorer('');
                      setIsOwnGoal(false);
                      setIsGoalkeeperEvent(false);
                      setSelectedAssister('');
                    }}
                    className="flex flex-col items-center flex-1 group hover:scale-105 transition-all outline-none"
                    title="Registrar Gol para o Time Preto"
                  >
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary mb-1 group-hover:text-primary/80 transition-colors">{liveTeamNames.teamA}</span>
                    <div className="text-6xl font-black italic text-white drop-shadow-sm group-hover:text-primary transition-colors">{liveGame.scoreA}</div>
                  </button>
                ) : (
                  <div className="flex flex-col items-center flex-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">{liveTeamNames.teamA}</span>
                    <div className="text-6xl font-black italic text-white drop-shadow-sm">{liveGame.scoreA}</div>
                  </div>
                )}

                {/* Central Timer & Controls */}
                <div className="flex flex-col items-center space-y-4 px-4 border-x border-white/5">
                  <div className={`font-mono text-4xl font-black tabular-nums transition-all ${liveGame.isPaused ? 'text-gray-600 scale-90' : 'text-primary drop-shadow-[0_0_10px_rgba(0,255,187,0.3)]'}`}>
                    {formatTime(elapsed)}
                  </div>
                  
                  {isAdmin && (
                    <div className="flex items-center space-x-3">
                      {liveGame.isPaused ? (
                        <button 
                          onClick={() => resumeGame(activeMatch.id, liveGame.id)}
                          className="flex flex-col items-center group"
                        >
                          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-bg shadow-lg shadow-primary/30 group-active:scale-95 transition-all">
                            <Play size={18} fill="currentColor" />
                          </div>
                          <span className="text-[10px] font-black uppercase mt-1.5 text-primary tracking-widest">Retomar</span>
                        </button>
                      ) : (
                        <button 
                          onClick={() => pauseGame(activeMatch.id, liveGame.id)}
                          className="flex flex-col items-center group"
                        >
                          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary group-active:scale-95 transition-all">
                            <Pause size={18} fill="currentColor" />
                          </div>
                          <span className="text-[10px] font-black uppercase mt-1.5 text-primary tracking-widest">Pausar</span>
                        </button>
                      )}

                      <button 
                        onClick={() => confirmAction(`Deseja finalizar a partida atual com o placar de ${liveGame.scoreA} x ${liveGame.scoreB}?`, handleFinish)}
                        className="flex flex-col items-center group"
                      >
                        <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-500 group-active:scale-95 transition-all">
                          <Square size={18} fill="currentColor" />
                        </div>
                        <span className="text-[10px] font-black uppercase mt-1.5 text-red-500 tracking-widest">Finalizar</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Score Team B */}
                {isAdmin ? (
                  <button 
                    onClick={() => {
                      setShowEventModal({ type: 'GOAL', teamSide: 'B' });
                      setSelectedScorer('');
                      setIsOwnGoal(false);
                      setIsGoalkeeperEvent(false);
                      setSelectedAssister('');
                    }}
                    className="flex flex-col items-center flex-1 group hover:scale-105 transition-all outline-none"
                    title="Registrar Gol para o Time Branco"
                  >
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1 group-hover:text-blue-300 transition-colors">{liveTeamNames.teamB}</span>
                    <div className="text-6xl font-black italic text-white drop-shadow-sm group-hover:text-blue-400 transition-colors">{liveGame.scoreB}</div>
                  </button>
                ) : (
                  <div className="flex flex-col items-center flex-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1">{liveTeamNames.teamB}</span>
                    <div className="text-6xl font-black italic text-white drop-shadow-sm">{liveGame.scoreB}</div>
                  </div>
                )}
              </div>

              {/* BANDEIRAS (Linesmen) */}
              {(() => {
                let bandeirasPlayers: Player[] = [];
                let bTeamIdx = -1;
                
                if (liveGame.bandeiras_ids && liveGame.bandeiras_ids.length > 0) {
                  bandeirasPlayers = liveGame.bandeiras_ids
                    .map(id => players.find(p => p.id === id))
                    .filter((p): p is Player => p !== undefined);
                  
                  if (bandeirasPlayers.length > 0) {
                    const firstPlayerId = bandeirasPlayers[0].id;
                    if (activeMatch.teams) {
                      const foundEntry = Object.entries(activeMatch.teams).find(([_, ids]) => (ids as string[] || []).includes(firstPlayerId));
                      if (foundEntry) {
                        bTeamIdx = Number(foundEntry[0]);
                      }
                    }
                  }
                } else {
                  const tAIdx = resolveTeamIndex(liveGame.teamA_ids, liveGame.teamA_name);
                  const tBIdx = resolveTeamIndex(liveGame.teamB_ids, liveGame.teamB_name);
                  const bInfo = getBandeirasForMatch(tAIdx, tBIdx);
                  bandeirasPlayers = bInfo.players;
                  bTeamIdx = bInfo.teamIdx;
                }

                if (bandeirasPlayers.length === 0) return null;

                const flagTeamPlayerIds = bTeamIdx !== -1 && activeMatch.teams ? (activeMatch.teams[String(bTeamIdx)] || []) : [];
                const activeGameAvailableBandeiras = players.filter(ap => 
                  (bTeamIdx !== -1 ? flagTeamPlayerIds.includes(ap.id) : true) &&
                  (activeMatch.confirmedIds || []).includes(ap.id) &&
                  !(liveGame.teamA_ids || []).includes(ap.id) &&
                  !(liveGame.teamB_ids || []).includes(ap.id)
                );

                return (
                  <div className="mt-4 pt-4 border-t border-white/5 flex flex-col items-center justify-center relative z-10 w-full overflow-hidden">
                    <div className="flex items-center space-x-1.5 text-[9px] font-black uppercase tracking-widest text-gray-500 mb-2">
                      <span className="text-amber-500">🚩</span>
                      <span>{isAdmin ? 'Substituir Bandeiras' : 'Bandeiras da Partida'}</span>
                      {bTeamIdx !== -1 && (
                        <span className="text-gray-400 font-extrabold italic">(Equipe {bTeamIdx + 1})</span>
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-1.5 flex-row flex-nowrap overflow-x-auto scroller-none max-w-full px-2 py-0.5">
                      {bandeirasPlayers.map((p, idx) => {
                        const name = p.displayName || p.name;
                        const truncated = name.length > 10 ? name.slice(0, 10).trim() + '.' : name;
                        
                        if (isAdmin) {
                          return (
                            <div key={p.id} className="flex items-center space-x-1 bg-white/5 border border-white/5 px-2 py-1 rounded-lg shadow-sm whitespace-nowrap">
                              <span className="text-gray-500 font-bold text-[9px]">#{idx + 1}</span>
                              <select
                                value={p.id}
                                onChange={async (e) => {
                                  const newId = e.target.value;
                                  if (!newId) return;
                                  
                                  let currentBIds = liveGame.bandeiras_ids && liveGame.bandeiras_ids.length > 0 
                                    ? [...liveGame.bandeiras_ids] 
                                    : bandeirasPlayers.map(bp => bp.id);
                                  
                                  while (currentBIds.length < 2 && currentBIds.length < bandeirasPlayers.length) {
                                    currentBIds.push(bandeirasPlayers[currentBIds.length].id);
                                  }
                                  
                                  currentBIds[idx] = newId;
                                  
                                  try {
                                    await updateDoc(doc(db, 'matches', activeMatch.id, 'games', liveGame.id), {
                                      bandeiras_ids: currentBIds
                                    });
                                    console.log("[LiveMatch] Bandeira substituído com sucesso");
                                  } catch (error) {
                                    console.error("Erro ao substituir bandeira:", error);
                                  }
                                }}
                                className="bg-transparent border-none text-[9px] font-bold text-white focus:outline-none focus:ring-0 uppercase cursor-pointer py-0 px-1"
                              >
                                <option value={p.id} className="bg-bg text-white">
                                  {name.toUpperCase()} {p.number !== undefined ? `(Nº ${p.number})` : ''}
                                </option>
                                {activeGameAvailableBandeiras.filter(ap => ap.id !== p.id).map(ap => (
                                  <option key={ap.id} value={ap.id} className="bg-bg text-white">
                                    {(ap.displayName || ap.name).toUpperCase()} {ap.number !== undefined ? `(Nº ${ap.number})` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        }

                        return (
                          <span key={p.id} className="text-[9px] font-bold text-white px-2 py-1 bg-white/5 border border-white/5 rounded-lg flex items-center space-x-1 shadow-sm whitespace-nowrap">
                            <span className="text-gray-500 font-bold text-[9px]">#{idx + 1}</span>
                            <span className="uppercase whitespace-nowrap">{truncated}</span>
                            {p.number !== undefined && p.number !== null && (
                              <span className="text-primary font-mono text-[9px] font-extrabold">Nº {p.number}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* REAL-TIME MATCH EVENTS DISPLAY */}
              {(() => {
                const eventsWithIdx = (liveGame.events || []).map((e, idx) => ({ ...e, originalIdx: idx }));
                return liveGame.events && liveGame.events.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-white/5 grid grid-cols-2 gap-4 text-xs font-semibold relative z-10">
                    {/* Team A Goals */}
                    <div className="space-y-2 border-r border-white/5 pr-4 text-left">
                      {eventsWithIdx.filter(e => e.teamSide === 'A').map((e, idx) => (
                        <div key={idx} className="flex items-center justify-between group/event text-gray-300 min-w-0 py-1 border-b border-white/[0.02] last:border-0">
                          <div className="flex items-start space-x-2 min-w-0">
                            <Circle size={8} className="fill-primary text-primary mt-1 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-extrabold uppercase text-[10px] tracking-tight truncate text-white">
                                {(() => {
                                  const p = players.find(p => p.id === e.playerId);
                                  const name = p ? (p.displayName || p.name) : (e.isGoalkeeperGoal || e.isGoalkeeperOwnGoal || e.playerId === 'goleiro' ? 'Goleiro' : 'Atleta');
                                  const numStr = p?.number !== undefined && p?.number !== null ? ` (Nº ${p.number})` : '';
                                  return `${name}${numStr}`;
                                })()}
                                {e.type === 'OWN_GOAL' && <span className="text-danger ml-1 font-black">(GC)</span>}
                                {e.isGoalkeeperGoal && <span className="text-amber-500 ml-1 font-extrabold text-[8px] tracking-tight">(GOLEIRO)</span>}
                                {e.isGoalkeeperOwnGoal && <span className="text-red-500 ml-1 font-extrabold text-[8px] tracking-tight">(GC GOLEIRO)</span>}
                              </p>
                              {e.assistId && (
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider leading-none mt-0.5 truncate">
                                  Assist: {(() => {
                                    const p = players.find(p => p.id === e.assistId);
                                    const name = p ? (p.displayName || p.name) : 'Atleta';
                                    const numStr = p?.number !== undefined && p?.number !== null ? ` (Nº ${p.number})` : '';
                                    return `${name}${numStr}`;
                                  })()}
                                </p>
                              )}
                            </div>
                          </div>
                          {isAdmin && (
                            <button
                              onClick={() => handleRemoveEvent(e.originalIdx)}
                              className="p-1 text-gray-500 hover:text-red-400 hover:bg-white/5 rounded transition-all shrink-0"
                              title="Anular este gol"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Team B Goals */}
                    <div className="space-y-2 pl-4 text-right">
                      {eventsWithIdx.filter(e => e.teamSide === 'B').map((e, idx) => (
                        <div key={idx} className="flex items-center justify-between group/event text-gray-300 min-w-0 py-1 border-b border-white/[0.02] last:border-0 flex-row-reverse">
                          <div className="flex items-start space-x-2 justify-end text-right min-w-0 flex-row-reverse">
                            <Circle size={8} className="fill-blue-500 text-blue-500 mt-1 shrink-0 ml-2" />
                            <div className="min-w-0">
                              <p className="font-extrabold uppercase text-[10px] tracking-tight truncate text-white">
                                {(() => {
                                  const p = players.find(p => p.id === e.playerId);
                                  const name = p ? (p.displayName || p.name) : (e.isGoalkeeperGoal || e.isGoalkeeperOwnGoal || e.playerId === 'goleiro' ? 'Goleiro' : 'Atleta');
                                  const numStr = p?.number !== undefined && p?.number !== null ? ` (Nº ${p.number})` : '';
                                  return `${name}${numStr}`;
                                })()}
                                {e.type === 'OWN_GOAL' && <span className="text-danger ml-1 font-black">(GC)</span>}
                                {e.isGoalkeeperGoal && <span className="text-amber-500 ml-1 font-extrabold text-[8px] tracking-tight">(GOLEIRO)</span>}
                                {e.isGoalkeeperOwnGoal && <span className="text-red-500 ml-1 font-extrabold text-[8px] tracking-tight">(GC GOLEIRO)</span>}
                              </p>
                              {e.assistId && (
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider leading-none mt-0.5 truncate">
                                  Assist: {(() => {
                                    const p = players.find(p => p.id === e.assistId);
                                    const name = p ? (p.displayName || p.name) : 'Atleta';
                                    const numStr = p?.number !== undefined && p?.number !== null ? ` (Nº ${p.number})` : '';
                                    return `${name}${numStr}`;
                                  })()}
                                </p>
                              )}
                            </div>
                          </div>
                          {isAdmin && (
                            <button
                              onClick={() => handleRemoveEvent(e.originalIdx)}
                              className="p-1 text-gray-500 hover:text-red-400 hover:bg-white/5 rounded transition-all shrink-0"
                              title="Anular este gol"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {finishStatus.text && finishStatus.type !== 'idle' && (
                <div className={`mt-4 p-3 rounded-2xl text-center font-bold text-xs relative z-10 animate-in slide-in-from-top-2 ${
                  finishStatus.type === 'error' ? 'bg-danger/20 text-danger border border-danger/30' :
                  finishStatus.type === 'success' ? 'bg-success/20 text-success border border-success/30' :
                  'bg-primary/20 text-primary border border-primary/30'
                }`}>
                  {finishStatus.text}
                </div>
              )}

              {/* Background Glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-primary/5 blur-[100px] rounded-full pointer-events-none" />
            </div>
          </div>

          {/* Parallel Player Rows */}
          <div className="px-6 space-y-4">
            <div className="flex items-center justify-between px-6 py-1">
              <div className="flex items-center space-x-2">
                <Trophy size={14} className="text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white italic">{liveTeamNames.teamA}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-white italic">{liveTeamNames.teamB}</span>
                <Trophy size={14} className="text-blue-400" />
              </div>
            </div>

            <div className="space-y-px border border-white/5 rounded-[2rem] overflow-hidden">
               {(() => {
                 const maxRows = Math.max(teamAPlayers.length, teamBPlayers.length);
                 return Array.from({ length: maxRows }).map((_, idx) => {
                   const playerA = teamAPlayers[idx];
                   const playerB = teamBPlayers[idx];

                   return (
                     <div key={idx} className="flex h-16 divide-x divide-white/5 border-b border-white/5 last:border-b-0">
                       {/* Player A slot */}
                       <div className="flex-1">
                         {playerA ? (
                           <button 
                             onClick={() => {
                               if (isAdmin) {
                                 setShowEventModal({ type: 'GOAL', teamSide: 'A' });
                                 setSelectedScorer(playerA.id);
                                 setIsOwnGoal(false);
                                 setSelectedAssister('');
                               }
                             }}
                             disabled={!isAdmin}
                             className="w-full h-full flex items-center px-4 space-x-3 hover:bg-white/5 transition-all text-left group"
                           >
                              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden border border-white/10 group-active:scale-90 transition-transform">
                                {playerA.photoUrl ? (
                                  <img src={playerA.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <User size={16} className="text-gray-500" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black text-white uppercase truncate tracking-tight">{playerA.displayName || playerA.name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-[10px] font-bold text-primary/70 uppercase tracking-widest">{formatPosition(playerA.position)}</span>
                                  {playerA.number !== undefined && playerA.number !== null && (
                                    <span className="text-[10px] font-black px-1 py-0.5 bg-primary/20 text-primary border border-primary/10 rounded leading-none">
                                      Nº {playerA.number}
                                    </span>
                                  )}
                                </div>
                              </div>
                           </button>
                         ) : (
                           <div className="w-full h-full" />
                         )}
                       </div>

                       {/* Player B slot */}
                       <div className="flex-1">
                         {playerB ? (
                           <button 
                             onClick={() => {
                               if (isAdmin) {
                                 setShowEventModal({ type: 'GOAL', teamSide: 'B' });
                                 setSelectedScorer(playerB.id);
                                 setIsOwnGoal(false);
                                 setSelectedAssister('');
                               }
                             }}
                             disabled={!isAdmin}
                             className="w-full h-full flex items-center px-4 space-x-3 hover:bg-white/5 transition-all text-right justify-end group"
                           >
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black text-white uppercase truncate tracking-tight">{playerB.displayName || playerB.name}</p>
                                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                                  {playerB.number !== undefined && playerB.number !== null && (
                                    <span className="text-[10px] font-black px-1 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/10 rounded leading-none flex-shrink-0">
                                      Nº {playerB.number}
                                    </span>
                                  )}
                                  <span className="text-[10px] font-bold text-blue-400/70 uppercase tracking-widest">{formatPosition(playerB.position)}</span>
                                </div>
                              </div>
                              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden border border-white/10 group-active:scale-90 transition-transform">
                                {playerB.photoUrl ? (
                                  <img src={playerB.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <User size={16} className="text-gray-500" />
                                )}
                              </div>
                           </button>
                         ) : (
                           <div className="w-full h-full" />
                         )}
                       </div>
                     </div>
                   );
                 });
                })()}
             </div>
          </div>
        </div>
      )}

      {liveGame && (
        <div className="px-2 space-y-6 mb-6">
          {renderQueueSequence()}
          {isAdmin && renderPrepareNextMatch()}
        </div>
      )}

      {/* TODAS AS ESCALAÇÕES (Always visible at bottom) */}
      <div className="space-y-4 pt-8 shrink-0">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center space-x-2">
            <History size={18} className="text-gray-500" />
            <h2 className="text-xl font-black uppercase italic tracking-tighter text-gray-500">Todas as Escalações</h2>
          </div>
          {isAdmin && (
            <div className="flex items-center space-x-2">
              <button 
                onClick={async () => {
                  confirmAction('Deseja excluir TODAS as equipes e atletas escalados desta pelada?', async () => {
                    try {
                      await updateMatch(activeMatch.id, { teams: {} });
                    } catch (error: any) {
                      console.error("Erro ao limpar escalações:", error);
                    }
                  });
                }}
                className="p-2 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all flex items-center space-x-2"
                title="Limpar todas as escalações"
              >
                <Trash2 size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest pr-1">Limpar Tudo</span>
              </button>
              <button 
                onClick={handleAddNewTeam}
                className="p-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl transition-all flex items-center space-x-2"
                title="Adicionar nova equipe"
              >
                <Plus size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest pr-1">Nova Equipe</span>
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeMatch.teams && orderedTeamKeys.map(key => {
            const teamIds = activeMatch.teams[key] || [];
            const sortedIds = teamIds as string[];
            const completedRoster = completedScheduledPlayers?.allCompleted?.[key] || [];
            const suggestedIdsForTeam = completedRoster.filter(id => !sortedIds.includes(id));

            return (
              <div key={key} className="bg-card p-5 rounded-[2rem] border border-border/50 relative overflow-hidden group shadow-xl">
                <div className="flex justify-between items-center mb-5">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <Trophy size={14} />
                    </div>
                    <span className="text-xs font-black text-primary uppercase tracking-widest">Equipe {Number(key) + 1}</span>
                    {isAdmin && (
                      <div className="flex items-center space-x-1">
                        <button 
                          onClick={() => setEditingTeamIndex(Number(key))}
                          className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                          title="Editar time"
                        >
                          <Edit size={12} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteTeam(key);
                          }}
                          className="p-3 bg-red-500 text-white hover:bg-red-600 rounded-2xl transition-all shadow-lg shadow-red-500/20"
                          title="Excluir equipe"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                    {sortedIds.length} {sortedIds.length === 1 ? 'Atleta' : 'Atletas'}
                    {suggestedIdsForTeam.length > 0 && ` (+ ${suggestedIdsForTeam.length} sug)`}
                  </span>
                </div>
                
                <div className="space-y-2">
                  {sortedIds.map((id, pIdx) => {
                    const p = players.find(p => p.id === id);
                    const isGK = p?.position === 'GOLEIRO' || p?.secondaryPosition === 'GOLEIRO';
                    return (
                      <div key={`${id}-${pIdx}`} className="flex items-center justify-between text-[11px] font-bold py-1 border-b border-white/5 last:border-0 group min-w-0 gap-2">
                        <div className="flex items-center space-x-2 min-w-0 flex-1">
                          <span className={`w-8 text-[10px] text-center rounded px-1 shrink-0 group-hover:bg-primary/10 transition-colors ${isGK ? 'bg-primary text-bg' : 'text-gray-500'}`}>
                            {formatPosition(p?.position) || 'POS'}
                          </span>
                          <span className="text-white truncate min-w-0 flex-1" title={p?.displayName || p?.name || 'Desconhecido'}>
                            {p?.displayName || p?.name || 'Desconhecido'}
                          </span>
                          {p?.number !== undefined && p?.number !== null && (
                            <span className="text-[10px] font-black text-primary/80 shrink-0 ml-1.5 whitespace-nowrap">
                              (Nº {p.number})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          {isGK && <div className="w-1 h-1 bg-primary rounded-full animate-pulse" />}
                        </div>
                      </div>
                    );
                  })}

                  {suggestedIdsForTeam.map((suggestedId, sIdx) => {
                    const p = players.find(p => p.id === suggestedId);
                    if (!p) return null;
                    const isGK = p.position === 'GOLEIRO' || p.secondaryPosition === 'GOLEIRO';
                    return (
                      <div key={`sug-${key}-${suggestedId}-${sIdx}`} className="flex items-center justify-between text-[11px] font-bold py-1.5 px-2 bg-primary/5 border border-dashed border-primary/20 rounded-xl min-w-0 gap-2 mt-1 animate-in fade-in duration-300">
                        <div className="flex items-center space-x-2 min-w-0 flex-1">
                          <span className={`w-8 text-[9px] text-center rounded px-1 shrink-0 bg-primary/15 text-primary uppercase font-bold`}>
                            {formatPosition(p.position) || 'POS'}
                          </span>
                          <span className="text-primary truncate min-w-0 flex-1" title={p.displayName || p.name}>
                            {p.displayName || p.name}
                          </span>
                          {p.number !== undefined && p.number !== null && (
                            <span className="text-[9px] font-black text-primary/80 shrink-0 ml-1 whitespace-nowrap">
                              (Nº {p.number})
                            </span>
                          )}
                          <span className="text-[8px] text-gray-400 font-extrabold uppercase tracking-wider shrink-0 bg-white/5 px-1.5 py-0.5 rounded">
                            SUGESTÃO
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 shrink-0">
                          {isAdmin && (
                            <button
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                
                                const currentTeams = { ...activeMatch.teams };
                                const teamKey = String(key);
                                
                                // Remove player from other teams if exists to avoid duplicated instances
                                Object.keys(currentTeams).forEach(k => {
                                  if (currentTeams[k]) {
                                    currentTeams[k] = currentTeams[k].filter(id => id !== suggestedId);
                                  }
                                });

                                let newTeamIds = [...(currentTeams[teamKey] || [])];
                                newTeamIds.push(suggestedId);
                                currentTeams[teamKey] = newTeamIds;

                                try {
                                  await updateMatch(activeMatch.id, { teams: currentTeams });
                                } catch (error) {
                                  console.error("Erro ao adicionar jogador sugerido:", error);
                                }
                              }}
                              className="p-1.5 bg-primary/20 hover:bg-primary/35 text-primary border border-primary/30 rounded-lg transition-all shrink-0 cursor-pointer flex items-center justify-center"
                              title={`Incluir ${p.displayName || p.name} no Time`}
                            >
                              <Plus size={10} className="stroke-[3]" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Partidas do Dia */}
      <div className="space-y-4 shrink-0">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-sm font-bold uppercase tracking-widest flex items-center space-x-2">
            <Trophy size={16} className="text-primary" />
            <span>Partidas de Hoje</span>
          </h3>
          <div className="flex items-center space-x-3">
            <span className="text-[10px] font-bold text-gray-500">{activeGames.length} JOGOS</span>
            {isAdmin && activeMatch && (
              <button 
                onClick={() => confirmAction("Tem certeza que deseja excluir esta pelada inteira? Todas as partidas, gols e estatísticas dela serão apagadas permanentemente.", () => deleteMatch(activeMatch.id))}
                className="p-2 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all flex items-center space-x-1.5"
                title="Excluir Pelada Inteira"
              >
                <Trash2 size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">Excluir Pelada</span>
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {activeGames.length === 0 ? (
            <div className="bg-card/50 border border-dashed border-border p-6 rounded-3xl text-center">
              <p className="text-xs text-gray-500 font-medium italic">Nenhuma partida registrada hoje.</p>
            </div>
          ) : (
            activeGames.map((game) => {
              const rTeams = getGameTeamNames(game, { A: 'Time Preto', B: 'Time Branco' });
              return (
                <div key={game.id} className="bg-card rounded-[2.5rem] border border-border/50 overflow-hidden shadow-lg">
                  <div className={`px-4 py-2 flex items-center justify-between ${game.status === 'RUNNING' ? 'bg-primary/10' : game.status === 'SCHEDULED' ? 'bg-yellow-500/10' : 'bg-white/5'}`}>
                    <div className="flex items-center space-x-2">
                      {game.status === 'RUNNING' ? (
                        <div className="flex items-center space-x-1.5">
                          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                          <span className="text-[10px] font-black text-primary uppercase tracking-widest">Em Andamento</span>
                        </div>
                      ) : game.status === 'SCHEDULED' ? (
                        <div className="flex items-center space-x-1.5 text-yellow-500">
                          <Timer size={10} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Agendada</span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Finalizada</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-[10px] font-bold text-gray-500">
                        {game.startTime?.toDate?.().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isAdmin && (game.status === 'RUNNING' || game.status === 'SCHEDULED') && (
                        <button 
                          onClick={() => setEditingGame(game)}
                          className="p-1 px-2 bg-white/5 border border-border/50 rounded-lg text-[10px] font-black uppercase text-white hover:bg-white/10"
                        >
                          EDITAR
                        </button>
                      )}
                      {isAdmin && game.status === 'SCHEDULED' && (
                        <button 
                          onClick={() => {
                            let bIds = game.bandeiras_ids;
                            if (!bIds || bIds.length === 0) {
                              const tAIdx = resolveTeamIndex(game.teamA_ids, game.teamA_name);
                              const tBIdx = resolveTeamIndex(game.teamB_ids, game.teamB_name);
                              const bInfo = getBandeirasForMatch(tAIdx, tBIdx);
                              bIds = bInfo.players.map(p => p.id);
                            }
                            startGame(activeMatch.id, game.id, bIds);
                          }}
                          className="p-1 px-2 bg-primary text-bg rounded-lg text-[10px] font-black uppercase shadow-lg shadow-primary/20"
                        >
                          INICIAR
                        </button>
                      )}
                      {isAdmin && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmAction('Deseja excluir esta partida permanentemente?', () => {
                              console.log("[LiveMatch] Chamando deleteGame para gameId:", game.id);
                              deleteGame(activeMatch.id, game.id);
                            });
                          }}
                          className="p-2.5 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all ml-1"
                          title="Excluir partida"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-4 flex items-center justify-between">
                    <div className="flex-1 flex flex-col items-center">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight mb-1">{rTeams.teamA}</span>
                      <div className="text-2xl font-black italic">{game.scoreA}</div>
                      <div className="mt-1 space-y-0.5 text-center">
                        {game.events.filter(e => e.teamSide === 'A').map((e, evIdx) => (
                          <div key={evIdx} className="flex items-center space-x-1.5 justify-center">
                            <Circle size={6} className="fill-primary/50 text-primary/50" />
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                              {(() => {
                                const p = players.find(p => p.id === e.playerId);
                                if (!p) return e.isGoalkeeperGoal || e.isGoalkeeperOwnGoal || e.playerId === 'goleiro' ? 'Goleiro' : '';
                                const name = p.displayName || p.name;
                                return p.number !== undefined && p.number !== null ? `${name} (Nº ${p.number})` : name;
                              })()}
                              {e.type === 'OWN_GOAL' && <span className="text-danger ml-0.5">(GC)</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-center px-4 space-y-2">
                       <div className="text-xs font-black text-border/40 italic">VS</div>
                    </div>
                    <div className="flex-1 flex flex-col items-center">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight mb-1">{rTeams.teamB}</span>
                      <div className="text-2xl font-black italic">{game.scoreB}</div>
                      <div className="mt-1 space-y-0.5 text-center">
                        {game.events.filter(e => e.teamSide === 'B').map((e, evIdx) => (
                          <div key={evIdx} className="flex items-center space-x-1.5 justify-center">
                            <Circle size={6} className="fill-primary/50 text-primary/50" />
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                              {(() => {
                                const p = players.find(p => p.id === e.playerId);
                                if (!p) return e.isGoalkeeperGoal || e.isGoalkeeperOwnGoal || e.playerId === 'goleiro' ? 'Goleiro' : '';
                                const name = p.displayName || p.name;
                                return p.number !== undefined && p.number !== null ? `${name} (Nº ${p.number})` : name;
                              })()}
                              {e.type === 'OWN_GOAL' && <span className="text-danger ml-0.5">(GC)</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {game.bandeiras_ids && game.bandeiras_ids.length > 0 && (
                    <div className="px-4 py-2 border-t border-white/5 bg-white/[0.01] flex items-center justify-center space-x-2">
                      <span className="text-[10px] font-black uppercase text-amber-500 tracking-widest flex items-center shrink-0">
                        🚩 Bandeiras:
                      </span>
                      <div className="flex items-center gap-1.5 flex-row flex-nowrap overflow-x-auto scroller-none min-w-0 pr-1 py-0.5">
                        {game.bandeiras_ids.map(id => {
                          const p = players.find(p => p.id === id);
                          if (!p) return null;
                          const name = p.displayName || p.name;
                          const truncated = name.length > 10 ? name.slice(0, 10).trim() + '.' : name;
                          return (
                            <span key={id} className="text-[10px] font-bold text-gray-400 bg-white/[0.03] px-1.5 py-0.5 rounded leading-none shrink-0 border border-white/5 uppercase whitespace-nowrap">
                              {truncated}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>



      {/* Modal de Substituição/Edição */}
      {typeof document !== 'undefined' && createPortal(
        <>
          {(editingGame || editingTeamIndex !== null) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-2xl bg-card border border-border rounded-[2.5rem] shadow-2xl relative max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between p-8 pb-4">
              <div>
                <h3 className="text-xl font-bold uppercase italic tracking-tighter">
                  {editingGame ? 'Editar Escalação' : `Editar Equipe ${editingTeamIndex! + 1}`}
                </h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Ajuste os jogadores</p>
              </div>
              <button 
                onClick={() => {
                  setEditingGame(null);
                  setEditingTeamIndex(null);
                  setSwapTarget(null);
                }} 
                className="p-3 bg-white/5 rounded-2xl text-gray-400 hover:text-white"
              >
                <Plus className="rotate-45" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 pt-0 custom-scrollbar">
              <div className="grid grid-cols-1 gap-8">
               {editingGame ? (() => {
                 const edTeams = getGameTeamNames(editingGame, { A: 'Time Preto', B: 'Time Branco' });
                 return (
                   <>
                     <div className="space-y-4">
                       <h4 className="text-xs font-black uppercase text-primary tracking-widest">{edTeams.teamA}</h4>
                       <div className="space-y-2">
                         {(editingGame.teamA_ids || []).map((id) => (
                           <div key={id} className="flex items-center gap-2 group">
                             <button 
                               onClick={() => setSwapTarget({ type: 'PLAYER', teamSide: 'A', replacedPlayerId: id, mode: 'SWAP' })}
                               className={`flex-1 p-4 bg-bg border rounded-2xl text-left flex items-center justify-between ${swapTarget?.replacedPlayerId === id && swapTarget?.teamSide === 'A' && swapTarget.mode === 'SWAP' ? 'border-primary' : 'border-border'}`}
                             >
                               <span className="text-sm font-bold truncate">
                                 {(() => {
                                   const p = players.find(p => p.id === id);
                                   if (!p) return 'Vazio';
                                   const name = p.displayName || p.name;
                                   return p.number !== undefined && p.number !== null ? `${name} (Nº ${p.number})` : name;
                                 })()}
                               </span>
                               <Edit2 size={12} className="text-gray-500" />
                             </button>
                             <button 
                               onClick={() => handleRemovePlayerFromTeam(id)}
                               className="p-4 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                             >
                               <Trash2 size={16} />
                             </button>
                           </div>
                         ))}
                         <button 
                           onClick={() => setSwapTarget({ type: 'PLAYER', teamSide: 'A', mode: 'ADD' })}
                           className={`w-full p-4 border border-dashed rounded-2xl flex items-center justify-center space-x-2 text-gray-500 hover:text-white hover:border-white/50 transition-all ${swapTarget?.mode === 'ADD' && swapTarget?.teamSide === 'A' ? 'border-primary text-primary' : 'border-border'}`}
                         >
                           <Plus size={16} />
                           <span className="text-xs font-bold uppercase tracking-widest">Adicionar Man.</span>
                         </button>
                         {topWaitingPlayer && (
                            <button
                              onClick={() => handleQuickAddNext(topWaitingPlayer.id, 'A')}
                              className="w-full p-4 bg-primary/10 border border-primary/30 rounded-2xl flex items-center justify-between text-left hover:bg-primary/20 hover:border-primary/50 transition-all group mt-2"
                            >
                              <div className="flex flex-col">
                                <span className="text-xs text-primary font-bold uppercase tracking-widest mb-1 flex items-center space-x-1">
                                  <span>Da Fila</span>
                                </span>
                                <span className="text-sm font-bold text-white truncate">
                                  {topWaitingPlayer.displayName || topWaitingPlayer.name}
                                </span>
                              </div>
                              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                <Plus size={16} className="text-primary" />
                              </div>
                            </button>
                          )}
                       </div>
                     </div>
                     <div className="space-y-4">
                       <h4 className="text-xs font-black uppercase text-white tracking-widest">{edTeams.teamB}</h4>
                       <div className="space-y-2">
                         {(editingGame.teamB_ids || []).map((id) => (
                           <div key={id} className="flex items-center gap-2 group">
                             <button 
                               onClick={() => setSwapTarget({ type: 'PLAYER', teamSide: 'B', replacedPlayerId: id, mode: 'SWAP' })}
                               className={`flex-1 p-4 bg-bg border rounded-2xl text-left flex items-center justify-between ${swapTarget?.replacedPlayerId === id && swapTarget?.teamSide === 'B' && swapTarget.mode === 'SWAP' ? 'border-white' : 'border-border'}`}
                             >
                               <span className="text-sm font-bold truncate">
                                 {(() => {
                                   const p = players.find(p => p.id === id);
                                   if (!p) return 'Vazio';
                                   const name = p.displayName || p.name;
                                   return p.number !== undefined && p.number !== null ? `${name} (Nº ${p.number})` : name;
                                 })()}
                               </span>
                               <Edit2 size={12} className="text-gray-500" />
                             </button>
                             <button 
                               onClick={() => handleRemovePlayerFromTeam(id)}
                               className="p-4 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                             >
                               <Trash2 size={16} />
                             </button>
                           </div>
                         ))}
                         <button 
                           onClick={() => setSwapTarget({ type: 'PLAYER', teamSide: 'B', mode: 'ADD' })}
                           className={`w-full p-4 border border-dashed rounded-2xl flex items-center justify-center space-x-2 text-gray-500 hover:text-white hover:border-white/50 transition-all ${swapTarget?.mode === 'ADD' && swapTarget?.teamSide === 'B' ? 'border-white text-white' : 'border-border'}`}
                         >
                           <Plus size={16} />
                           <span className="text-xs font-bold uppercase tracking-widest">Adicionar Man.</span>
                         </button>
                         {topWaitingPlayer && (
                            <button
                              onClick={() => handleQuickAddNext(topWaitingPlayer.id, 'B')}
                              className="w-full p-4 bg-white/5 border border-white/20 rounded-2xl flex items-center justify-between text-left hover:bg-white/10 hover:border-white/40 transition-all group mt-2"
                            >
                              <div className="flex flex-col">
                                <span className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1 flex items-center space-x-1">
                                  <span>Da Fila</span>
                                </span>
                                <span className="text-sm font-bold text-white truncate">
                                  {topWaitingPlayer.displayName || topWaitingPlayer.name}
                                </span>
                              </div>
                              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                <Plus size={16} className="text-white" />
                              </div>
                            </button>
                          )}
                       </div>
                     </div>
                   </>
                 );
               })() : (
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase text-primary tracking-widest">Membros da Equipe</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {(activeMatch.teams?.[String(editingTeamIndex!)] || []).map((id) => (
                      <div key={id} className="flex items-center gap-2 group">
                        <button 
                          onClick={() => setSwapTarget({ type: 'PLAYER', teamSide: 'A', replacedPlayerId: id, mode: 'SWAP' })}
                          className={`flex-1 p-4 bg-bg border rounded-2xl text-left flex items-center justify-between ${swapTarget?.replacedPlayerId === id && swapTarget.mode === 'SWAP' ? 'border-primary' : 'border-border'}`}
                        >
                          <span className="text-sm font-bold truncate">{(() => {
                            const p = players.find(player => player.id === id);
                            if (!p) return 'Vazio';
                            const name = p.displayName || p.name;
                            return p.number !== undefined && p.number !== null ? `${name} (Nº ${p.number})` : name;
                          })()}</span>
                          <Edit2 size={12} className="text-gray-500" />
                        </button>
                        <button 
                          onClick={() => handleRemovePlayerFromTeam(id)}
                          className="p-4 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {topWaitingPlayer && (
                      <button
                        onClick={() => handleQuickAddNext(topWaitingPlayer.id)}
                        className="w-full p-4 bg-primary/10 border border-primary/30 rounded-2xl flex items-center justify-between text-left hover:bg-primary/20 hover:border-primary/50 transition-all group"
                      >
                        <div className="flex flex-col">
                          <span className="text-xs text-primary font-bold uppercase tracking-widest mb-1 flex items-center space-x-1">
                            <span>Da Fila</span>
                          </span>
                          <span className="text-sm font-bold text-white truncate">
                            {topWaitingPlayer.displayName || topWaitingPlayer.name}
                          </span>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                          <Plus size={16} className="text-primary" />
                        </div>
                      </button>
                    )}
                    <button 
                      onClick={() => setSwapTarget({ type: 'PLAYER', teamSide: 'A', mode: 'ADD' })}
                      className={`w-full p-4 border border-dashed rounded-2xl flex items-center justify-center space-x-2 text-gray-500 hover:text-white hover:border-white/50 transition-all ${swapTarget?.mode === 'ADD' ? 'border-primary text-primary' : 'border-border'}`}
                    >
                      <Plus size={16} />
                      <span className="text-xs font-bold uppercase tracking-widest">Adicionar Manualmente</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
            
            {/* Modal de Seleção de Jogador (Window Overlay) */}
            <AnimatePresence>
              {swapTarget && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                >
                  <motion.div 
                    initial={{ y: 20 }}
                    animate={{ y: 0 }}
                    className="w-full max-w-lg bg-card border border-primary/20 rounded-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
                  >
                    <div className="flex items-center justify-between p-8 pb-4">
                      <div>
                        <h4 className="text-lg font-black uppercase italic tracking-tighter text-primary">
                          {swapTarget.mode === 'ADD' ? 'Adicionar Jogador' : 'Substituir Jogador'}
                        </h4>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                          Escolha um atleta disponível abaixo
                        </p>
                      </div>
                      <button 
                        onClick={() => setSwapTarget(null)} 
                        className="p-3 bg-white/5 rounded-2xl text-gray-400 hover:text-white"
                      >
                        <Plus className="rotate-45" />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 pt-0 custom-scrollbar">
                      <div className="space-y-6 pb-6">
                        {(() => {
                          const confirmedIds = activeMatch.confirmedIds || [];
                          const activePlayers = players.filter(p => p.active);
                          const confirmed = activePlayers.filter(p => confirmedIds.includes(p.id));
                          const lateArrivals = activePlayers.filter(p => !confirmedIds.includes(p.id));
                          
                          const filterAlreadyInTeam = (list: Player[]) => list.filter(p => {
                            if (editingGame) {
                              return !editingGame.teamA_ids.includes(p.id) && !editingGame.teamB_ids.includes(p.id);
                            }
                            
                            // Se houver uma partida em andamento, ocultar os jogadores que já estão jogando no campo!
                            if (liveGame && liveGame.status === 'RUNNING') {
                              const liveA = liveGame.teamA_ids || [];
                              const liveB = liveGame.teamB_ids || [];
                              if (liveA.includes(p.id) || liveB.includes(p.id)) {
                                return false;
                              }
                            }

                            const teamKey = String(editingTeamIndex);
                            const currentTeam = activeMatch.teams?.[teamKey] || [];
                            return !currentTeam.includes(p.id);
                          });

                          const availableConfirmed = filterAlreadyInTeam(confirmed);
                          const availableLate = filterAlreadyInTeam(lateArrivals);

                          // Separate confirmed into "In other teams" and "On bench"
                          const inOtherTeams: Player[] = [];
                          const onBench: Player[] = [];

                          availableConfirmed.forEach(p => {
                            let found = false;
                            const teams = activeMatch.teams || {};
                            const currentTeamKey = editingTeamIndex !== null ? String(editingTeamIndex) : null;
                            Object.entries(teams).forEach(([key, teamIds]: [string, any]) => {
                              if (currentTeamKey !== null && key === currentTeamKey) return;
                              if (Array.isArray(teamIds) && teamIds.includes(p.id)) found = true;
                            });
                            if (found) inOtherTeams.push(p);
                            else onBench.push(p);
                          });

                          const renderPlayerButton = (p: Player, type: 'BENCH' | 'OTHER' | 'LATE', queueIndex?: number) => {
                            const borderColor = type === 'LATE' ? 'border-warning/30' : 'border-primary/30';
                            const textColor = type === 'LATE' ? 'text-warning' : 'text-primary';
                            
                            let tag = 'Banco';
                            if (type === 'LATE') {
                              tag = 'Fora';
                            } else if (type === 'OTHER') {
                              tag = 'Equipe';
                              if (activeMatch.teams) {
                                const foundEntry = Object.entries(activeMatch.teams).find(([_, ids]) => (ids as string[] || []).includes(p.id));
                                if (foundEntry) {
                                  tag = `Equipe ${Number(foundEntry[0]) + 1}`;
                                }
                              }
                            }

                            return (
                              <button 
                                key={p.id}
                                onClick={() => handleSelectPlayerForTeam(p.id)}
                                className={`p-4 bg-white/5 border ${borderColor} rounded-2xl text-[10px] font-bold uppercase text-left hover:border-primary transition-all group relative overflow-hidden`}
                              >
                                <div className="relative z-10 flex items-center justify-between">
                                  <div className="flex flex-col">
                                    <span className="truncate text-white text-xs">
                                      {p.displayName || p.name}
                                      {p.number !== undefined && p.number !== null ? ` (Nº ${p.number})` : ''}
                                    </span>
                                    <span className={`text-[10px] opacity-70 mt-0.5 ${textColor}`}>
                                      {queueIndex !== undefined ? `Fila #${queueIndex + 1} • ` : ''}
                                      {tag} • {formatPosition(p.position)}
                                    </span>
                                  </div>
                                  <div className="flex items-center space-x-2 flex-shrink-0">
                                    {queueIndex !== undefined && (
                                      <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded font-black whitespace-nowrap">
                                        Fila #{queueIndex + 1}
                                      </span>
                                    )}
                                    <Plus size={14} className="text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                </div>
                                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>
                            );
                          };

                          const isLiveRunning = liveGame && liveGame.status === 'RUNNING';

                          return (
                            <div className="space-y-8">
                              {/* Se houver partida em andamento, mostra a sequência de entrada dos jogadores de fora */}
                              {isLiveRunning && (
                                <div className="space-y-4">
                                  <div className="flex items-center space-x-2 text-primary">
                                    <ArrowRight size={16} />
                                    <h4 className="text-xs font-black uppercase tracking-widest italic">Sequência de Entrada (Jogadores de Fora)</h4>
                                  </div>
                                  
                                  {(() => {
                                    const currentTeamKey = editingTeamIndex !== null ? String(editingTeamIndex) : null;
                                    const currentTeam = currentTeamKey !== null ? (activeMatch.teams?.[currentTeamKey] || []) : [];
                                    
                                    // Map playerQueue to Player objects and exclude any player already in the current team
                                    const waitersToShow = playerQueue
                                      .map(id => players.find(p => p.id === id))
                                      .filter((p): p is Player => !!p && !currentTeam.includes(p.id));

                                    if (waitersToShow.length === 0) {
                                      return (
                                        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider italic p-2">Nenhum jogador na fila de espera</p>
                                      );
                                    }

                                    return (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {waitersToShow.map((p, index) => {
                                          let type: 'BENCH' | 'OTHER' = 'BENCH';
                                          const teams = activeMatch.teams || {};
                                          let found = false;
                                          Object.entries(teams).forEach(([key, teamIds]: [string, any]) => {
                                            if (currentTeamKey !== null && key === currentTeamKey) return;
                                            if (Array.isArray(teamIds) && teamIds.includes(p.id)) found = true;
                                          });
                                          if (found) type = 'OTHER';

                                          return renderPlayerButton(p, type, index);
                                        })}
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}

                              {/* Se NÃO houver partida em andamento, mostra as categorias padrões */}
                              {!isLiveRunning && onBench.length === 0 && inOtherTeams.length === 0 && availableLate.length === 0 && (
                                <div className="py-12 text-center space-y-2">
                                  <User size={48} className="mx-auto text-gray-600 opacity-20" />
                                  <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Nenhum jogador disponível</p>
                                  <p className="text-xs text-gray-600">Verifique se há atletas ativos cadastrados.</p>
                                </div>
                              )}

                              {!isLiveRunning && onBench.length > 0 && (
                                <div className="space-y-3">
                                  <h4 className="text-[10px] font-black uppercase tracking-widest text-primary/70 ml-1">Disponíveis no Banco</h4>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {onBench.sort((a, b) => comparePlayersByWaitTime(a.id, b.id)).map(p => renderPlayerButton(p, 'BENCH'))}
                                  </div>
                                </div>
                              )}

                              {!isLiveRunning && inOtherTeams.length > 0 && (
                                <div className="space-y-3">
                                  <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400/70 ml-1">Vindos de Outras Equipes</h4>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {inOtherTeams.sort((a, b) => comparePlayersByWaitTime(a.id, b.id)).map(p => renderPlayerButton(p, 'OTHER'))}
                                  </div>
                                </div>
                              )}

                              {availableLate.length > 0 && (
                                <div className="space-y-3">
                                  <h4 className="text-[10px] font-black uppercase tracking-widest text-warning/70 ml-1">Fora da Pelada</h4>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {availableLate.sort((a, b) => comparePlayersByWaitTime(a.id, b.id)).map(p => renderPlayerButton(p, 'LATE'))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
      {/* MODALS */}
      <AnimatePresence>
      </AnimatePresence>

      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-lg bg-card border border-border rounded-[2.5rem] p-8 space-y-6 shadow-2xl relative max-h-[95vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${showEventModal.teamSide === 'A' ? 'bg-primary text-bg' : 'bg-white text-bg'}`}>
                  <Circle size={24} strokeWidth={2.5} className="fill-current" />
                </div>
                <div>
                  <h3 className="text-xl font-bold uppercase italic leading-none">
                    {showEventModal.editIdx !== undefined ? 'Editar Gol' : 'Registrar Gol'}
                  </h3>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                    {showEventModal.teamSide === 'A' 
                      ? `${liveTeamNames.teamA} - Boleiros` 
                      : `${liveTeamNames.teamB} - Convidados`}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowEventModal(null);
                  setIsGoalkeeperEvent(false);
                  setIsOwnGoal(false);
                }} 
                className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors"
              >
                <Plus className="rotate-45 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between bg-bg p-4 rounded-2xl border border-border">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-gray-300">GOL CONTRA?</span>
                </div>
                <button
                  onClick={() => {
                    setIsOwnGoal(!isOwnGoal);
                    setSelectedAssister('');
                  }}
                  className={`w-12 h-6 rounded-full transition-all relative ${isOwnGoal ? 'bg-danger' : 'bg-gray-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isOwnGoal ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between bg-bg p-4 rounded-2xl border border-border">
                <div className="flex flex-col text-left">
                  <span className="text-xs font-bold text-gray-300">GOL DE GOLEIRO?</span>
                  <span className="text-[9px] text-gray-500 font-bold uppercase tracking-tight">Não conta para estatísticas do ranking</span>
                </div>
                <button
                  onClick={() => {
                    const nextVal = !isGoalkeeperEvent;
                    setIsGoalkeeperEvent(nextVal);
                    if (nextVal) {
                      setSelectedScorer('');
                    }
                  }}
                  className={`w-12 h-6 rounded-full transition-all relative ${isGoalkeeperEvent ? 'bg-amber-500' : 'bg-gray-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isGoalkeeperEvent ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              {!isGoalkeeperEvent && (
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">
                    {isOwnGoal ? 'Quem marcou contra?' : 'Quem marcou?'} *
                  </label>
                  <select 
                    value={selectedScorer}
                    onChange={(e) => setSelectedScorer(e.target.value)}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-bold text-white"
                  >
                    <option value="" className="bg-bg">Selecione o jogador</option>
                    {(() => {
                      const availablePlayers = showEventModal.teamSide === 'A' ? teamAPlayers : teamBPlayers;
                      
                      if (availablePlayers.length === 0) {
                        return <option disabled className="bg-bg italic">Nenhum jogador encontrado neste time</option>;
                      }
                      
                      return availablePlayers.map(p => {
                        const suffix = p.number !== undefined && p.number !== null ? ` (Nº ${p.number})` : '';
                        return (
                          <option key={p.id} value={p.id} className="bg-bg">
                            {(p.displayName || p.name) + suffix}
                          </option>
                        );
                      });
                    })()}
                  </select>
                </div>
              )}

              {!isOwnGoal && !isGoalkeeperEvent && (
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Assistência (Opcional)</label>
                  <select 
                    value={selectedAssister}
                    onChange={(e) => setSelectedAssister(e.target.value)}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-bold text-white"
                  >
                    <option value="" className="bg-bg">Ninguém</option>
                    {(() => {
                      const availableAssisters = (showEventModal.teamSide === 'A' ? teamAPlayers : teamBPlayers)
                        .filter(p => p.id !== selectedScorer);
                      
                      return availableAssisters.map(p => {
                        const suffix = p.number !== undefined && p.number !== null ? ` (Nº ${p.number})` : '';
                        return (
                          <option key={p.id} value={p.id} className="bg-bg">
                            {(p.displayName || p.name) + suffix}
                          </option>
                        );
                      });
                    })()}
                  </select>
                </div>
              )}

              <button 
                disabled={(!isGoalkeeperEvent && !selectedScorer) || submitting}
                onClick={handleAddGoal}
                className="w-full py-4 bg-primary text-bg rounded-2xl font-black uppercase tracking-widest disabled:opacity-50 transition-all flex items-center justify-center space-x-2"
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>{showEventModal.editIdx !== undefined ? 'Salvar Alteração' : `Confirmar Gol ${isOwnGoal ? 'Contra' : ''}`}</span>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal de Confirmação */}
      {confirmState && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-sm bg-card border border-border rounded-[2.5rem] p-6 shadow-2xl relative"
          >
            <h3 className="text-xl font-black uppercase text-white mb-4">Confirmar Ação</h3>
            <p className="text-sm font-bold text-gray-400 mb-8 whitespace-pre-wrap">{confirmState.message}</p>
            <div className="flex gap-4">
              <button onClick={() => setConfirmState(null)} className="flex-1 p-4 rounded-2xl bg-white/5 font-bold hover:bg-white/10 transition-all text-white">Cancelar</button>
              <button 
                onClick={() => {
                  confirmState.onConfirm();
                  setConfirmState(null);
                }} 
                className="flex-1 p-4 rounded-2xl bg-red-500 text-white font-black hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
              >
                Confirmar
              </button>
            </div>
          </motion.div>
        </div>
      )}
        </>,
        document.body
      )}

      {/* FINALIZAR RODADA (End of page) */}
      {isAdmin && activeMatch && (
        <div className="pt-12 px-2">
          <div className="bg-danger/5 border border-danger/20 rounded-[2.5rem] p-8 space-y-4 text-center">
            <div className="w-16 h-16 bg-danger/10 text-danger rounded-full flex items-center justify-center mx-auto mb-2">
              <Square size={32} fill="currentColor" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-black uppercase italic tracking-tighter text-danger">Finalizar Rodada</h3>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest max-w-[240px] mx-auto leading-relaxed">
                Encerre todas as atividades de hoje para que os dados sejam compilados no Ranking da Rodada.
              </p>
            </div>

            <div className="pt-4 max-w-xs mx-auto">
              {finishStatus.text && finishStatus.type !== 'idle' && (
                <div className={`mb-4 p-3 rounded-xl text-center font-bold text-[10px] animate-in slide-in-from-top-2 ${
                  finishStatus.type === 'error' ? 'bg-danger/20 text-danger border border-danger/30' :
                  finishStatus.type === 'success' ? 'bg-success/20 text-success border border-success/30' :
                  'bg-primary/20 text-primary border border-primary/30'
                }`}>
                  {finishStatus.text}
                </div>
              )}

              {showConfirmFinishRound ? (
                <div className="flex space-x-2 animate-in zoom-in-95 duration-200">
                  <button 
                    onClick={() => setShowConfirmFinishRound(false)}
                    disabled={isFinishing}
                    className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase"
                  >
                    Voltar
                  </button>
                  <button 
                    onClick={handleFinishRound}
                    disabled={isFinishing}
                    className="flex-[2] py-4 bg-danger text-white rounded-2xl text-[10px] font-black uppercase shadow-xl shadow-danger/20 active:scale-95 transition-all"
                  >
                    Confirmar Encerramento
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => setShowConfirmFinishRound(true)}
                  disabled={isFinishing}
                  className="w-full py-5 bg-danger text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] flex items-center justify-center space-x-3 shadow-xl shadow-danger/20 hover:bg-danger/90 active:scale-95 transition-all"
                >
                  <Trophy size={18} fill="currentColor" />
                  <span>Finalizar Rodada de Hoje</span>
                </button>
              )}
            </div>
            <p className="text-[10px] font-bold text-gray-600 uppercase tracking-tighter italic">
              * A rodada também será encerrada automaticamente às 23:59 de hoje.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
