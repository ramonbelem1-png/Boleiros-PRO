import React, { useState, useEffect } from 'react';
import { usePelada, Player, Game } from '../hooks/usePelada';
import { useAuth } from './AuthProvider';
import { Play, Pause, Square, Timer, Trophy, User, Plus, History, Circle, Edit, Edit2, Trash2, Star, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../lib/firebase';
import EvaluationDialog from './EvaluationDialog';

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
  
  // New state for scheduling and editing
  const [scheduledTeamA, setScheduledTeamA] = useState<string>('0');
  const [scheduledTeamB, setScheduledTeamB] = useState<string>('1');
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [editingTeamIndex, setEditingTeamIndex] = useState<number | null>(null);
  const [swapTarget, setSwapTarget] = useState<{ type: 'PLAYER' | 'BENCH', teamSide: 'A' | 'B', replacedPlayerId?: string, mode: 'SWAP' | 'ADD' } | null>(null);

  const [isEditingRules, setIsEditingRules] = useState(false);
  const [editPlayersPerTeam, setEditPlayersPerTeam] = useState(6);
  const [savingRules, setSavingRules] = useState(false);
  const [showEvaluation, setShowEvaluation] = useState(false);

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

  const currentTeamA = players.filter(p => liveGame?.teamA_ids.includes(p.id));
  const currentTeamB = players.filter(p => liveGame?.teamB_ids.includes(p.id));

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
      
      // Auto show evaluation for admin too after finishing
      setTimeout(() => {
        setFinishStatus({ type: 'idle', text: '' });
        setShowEvaluation(true);
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

    confirmAction('Remover jogador do time?', async () => {
      if (editingGame) {
      const newTeamA = (editingGame.teamA_ids || []).filter(id => id !== playerId);
      const newTeamB = (editingGame.teamB_ids || []).filter(id => id !== playerId);
      
      try {
        const gameRef = doc(db, 'matches', activeMatch.id, 'games', editingGame.id);
        await updateDoc(gameRef, { 
          teamA_ids: newTeamA,
          teamB_ids: newTeamB 
        });
        setEditingGame({ ...editingGame, teamA_ids: newTeamA, teamB_ids: newTeamB });
      } catch (error: any) {
        console.error("Erro ao remover jogador do jogo:", error);
      }
    } else if (editingTeamIndex !== null) {
      const currentTeams = { ...activeMatch.teams };
      const teamKey = String(editingTeamIndex);
      const newTeamIds = (currentTeams[teamKey] || []).filter(id => id !== playerId);
      
      currentTeams[teamKey] = newTeamIds;
      
      try {
        await updateMatch(activeMatch.id, { teams: currentTeams });
      } catch (error: any) {
        console.error("Erro ao remover jogador do time estático:", error);
      }
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
                      startLiveGame(activeMatch.id, teams[scheduledTeamA], teams[scheduledTeamB]);
                    }}
                    className="flex-1 py-4 bg-primary text-bg rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center space-x-2 shadow-lg shadow-primary/20"
                  >
                    <Play size={14} fill="currentColor" />
                    <span>Iniciar Agora</span>
                  </button>
                  <button 
                    onClick={() => {
                      const teams = activeMatch.teams!;
                      createScheduledGame(activeMatch.id, teams[scheduledTeamA], teams[scheduledTeamB]);
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
            <div className="bg-card rounded-[32px] p-10 border border-border/50 text-center space-y-4 shadow-2xl">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto border border-primary/20">
                <Timer size={40} />
              </div>
              <h2 className="text-2xl font-black italic uppercase tracking-tighter">Sem Jogo em Andamento</h2>
              <p className="text-gray-500 text-sm max-w-[240px] mx-auto font-medium">Aguarde o administrador iniciar a próxima partida para acompanhar em tempo real.</p>
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Placar e Timer */}
          <div className="bg-card rounded-[2.5rem] p-8 border border-border text-center space-y-6 relative overflow-hidden">
            <div className="flex items-center justify-center space-x-6">
              <div className="flex items-center space-x-4">
                <Timer size={16} className="text-primary" />
                <span className={`font-mono text-2xl font-bold tabular-nums ${liveGame.isPaused ? 'text-gray-500' : 'text-primary'}`}>
                  {formatTime(elapsed)}
                </span>
                {isAdmin && (
                  <div className="flex items-center space-x-2 ml-2">
                    {liveGame.isPaused ? (
                      <button 
                        onClick={() => resumeGame(activeMatch.id, liveGame.id)}
                        className="p-2 bg-primary/20 text-primary rounded-xl hover:bg-primary/30 transition-all"
                        title="Retomar Tempo"
                      >
                        <Play size={14} fill="currentColor" />
                      </button>
                    ) : (
                      <button 
                        onClick={() => pauseGame(activeMatch.id, liveGame.id)}
                        className="p-2 bg-yellow-500/20 text-yellow-500 rounded-xl hover:bg-yellow-500/30 transition-all font-bold"
                        title="Pausar Tempo"
                      >
                        <Pause size={14} fill="currentColor" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {isAdmin && (
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => setEditingGame(liveGame)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-white/5 border border-border/50 rounded-xl text-[9px] font-black uppercase text-white/50 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <Edit2 size={12} />
                    <span>Editar Escalação</span>
                  </button>
                  <button 
                    onClick={() => {
                      confirmAction('Deseja excluir esta partida permanentemente?', () => {
                        console.log("[LiveMatch] Chamando deleteGame (Live) para liveGame.id:", liveGame.id);
                        deleteGame(activeMatch.id, liveGame.id);
                      });
                    }}
                    className="p-3 bg-red-500/10 border border-red-500/50 rounded-2xl text-red-500 hover:bg-red-500 hover:text-white transition-all"
                    title="Excluir partida"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex-1 flex flex-col items-center">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">TIME A</span>
                <div className="text-6xl font-black italic mb-4">{liveGame.scoreA}</div>
                
                <div className="space-y-1 mb-6 min-h-[40px]">
                  {liveGame.events.map((e, i) => ({ e, i })).filter(({e}) => e.teamSide === 'A').map(({ e, i }) => (
                    <div key={i} className="group text-[10px] font-bold text-white uppercase tracking-tighter flex items-center justify-center space-x-1">
                      <div className="flex items-center space-x-1">
                        <Circle size={10} className="fill-primary text-primary shrink-0" />
                        <span className="truncate max-w-[150px]">
                          {(() => {
                            const p = players.find(p => p.id === e.playerId);
                            return p?.displayName || p?.name;
                          })()}
                          {e.type === 'OWN_GOAL' && <span className="text-danger ml-1">(GC)</span>}
                        </span>
                      </div>
                      {isAdmin && (
                        <div className="hidden group-hover:flex items-center space-x-1 ml-2">
                          <button 
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setShowEventModal({ type: 'GOAL', teamSide: 'A', editIdx: i });
                              setSelectedScorer(e.playerId);
                              setSelectedAssister(e.assistId || '');
                              setIsOwnGoal(e.type === 'OWN_GOAL');
                            }}
                            className="p-2.5 hover:text-primary bg-primary/10 rounded-xl transition-colors"
                            title="Editar gol"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={(ev) => {
                              ev.stopPropagation();
                              handleRemoveEvent(i);
                            }}
                            className="p-2.5 hover:text-danger bg-danger/10 rounded-xl transition-colors"
                            title="Excluir gol"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {isAdmin && (
                  <button 
                    onClick={() => {
                      setShowEventModal({ type: 'GOAL', teamSide: 'A' });
                      setIsOwnGoal(false);
                    }}
                    className="group flex flex-col items-center justify-center w-16 h-16 rounded-full bg-primary/10 border border-primary/20 hover:bg-primary hover:text-bg transition-all active:scale-95 shadow-lg shadow-primary/10"
                    title="Registrar Gol Time A"
                  >
                    <Plus size={24} className="group-hover:scale-110 transition-transform" />
                    <span className="text-[8px] font-black uppercase mt-0.5">GOL</span>
                  </button>
                )}
              </div>
              
              <div className="px-4 flex flex-col items-center">
                <div className="text-2xl font-black text-border/50 italic mb-10">VS</div>
              </div>

              <div className="flex-1 flex flex-col items-center">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">TIME B</span>
                <div className="text-6xl font-black italic mb-4">{liveGame.scoreB}</div>

                <div className="space-y-1 mb-6 min-h-[40px]">
                  {liveGame.events.map((e, i) => ({ e, i })).filter(({e}) => e.teamSide === 'B').map(({ e, i }) => (
                    <div key={i} className="group text-[10px] font-bold text-white uppercase tracking-tighter flex items-center justify-center space-x-1">
                      <div className="flex items-center space-x-1">
                        <Circle size={10} className="fill-primary text-primary shrink-0" />
                        <span className="truncate max-w-[150px]">
                          {(() => {
                            const p = players.find(p => p.id === e.playerId);
                            return p?.displayName || p?.name;
                          })()}
                          {e.type === 'OWN_GOAL' && <span className="text-danger ml-1">(GC)</span>}
                        </span>
                      </div>
                      {isAdmin && (
                        <div className="hidden group-hover:flex items-center space-x-1 ml-2">
                          <button 
                             onClick={(ev) => {
                              ev.stopPropagation();
                              setShowEventModal({ type: 'GOAL', teamSide: 'B', editIdx: i });
                              setSelectedScorer(e.playerId);
                              setSelectedAssister(e.assistId || '');
                              setIsOwnGoal(e.type === 'OWN_GOAL');
                            }}
                            className="p-2.5 hover:text-primary bg-primary/10 rounded-xl transition-colors"
                            title="Editar gol"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={(ev) => {
                              ev.stopPropagation();
                              handleRemoveEvent(i);
                            }}
                            className="p-2.5 hover:text-danger bg-danger/10 rounded-xl transition-colors"
                            title="Excluir gol"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {isAdmin && (
                  <button 
                    onClick={() => {
                      setShowEventModal({ type: 'GOAL', teamSide: 'B' });
                      setIsOwnGoal(false);
                    }}
                    className="group flex flex-col items-center justify-center w-16 h-16 rounded-full bg-white/5 border border-border/50 hover:bg-white hover:text-bg transition-all active:scale-95 shadow-lg"
                    title="Registrar Gol Time B"
                  >
                    <Plus size={24} className="group-hover:scale-110 transition-transform" />
                    <span className="text-[8px] font-black uppercase mt-0.5">GOL</span>
                  </button>
                )}
              </div>
            </div>

            {/* Finish Button inside Card */}
            {isAdmin && (
              <div className="pt-4 border-t border-border/50">
                {finishStatus.text && (
                  <div className={`mb-4 p-3 rounded-xl text-center font-bold text-[10px] ${
                    finishStatus.type === 'error' ? 'bg-danger/20 text-danger border border-danger/30' :
                    finishStatus.type === 'success' ? 'bg-success/20 text-success border border-success/30' :
                    'bg-primary/20 text-primary border border-primary/30'
                  }`}>
                    {finishStatus.text}
                  </div>
                )}

                {showConfirmFinish ? (
                  <div className="flex space-x-2 animate-in slide-in-from-bottom-2">
                    <button 
                      onClick={() => setShowConfirmFinish(false)}
                      disabled={isFinishing}
                      className="flex-1 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleFinish}
                      disabled={isFinishing}
                      className="flex-1 py-3 bg-red-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-red-600 disabled:opacity-50 shadow-lg shadow-red-500/20"
                    >
                      {isFinishing ? 'Salvando...' : 'Confirmar'}
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setShowConfirmFinish(true)}
                    disabled={isFinishing}
                    className="w-full py-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center space-x-2 hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                  >
                    <Square size={14} fill="currentColor" />
                    <span>Finalizar Partida</span>
                  </button>
                )}
              </div>
            )}

            {!isAdmin && (
               <div className="pt-4 border-t border-border/50">
                <button 
                  onClick={() => setShowEvaluation(true)}
                  className="w-full py-4 bg-primary/10 border border-primary/20 text-primary rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center space-x-2 hover:bg-primary hover:text-bg transition-all"
                >
                  <Star size={14} fill="currentColor" />
                  <span>Avaliar Jogadores</span>
                </button>
              </div>
            )}
          </div>
        </>
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
            activeGames.map((game) => (
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
                    <span className="text-[8px] font-bold text-gray-500 uppercase tracking-tighter mb-1">Time A</span>
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
                    <span className="text-[8px] font-bold text-gray-500 uppercase tracking-tighter mb-1">Time B</span>
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
            ))
          )}
        </div>
      </div>



      {/* Modal de Substituição/Edição */}
      {(editingGame || editingTeamIndex !== null) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-bg/95 backdrop-blur-xl">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-2xl bg-card border border-border rounded-[2.5rem] p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
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

            <div className={`grid ${editingGame ? 'grid-cols-2' : 'grid-cols-1'} gap-8`}>
              {editingGame ? (
                <>
                    <div className="space-y-4">
                      <h4 className="text-xs font-black uppercase text-primary tracking-widest">Time A</h4>
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
                      <h4 className="text-xs font-black uppercase text-white tracking-widest">Time B</h4>
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
              ) : (
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase text-primary tracking-widest">Membros da Equipe</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {sortPlayersByPosition(activeMatch.teams![String(editingTeamIndex!)] || []).map((id) => (
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

            {swapTarget && (
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-3xl space-y-4 animate-in slide-in-from-bottom-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary text-center">
                  {swapTarget.mode === 'ADD' ? 'Selecionar jogador para Adicionar' : 'Selecionar substituto'}
                </p>
                <div className="grid grid-cols-1 gap-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                  {(() => {
                    const confirmedIds = activeMatch.confirmedIds || [];
                    const confirmed = players.filter(p => confirmedIds.includes(p.id));
                    const lateArrivals = players.filter(p => !confirmedIds.includes(p.id));
                    
                    const filterAlreadyInTeam = (list: Player[]) => list.filter(p => {
                      if (editingGame) {
                        return !editingGame.teamA_ids.includes(p.id) && !editingGame.teamB_ids.includes(p.id);
                      }
                      return !activeMatch.teams![String(editingTeamIndex!)].includes(p.id);
                    });

                    const availableConfirmed = filterAlreadyInTeam(confirmed);
                    const availableLate = filterAlreadyInTeam(lateArrivals);

                    // Separate confirmed into "In other teams" and "On bench"
                    const inOtherTeams: Player[] = [];
                    const onBench: Player[] = [];

                    availableConfirmed.forEach(p => {
                      let found = false;
                      Object.values(activeMatch.teams!).forEach((teamIds: any) => {
                        if (teamIds.includes(p.id)) found = true;
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
                          className={`p-3 bg-white/5 border ${borderColor} rounded-xl text-[10px] font-bold uppercase text-left hover:border-primary transition-all group relative overflow-hidden`}
                        >
                          <div className="relative z-10 flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="truncate text-white">{p.displayName || p.name}</span>
                              <span className={`text-[8px] opacity-70 ${textColor}`}>{tag} • {p.position}</span>
                            </div>
                            <Plus size={12} className="text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      );
                    };

                    return (
                      <div className="space-y-6">
                        {onBench.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-primary/70">No Banco</h4>
                            <div className="grid grid-cols-2 gap-2">
                              {onBench.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name)).map(p => renderPlayerButton(p, 'BENCH'))}
                            </div>
                          </div>
                        )}

                        {inOtherTeams.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400/70">Em Outras Equipes</h4>
                            <div className="grid grid-cols-2 gap-2">
                              {inOtherTeams.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name)).map(p => renderPlayerButton(p, 'OTHER'))}
                            </div>
                          </div>
                        )}

                        {availableLate.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-warning/70">Chegaram Atrasados</h4>
                            <div className="grid grid-cols-2 gap-2">
                              {availableLate.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name)).map(p => renderPlayerButton(p, 'LATE'))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
      {/* MODALS */}
      <AnimatePresence>
        {showEvaluation && activeMatch && (
          <EvaluationDialog 
            matchId={activeMatch.id}
            playersToEvaluate={players.filter(p => 
              (liveGame?.teamA_ids.includes(p.id) || liveGame?.teamB_ids.includes(p.id)) && p.active
            )}
            onClose={() => setShowEvaluation(false)}
          />
        )}
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
                    {showEventModal.teamSide === 'A' ? 'Time A - Boleiros' : 'Time B - Convidados'}
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
                    setSelectedScorer('');
                    setSelectedAssister('');
                  }}
                  className={`w-12 h-6 rounded-full transition-all relative ${isOwnGoal ? 'bg-danger' : 'bg-gray-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isOwnGoal ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">
                  {isOwnGoal ? 'Quem marcou contra? (Time Oposto)' : 'Quem marcou?'} *
                </label>
                <select 
                  value={selectedScorer}
                  onChange={(e) => setSelectedScorer(e.target.value)}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-bold text-white"
                >
                  <option value="" className="bg-bg">Selecione o jogador</option>
                  {(() => {
                    const availablePlayers = isOwnGoal 
                      ? (showEventModal.teamSide === 'A' ? teamBPlayers : teamAPlayers)
                      : (showEventModal.teamSide === 'A' ? teamAPlayers : teamBPlayers);
                    
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
