import React, { useState, useEffect, useMemo } from 'react';
import { usePelada, Player, Game } from '../hooks/usePelada';
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
    deleteGame,
    pauseGame,
    resumeGame,
    deleteMatch
  } = usePelada();
  const { role, user } = useAuth();
  const isAdmin = role === 'ADMIN' || user?.email?.trim().toLowerCase() === 'ramonbelem1@gmail.com';

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
  
  // New state for scheduling and editing
  const [scheduledTeamA, setScheduledTeamA] = useState<string>('0');
  const [scheduledTeamB, setScheduledTeamB] = useState<string>('1');

  // 1. Get finished games of the match, ordered chronologically (oldest to newest)
  const finishedGames = useMemo(() => {
    return [...activeGames]
      .filter((g) => g.status === 'FINISHED')
      .reverse();
  }, [activeGames]);

  // 2. Identify the number of teams
  const teamsCount = Object.keys(activeMatch?.teams || {}).length;

  // 3. Compute suggested active state and waiting queue
  const queueState = useMemo(() => {
    if (!activeMatch?.teams || teamsCount < 2) {
      return { onField: [] as number[], queue: [] as number[], suggested: [] as number[] };
    }

    const getTeamIndexLocal = (teamIds: string[] | undefined): number => {
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
      const teamA = getTeamIndexLocal(game.teamA_ids);
      const teamB = getTeamIndexLocal(game.teamB_ids);
      return { teamA, teamB, scoreA: game.scoreA ?? 0, scoreB: game.scoreB ?? 0 };
    });

    // Determine who is currently on the field
    let currentOnField: number[] = [];
    if (liveGame) {
      const idxA = getTeamIndexLocal(liveGame.teamA_ids);
      const idxB = getTeamIndexLocal(liveGame.teamB_ids);
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
      // No games played yet -> Time 1 and Time 2 start
      currentOnField = [0, 1];
    }

    // Find the index of the most recent finished game where each team played (newest to oldest index)
    const lastPlayedIndices: Record<number, number> = {};
    const gamesPlayedCount: Record<number, number> = {};
    for (let i = 0; i < teamsCount; i++) {
      lastPlayedIndices[i] = -1;
      gamesPlayedCount[i] = 0;
    }

    gameTeams.forEach((gg, gameIdx) => {
      if (gg.teamA !== -1) {
        lastPlayedIndices[gg.teamA] = gameIdx;
        gamesPlayedCount[gg.teamA]++;
      }
      if (gg.teamB !== -1) {
        lastPlayedIndices[gg.teamB] = gameIdx;
        gamesPlayedCount[gg.teamB]++;
      }
    });

    // Build the wait list of all teams not currently on the field
    const waitingTeams: number[] = [];
    const onFieldIndices = new Set(currentOnField);
    for (let i = 0; i < teamsCount; i++) {
      if (!onFieldIndices.has(i)) {
        waitingTeams.push(i);
      }
    }

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
        suggested = [0, 1];
      }
    }

    return {
      onField: currentOnField,
      queue: waitingTeams,
      suggested
    };
  }, [finishedGames, activeMatch?.teams, teamsCount, liveGame]);

  // 4. Auto-update scheduledTeamA and scheduledTeamB to match suggestions by default
  useEffect(() => {
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
  }, [queueState.suggested, queueState.queue]);
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
    return getGameTeamNames(liveGame, { A: 'Time A', B: 'Time B' });
  }, [liveGame, activeMatch?.teams]);

  const handleAddGoal = async () => {
    console.log("[LiveMatch] handleAddGoal called", { liveGame: liveGame?.id, showEventModal, selectedScorer, isOwnGoal });
    if (!liveGame || !activeMatch || !showEventModal || !selectedScorer || submitting) {
      console.log("[LiveMatch] handleAddGoal aborted: preconditions not met");
      return;
    }

    setSubmitting(true);
    try {
      if (showEventModal.editIdx !== undefined) {
        await updateGameEvent(activeMatch.id, liveGame.id, showEventModal.editIdx, {
          playerId: selectedScorer,
          assistId: isOwnGoal ? undefined : (selectedAssister || undefined),
          type: isOwnGoal ? 'OWN_GOAL' : 'GOAL'
        });
      } else {
        await addGameEvent(activeMatch.id, liveGame.id, {
          type: isOwnGoal ? 'OWN_GOAL' : 'GOAL',
          playerId: selectedScorer,
          assistId: isOwnGoal ? undefined : (selectedAssister || undefined),
          teamSide: showEventModal.teamSide
        });
      }

      setShowEventModal(null);
      setSelectedScorer('');
      setSelectedAssister('');
      setIsOwnGoal(false);
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

    confirmAction('Remover jogador do time e reorganizar os times sequencialmente?', async () => {
      const getTeamIndexLocal = (teamIds: string[] | undefined): number => {
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
      
      // Step 1: Collect original sizes and linear sequence of player registrations
      const teamSizes: Record<string, number> = {};
      const allTeamPlayers: string[] = [];
      for (const k of sortedKeys) {
        const keyStr = String(k);
        const playersInTeam = currentTeams[keyStr] || [];
        teamSizes[keyStr] = playersInTeam.length;
        allTeamPlayers.push(...playersInTeam);
      }

      // Step 2: Extract the designated player
      const remainingPlayers = allTeamPlayers.filter(id => id !== playerId);

      // Step 3: Redistribute according to original sizes
      const newTeams: Record<string, string[]> = {};
      let playerPointer = 0;
      for (const k of sortedKeys) {
        const keyStr = String(k);
        const originalSize = teamSizes[keyStr] || 0;
        const teamPlayers = remainingPlayers.slice(playerPointer, playerPointer + originalSize);
        newTeams[keyStr] = teamPlayers;
        playerPointer += originalSize;
      }

      // Step 4: Detect active game team indexes based on maximum overlap before shifting
      let liveGameTeamAKey: string | null = null;
      let liveGameTeamBKey: string | null = null;
      if (liveGame) {
        const idxA = getTeamIndexLocal(liveGame.teamA_ids);
        const idxB = getTeamIndexLocal(liveGame.teamB_ids);
        if (idxA !== -1) liveGameTeamAKey = String(idxA);
        if (idxB !== -1) liveGameTeamBKey = String(idxB);
      }

      // Step 5: Detect editing game team indexes if currently editing inside modal
      let editingGameTeamAKey: string | null = null;
      let editingGameTeamBKey: string | null = null;
      if (editingGame) {
        const idxA = getTeamIndexLocal(editingGame.teamA_ids);
        const idxB = getTeamIndexLocal(editingGame.teamB_ids);
        if (idxA !== -1) editingGameTeamAKey = String(idxA);
        if (idxB !== -1) editingGameTeamBKey = String(idxB);
      }

      try {
        // Redraw static matches on DB
        await updateMatch(activeMatch.id, { teams: newTeams });

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
        await updateDoc(doc(db, 'matches', activeMatch.id), {
          [`teams.${teamKey}`]: deleteField()
        });
        console.log("[LiveMatch] Equipe excluída com sucesso");
      } catch (error: any) {
        console.error("Erro ao excluir equipe:", error);
      }
    });
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
      let newTeamA = [...(editingGame.teamA_ids || [])];
      let newTeamB = [...(editingGame.teamB_ids || [])];
      
      if (swapTarget.mode === 'SWAP' && swapTarget.replacedPlayerId !== undefined) {
        if (swapTarget.teamSide === 'A') {
          const idx = newTeamA.indexOf(swapTarget.replacedPlayerId);
          if (idx !== -1) newTeamA[idx] = playerId;
        } else {
          const idx = newTeamB.indexOf(swapTarget.replacedPlayerId);
          if (idx !== -1) newTeamB[idx] = playerId;
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
      let newTeamIds = [...(currentTeams[teamKey] || [])];
      
      if (swapTarget.mode === 'SWAP' && swapTarget.replacedPlayerId !== undefined) {
        const idx = newTeamIds.indexOf(swapTarget.replacedPlayerId);
        if (idx !== -1) newTeamIds[idx] = playerId;
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
    const nextKeyNum = Object.keys(currentTeams).length;
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

  const teamAPlayers = liveGame ? sortPlayersByPosition(liveGame.teamA_ids || []).map(id => players.find(p => p.id === id)!).filter(Boolean) : [];
  const teamBPlayers = liveGame ? sortPlayersByPosition(liveGame.teamB_ids || []).map(id => players.find(p => p.id === id)!).filter(Boolean) : [];

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
      <div className="bg-card/40 border border-border/80 rounded-[2rem] p-5 space-y-4 shadow-xl">
        <div className="flex items-center space-x-2 text-primary">
          <History size={16} />
          <h3 className="text-xs font-black uppercase tracking-widest italic">Sequência de Entrada</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Próximo Jogo */}
          <div className="bg-bg/40 p-3.5 rounded-2xl border border-border/40 space-y-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Sugerido Próximo Confronto</span>
            {liveGame ? (
              <div className="space-y-1.5 py-0.5">
                <div className="flex items-center space-x-2 text-sm font-black text-white">
                  <span className="text-primary italic">Vencedor Jogo Atual</span>
                  <span className="text-[10px] text-gray-500 font-bold uppercase italic">VS</span>
                  <span className="text-blue-400">Time {queueState.queue[0] !== undefined ? queueState.queue[0] + 1 : '?'}</span>
                </div>
                {queueState.queue.length >= 2 && (
                  <div className="flex items-center space-x-1.5 text-[9px] font-bold text-gray-500 uppercase tracking-wider">
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
            <span className="text-[8px] text-gray-500 block font-semibold leading-tight pt-1">
              * Regra: vencedor continua contra o próximo da fila. Nos empates, entram os dois seguintes.
            </span>
          </div>

          {/* Fila de espera */}
          <div className="bg-bg/40 p-3.5 rounded-2xl border border-border/40 space-y-2 font-black">
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Fila de Espera (Mais tempo sem jogar)</span>
            {queueState.queue.length === 0 ? (
              <span className="text-xs font-semibold text-gray-500 block italic py-1">Nenhum time na fila de espera.</span>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5 py-1">
                {queueState.queue.map((teamIdx, index) => (
                  <React.Fragment key={teamIdx}>
                    <span className="px-2.5 py-1 bg-white/[0.04] border border-white/5 rounded-xl text-[10px] font-bold text-gray-300 inline-flex items-center">
                      <span className="text-[8px] text-gray-500 font-bold mr-1">#{index + 1}</span>
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
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
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
          ) : isAdmin ? (
            <>
              {renderQueueSequence()}
              <div className="flex items-center space-x-2 px-2">
                <Play size={18} className="text-primary" />
                <h2 className="text-xl font-black uppercase italic tracking-tighter">Preparar Próxima Partida</h2>
              </div>
              
              <div className="bg-card/50 border border-border p-6 rounded-[2.5rem] space-y-6 shadow-xl">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-2">Time A</label>
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
                    <div className="bg-bg/50 rounded-2xl p-3 space-y-1.5">
                      {activeMatch.teams![scheduledTeamA]?.map(id => {
                        const p = players.find(p => p.id === id);
                        return (
                          <div key={id} className="flex items-center space-x-2">
                            <div className="w-1 h-1 bg-primary rounded-full" />
                            <span className="text-[8px] font-bold text-gray-400 uppercase truncate">{p?.displayName || p?.name || 'Vazio'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-2">Time B</label>
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
                    <div className="bg-bg/50 rounded-2xl p-3 space-y-1.5">
                      {activeMatch.teams![scheduledTeamB]?.map(id => {
                        const p = players.find(p => p.id === id);
                        return (
                          <div key={id} className="flex items-center space-x-2">
                            <div className="w-1 h-1 bg-white/30 rounded-full" />
                            <span className="text-[8px] font-bold text-gray-400 uppercase truncate">{p?.displayName || p?.name || 'Vazio'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button 
                    onClick={() => {
                      const teams = activeMatch.teams!;
                      const nameA = `Time ${Number(scheduledTeamA) + 1}`;
                      const nameB = `Time ${Number(scheduledTeamB) + 1}`;
                      startLiveGame(activeMatch.id, teams[scheduledTeamA], teams[scheduledTeamB], nameA, nameB);
                    }}
                    className="flex-1 py-4 bg-primary text-bg rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center space-x-2 shadow-lg shadow-primary/20"
                  >
                    <Play size={14} fill="currentColor" />
                    <span>Iniciar Agora</span>
                  </button>
                  <button 
                    onClick={() => {
                      const teams = activeMatch.teams!;
                      const nameA = `Time ${Number(scheduledTeamA) + 1}`;
                      const nameB = `Time ${Number(scheduledTeamB) + 1}`;
                      createScheduledGame(activeMatch.id, teams[scheduledTeamA], teams[scheduledTeamB], nameA, nameB);
                    }}
                    className="flex-1 py-4 bg-white/5 border border-border text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center space-x-2 hover:bg-white/10"
                  >
                    <Plus size={14} />
                    <span>Agendar</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-6">
              {renderQueueSequence()}
              <div className="bg-card rounded-[32px] p-10 border border-border/50 text-center space-y-4 shadow-2xl">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto border border-primary/20">
                  <Timer size={40} />
                </div>
                <h2 className="text-2xl font-black italic uppercase tracking-tighter">Sem Jogo em Andamento</h2>
                <p className="text-gray-500 text-sm max-w-[240px] mx-auto font-medium">Aguarde o administrador iniciar a próxima partida para acompanhar em tempo real.</p>
              </div>
            </div>
          )}
        </section>
      ) : (
        <div className="bg-bg min-h-screen -mt-6 -mx-4 pb-20 relative overflow-hidden">
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
                <div className="flex flex-col items-center flex-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">{liveTeamNames.teamA}</span>
                  <div className="text-6xl font-black italic text-white drop-shadow-sm">{liveGame.scoreA}</div>
                </div>

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
                          <span className="text-[8px] font-black uppercase mt-1.5 text-primary tracking-widest">Retomar</span>
                        </button>
                      ) : (
                        <button 
                          onClick={() => pauseGame(activeMatch.id, liveGame.id)}
                          className="flex flex-col items-center group"
                        >
                          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary group-active:scale-95 transition-all">
                            <Pause size={18} fill="currentColor" />
                          </div>
                          <span className="text-[8px] font-black uppercase mt-1.5 text-primary tracking-widest">Pausar</span>
                        </button>
                      )}

                      <button 
                        onClick={() => confirmAction(`Deseja finalizar a partida atual com o placar de ${liveGame.scoreA} x ${liveGame.scoreB}?`, handleFinish)}
                        className="flex flex-col items-center group"
                      >
                        <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-500 group-active:scale-95 transition-all">
                          <Square size={18} fill="currentColor" />
                        </div>
                        <span className="text-[8px] font-black uppercase mt-1.5 text-red-500 tracking-widest">Finalizar</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Score Team B */}
                <div className="flex flex-col items-center flex-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1">{liveTeamNames.teamB}</span>
                  <div className="text-6xl font-black italic text-white drop-shadow-sm">{liveGame.scoreB}</div>
                </div>
              </div>

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
                                <p className="text-[8px] font-bold text-primary/70 uppercase tracking-widest mt-0.5">{playerA.position}</p>
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
                                <p className="text-[8px] font-bold text-blue-400/70 uppercase tracking-widest mt-0.5">{playerB.position}</p>
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

      {/* TODAS AS ESCALAÇÕES (Always visible at bottom) */}
      <div className="space-y-4 pt-8">
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
          {activeMatch.teams && (Object.entries(activeMatch.teams).sort(([a], [b]) => Number(a) - Number(b))).map(([key, teamIds]) => {
            const sortedIds = sortPlayersByPosition(teamIds as string[]);
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
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{sortedIds.length} Atletas</span>
                </div>
                
                <div className="space-y-2">
                  {sortedIds.map((id, pIdx) => {
                    const p = players.find(p => p.id === id);
                    const isGK = p?.position === 'GOLEIRO' || p?.secondaryPosition === 'GOLEIRO';
                    return (
                      <div key={`${id}-${pIdx}`} className="flex items-center justify-between text-[11px] font-bold py-1 border-b border-white/5 last:border-0 group">
                        <div className="flex items-center space-x-2">
                          <span className={`w-8 text-[9px] text-center rounded px-1 group-hover:bg-primary/10 transition-colors ${isGK ? 'bg-primary text-bg' : 'text-gray-500'}`}>
                            {p?.position.substring(0, 3).toUpperCase() || 'POS'}
                          </span>
                          <span className="text-white truncate max-w-[120px]">{p?.displayName || p?.name || 'Desconhecido'}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {isGK && <div className="w-1 h-1 bg-primary rounded-full animate-pulse" />}
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

      {liveGame && renderQueueSequence()}

      {/* Partidas do Dia */}
      <div className="space-y-4">
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
                <span className="text-[9px] font-black uppercase tracking-widest">Excluir Pelada</span>
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
              const rTeams = getGameTeamNames(game, { A: 'Time A', B: 'Time B' });
              return (
                <div key={game.id} className="bg-card rounded-[2.5rem] border border-border/50 overflow-hidden shadow-lg">
                  <div className={`px-4 py-2 flex items-center justify-between ${game.status === 'RUNNING' ? 'bg-primary/10' : game.status === 'SCHEDULED' ? 'bg-yellow-500/10' : 'bg-white/5'}`}>
                    <div className="flex items-center space-x-2">
                      {game.status === 'RUNNING' ? (
                        <div className="flex items-center space-x-1.5">
                          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                          <span className="text-[9px] font-black text-primary uppercase tracking-widest">Em Andamento</span>
                        </div>
                      ) : game.status === 'SCHEDULED' ? (
                        <div className="flex items-center space-x-1.5 text-yellow-500">
                          <Timer size={10} />
                          <span className="text-[9px] font-black uppercase tracking-widest">Agendada</span>
                        </div>
                      ) : (
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Finalizada</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-[9px] font-bold text-gray-500">
                        {game.startTime?.toDate?.().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isAdmin && (game.status === 'RUNNING' || game.status === 'SCHEDULED') && (
                        <button 
                          onClick={() => setEditingGame(game)}
                          className="p-1 px-2 bg-white/5 border border-border/50 rounded-lg text-[8px] font-black uppercase text-white hover:bg-white/10"
                        >
                          EDITAR
                        </button>
                      )}
                      {isAdmin && game.status === 'SCHEDULED' && (
                        <button 
                          onClick={() => startGame(activeMatch.id, game.id)}
                          className="p-1 px-2 bg-primary text-bg rounded-lg text-[8px] font-black uppercase shadow-lg shadow-primary/20"
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
                      <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tight mb-1">{rTeams.teamA}</span>
                      <div className="text-2xl font-black italic">{game.scoreA}</div>
                      <div className="mt-1 space-y-0.5 text-center">
                        {game.events.filter(e => e.teamSide === 'A').map((e, evIdx) => (
                          <div key={evIdx} className="flex items-center space-x-1.5 justify-center">
                            <Circle size={6} className="fill-primary/50 text-primary/50" />
                            <span className="text-[7px] font-bold text-gray-400 uppercase tracking-tighter">
                              {(() => {
                                const p = players.find(p => p.id === e.playerId);
                                return p?.displayName || p?.name;
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
                      <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tight mb-1">{rTeams.teamB}</span>
                      <div className="text-2xl font-black italic">{game.scoreB}</div>
                      <div className="mt-1 space-y-0.5 text-center">
                        {game.events.filter(e => e.teamSide === 'B').map((e, evIdx) => (
                          <div key={evIdx} className="flex items-center space-x-1.5 justify-center">
                            <Circle size={6} className="fill-primary/50 text-primary/50" />
                            <span className="text-[7px] font-bold text-gray-400 uppercase tracking-tighter">
                              {(() => {
                                const p = players.find(p => p.id === e.playerId);
                                return p?.displayName || p?.name;
                              })()}
                              {e.type === 'OWN_GOAL' && <span className="text-danger ml-0.5">(GC)</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>



      {/* Modal de Substituição/Edição */}
      {(editingGame || editingTeamIndex !== null) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-bg/95 backdrop-blur-xl">
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
                 const edTeams = getGameTeamNames(editingGame, { A: 'Time A', B: 'Time B' });
                 return (
                   <>
                     <div className="space-y-4">
                       <h4 className="text-xs font-black uppercase text-primary tracking-widest">{edTeams.teamA}</h4>
                       <div className="space-y-2">
                         {sortPlayersByPosition(editingGame.teamA_ids || []).map((id) => (
                           <div key={id} className="flex items-center gap-2 group">
                             <button 
                               onClick={() => setSwapTarget({ type: 'PLAYER', teamSide: 'A', replacedPlayerId: id, mode: 'SWAP' })}
                               className={`flex-1 p-4 bg-bg border rounded-2xl text-left flex items-center justify-between ${swapTarget?.replacedPlayerId === id && swapTarget?.teamSide === 'A' && swapTarget.mode === 'SWAP' ? 'border-primary' : 'border-border'}`}
                             >
                               <span className="text-sm font-bold truncate">
                                 {(() => {
                                   const p = players.find(p => p.id === id);
                                   return p?.displayName || p?.name || 'Vazio';
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
                           <span className="text-xs font-bold uppercase tracking-widest">Adicionar Jogador</span>
                         </button>
                       </div>
                     </div>
                     <div className="space-y-4">
                       <h4 className="text-xs font-black uppercase text-white tracking-widest">{edTeams.teamB}</h4>
                       <div className="space-y-2">
                         {sortPlayersByPosition(editingGame.teamB_ids || []).map((id) => (
                           <div key={id} className="flex items-center gap-2 group">
                             <button 
                               onClick={() => setSwapTarget({ type: 'PLAYER', teamSide: 'B', replacedPlayerId: id, mode: 'SWAP' })}
                               className={`flex-1 p-4 bg-bg border rounded-2xl text-left flex items-center justify-between ${swapTarget?.replacedPlayerId === id && swapTarget?.teamSide === 'B' && swapTarget.mode === 'SWAP' ? 'border-white' : 'border-border'}`}
                             >
                               <span className="text-sm font-bold truncate">
                                 {(() => {
                                   const p = players.find(p => p.id === id);
                                   return p?.displayName || p?.name || 'Vazio';
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
                           <span className="text-xs font-bold uppercase tracking-widest">Adicionar Jogador</span>
                         </button>
                       </div>
                     </div>
                   </>
                 );
               })() : (
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase text-primary tracking-widest">Membros da Equipe</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {sortPlayersByPosition(activeMatch.teams?.[String(editingTeamIndex!)] || []).map((id) => (
                      <div key={id} className="flex items-center gap-2 group">
                        <button 
                          onClick={() => setSwapTarget({ type: 'PLAYER', teamSide: 'A', replacedPlayerId: id, mode: 'SWAP' })}
                          className={`flex-1 p-4 bg-bg border rounded-2xl text-left flex items-center justify-between ${swapTarget?.replacedPlayerId === id && swapTarget.mode === 'SWAP' ? 'border-primary' : 'border-border'}`}
                        >
                          <span className="text-sm font-bold truncate">{(() => {
                            const p = players.find(player => player.id === id);
                            return p?.displayName || p?.name || 'Vazio';
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
                    <button 
                      onClick={() => setSwapTarget({ type: 'PLAYER', teamSide: 'A', mode: 'ADD' })}
                      className={`w-full p-4 border border-dashed rounded-2xl flex items-center justify-center space-x-2 text-gray-500 hover:text-white hover:border-white/50 transition-all ${swapTarget?.mode === 'ADD' ? 'border-primary text-primary' : 'border-border'}`}
                    >
                      <Plus size={16} />
                      <span className="text-xs font-bold uppercase tracking-widest">Adicionar ao Time</span>
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
                  className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bg/95 backdrop-blur-md"
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
                            Object.values(teams).forEach((teamIds: any) => {
                              if (Array.isArray(teamIds) && teamIds.includes(p.id)) found = true;
                            });
                            if (found) inOtherTeams.push(p);
                            else onBench.push(p);
                          });

                          const renderPlayerButton = (p: Player, type: 'BENCH' | 'OTHER' | 'LATE') => {
                            const borderColor = type === 'LATE' ? 'border-warning/30' : 'border-primary/30';
                            const textColor = type === 'LATE' ? 'text-warning' : 'text-primary';
                            const tag = type === 'OTHER' ? 'Equipe' : type === 'BENCH' ? 'Banco' : 'Atrasado';

                            return (
                              <button 
                                key={p.id}
                                onClick={() => handleSelectPlayerForTeam(p.id)}
                                className={`p-4 bg-white/5 border ${borderColor} rounded-2xl text-[10px] font-bold uppercase text-left hover:border-primary transition-all group relative overflow-hidden`}
                              >
                                <div className="relative z-10 flex items-center justify-between">
                                  <div className="flex flex-col">
                                    <span className="truncate text-white text-xs">{p.displayName || p.name}</span>
                                    <span className={`text-[8px] opacity-70 mt-0.5 ${textColor}`}>{tag} • {p.position}</span>
                                  </div>
                                  <Plus size={14} className="text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>
                            );
                          };

                          return (
                            <div className="space-y-8">
                              {onBench.length === 0 && inOtherTeams.length === 0 && availableLate.length === 0 && (
                                <div className="py-12 text-center space-y-2">
                                  <User size={48} className="mx-auto text-gray-600 opacity-20" />
                                  <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Nenhum jogador disponível</p>
                                  <p className="text-xs text-gray-600">Verifique se há atletas ativos cadastrados.</p>
                                </div>
                              )}

                              {onBench.length > 0 && (
                                <div className="space-y-3">
                                  <h4 className="text-[10px] font-black uppercase tracking-widest text-primary/70 ml-1">Disponíveis no Banco</h4>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {onBench.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name)).map(p => renderPlayerButton(p, 'BENCH'))}
                                  </div>
                                </div>
                              )}

                              {inOtherTeams.length > 0 && (
                                <div className="space-y-3">
                                  <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400/70 ml-1">Vindos de Outras Equipes</h4>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {inOtherTeams.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name)).map(p => renderPlayerButton(p, 'OTHER'))}
                                  </div>
                                </div>
                              )}

                              {availableLate.length > 0 && (
                                <div className="space-y-3">
                                  <h4 className="text-[10px] font-black uppercase tracking-widest text-warning/70 ml-1">Atletas que chegaram agora</h4>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {availableLate.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name)).map(p => renderPlayerButton(p, 'LATE'))}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/90 backdrop-blur-md">
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
              <button onClick={() => setShowEventModal(null)} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors">
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
                    
                    return availablePlayers.map(p => (
                      <option key={p.id} value={p.id} className="bg-bg">{p.displayName || p.name}</option>
                    ));
                  })()}
                </select>
              </div>

              {!isOwnGoal && (
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
                      
                      return availableAssisters.map(p => (
                        <option key={p.id} value={p.id} className="bg-bg">{p.displayName || p.name}</option>
                      ));
                    })()}
                  </select>
                </div>
              )}

              <button 
                disabled={!selectedScorer || submitting}
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bg/95 backdrop-blur-xl">
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
            <p className="text-[9px] font-bold text-gray-600 uppercase tracking-tighter italic">
              * A rodada também será encerrada automaticamente às 23:59 de hoje.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
