import React, { useState } from 'react';
import { usePelada, GroupSettings, Match, Player } from '../hooks/usePelada';
import { useAuth } from './AuthProvider';
import { 
  UserPlus, UserCircle, User, ChevronRight, LogOut, Bell, Shield, Info, Save, 
  History, Calendar, Users, Camera, Upload, Loader2, Trash2, Edit, 
  CheckCircle2, AlertCircle, ArrowUpDown, Filter, Star, Type, Target,
  TrendingUp
} from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, updateDoc, onSnapshot, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import ManagementModals from './ManagementModals';

interface SettingsProps {
  onAddPlayer: () => void;
  onEditPlayer: (player: Player) => void;
  updatePlayer: (id: string, data: any) => Promise<void>;
  settings: GroupSettings;
  onUpdateSettings: (settings: GroupSettings) => Promise<void>;
}

export default function Settings({ onAddPlayer, onEditPlayer, updatePlayer, settings, onUpdateSettings }: SettingsProps) {
  const { players, matches, deletePlayer } = usePelada();
  const { logout, role, user } = useAuth();
  const [localSettings, setLocalSettings] = useState<GroupSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [uploadingPlayerId, setUploadingPlayerId] = useState<string | null>(null);
  const [playerToDelete, setPlayerToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'level' | 'name' | 'position'>('name');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

  const isAdmin = role === 'ADMIN';

  const filteredPlayers = players.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    if (sortBy === 'level') return (b.level || 0) - (a.level || 0);
    if (sortBy === 'position') return (a.position || '').localeCompare(b.position || '');
    return a.name.localeCompare(b.name);
  });

  const [adminEmail, setAdminEmail] = useState('');
  const [userRoles, setUserRoles] = useState<any[]>([]);

  // Fetch all user roles for the admin to manage
  React.useEffect(() => {
    if (!isAdmin) return;
    const unsub = onSnapshot(collection(db, 'user_roles'), (snap) => {
      setUserRoles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [isAdmin]);

  const handleAddAdmin = async () => {
    if (!adminEmail) return;
    const userToPromote = userRoles.find(ur => ur.email === adminEmail);
    if (userToPromote) {
      try {
        await updateDoc(doc(db, 'user_roles', userToPromote.id), { role: 'ADMIN' });
        showFeedback('success', `${userToPromote.name} agora é administrador.`);
        setAdminEmail('');
      } catch (e) {
        showFeedback('error', 'Erro ao promover usuário.');
      }
    } else {
      showFeedback('error', 'Usuário não encontrado. Ele precisa logar pelo menos uma vez.');
    }
  };

  const handleRemoveAdmin = async (uid: string) => {
    if (uid === user?.uid) {
      showFeedback('error', 'Você não pode remover seu próprio acesso admin.');
      return;
    }
    try {
      await updateDoc(doc(db, 'user_roles', uid), { role: 'USER' });
      showFeedback('success', 'Acesso administrativo removido.');
    } catch (e) {
      showFeedback('error', 'Erro ao remover acesso.');
    }
  };

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  // Sync with prop when data finishes loading
  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleLevelChange = async (playerId: string, newLevel: number) => {
    try {
      await updatePlayer(playerId, { level: newLevel });
      showFeedback('success', `Nível de ${players.find(p => p.id === playerId)?.name} atualizado!`);
    } catch (e) {
      showFeedback('error', 'Erro ao atualizar nível.');
    }
  };

  const handleTypeToggle = async (playerId: string, currentType: string) => {
    try {
      const newType = currentType === 'MENSALISTA' ? 'DIARISTA' : 'MENSALISTA';
      await updatePlayer(playerId, { type: newType });
      showFeedback('success', `${players.find(p => p.id === playerId)?.name} agora é ${newType.toLowerCase()}.`);
    } catch (e) {
      showFeedback('error', 'Erro ao atualizar tipo.');
    }
  };

  const handlePhotoUpload = async (playerId: string, file: File) => {
    setUploadingPlayerId(playerId);
    try {
      const storageRef = ref(storage, `players/${playerId}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const photoUrl = await getDownloadURL(storageRef);
      await updatePlayer(playerId, { photoUrl });
      showFeedback('success', `Foto de ${players.find(p => p.id === playerId)?.name} atualizada!`);
    } catch (error) {
      console.error("Erro no upload da foto:", error);
      showFeedback('error', 'Erro ao enviar foto.');
    } finally {
      setUploadingPlayerId(null);
    }
  };

  const handleDeletePlayer = async () => {
    if (playerToDelete) {
      const playerName = players.find(p => p.id === playerToDelete)?.name;
      try {
        await deletePlayer(playerToDelete);
        showFeedback('success', `${playerName} removido da lista.`);
      } catch (e) {
        showFeedback('error', 'Erro ao remover jogador.');
      }
      setPlayerToDelete(null);
    }
  };

  const handleGolsChange = async (playerId: string, val: number) => {
    try {
      await updatePlayer(playerId, { gols: val });
    } catch (e) {
      showFeedback('error', 'Erro ao atualizar gols.');
    }
  };

  const handleAssistsChange = async (playerId: string, val: number) => {
    try {
      await updatePlayer(playerId, { assistencias: val });
    } catch (e) {
      showFeedback('error', 'Erro ao atualizar assistências.');
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await onUpdateSettings(localSettings);
      showFeedback('success', 'Configurações do grupo salvas!');
    } catch (e) {
      console.error(e);
      showFeedback('error', 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const finishedMatches = matches.filter(m => m.status === 'FINISHED');

  return (
    <div className="space-y-8 pb-8">
      {/* Feedback Toast */}
      {feedback && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-2 animate-in fade-in zoom-in duration-300 ${
          feedback.type === 'success' ? 'bg-primary text-bg' : 'bg-danger text-white'
        }`}>
          {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-xs font-bold uppercase tracking-widest">{feedback.msg}</span>
        </div>
      )}

      {/* User Profile Summary */}
      <div className="bg-card rounded-[32px] p-6 border border-border/50 flex items-center gap-4 mb-2">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0 transition-transform hover:scale-105">
          <UserCircle size={40} className="stroke-[1.5]" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-black text-white leading-none truncate">
              {user?.displayName || user?.email?.split('@')[0] || 'Usuário'}
            </h2>
            {role === 'ADMIN' && (
              <span className="bg-primary/20 text-primary text-[8px] font-black px-1.5 py-0.5 rounded border border-primary/30 uppercase tracking-tighter shrink-0">
                ADMIN
              </span>
            )}
          </div>
          <p className="text-gray-500 text-[10px] font-medium truncate opacity-70">{user?.email}</p>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {playerToDelete && (
        <div className="fixed inset-0 bg-bg/95 backdrop-blur-md z-[150] flex items-center justify-center p-6">
          <div className="bg-card w-full max-w-sm rounded-[44px] p-8 border border-border/50 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto mb-6">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-black text-center mb-2">Remover Jogador?</h3>
            <p className="text-gray-500 text-center text-sm mb-8">Esta ação não pode ser desfeita. O jogador será excluído permanentemente.</p>
            <div className="flex gap-4">
              <button 
                onClick={() => setPlayerToDelete(null)}
                className="flex-1 py-4 bg-white/5 border border-border text-gray-400 font-bold uppercase tracking-widest text-[10px] rounded-2xl"
              >
                Cancelar
              </button>
              <button 
                onClick={handleDeletePlayer}
                className="flex-1 py-4 bg-danger text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-lg shadow-danger/20"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Rules Section */}
      {isAdmin && (
        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[11px] font-bold tracking-[0.2em] text-gray-500 uppercase">Controle de Acessos</h3>
          </div>
          <div className="bg-card rounded-[32px] border border-border/50 p-6 space-y-6 shadow-xl">
             <div className="flex gap-2">
              <input 
                type="email"
                placeholder="Email do novo admin..."
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="flex-1 bg-bg border border-border rounded-xl px-4 py-3 text-white text-sm focus:border-primary outline-none"
              />
              <button 
                onClick={handleAddAdmin}
                className="bg-primary text-bg p-3 rounded-xl hover:opacity-90 transition-opacity"
              >
                <UserPlus size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Membros com Acesso</p>
              {userRoles.map((ur) => (
                <div key={ur.id} className="flex items-center justify-between bg-bg/50 p-3 rounded-2xl border border-border/30">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <UserCircle size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white leading-tight">{ur.name || 'Usuário'}</p>
                      <p className="text-[9px] text-gray-500">{ur.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <select 
                      value={ur.role}
                      onChange={(e) => {
                        const newRole = e.target.value as any;
                        if (ur.id === user?.uid && newRole !== 'ADMIN') {
                          showFeedback('error', 'Você não pode remover seu próprio acesso admin.');
                          return;
                        }
                        updateDoc(doc(db, 'user_roles', ur.id), { role: newRole });
                      }}
                      className="bg-card border border-border rounded-lg px-2 py-1 text-[9px] font-bold text-gray-400 focus:border-primary outline-none"
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="USER">USUÁRIO</option>
                    </select>
                    {ur.id !== user?.uid && (
                      <button 
                        onClick={() => handleRemoveAdmin(ur.id)}
                        className="p-1.5 text-gray-600 hover:text-danger transition-colors border border-border/50 rounded-lg"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Group Rules Section */}
      {isAdmin && (
        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[11px] font-bold tracking-[0.2em] text-gray-500 uppercase">Regras do Grupo</h3>
            <button 
              disabled={saving}
              onClick={handleSaveSettings}
              className="flex items-center space-x-1 text-primary text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
            >
              <LogOut size={12} className="rotate-180" /> {/* Reusing an icon since Save is also imported but let's stick to Save if available */}
              <Save size={12} />
              <span>{saving ? 'Salvando...' : 'Salvar'}</span>
            </button>
          </div>
          
          <div className="bg-card rounded-[32px] border border-border/50 p-6 space-y-6 shadow-xl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Mensalidade (R$)</label>
                <input 
                  type="number" 
                  value={localSettings.monthlyFee}
                  onChange={(e) => setLocalSettings({ ...localSettings, monthlyFee: Number(e.target.value) })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-white font-bold focus:border-primary transition-colors outline-none"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Taxa Diária (R$)</label>
                <input 
                  type="number" 
                  value={localSettings.dailyFee}
                  onChange={(e) => setLocalSettings({ ...localSettings, dailyFee: Number(e.target.value) })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-white font-bold focus:border-primary transition-colors outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Limite de Jogadores</label>
                <input 
                  type="number" 
                  value={localSettings.maxPlayers}
                  onChange={(e) => setLocalSettings({ ...localSettings, maxPlayers: Number(e.target.value) })}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-white font-bold focus:border-primary transition-colors outline-none"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Match History Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-[11px] font-bold tracking-[0.2em] text-gray-500 uppercase">Histórico de Partidas</h3>
        </div>

        <div className="space-y-3">
          {finishedMatches.length === 0 ? (
            <div className="bg-card/50 p-8 rounded-[32px] border border-dashed border-border flex flex-col items-center text-center">
              <History className="text-gray-700 mb-2" size={32} />
              <p className="text-gray-500 text-sm">Nenhuma partida finalizada ainda.</p>
            </div>
          ) : (
            finishedMatches.map(match => (
              <div 
                key={match.id} 
                className="bg-card p-5 rounded-[32px] border border-border/50 shadow-xl"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">
                        {match.date.toDate().toLocaleDateString('pt-BR')}
                      </p>
                      <h4 className="font-bold text-white">Partida Finalizada</h4>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedMatch(selectedMatch?.id === match.id ? null : match)}
                    className="text-primary text-[10px] font-black uppercase tracking-widest"
                  >
                    {selectedMatch?.id === match.id ? 'Ocultar' : 'Detalhes'}
                  </button>
                </div>

                {selectedMatch?.id === match.id && (
                  <div className="mt-4 pt-4 border-t border-border/20 space-y-4">
                    <div className="flex items-center justify-around text-center">
                      <div>
                        <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Confirmados</p>
                        <p className="text-lg font-black text-primary">{match.confirmedIds.length}</p>
                      </div>
                      <div className="w-px h-8 bg-border/20" />
                      <div>
                        <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Faltas</p>
                        <p className="text-lg font-black text-danger">{match.absentIds.length}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] text-gray-500 font-bold uppercase px-1">Jogadores</p>
                      <div className="flex flex-wrap gap-2">
                        {match.confirmedIds.map(id => {
                          const p = players.find(p => p.id === id);
                          return (
                            <span key={id} className="bg-bg border border-border px-2 py-1 rounded-lg text-[10px] text-gray-300">
                              {p?.name || 'Inativo'}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Player Management Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-[11px] font-bold tracking-[0.2em] text-gray-500 uppercase">Gerenciar Jogadores ({players.length})</h3>
        </div>

        {/* Search Input */}
        <div className="px-1">
          <div className="relative">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input 
              type="text"
              placeholder="Buscar jogador por nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-card border border-border/50 rounded-2xl pl-12 pr-4 py-3 text-white text-sm focus:border-primary outline-none shadow-xl"
            />
          </div>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center space-x-2 px-1 overflow-x-auto pb-2 scrollbar-none">
          <div className="flex items-center space-x-1 text-gray-600 mr-2">
            <ArrowUpDown size={12} />
            <span className="text-[9px] font-bold uppercase tracking-widest">Ordem:</span>
          </div>
          <button 
            onClick={() => setSortBy('name')}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border shrink-0 ${
              sortBy === 'name' ? 'bg-primary border-primary text-bg' : 'bg-card border-border text-gray-500'
            }`}
          >
            <Type size={12} />
            <span>Nome</span>
          </button>
          <button 
            onClick={() => setSortBy('level')}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border shrink-0 ${
              sortBy === 'level' ? 'bg-primary border-primary text-bg' : 'bg-card border-border text-gray-500'
            }`}
          >
            <Star size={12} />
            <span>Nível</span>
          </button>
          <button 
            onClick={() => setSortBy('position')}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border shrink-0 ${
              sortBy === 'position' ? 'bg-primary border-primary text-bg' : 'bg-card border-border text-gray-500'
            }`}
          >
            <Target size={12} />
            <span>Posição</span>
          </button>
        </div>

        <div className="space-y-3">
          {sortedPlayers.map(player => (
            <div key={player.id} className="group bg-card p-4 rounded-[28px] border border-border/50 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <label className="relative group/photo cursor-pointer inline-block shrink-0">
                    <div className="w-12 h-12 rounded-2xl bg-bg border border-border flex items-center justify-center font-bold text-gray-400 text-base overflow-hidden transition-all group-hover/photo:border-primary">
                      {uploadingPlayerId === player.id ? (
                        <Loader2 className="animate-spin text-primary" size={18} />
                      ) : player.photoUrl ? (
                        <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        player.name.charAt(0)
                      )}
                    </div>
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePhotoUpload(player.id, file);
                      }}
                      disabled={uploadingPlayerId === player.id}
                    />
                    <div className="absolute -bottom-1 -right-1 bg-primary text-bg p-1 rounded-full shadow-lg opacity-0 group-hover/photo:opacity-100 transition-opacity">
                      <Camera size={8} />
                    </div>
                  </label>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="font-bold text-white tracking-tight text-sm sm:text-base truncate max-w-[120px] sm:max-w-none">{player.name}</h4>
                      {isAdmin && (
                        <div className="flex items-center space-x-1 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => onEditPlayer(player)}
                            className="p-1 bg-white/5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition-all"
                          >
                            <Edit size={10} />
                          </button>
                          <button 
                            onClick={() => setPlayerToDelete(player.id)}
                            className="p-1 bg-white/5 rounded-lg text-gray-400 hover:text-danger hover:bg-danger/10 transition-all"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <button 
                        onClick={() => isAdmin && handleTypeToggle(player.id, player.type)}
                        disabled={!isAdmin}
                        className={`text-[8px] font-black px-1.5 py-0.5 rounded border transition-colors ${
                          player.type === 'MENSALISTA' ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-gray-800 border-border text-gray-400'
                        } ${!isAdmin ? 'cursor-default' : ''}`}
                      >
                        {player.type}
                      </button>
                      <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wider">{player.position}</span>
                      {player.secondaryPosition && (
                         <span className="text-[8px] text-gray-600 font-bold uppercase tracking-wider">/ {player.secondaryPosition}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className={`text-sm font-black ${player.balance >= 0 ? 'text-primary' : 'text-danger'}`}>
                    R$ {(player.balance || 0).toFixed(2)}
                  </div>
                  <p className="text-[8px] text-gray-600 font-bold uppercase">NÍVEL {player.level}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-3 border-t border-border/20">
                <div className="bg-bg/40 p-2 rounded-xl border border-border/20 text-center flex flex-col items-center justify-center">
                  <p className="text-[7px] font-black text-gray-500 uppercase tracking-tighter mb-0.5">Gols</p>
                  <div className="flex items-center space-x-1">
                    <Target size={10} className="text-primary shrink-0" />
                    <p className="text-xs font-bold text-white">{player.gols || 0}</p>
                  </div>
                </div>
                <div className="bg-bg/40 p-2 rounded-xl border border-border/20 text-center flex flex-col items-center justify-center">
                  <p className="text-[7px] font-black text-gray-500 uppercase tracking-tighter mb-0.5">Assists</p>
                  <div className="flex items-center space-x-1">
                    <Star size={10} className="text-primary shrink-0" />
                    <p className="text-xs font-bold text-white">{player.assistencias || 0}</p>
                  </div>
                </div>
                <div className="bg-bg/40 p-2 rounded-xl border border-border/20 text-center flex flex-col items-center justify-center">
                  <p className="text-[7px] font-black text-primary uppercase tracking-tighter mb-0.5">Vits</p>
                  <div className="flex items-center space-x-1">
                    <TrendingUp size={10} className="text-primary shrink-0" />
                    <p className="text-xs font-bold text-primary">{player.vitorias || 0}</p>
                  </div>
                </div>
                <div className="bg-bg/40 p-2 rounded-xl border border-border/20 text-center flex flex-col items-center justify-center">
                  <p className="text-[7px] font-black text-danger uppercase tracking-tighter mb-0.5">Derrots</p>
                  <div className="flex items-center justify-center space-x-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-danger shrink-0" />
                    <p className="text-xs font-bold text-danger">{player.derrotas || 0}</p>
                  </div>
                </div>
                <div className="bg-bg/40 p-2 rounded-xl border border-border/20 text-center flex flex-col items-center justify-center">
                  <p className="text-[7px] font-black text-yellow-500 uppercase tracking-tighter mb-0.5">Emps</p>
                  <div className="flex items-center justify-center space-x-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />
                    <p className="text-xs font-bold text-yellow-500">{player.empates || 0}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between pt-2 gap-3">
                {/* Technical Level Selector */}
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(l => (
                    <button
                      key={l}
                      onClick={() => isAdmin && handleLevelChange(player.id, l)}
                      disabled={!isAdmin}
                      className={`w-6 h-6 rounded-lg text-[9px] font-black transition-all border flex items-center justify-center ${
                        player.level === l 
                          ? 'bg-primary border-primary text-bg' 
                          : 'bg-bg border-border text-gray-600 hover:border-gray-700'
                      } ${!isAdmin ? 'cursor-default opacity-80' : ''}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>

                <div className="text-right">
                  <div className={`text-sm font-black ${player.balance >= 0 ? 'text-primary' : 'text-danger'}`}>
                    R$ {(player.balance || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Other Config Section */}
      <section className="space-y-3">
        <div className="bg-card rounded-3xl border border-border/50 divide-y divide-border/20 overflow-hidden">
          <SettingsLink icon={<Bell size={18}/>} label="Notificações" />
          <SettingsLink icon={<Info size={18}/>} label="Ajuda & Suporte" />
        </div>
      </section>

      <button 
        onClick={logout}
        className="w-full flex items-center justify-center space-x-2 py-6 text-danger font-black uppercase tracking-widest text-xs"
      >
        <LogOut size={16} />
        <span>Sair (Logout)</span>
      </button>
    </div>
  );
}

function SettingsLink({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <div className="flex items-center justify-between p-5 hover:bg-white/5 transition-colors cursor-pointer group">
      <div className="flex items-center space-x-4">
        <div className="text-gray-500 flex items-center justify-center w-5 h-5 shrink-0 group-hover:text-primary transition-colors">{icon}</div>
        <span className="font-semibold text-sm">{label}</span>
      </div>
      <ChevronRight size={16} className="text-gray-700 group-hover:text-white transition-colors" />
    </div>
  );
}
