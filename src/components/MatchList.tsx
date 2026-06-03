import React, { useState } from 'react';
import { usePelada, Player } from '../hooks/usePelada';
import { useAuth } from './AuthProvider';
import { Check, X, Clock, AlertCircle, Calendar as CalendarIcon, ChevronDown, ChevronUp, Filter, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import CalendarView from './CalendarView';

export default function MatchList() {
  const { user, role } = useAuth();
  const { players, matches, settings, confirmPresence, markAbsent, loading } = usePelada();
  const [view, setView] = useState<'current' | 'history'>('current');
  
  const now = new Date();
  const nextMatch = matches.find(m => {
    if (m.status !== 'OPEN') return false;
    const matchDate = m.date.toDate();
    const dayAfterMatch = new Date(matchDate);
    dayAfterMatch.setDate(dayAfterMatch.getDate() + 1);
    dayAfterMatch.setHours(0, 0, 0, 0);
    return now < dayAfterMatch;
  });

  const isAdmin = role === 'ADMIN' || user?.email?.trim().toLowerCase() === 'ramonbelem1@gmail.com';
  
  const [showReasonModal, setShowReasonModal] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [searchPlayer, setSearchPlayer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [confirmState, setConfirmState] = useState<{message: string, onConfirm: () => void} | null>(null);

  const confirmAction = (message: string, action: () => void) => {
    setConfirmState({ message, onConfirm: action });
  };

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleConfirm = async (matchId: string) => {
    if (!user) return;
    setSubmitting(true);
    try {
      await confirmPresence(matchId, user.uid);
      showFeedback('success', 'Presença confirmada!');
    } catch (e) {
      showFeedback('error', 'Erro ao confirmar presença.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkAbsent = async (matchId: string, reason: string) => {
    if (!user) return;
    setSubmitting(true);
    try {
      await markAbsent(matchId, user.uid, reason);
      showFeedback('success', 'Ausência marcada.');
    } catch (e) {
      showFeedback('error', 'Erro ao marcar ausência.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminConfirm = async (matchId: string, playerId: string) => {
    setSubmitting(true);
    try {
      await confirmPresence(matchId, playerId);
      showFeedback('success', 'Presença confirmada pelo Admin.');
    } catch (e) {
      showFeedback('error', 'Erro ao confirmar presença.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminAbsent = async (matchId: string, playerId: string) => {
    setSubmitting(true);
    try {
      await markAbsent(matchId, playerId, 'Administrativo');
      showFeedback('success', 'Ausência marcada pelo Admin.');
    } catch (e) {
      showFeedback('error', 'Erro ao marcar ausência.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500 text-xs font-bold uppercase tracking-widest animate-pulse">Carregando lista...</div>;

  const filterPlayersByName = (pIds: string[]) => {
    const list = pIds
      .map(id => players.find(p => p.id === id))
      .filter((p): p is Player => !!p)
      .filter(p => (p.displayName || p.name).toLowerCase().includes(searchPlayer.toLowerCase()));
    
    if (nextMatch && nextMatch.confirmations) {
      list.sort((a, b) => {
        const timeA = nextMatch.confirmations?.[a.id] ? new Date(nextMatch.confirmations[a.id]).getTime() : Infinity;
        const timeB = nextMatch.confirmations?.[b.id] ? new Date(nextMatch.confirmations[b.id]).getTime() : Infinity;
        return timeA - timeB;
      });
    }
    return list;
  };

  return (
    <div className="space-y-6">
      <div className="flex bg-card p-1 rounded-2xl border border-border/50 max-w-[240px] mb-2 mx-auto">
        <button 
          onClick={() => setView('current')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${view === 'current' ? 'bg-primary text-bg shadow-lg shadow-primary/20' : 'text-gray-500 hover:text-white'}`}
        >
          <Clock size={14} />
          <span>Atual</span>
        </button>
        <button 
          onClick={() => setView('history')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${view === 'history' ? 'bg-primary text-bg shadow-lg shadow-primary/20' : 'text-gray-500 hover:text-white'}`}
        >
          <CalendarIcon size={14} />
          <span>Histórico</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {view === 'current' ? (
          <motion.div
            key="current"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {!nextMatch ? (
              <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
                <AlertCircle size={48} className="text-gray-600" />
                <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Nenhuma pelada aberta.</p>
              </div>
            ) : (
              <>
                <div className="px-2 mb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2 text-primary mb-1">
                        <CalendarIcon size={14} strokeWidth={3} />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Data da Pelada</span>
                      </div>
                      <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">
                        {nextMatch.date?.toDate().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '')}
                      </h2>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center justify-end space-x-2 text-gray-500 mb-1">
                        <Clock size={14} />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Início</span>
                      </div>
                      <div className="text-xl font-bold text-white/90">
                        {nextMatch.date?.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-card p-4 rounded-3xl border border-border/50">
                    <span className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Confirmados</span>
                    <div className="text-2xl font-bold text-primary">{players.filter(p => nextMatch.confirmedIds.includes(p.id)).length} / {settings.maxPlayers}</div>
                  </div>
                  <div className="bg-card p-4 rounded-3xl border border-border/50">
                    <span className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Ausentes</span>
                    <div className="text-2xl font-bold text-danger">{nextMatch.absentIds.length}</div>
                  </div>
                </div>

                {/* Search Player Input */}
                <div className="px-1">
                  <div className="relative">
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                    <input 
                      type="text"
                      placeholder="Buscar jogador na lista..."
                      value={searchPlayer}
                      onChange={(e) => setSearchPlayer(e.target.value)}
                      className="w-full bg-card border border-border/50 rounded-2xl pl-12 pr-4 py-3 text-white text-sm focus:border-primary outline-none shadow-xl"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={() => toggleSection('confirmed')}
                    className="w-full flex items-center justify-between px-2 group"
                  >
                    <h3 className="text-primary text-[11px] font-bold tracking-[0.2em] uppercase flex items-center">
                      DENTRO 
                      <span className="ml-2 text-gray-500">{players.filter(p => nextMatch.confirmedIds.includes(p.id)).length}</span>
                    </h3>
                    <div className="text-gray-600 group-hover:text-primary transition-colors">
                      {collapsedSections.confirmed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </div>
                  </button>
                  <AnimatePresence initial={false}>
                    {!collapsedSections.confirmed && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <PresenceSection 
                          players={filterPlayersByName(nextMatch.confirmedIds)} 
                          color="text-primary" 
                          emptyMsg="Nenhum jogador encontrado."
                          isAdmin={isAdmin}
                          confirmations={nextMatch.confirmations}
                          onRemove={(pid) => {
                            confirmAction('Remover jogador da lista?', () => {
                              markAbsent(nextMatch.id, pid, 'Removido pelo Admin');
                            });
                          }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={() => toggleSection('waiting')}
                    className="w-full flex items-center justify-between px-2 group"
                  >
                    <h3 className="text-yellow-400 text-[11px] font-bold tracking-[0.2em] uppercase flex items-center">
                      FILA DE ESPERA 
                      <span className="ml-2 text-gray-500">{players.filter(p => nextMatch.waitingIds.includes(p.id)).length}</span>
                    </h3>
                    <div className="text-gray-600 group-hover:text-yellow-400 transition-colors">
                      {collapsedSections.waiting ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </div>
                  </button>
                  <AnimatePresence initial={false}>
                    {!collapsedSections.waiting && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <PresenceSection 
                          players={filterPlayersByName(nextMatch.waitingIds)} 
                          color="text-yellow-400" 
                          emptyMsg="Nenhum jogador encontrado."
                          isAdmin={isAdmin}
                          confirmations={nextMatch.confirmations}
                          onRemove={(pid) => {
                            confirmAction('Remover jogador da lista de espera?', () => {
                              markAbsent(nextMatch.id, pid, 'Removido pelo Admin');
                            });
                          }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={() => toggleSection('absent')}
                    className="w-full flex items-center justify-between px-2 group"
                  >
                    <h3 className="text-danger text-[11px] font-bold tracking-[0.2em] uppercase flex items-center">
                      FORA 
                      <span className="ml-2 text-gray-500">{nextMatch.absentIds.length}</span>
                    </h3>
                    <div className="text-gray-600 group-hover:text-danger transition-colors">
                      {collapsedSections.absent ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </div>
                  </button>
                  <AnimatePresence initial={false}>
                    {!collapsedSections.absent && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-2">
                          {nextMatch.absentIds.length === 0 ? (
                            <p className="text-gray-600 text-xs px-2 italic text-[10px] font-bold uppercase">Ninguém confirmou ausência.</p>
                          ) : (
                            nextMatch.absentIds
                              .filter(a => {
                                const p = players.find(player => player.id === a.userId);
                                return (p?.displayName || p?.name || '').toLowerCase().includes(searchPlayer.toLowerCase());
                              })
                              .map((a, idx) => {
                                const p = players.find(player => player.id === a.userId);
                                return (
                                  <div key={idx} className="bg-card/50 p-4 rounded-3xl border border-border/30 flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                      <div className="w-10 h-10 rounded-full bg-bg flex items-center justify-center font-bold text-gray-500 border border-border overflow-hidden">
                                        {p?.photoUrl ? (
                                          <img src={p.photoUrl} alt={p.displayName || p.name} className="w-full h-full object-cover" />
                                        ) : (
                                          (p?.displayName || p?.name || '').charAt(0)
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <h4 className="font-semibold text-sm truncate">{p?.displayName || p?.name}</h4>
                                        <p className="text-[10px] text-danger italic truncate">"{a.reason}"</p>
                                      </div>
                                    </div>
                                    {isAdmin && (
                                      <button 
                                        onClick={() => confirmPresence(nextMatch.id, a.userId)}
                                        className="text-primary hover:bg-primary/10 p-2 rounded-xl transition-colors shrink-0"
                                      >
                                        <Check size={16} />
                                      </button>
                                    )}
                                  </div>
                                );
                              })
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="pt-8 pb-4">
                  <label className="text-gray-500 text-[10px] font-bold uppercase tracking-wider px-2 block mb-3 text-center">Minha Presença</label>
                  <div className="flex gap-4">
                    {(() => {
                      const isConfirmed = user && nextMatch.confirmedIds.includes(user.uid);
                      const isWaiting = user && nextMatch.waitingIds.includes(user.uid);
                      const isAbsent = user && nextMatch.absentIds.some(a => a.userId === user.uid);

                      return (
                        <>
                          <button 
                            onClick={() => handleConfirm(nextMatch.id)}
                            disabled={submitting}
                            className={`flex-1 h-16 font-black rounded-3xl flex items-center justify-center space-x-2 active:scale-95 transition-all ${
                              isConfirmed || isWaiting 
                                ? 'bg-primary text-bg' 
                                : 'bg-white/5 border border-border text-gray-400 hover:border-primary/50'
                            }`}
                          >
                            {submitting ? <Loader2 className="animate-spin" size={24} /> : <Check size={24} strokeWidth={4} />}
                            <span className="tracking-widest">
                              {isConfirmed ? 'DENTRO' : isWaiting ? 'NA FILA' : 'DENTRO'}
                            </span>
                          </button>
                          <button 
                            onClick={() => setShowReasonModal(nextMatch.id)}
                            disabled={submitting}
                            className={`flex-1 h-16 font-black rounded-3xl flex items-center justify-center space-x-2 active:scale-95 transition-all ${
                              isAbsent 
                                ? 'bg-danger text-white' 
                                : 'bg-card border border-border text-gray-500 hover:border-danger/50'
                            }`}
                          >
                            <X size={24} strokeWidth={4} />
                            <span className="tracking-widest">FORA</span>
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="pt-8 space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-primary text-[11px] font-bold tracking-[0.2em] uppercase">Elenco do Grupo</h3>
                    <span className="text-[10px] font-bold text-gray-500">
                      {players.filter(p => (p.displayName || p.name).toLowerCase().includes(searchPlayer.toLowerCase())).length} ATLETAS
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    {players
                      .filter(p => (p.displayName || p.name).toLowerCase().includes(searchPlayer.toLowerCase()))
                      .sort((a,b) => (a.displayName || a.name).localeCompare(b.displayName || b.name))
                      .map(player => (
                      <div key={player.id} className="bg-card p-4 rounded-3xl border border-border/50 flex items-center justify-between shadow-sm">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 rounded-full overflow-hidden bg-bg border border-border flex items-center justify-center">
                            {player.photoUrl ? (
                              <img src={player.photoUrl} alt={player.displayName || player.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-gray-500 font-bold">{(player.displayName || player.name).charAt(0)}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-white text-base leading-tight tracking-tight truncate">{player.displayName || player.name}</h4>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest truncate">{player.position}</span>
                              {isAdmin && (
                                <span className={`text-[9px] font-black shrink-0 ${player.balance >= 0 ? 'text-primary' : 'text-danger'}`}>
                                  • R$ {(player.balance || 0).toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3 shrink-0">
                          {isAdmin && nextMatch && (
                            <div className="flex items-center space-x-1 pr-2 border-r border-border/30 mr-1">
                              {(() => {
                                const isConfirmed = nextMatch.confirmedIds.includes(player.id);
                                const isWaiting = nextMatch.waitingIds.includes(player.id);
                                const isAbsent = nextMatch.absentIds.some(a => a.userId === player.id);

                                return (
                                  <>
                                    <button 
                                      onClick={() => handleAdminConfirm(nextMatch.id, player.id)}
                                      disabled={submitting || isConfirmed || isWaiting}
                                      className={`p-2 rounded-xl transition-all ${
                                        isConfirmed || isWaiting 
                                          ? 'bg-primary text-bg' 
                                          : 'bg-white/5 text-gray-500 hover:text-primary hover:bg-primary/10'
                                      }`}
                                      title={isConfirmed ? "Confirmado" : isWaiting ? "Na Fila" : "Confirmar Jogador"}
                                    >
                                      <Check size={16} strokeWidth={3} />
                                    </button>
                                    <button 
                                      onClick={() => handleAdminAbsent(nextMatch.id, player.id)}
                                      disabled={submitting || isAbsent}
                                      className={`p-2 rounded-xl transition-all ${
                                        isAbsent 
                                          ? 'bg-danger text-white' 
                                          : 'bg-white/5 text-gray-500 hover:text-danger hover:bg-danger/10'
                                      }`}
                                      title={isAbsent ? "Ausente" : "Marcar Ausente"}
                                    >
                                      <X size={16} strokeWidth={3} />
                                    </button>
                                  </>
                                );
                              })()}
                            </div>
                          )}
                          
                          {isAdmin && (
                            <div className="hidden sm:flex space-x-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < player.level ? 'bg-primary' : 'bg-gray-700'}`} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {feedback && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl z-[100] ${
                      feedback.type === 'success' ? 'bg-primary text-bg' : 'bg-danger text-white'
                    }`}
                  >
                    {feedback.message}
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="history"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <CalendarView />
          </motion.div>
        )}
      </AnimatePresence>

      {showReasonModal && (
        <div className="fixed inset-0 bg-bg/95 backdrop-blur-md z-50 flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-card w-full max-w-sm rounded-[40px] p-8 border border-border/50 shadow-2xl"
          >
            <h3 className="text-xl font-bold mb-6 text-center text-white italic uppercase tracking-tighter">Infelizmente hoje não dá?</h3>
            <div className="grid grid-cols-1 gap-3 mb-6">
              {['Trabalho', 'Machucado/Doente', 'Viagem', 'Compromisso', 'Outro'].map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    handleMarkAbsent(showReasonModal, r);
                    setShowReasonModal(null);
                  }}
                  className="w-full py-4 bg-bg border border-border/50 rounded-2xl text-center font-bold text-sm text-white hover:border-primary/50 transition-colors uppercase tracking-widest active:scale-95 disabled:opacity-50"
                  disabled={submitting}
                >
                  {r}
                </button>
              ))}
            </div>
            
            <button 
              onClick={() => setShowReasonModal(null)}
              className="w-full py-2 text-gray-500 font-bold uppercase tracking-widest text-[10px]"
            >
              Cancelar
            </button>
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
    </div>
  );
}

function formatConfirmDate(isoString?: string) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month} às ${hours}:${minutes}`;
  } catch (e) {
    return '';
  }
}

function PresenceSection({ 
  title, 
  players, 
  color, 
  emptyMsg, 
  isAdmin, 
  onRemove,
  confirmations 
}: { 
  title?: string, 
  players: Player[], 
  color: string, 
  emptyMsg: string, 
  isAdmin?: boolean, 
  onRemove?: (id: string) => void,
  confirmations?: Record<string, string>
}) {
  return (
    <div className="space-y-3">
      {title && (
        <h3 className={`${color} text-[11px] font-bold tracking-[0.2em] px-2 flex items-center justify-between`}>
          {title} <span className="text-gray-500">{players.length}</span>
        </h3>
      )}
      <div className="space-y-2">
        {players.length === 0 ? (
          <p className="text-gray-600 text-xs px-2 italic text-[10px] font-bold uppercase">{emptyMsg}</p>
        ) : (
          players.map(player => (
            <motion.div 
              layout
              key={player.id} 
              className="bg-card p-4 rounded-3xl border border-border/50 flex items-center justify-between shadow-sm"
            >
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-bg border border-border flex items-center justify-center">
                    {player.photoUrl ? (
                      <img src={player.photoUrl} alt={player.displayName || player.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-gray-500 font-bold">{(player.displayName || player.name).charAt(0)}</span>
                    )}
                  </div>
                  <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-card flex items-center justify-center text-[8px] font-bold ${
                    player.type === 'MENSALISTA' ? 'bg-primary text-bg' : 'bg-gray-700 text-gray-400'
                  }`}>
                    {player.type === 'MENSALISTA' ? 'M' : 'D'}
                  </div>
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-white text-base leading-tight tracking-tight truncate">{player.displayName || player.name}</h4>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:gap-2 mt-0.5">
                    <span className="text-[10px] text-gray-500 font-extrabold uppercase tracking-widest">{player.position}</span>
                    {confirmations && confirmations[player.id] && (
                      <div className="flex items-center gap-1 text-[10px] text-primary/90 font-bold tracking-wider mt-1 sm:mt-0">
                        <span className="hidden sm:inline text-gray-600 font-normal">•</span>
                        <Clock size={11} className="text-primary/70 shrink-0" />
                        <span>{formatConfirmDate(confirmations[player.id])}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-3 shrink-0">
                {isAdmin && (
                  <div className="flex space-x-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < player.level ? 'bg-primary' : 'bg-gray-700'}`} />
                    ))}
                  </div>
                )}
                {isAdmin && onRemove && (
                  <button 
                    onClick={() => onRemove(player.id)}
                    className="p-2 text-gray-600 hover:text-danger hover:bg-danger/10 rounded-xl transition-colors"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
