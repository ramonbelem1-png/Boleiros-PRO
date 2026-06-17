import React, { useState, useEffect } from 'react';
import { usePelada, Match, Player } from '../hooks/usePelada';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  isToday
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, X, Clock, Users, Trophy, UserX, Trash2, Circle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from './AuthProvider';

export default function CalendarView() {
  const { matches, players, deleteMatch, deleteGame } = usePelada();
  const { role, user } = useAuth();
  const isAdmin = role === 'ADMIN' || user?.email?.trim().toLowerCase() === 'ramonbelem1@gmail.com';
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [confirmDeleteMatch, setConfirmDeleteMatch] = useState<string | null>(null);
  const [confirmDeleteGame, setConfirmDeleteGame] = useState<{matchId: string, gameId: string} | null>(null);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const days = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd
  });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const getMatchForDay = (day: Date) => {
    return matches.find(m => {
      const matchDate = m.date.toDate ? m.date.toDate() : new Date(m.date);
      return isSameDay(matchDate, day);
    });
  };

  const sortedMatches = [...matches].sort((a, b) => {
    const dateA = a.date.toDate ? a.date.toDate() : new Date(a.date);
    const dateB = b.date.toDate ? b.date.toDate() : new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex bg-card p-1 rounded-xl border border-border/50">
          <button 
            onClick={() => setViewMode('calendar')}
            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'calendar' ? 'bg-primary text-bg' : 'text-gray-500'}`}
          >
            Calendário
          </button>
          <button 
            onClick={() => setViewMode('list')}
            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'list' ? 'bg-primary text-bg' : 'text-gray-500'}`}
          >
            Lista
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {viewMode === 'calendar' ? (
          <motion.div
            key="calendar"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Calendar Header */}
            <div className="flex items-center justify-between bg-card p-4 rounded-[32px] border border-border/50 shadow-lg">
              <button onClick={prevMonth} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                <ChevronLeft size={20} className="text-primary" />
              </button>
              <h2 className="text-base font-black uppercase tracking-widest text-white">
                {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
              </h2>
              <button onClick={nextMonth} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                <ChevronRight size={20} className="text-primary" />
              </button>
            </div>

            {/* Days Labels */}
            <div className="grid grid-cols-7 gap-1 px-2">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, i) => (
                <div key={i} className="text-center text-[10px] font-black text-gray-600 py-2 uppercase tracking-tighter">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-2">
              {days.map((day, i) => {
                const match = getMatchForDay(day);
                const isCurrentMonth = isSameMonth(day, monthStart);
                const active = match && match.status === 'OPEN';
                const finished = match && match.status === 'FINISHED';
                
                return (
                  <button
                    key={i}
                    onClick={() => match && setSelectedMatch(match)}
                    disabled={!match}
                    className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center transition-all border ${
                      !isCurrentMonth ? 'opacity-20 border-transparent' : 
                      match ? 'bg-card border-primary/30 shadow-md active:scale-90 cursor-pointer' : 
                      'bg-transparent border-border/10'
                    } ${isToday(day) ? 'ring-2 ring-primary ring-offset-4 ring-offset-bg' : ''}`}
                  >
                    <span className={`text-xs font-bold ${match ? 'text-white' : 'text-gray-600'}`}>
                      {format(day, 'd')}
                    </span>
                    
                    {match && (
                      <div className="absolute bottom-1.5 flex gap-0.5">
                        <div className={`w-1 h-1 rounded-full ${finished ? 'bg-gray-500' : 'bg-primary animate-pulse'}`} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            {sortedMatches.length === 0 ? (
              <div className="bg-card p-12 rounded-[40px] border border-dashed border-border flex flex-col items-center justify-center text-center">
                <Clock className="text-gray-700 mb-4" size={48} />
                <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Nenhuma partida registrada</p>
              </div>
            ) : (
              sortedMatches.map(match => {
                const date = match.date.toDate ? match.date.toDate() : new Date(match.date);
                const isFinished = match.status === 'FINISHED';
                return (
                  <div 
                    key={match.id}
                    onClick={() => setSelectedMatch(match)}
                    className="w-full bg-card p-5 rounded-[2.5rem] border border-border/50 flex items-center justify-between group active:scale-[0.98] transition-all shadow-lg hover:border-primary/30 cursor-pointer"
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center ${isFinished ? 'bg-white/5 text-gray-500' : 'bg-primary/10 text-primary animate-pulse'}`}>
                        <span className="text-[10px] font-black leading-none">{format(date, 'MMM', { locale: ptBR }).toUpperCase()}</span>
                        <span className="text-lg font-black leading-none">{format(date, 'dd')}</span>
                      </div>
                      <div className="text-left">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-black text-sm text-white uppercase italic tracking-tight">Pelada Oficial</h4>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-black uppercase tracking-tighter ${isFinished ? 'bg-gray-800 text-gray-500' : 'bg-primary/20 text-primary'}`}>
                            {isFinished ? 'Finalizada' : 'Aberta'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-3 mt-1 text-gray-500">
                          <div className="flex items-center space-x-1">
                            <Clock size={10} />
                            <span className="text-[10px] font-bold uppercase">{format(date, 'HH:mm')}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Users size={10} />
                            <span className="text-[10px] font-bold uppercase">{match.confirmedIds.length} Atletas</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      {isFinished && match.result && (
                        <div className="flex items-center space-x-2 bg-bg px-3 py-2 rounded-xl border border-border/50">
                          <span className="text-sm font-black text-white italic">{match.result.scoreA}</span>
                          <span className="text-[10px] font-bold text-gray-600">X</span>
                          <span className="text-sm font-black text-white italic">{match.result.scoreB}</span>
                        </div>
                      )}
                      {isAdmin && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteMatch(match.id);
                          }}
                          className="p-3 bg-danger/10 text-danger rounded-xl hover:bg-danger hover:text-white transition-all active:scale-90"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      <ChevronRight size={20} className="text-gray-700 group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Match Detail Modal */}
      <AnimatePresence>
        {selectedMatch && (
          <MatchModal 
            match={selectedMatch} 
            players={players} 
            onClose={() => setSelectedMatch(null)} 
            onDeleteMatch={(id) => setConfirmDeleteMatch(id)}
            onDeleteGame={(mId, gId) => setConfirmDeleteGame({matchId: mId, gameId: gId})}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDeleteMatch && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-card border border-border rounded-[2.5rem] p-6 shadow-2xl relative"
            >
              <h3 className="text-xl font-black uppercase text-white mb-4">Confirmar Ação</h3>
              <p className="text-sm font-bold text-gray-400 mb-8 whitespace-pre-wrap">
                Tem certeza que deseja excluir esta pelada inteira? Todas as partidas, gols e estatísticas dela serão apagadas permanentemente.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setConfirmDeleteMatch(null)} 
                  className="flex-1 p-4 rounded-2xl bg-white/5 font-bold hover:bg-white/10 transition-all text-white"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    deleteMatch(confirmDeleteMatch);
                    setConfirmDeleteMatch(null);
                  }} 
                  className="flex-1 p-4 rounded-2xl bg-danger text-white font-black hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDeleteGame && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-card border border-border rounded-[2.5rem] p-6 shadow-2xl relative"
            >
              <h3 className="text-xl font-black uppercase text-white mb-4">Confirmar Ação</h3>
              <p className="text-sm font-bold text-gray-400 mb-8 whitespace-pre-wrap">
                Deseja excluir este jogo e reverter os gols/estatísticas?
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setConfirmDeleteGame(null)} 
                  className="flex-1 p-4 rounded-2xl bg-white/5 font-bold hover:bg-white/10 transition-all text-white"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    if (confirmDeleteGame) {
                      deleteGame(confirmDeleteGame.matchId, confirmDeleteGame.gameId);
                      setConfirmDeleteGame(null);
                    }
                  }} 
                  className="flex-1 p-4 rounded-2xl bg-danger text-white font-black hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      <div className="px-4 text-[10px] font-bold text-gray-600 uppercase tracking-widest text-center">
        Toque em uma data com marcador para ver detalhes
      </div>
    </div>
  );
}

function MatchModal({ match, players, onClose, onDeleteMatch, onDeleteGame }: { match: Match, players: Player[], onClose: () => void, onDeleteMatch: (id: string) => void, onDeleteGame: (mId: string, gId: string) => void }) {
  const { getMatchGames } = usePelada();
  const { role, user } = useAuth();
  const isAdmin = role === 'ADMIN' || user?.email?.trim().toLowerCase() === 'ramonbelem1@gmail.com';
  const [matchGames, setMatchGames] = useState<any[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);

  const getGameTeamNames = (game: any, currentMatch: any, defaultLabels: { A: string; B: string }): { teamA: string; teamB: string } => {
    if (!game) return { teamA: defaultLabels.A, teamB: defaultLabels.B };
    
    // 1. If explicit names are saved on the game, use them!
    if (game.teamA_name && game.teamB_name) {
      return { teamA: game.teamA_name, teamB: game.teamB_name };
    }
    
    const teamAIds = game.teamA_ids || [];
    const teamBIds = game.teamB_ids || [];
    
    const defaultA = game.teamA_name || defaultLabels.A;
    const defaultB = game.teamB_name || defaultLabels.B;

    if (!currentMatch || !currentMatch.teams) {
      return { teamA: defaultA, teamB: defaultB };
    }

    const teamEntries = Object.entries(currentMatch.teams);
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

  useEffect(() => {
    const fetchGames = async () => {
      setLoadingGames(true);
      try {
        const games = await getMatchGames(match.id);
        setMatchGames(games);
      } catch (e) {
        console.error("Erro ao carregar jogos:", e);
      } finally {
        setLoadingGames(false);
      }
    };
    fetchGames();
  }, [match.id]);

  const matchDate = match.date.toDate ? match.date.toDate() : new Date(match.date);
  
  const confirmed = players.filter(p => match.confirmedIds.includes(p.id));
  const absentEntries = match.absentIds.map(a => ({
    player: players.find(p => p.id === a.userId),
    reason: a.reason
  })).filter(entry => entry.player);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4">
      <motion.div 
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="bg-card w-full max-w-lg rounded-t-[40px] sm:rounded-[40px] p-6 max-h-[90vh] overflow-y-auto border border-border/50"
      >
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="flex items-center space-x-2 text-primary mb-1">
              <Clock size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                {format(matchDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
              </span>
            </div>
            <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">
              Detalhes da Pelada
            </h2>
          </div>
          <button onClick={onClose} className="p-2 bg-white/5 rounded-full text-gray-500">
            <X size={24} />
          </button>
        </div>

        {/* Score if finished */}
        {match.status === 'FINISHED' && match.result && (
          <div className="bg-primary/10 p-6 rounded-3xl border border-primary/20 mb-6 text-center">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-2 block text-center">Resultado Final da Pelada</span>
            <div className="flex items-center justify-center space-x-8">
              <div className="text-center">
                <div className="text-4xl font-black text-white italic">{match.result.scoreA}</div>
                <div className="text-[10px] font-bold text-gray-500 uppercase">Time A</div>
              </div>
              <div className="text-2xl text-primary font-black">X</div>
              <div className="text-center">
                <div className="text-4xl font-black text-white italic">{match.result.scoreB}</div>
                <div className="text-[10px] font-bold text-gray-500 uppercase">Time B</div>
              </div>
            </div>
          </div>
        )}

        {/* History of Games */}
        <div className="mb-8 space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center space-x-2 text-primary">
              <Trophy size={14} />
              <h4 className="text-[10px] font-black uppercase tracking-widest">Jogos Realizados</h4>
            </div>
            {isAdmin && (
               <button 
                onClick={() => {
                  onDeleteMatch(match.id);
                  onClose();
                }}
                className="flex items-center space-x-1 px-3 py-1 bg-danger/10 text-danger rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-danger hover:text-white transition-all"
               >
                 <Trash2 size={10} />
                 <span>Excluir Pelada</span>
               </button>
            )}
          </div>

          {loadingGames ? (
            <div className="p-4 text-center text-[10px] font-bold text-gray-500 uppercase animate-pulse">Carregando jogos...</div>
          ) : matchGames.length === 0 ? (
            <div className="p-4 text-center text-[10px] font-bold text-gray-600 uppercase italic">Nenhum jogo individual registrado</div>
          ) : (
            <div className="space-y-3">
              {matchGames.map((game, gIdx) => {
                const resolvedTeams = getGameTeamNames(game, match, { A: 'Time A', B: 'Time B' });
                return (
                  <div key={game.id} className="bg-bg/40 border border-border/20 rounded-2xl overflow-hidden relative group/game">
                    <div className="px-4 py-1.5 bg-white/5 flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                         <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Jogo {gIdx + 1}</span>
                         {isAdmin && (
                           <button 
                            onClick={() => {
                              onDeleteGame(match.id, game.id);
                            }}
                            className="p-1 text-danger/50 hover:text-danger"
                           >
                             <Trash2 size={10} />
                           </button>
                         )}
                      </div>
                    </div>
                    
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex-1 flex flex-col items-center text-center">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight mb-1">
                          {resolvedTeams.teamA}
                        </span>
                        <div className="text-2xl font-black italic text-white">{game.scoreA}</div>
                        <div className="mt-1 space-y-0.5 text-center">
                          {game.events?.filter((e: any) => e.teamSide === 'A').map((e: any, evIdx: number) => {
                            const p = players.find(p => p.id === e.playerId);
                            const pName = p?.displayName || p?.name || '';
                            return (
                              <div key={evIdx} className="flex items-center space-x-1 justify-center">
                                <Circle size={6} className="fill-primary/50 text-primary/50" />
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                  {pName.split(' ')[0]}
                                  {e.type === 'OWN_GOAL' && <span className="text-danger ml-0.5">(GC)</span>}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-center px-4 space-y-2">
                        <div className="text-xs font-black text-border/45 italic select-none">VS</div>
                      </div>
                      
                      <div className="flex-1 flex flex-col items-center text-center">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight mb-1">
                          {resolvedTeams.teamB}
                        </span>
                        <div className="text-2xl font-black italic text-white">{game.scoreB}</div>
                        <div className="mt-1 space-y-0.5 text-center">
                          {game.events?.filter((e: any) => e.teamSide === 'B').map((e: any, evIdx: number) => {
                            const p = players.find(p => p.id === e.playerId);
                            const pName = p?.displayName || p?.name || '';
                            return (
                              <div key={evIdx} className="flex items-center space-x-1 justify-center">
                                <Circle size={6} className="fill-primary/50 text-primary/50" />
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                  {pName.split(' ')[0]}
                                  {e.type === 'OWN_GOAL' && <span className="text-danger ml-0.5">(GC)</span>}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Confirmed */}
          <section className="space-y-3">
             <div className="flex items-center space-x-2 text-primary px-1">
               <Users size={14} />
               <h4 className="text-[10px] font-black uppercase tracking-widest">Confirmados ({confirmed.length})</h4>
             </div>
             <div className="grid grid-cols-1 gap-2">
               {confirmed.map(p => (
                 <div key={p.id} className="flex items-center space-x-3 bg-bg/50 p-3 rounded-2xl border border-border/20">
                   <div className="w-8 h-8 rounded-full bg-bg border border-border overflow-hidden">
                     {p.photoUrl ? <img src={p.photoUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-[10px]">{(p.displayName || p.name).charAt(0)}</div>}
                   </div>
                   <span className="text-sm font-bold text-white">{p.displayName || p.name}</span>
                 </div>
               ))}
             </div>
          </section>

          {/* Absent */}
          {absentEntries.length > 0 && (
            <section className="space-y-3">
               <div className="flex items-center space-x-2 text-danger px-1">
                 <UserX size={14} />
                 <h4 className="text-[10px] font-black uppercase tracking-widest">Ausentes ({absentEntries.length})</h4>
               </div>
               <div className="grid grid-cols-1 gap-2">
                 {absentEntries.map((e, idx) => (
                   <div key={idx} className="flex items-center justify-between bg-bg/30 p-3 rounded-2xl border border-border/10">
                     <span className="text-xs font-bold text-gray-400">{e.player?.displayName || e.player?.name}</span>
                     <span className="text-[10px] font-bold text-gray-600 italic">"{e.reason}"</span>
                   </div>
                 ))}
               </div>
            </section>
          )}
        </div>
      </motion.div>
    </div>
  );
}
