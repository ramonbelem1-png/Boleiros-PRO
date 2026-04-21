import React, { useState, useEffect } from 'react';
import { usePelada, Player } from '../hooks/usePelada';
import { useAuth } from './AuthProvider';
import { Play, Square, Timer, Trophy, User, Plus, History } from 'lucide-react';
import { motion } from 'motion/react';

export default function LiveMatch() {
  const { players, matches, liveGame, startLiveGame, addGameEvent, finishGame } = usePelada();
  const { role } = useAuth();
  const isAdmin = role === 'ADMIN';
  const activeMatch = matches.find(m => m.status === 'OPEN');
  
  const [elapsed, setElapsed] = useState(0);
  const [showEventModal, setShowEventModal] = useState<{ type: 'GOAL'; teamSide: 'A' | 'B' } | null>(null);
  const [selectedScorer, setSelectedScorer] = useState<string>('');
  const [selectedAssister, setSelectedAssister] = useState<string>('');

  useEffect(() => {
    let interval: any;
    if (liveGame && liveGame.status === 'RUNNING') {
      const start = liveGame.startTime?.toDate?.()?.getTime() || Date.now();
      interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(interval);
  }, [liveGame]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const currentTeamA = players.filter(p => liveGame?.teamA_ids.includes(p.id));
  const currentTeamB = players.filter(p => liveGame?.teamB_ids.includes(p.id));

  const handleAddGoal = async () => {
    if (!liveGame || !activeMatch || !showEventModal || !selectedScorer) return;

    await addGameEvent(activeMatch.id, liveGame.id, {
      type: 'GOAL',
      playerId: selectedScorer,
      assistId: selectedAssister || undefined,
      teamSide: showEventModal.teamSide
    });

    setShowEventModal(null);
    setSelectedScorer('');
    setSelectedAssister('');
  };

  const handleFinish = async () => {
    if (!liveGame || !activeMatch) return;
    if (confirm('Finalizar partida e registrar estatísticas?')) {
      await finishGame(activeMatch.id, liveGame.id, {
        scoreA: liveGame.scoreA,
        scoreB: liveGame.scoreB,
        teamA: liveGame.teamA_ids,
        teamB: liveGame.teamB_ids
      });
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

  if (!liveGame) {
    if (!activeMatch.teams || activeMatch.teams.length < 2) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <div className="w-20 h-20 rounded-full bg-card border border-border flex items-center justify-center mb-4">
            <Plus size={32} className="text-gray-500" />
          </div>
          <h3 className="text-xl font-bold">Sorteie os Times Primeiro</h3>
          <p className="text-gray-500 text-sm mt-2">Vá na aba "Sortear" e defina os times para começar um jogo.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-black uppercase italic">Iniciar Jogo</h2>
        <div className="grid grid-cols-1 gap-4">
          {activeMatch.teams.map((teamIds, idx) => (
            <div key={idx} className="bg-card p-4 rounded-3xl border border-border relative overflow-hidden group">
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-bold text-primary uppercase">Time {idx + 1}</span>
                <span className="text-[10px] text-gray-500 font-bold uppercase">{teamIds.length} Jogadores</span>
              </div>
              <div className="flex -space-x-2 overflow-hidden">
                {teamIds.slice(0, 5).map(id => {
                  const p = players.find(p => p.id === id);
                  return (
                    <div key={id} className="inline-block h-8 w-8 rounded-full ring-2 ring-card bg-bg border border-border flex items-center justify-center text-[10px] font-bold">
                      {p?.name.charAt(0)}
                    </div>
                  );
                })}
              </div>
              <button 
                onClick={() => {
                  const nextTeamIdx = (idx + 1) % activeMatch.teams!.length;
                  startLiveGame(activeMatch.id, teamIds, activeMatch.teams![nextTeamIdx]);
                }}
                className="mt-4 w-full py-3 bg-primary text-bg rounded-xl font-bold uppercase text-xs tracking-widest flex items-center justify-center space-x-2"
              >
                <Play size={16} fill="currentColor" />
                <span>Escolher para começar</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const teamAPlayers = players.filter(p => liveGame.teamA_ids.includes(p.id));
  const teamBPlayers = players.filter(p => liveGame.teamB_ids.includes(p.id));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Placar e Timer */}
      <div className="bg-card rounded-[2.5rem] p-8 border border-border text-center space-y-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-primary/20">
          <motion.div 
            className="h-full bg-primary"
            animate={{ scaleX: [0, 1] }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          />
        </div>

        <div className="flex items-center justify-center space-x-4">
          <Timer size={16} className="text-primary animate-pulse" />
          <span className="font-mono text-2xl font-bold tabular-nums text-primary">
            {formatTime(elapsed)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">TIME A</span>
            <div className="text-6xl font-black italic">{liveGame.scoreA}</div>
          </div>
          
          <div className="px-4 text-2xl font-black text-border/50 italic">VS</div>

          <div className="flex-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">TIME B</span>
            <div className="text-6xl font-black italic">{liveGame.scoreB}</div>
          </div>
        </div>

        {isAdmin && (
          <div className="flex gap-4 pt-4">
            <button 
              onClick={() => setShowEventModal({ type: 'GOAL', teamSide: 'A' })}
              className="flex-1 py-4 bg-white/5 border border-border rounded-2xl flex flex-col items-center space-y-1 active:scale-95 transition-all"
            >
              <Plus size={20} className="text-primary" />
              <span className="text-[10px] font-bold uppercase">Gol Time A</span>
            </button>
            <button 
              onClick={() => setShowEventModal({ type: 'GOAL', teamSide: 'B' })}
              className="flex-1 py-4 bg-white/5 border border-border rounded-2xl flex flex-col items-center space-y-1 active:scale-95 transition-all"
            >
              <Plus size={20} className="text-primary" />
              <span className="text-[10px] font-bold uppercase">Gol Time B</span>
            </button>
          </div>
        )}
      </div>

      {/* Histórico Recente */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-sm font-bold uppercase tracking-widest flex items-center space-x-2">
            <History size={16} className="text-primary" />
            <span>Eventos</span>
          </h3>
        </div>
        
        <div className="space-y-2">
          {liveGame.events.length === 0 ? (
            <div className="bg-card/50 border border-dashed border-border p-8 rounded-3xl text-center">
              <p className="text-xs text-gray-500 font-medium italic">Nenhum evento registrado ainda.</p>
            </div>
          ) : (
            [...liveGame.events].reverse().map((event, idx) => {
              const p = players.find(p => p.id === event.playerId);
              const a = players.find(p => p.id === event.assistId);
              return (
                <div key={idx} className="bg-card p-4 rounded-2xl border border-border/50 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Trophy size={14} className="text-primary" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold">Gol: {p?.name}</h4>
                      {a && <p className="text-[10px] font-medium text-gray-500 italic">Assistência: {a.name}</p>}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-primary px-2 py-1 bg-primary/10 rounded-full">
                    {event.teamSide === 'A' ? 'TIME A' : 'TIME B'}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {isAdmin && (
        <button 
          onClick={handleFinish}
          className="w-full py-5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-3xl font-black uppercase tracking-widest text-xs flex items-center justify-center space-x-2 hover:bg-red-500 hover:text-white transition-all"
        >
          <Square size={16} fill="currentColor" />
          <span>Finalizar Partida</span>
        </button>
      )}

      {/* Modal de Gol */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-bg/80 backdrop-blur-sm">
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            className="w-full max-w-lg bg-card border border-border rounded-[2.5rem] p-8 space-y-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold uppercase italic">Registrar Gol - Time {showEventModal.teamSide}</h3>
              <button onClick={() => setShowEventModal(null)} className="p-2 hover:bg-white/5 rounded-full">
                <Plus className="rotate-45" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Quem marcou? *</label>
                <select 
                  value={selectedScorer}
                  onChange={(e) => setSelectedScorer(e.target.value)}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
                >
                  <option value="">Selecione o jogador</option>
                  {(showEventModal.teamSide === 'A' ? teamAPlayers : teamBPlayers).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Assistência (Opcional)</label>
                <select 
                  value={selectedAssister}
                  onChange={(e) => setSelectedAssister(e.target.value)}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
                >
                  <option value="">Ninguém</option>
                  {(showEventModal.teamSide === 'A' ? teamAPlayers : teamBPlayers)
                    .filter(p => p.id !== selectedScorer)
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
              </div>

              <button 
                disabled={!selectedScorer}
                onClick={handleAddGoal}
                className="w-full py-4 bg-primary text-bg rounded-2xl font-black uppercase tracking-widest disabled:opacity-50 transition-all"
              >
                Confirmar Gol
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
