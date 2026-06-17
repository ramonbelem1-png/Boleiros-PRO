import React, { useState } from 'react';
import { usePelada, GroupSettings, Match, Player, formatPosition } from '../hooks/usePelada';
import { useAuth } from './AuthProvider';
import Logo from './Logo';
import { 
  UserPlus, UserCircle, User, ChevronRight, LogOut, Bell, Shield, Info, Save, 
  History, Calendar, Users, Camera, Upload, Loader2, Trash2, Edit, 
  CheckCircle2, AlertCircle, ArrowUpDown, Filter, Star, Type, Target,
  TrendingUp, Edit2, ShieldCheck, Plus, DollarSign, Search, ArrowRight, Hash
} from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, updateDoc, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import ManagementModals from './ManagementModals';
import { compressImageToBase64 } from '../lib/imageUtils';
import ImageCropper from './ImageCropper';

const removeAccents = (str: string): string => {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

interface SettingsProps {
  onAddPlayer: () => void;
  onEditPlayer: (player: Player) => void;
  updatePlayer: (id: string, data: any) => Promise<void>;
  settings: GroupSettings;
  onUpdateSettings: (settings: GroupSettings) => Promise<void>;
}

export default function Settings({ onAddPlayer, onEditPlayer, updatePlayer, settings, onUpdateSettings }: SettingsProps) {
  const { players, matches, deletePlayer, recalculateAllStats } = usePelada();
  const { logout, role, user } = useAuth();
  const isAdmin = role === 'ADMIN' || user?.email?.trim().toLowerCase() === 'ramonbelem1@gmail.com';
  const currentUserPlayer = players.find(p => p.id === user?.uid);

  const [localSettings, setLocalSettings] = useState<GroupSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [uploadingPlayerId, setUploadingPlayerId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedCropImage, setSelectedCropImage] = useState<string | null>(null);
  const [currentCroppingPlayerId, setCurrentCroppingPlayerId] = useState<string | null>(null);
  const [playerToDelete, setPlayerToDelete] = useState<string | null>(null);
  const [userRoleToDelete, setUserRoleToDelete] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchAccess, setSearchAccess] = useState('');
  const [sortBy, setSortBy] = useState<'number' | 'level' | 'name' | 'position'>('number');
  const [activeSettingsTab, setActiveSettingsTab] = useState<'players' | 'admin' | 'group' | 'profile'>(isAdmin ? 'players' : 'profile');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'loading', msg: string } | null>(null);
  const [showRecalculateConfirm, setShowRecalculateConfirm] = useState(false);

  const filteredPlayers = players.filter(p => 
    removeAccents(p.displayName || p.name).toLowerCase().includes(removeAccents(searchTerm).toLowerCase())
  );

  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    if (sortBy === 'number') {
      const numA = a.number !== undefined && a.number !== null ? a.number : Infinity;
      const numB = b.number !== undefined && b.number !== null ? b.number : Infinity;
      if (numA !== numB) return numA - numB;
      return (a.displayName || a.name).localeCompare(b.displayName || b.name);
    }
    if (sortBy === 'level') return (b.level || 0) - (a.level || 0);
    if (sortBy === 'position') return (a.position || '').localeCompare(b.position || '');
    return (a.displayName || a.name).localeCompare(b.displayName || b.name);
  });

  const duplicatedNumbers = players.reduce((acc, p) => {
    if (p.number !== undefined && p.number !== null) {
      const count = players.filter(hp => hp.number === p.number).length;
      if (count > 1) acc.add(p.number);
    }
    return acc;
  }, new Set<number>());

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
        showFeedback('success', `${userToPromote.displayName || userToPromote.name} agora é administrador.`);
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

  const handleRecalculate = async () => {
    setShowRecalculateConfirm(false);
    showFeedback('loading', 'Recalculando estatísticas...');
    try {
      await recalculateAllStats();
      // No alert needed, usePelada should handle success but since I will remove alert from there too, I'll show it here if it doesn't throw
      showFeedback('success', 'Estatísticas recalculadas com sucesso!');
    } catch (e) {
      showFeedback('error', 'Erro ao recalcular estatísticas.');
    }
  };

  const showFeedback = (type: 'success' | 'error' | 'loading', msg: string) => {
    setFeedback({ type, msg });
    if (type !== 'loading') {
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  // Sync with prop when data finishes loading
  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleLevelChange = async (playerId: string, newLevel: number) => {
    try {
      await updatePlayer(playerId, { level: newLevel });
      const p = players.find(p => p.id === playerId);
      showFeedback('success', `Nível de ${p?.displayName || p?.name} atualizado!`);
    } catch (e) {
      showFeedback('error', 'Erro ao atualizar nível.');
    }
  };

  const handleTypeToggle = async (playerId: string, currentType: string) => {
    try {
      const newType = currentType === 'MENSALISTA' ? 'DIARISTA' : 'MENSALISTA';
      await updatePlayer(playerId, { type: newType });
      const p = players.find(p => p.id === playerId);
      showFeedback('success', `${p?.displayName || p?.name} agora é ${newType.toLowerCase()}.`);
    } catch (e) {
      showFeedback('error', 'Erro ao atualizar tipo.');
    }
  };

  const handleActiveToggle = async (playerId: string, currentActive: boolean) => {
    try {
      await updatePlayer(playerId, { active: !currentActive });
      const p = players.find(p => p.id === playerId);
      showFeedback('success', `Status de ${p?.displayName || p?.name} atualizado!`);
    } catch (e) {
      showFeedback('error', 'Erro ao atualizar status.');
    }
  };

  const handlePhotoUpload = async (playerId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedCropImage(reader.result as string);
      setCurrentCroppingPlayerId(playerId);
    };
    reader.readAsDataURL(file);
  };

  const onCropComplete = async (croppedImage: string) => {
    if (!currentCroppingPlayerId) return;
    
    setUploadingPlayerId(currentCroppingPlayerId);
    setUploadProgress(100);
    
    try {
      await updatePlayer(currentCroppingPlayerId, { photoUrl: croppedImage });
      showFeedback('success', "Foto atualizada!");
    } catch (error: any) {
      showFeedback('error', "Falha ao salvar foto.");
    } finally {
      setUploadingPlayerId(null);
      setSelectedCropImage(null);
      setCurrentCroppingPlayerId(null);
    }
  };

  const handleDeletePlayer = async () => {
    if (playerToDelete) {
      const p = players.find(p => p.id === playerToDelete);
      const playerName = p?.displayName || p?.name;
      try {
        await deletePlayer(playerToDelete);
        showFeedback('success', `${playerName} removido da lista.`);
      } catch (e) {
        showFeedback('error', 'Erro ao remover jogador.');
      }
      setPlayerToDelete(null);
    }
  };

  const updateStat = async (playerId: string, field: string, value: number) => {
    try {
      await updatePlayer(playerId, { [field]: value });
    } catch (e) {
      showFeedback('error', `Erro ao atualizar ${field}.`);
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
    <div className="space-y-6 pb-12">
      {/* Feedback Toast */}
      {feedback && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-2 animate-in fade-in zoom-in duration-300 ${
          feedback.type === 'success' ? 'bg-primary text-bg' : 
          feedback.type === 'loading' ? 'bg-bg border border-primary text-primary' :
          'bg-danger text-white'
        }`}>
          {feedback.type === 'success' ? <CheckCircle2 size={18} /> : 
           feedback.type === 'loading' ? <Loader2 size={18} className="animate-spin" /> :
           <AlertCircle size={18} />}
          <span className="text-xs font-bold uppercase tracking-widest">{feedback.msg}</span>
        </div>
      )}

      {selectedCropImage && (
        <ImageCropper 
          image={selectedCropImage} 
          onCropComplete={onCropComplete} 
          onCancel={() => {
            setSelectedCropImage(null);
            setCurrentCroppingPlayerId(null);
          }} 
        />
      )}

      {/* User Profile Summary - Hidden when on profile tab to avoid redundancy */}
      {activeSettingsTab !== 'profile' && (
        <div className="bg-card rounded-[32px] p-6 border border-border/50 flex items-center gap-4 mb-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0 transition-transform hover:scale-105 border border-primary/20 overflow-hidden">
            {currentUserPlayer?.photoUrl ? (
              <img src={currentUserPlayer.photoUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <UserCircle size={40} className="stroke-[1.5]" />
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white leading-none truncate">
                  {currentUserPlayer?.displayName || currentUserPlayer?.name || user?.displayName || user?.email?.split('@')[0] || 'Usuário'}
                </h2>
                {role === 'ADMIN' && (
                  <span className="bg-primary/20 text-primary text-[10px] font-black px-1.5 py-0.5 rounded border border-primary/30 uppercase tracking-tighter shrink-0">
                    ADMIN
                  </span>
                )}
              </div>
              {currentUserPlayer && (
                <button 
                  onClick={() => onEditPlayer(currentUserPlayer)}
                  className="p-2 bg-white/5 rounded-xl text-gray-400 hover:text-primary transition-all flex items-center gap-2"
                >
                  <Edit2 size={12} />
                  <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Editar Perfil</span>
                </button>
              )}
            </div>
            <p className="text-gray-500 text-[10px] font-medium truncate opacity-70">{user?.email}</p>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex bg-card p-1 rounded-2xl border border-border/50 sticky top-0 z-20 backdrop-blur-md mb-6">
        {[
          { id: 'profile', label: 'Meu Perfil' },
          ...(isAdmin ? [{ id: 'players', label: 'Elenco' }] : []),
          ...(isAdmin ? [
            { id: 'admin', label: 'Acesso' },
            { id: 'group', label: 'Config' }
          ] : [])
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSettingsTab(tab.id as any)}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
              activeSettingsTab === tab.id ? 'bg-primary text-bg shadow-sm' : 'text-gray-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSettingsTab === 'profile' && (
        <div className="space-y-6">
          <div className="bg-card p-6 rounded-[32px] border border-border/50 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-2xl" />
            
            <div className="relative z-10 flex flex-col items-center text-center space-y-4 py-4">
              <div className="w-24 h-24 rounded-3xl bg-bg border-2 border-border/50 overflow-hidden shadow-2xl">
                {currentUserPlayer?.photoUrl ? (
                  <img src={currentUserPlayer.photoUrl} alt={currentUserPlayer.displayName || currentUserPlayer.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary">
                    <User size={40} />
                  </div>
                )}
              </div>
              
              <div>
                <h3 className="text-2xl font-black text-white italic tracking-tighter uppercase">{currentUserPlayer?.displayName || currentUserPlayer?.name}</h3>
                <p className="text-primary text-[10px] font-black uppercase tracking-[0.2em] mt-1">
                  {formatPosition(currentUserPlayer?.position)} • {currentUserPlayer?.type}
                </p>
              </div>

              <div className="grid grid-cols-5 gap-2 w-full pt-4 px-2">
                <div className="text-center">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter mb-1">Jogos</p>
                  <p className="text-base font-black text-white">
                    {(currentUserPlayer?.vitorias || 0) + (currentUserPlayer?.derrotas || 0) + (currentUserPlayer?.empates || 0)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter mb-1">Gols</p>
                  <p className="text-base font-black text-primary">{currentUserPlayer?.gols || 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter mb-1">Assis</p>
                  <p className="text-base font-black text-white">{currentUserPlayer?.assistencias || 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter mb-1">Vits</p>
                  <p className="text-base font-black text-white">{currentUserPlayer?.vitorias || 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter mb-1">Derr</p>
                  <p className="text-base font-black text-white">{currentUserPlayer?.derrotas || 0}</p>
                </div>
              </div>

              <button 
                onClick={() => currentUserPlayer && onEditPlayer(currentUserPlayer)}
                className="w-full py-4 bg-white/5 border border-border/50 rounded-2xl text-[11px] font-black uppercase tracking-widest text-gray-200 hover:bg-white/10 transition-all flex items-center justify-center gap-3 mt-4"
              >
                <Edit2 size={16} />
                Alterar Meus Dados
              </button>
            </div>
          </div>

          <div className="bg-card rounded-3xl border border-border/50 divide-y divide-border/20 overflow-hidden shadow-xl">
            <SettingsLink 
              icon={<Bell size={18}/>} 
              label="Notificações" 
              onClick={() => showFeedback('success', 'Central de notificações em desenvolvimento!')}
            />
          </div>

          <button 
            onClick={logout}
            className="w-full flex items-center justify-center space-x-2 py-6 text-danger font-black uppercase tracking-widest text-xs hover:bg-danger/5 transition-colors rounded-2xl"
          >
            <LogOut size={16} />
            <span>Sair (Logout)</span>
          </button>
        </div>
      )}

      {activeSettingsTab === 'players' && isAdmin && (
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[11px] font-bold tracking-[0.2em] text-primary uppercase">Gerenciar Jogadores</h3>
            <span className="text-[10px] font-bold text-gray-500 px-2 py-1 bg-white/5 rounded-lg border border-border">
              {players.length} TOTAL
            </span>
          </div>

          <div className="relative px-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input 
              className="w-full bg-card border border-border/50 rounded-2xl py-4 pl-12 pr-4 text-sm focus:border-primary outline-none transition-all placeholder:text-gray-600 shadow-xl"
              placeholder="Buscar atleta..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center space-x-2 px-1 overflow-x-auto pb-2 scrollbar-none">
            <div className="flex items-center space-x-1 text-gray-600 mr-2">
              <ArrowUpDown size={12} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Ordem:</span>
            </div>
            {(['number', 'name', 'level', 'position'] as const).filter(s => s !== 'level' || isAdmin).map((s) => (
              <button 
                key={s}
                onClick={() => setSortBy(s)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border shrink-0 ${
                  sortBy === s ? 'bg-primary border-primary text-bg' : 'bg-card border-border text-gray-500'
                }`}
              >
                {s === 'number' ? <Hash size={12} /> : s === 'name' ? <Type size={12} /> : s === 'level' ? <Star size={12} /> : <Target size={12} />}
                <span>{s === 'number' ? 'Camisa' : s === 'name' ? 'Nome' : s === 'level' ? 'Nível' : 'Posição'}</span>
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {sortedPlayers.map(player => (
              <div key={player.id} className="group bg-card p-4 rounded-[28px] border border-border/50 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <label className="relative group/photo cursor-pointer inline-block shrink-0">
                      <div className="w-12 h-12 rounded-2xl bg-bg border border-border flex items-center justify-center font-bold text-gray-400 text-base overflow-hidden transition-all group-hover/photo:border-primary relative">
                        {uploadingPlayerId === player.id ? (
                          <div className="flex flex-col items-center">
                            <Loader2 className="animate-spin text-primary" size={20} />
                            <span className="text-[10px] font-black text-primary mt-1 leading-none">{uploadProgress}%</span>
                          </div>
                        ) : player.photoUrl ? (
                          <img src={player.photoUrl} alt={player.displayName || player.name} className="w-full h-full object-cover" />
                        ) : (
                          (player.displayName || player.name).charAt(0)
                        )}
                        {player.number && (
                          <div className={`absolute top-0 right-0 ${duplicatedNumbers.has(player.number) ? 'bg-danger animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-primary'} text-bg text-[10px] font-black px-1.5 py-0.5 rounded-bl-lg shadow-lg flex items-center gap-1`}>
                            {duplicatedNumbers.has(player.number) && <AlertCircle size={8} />}
                            #{player.number}
                          </div>
                        )}
                      </div>
                      {(isAdmin || player.id === user?.uid) && (
                        <>
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
                        </>
                      )}
                    </label>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2 min-w-0">
                        <h4 className="font-bold text-white tracking-tight text-sm truncate">{player.displayName || player.name}</h4>
                        {(isAdmin || player.id === user?.uid) && (
                          <button 
                            onClick={() => onEditPlayer(player)}
                            className="p-1.5 bg-white/5 rounded-lg text-gray-400 hover:text-primary transition-all shrink-0"
                          >
                            <Edit2 size={10} />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 mt-0.5 overflow-hidden">
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border shrink-0 ${
                            player.type === 'MENSALISTA' ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-gray-800 border-border text-gray-400'
                          }`}>
                            {player.type}
                        </span>
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider truncate">{formatPosition(player.position)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0">
                    <button 
                      onClick={() => handleActiveToggle(player.id, player.active)}
                      className={`text-[10px] font-black px-1.5 py-0.5 rounded border mb-2 transition-all ${
                        player.active ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-danger/10 border-danger/20 text-danger'
                      }`}
                    >
                      {player.active ? 'ATIVO' : 'INATIVO'}
                    </button>
                    {isAdmin && (
                      <div className={`text-sm font-black ${player.balance >= 0 ? 'text-primary' : 'text-danger'}`}>
                        R$ {(player.balance || 0).toFixed(2)}
                      </div>
                    )}
                    {isAdmin && (
                      <div className="flex gap-1 mt-1 justify-end">
                        {[1, 2, 3, 4, 5].map(l => (
                          <div 
                            key={l}
                            className={`w-2 h-2 rounded-full ${player.level >= l ? 'bg-primary' : 'bg-gray-800'}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-1 pt-3 border-t border-border/20">
                  <StatBox 
                    label="Gols" 
                    value={player.gols || 0} 
                    color="text-white" 
                    editable={isAdmin} 
                    onIncrement={() => updateStat(player.id, 'gols', (player.gols || 0) + 1)}
                    onDecrement={() => updateStat(player.id, 'gols', Math.max(0, (player.gols || 0) - 1))}
                  />
                  <StatBox 
                    label="Assists" 
                    value={player.assistencias || 0} 
                    color="text-white" 
                    editable={isAdmin} 
                    onIncrement={() => updateStat(player.id, 'assistencias', (player.assistencias || 0) + 1)}
                    onDecrement={() => updateStat(player.id, 'assistencias', Math.max(0, (player.assistencias || 0) - 1))}
                  />
                  <StatBox 
                    label="Vits" 
                    value={player.vitorias || 0} 
                    color="text-primary" 
                    editable={isAdmin} 
                    onIncrement={() => updateStat(player.id, 'vitorias', (player.vitorias || 0) + 1)}
                    onDecrement={() => updateStat(player.id, 'vitorias', Math.max(0, (player.vitorias || 0) - 1))}
                  />
                  <StatBox 
                    label="Derr" 
                    value={player.derrotas || 0} 
                    color="text-danger" 
                    editable={isAdmin} 
                    onIncrement={() => updateStat(player.id, 'derrotas', (player.derrotas || 0) + 1)}
                    onDecrement={() => updateStat(player.id, 'derrotas', Math.max(0, (player.derrotas || 0) - 1))}
                  />
                  <StatBox 
                    label="Emp" 
                    value={player.empates || 0} 
                    color="text-yellow-500" 
                    editable={isAdmin} 
                    onIncrement={() => updateStat(player.id, 'empates', (player.empates || 0) + 1)}
                    onDecrement={() => updateStat(player.id, 'empates', Math.max(0, (player.empates || 0) - 1))}
                  />
                </div>
                
                {isAdmin && (
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(l => (
                        <button 
                          key={l}
                          onClick={() => handleLevelChange(player.id, l)}
                          className={`w-7 h-7 rounded-lg text-[10px] font-black transition-all border flex items-center justify-center ${
                            player.level === l ? 'bg-primary border-primary text-bg' : 'bg-bg border-border text-gray-600'
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    {player.email !== 'ramonbelem1@gmail.com' && (
                      <button 
                        onClick={() => setPlayerToDelete(player.id)}
                        className="p-2 text-danger/50 hover:text-danger transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSettingsTab === 'admin' && isAdmin && (
        <div className="space-y-6">
          <div className="bg-card p-6 rounded-[32px] border border-border/50 space-y-6 shadow-xl">
            <h3 className="text-[11px] font-bold tracking-[0.2em] text-primary uppercase">Adicionar Administrador</h3>
            <div className="flex gap-2">
              <input 
                className="flex-1 bg-bg border border-border rounded-xl px-4 py-3 text-sm focus:border-primary outline-none text-white"
                placeholder="E-mail do novo admin"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
              <button 
                onClick={handleAddAdmin}
                className="bg-primary text-bg p-3 rounded-xl hover:opacity-90 transition-all active:scale-95"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-[11px] font-bold tracking-[0.2em] text-gray-500 uppercase px-2">Lista de Acessos</h3>
            
            {/* Campo de Busca na Lista de Acessos */}
            <div className="relative px-2">
              <input 
                value={searchAccess}
                onChange={(e) => setSearchAccess(e.target.value)}
                className="w-full bg-card border border-border/50 rounded-2xl py-3 px-4 pl-10 text-xs focus:border-primary outline-none text-white transition-all placeholder:text-gray-500 font-semibold shadow-inner"
                placeholder="Buscar acesso por nome ou e-mail..."
              />
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
            </div>

            {/* Automatic Approval Toggle */}
            <div className="bg-card p-4 rounded-3xl border border-border/50 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${settings.autoApprove ? 'bg-primary/10 text-primary' : 'bg-gray-800 text-gray-500'}`}>
                  {settings.autoApprove ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-sm text-gray-200 leading-tight">Aprovação Automática</h4>
                  <p className="text-[10px] text-gray-500 truncate">
                    {settings.autoApprove 
                      ? 'Novos cadastros são aprovados automaticamente' 
                      : 'Novos cadastros necessitam de aprovação manual'
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={async () => {
                  try {
                    const newAutoApprove = !settings.autoApprove;
                    await updateDoc(doc(db, 'groups', 'main'), { autoApprove: newAutoApprove });
                    // Inform the user
                    showFeedback('success', `Aprovação automática ${newAutoApprove ? 'ativada' : 'desativada'}!`);
                  } catch (e) {
                    console.error(e);
                    showFeedback('error', 'Erro ao alterar configuração.');
                  }
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.autoApprove ? 'bg-primary' : 'bg-gray-700'
                }`}
                role="switch"
                aria-checked={settings.autoApprove}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-bg shadow ring-0 transition duration-200 ease-in-out ${
                    settings.autoApprove ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {(() => {
              const filteredUserRoles = userRoles.filter(ur => {
                const matchedPlayer = players.find(p => p.id === ur.id) || (ur.email ? players.find(p => p.email?.trim().toLowerCase() === ur.email.trim().toLowerCase()) : null);
                const displayNameForMatches = matchedPlayer ? (matchedPlayer.displayName || matchedPlayer.name) : (ur.displayName || ur.name || 'Usuário');
                
                const searchNormalized = removeAccents(searchAccess).toLowerCase();
                
                const nameMatches = removeAccents(displayNameForMatches).toLowerCase().includes(searchNormalized);
                const emailMatches = ur.email ? removeAccents(ur.email).toLowerCase().includes(searchNormalized) : false;
                
                return nameMatches || emailMatches;
              });

              if (filteredUserRoles.length === 0) {
                return (
                  <div className="text-center py-8 text-gray-500 text-xs font-semibold uppercase tracking-widest animate-pulse">
                    Nenhum acesso correspondente
                  </div>
                );
              }

              return filteredUserRoles.map(ur => {
                const matchedPlayer = players.find(p => p.id === ur.id) || (ur.email ? players.find(p => p.email?.trim().toLowerCase() === ur.email.trim().toLowerCase()) : null);
                const displayNameForMatches = matchedPlayer ? (matchedPlayer.displayName || matchedPlayer.name) : (ur.displayName || ur.name || 'Usuário');
                return (
                  <div key={ur.id} className="bg-card p-4 rounded-3xl border border-border/50 flex items-center justify-between gap-3 overflow-hidden">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${ur.role === 'ADMIN' ? 'bg-primary/10 text-primary' : 'bg-gray-800 text-gray-500'}`}>
                        {ur.role === 'ADMIN' ? <ShieldCheck size={20} /> : <User size={20} />}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-gray-200 leading-tight truncate">{displayNameForMatches}</h4>
                        <p className="text-[10px] text-gray-500 truncate">{ur.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button 
                        onClick={() => updateDoc(doc(db, 'user_roles', ur.id), { approved: !ur.approved })}
                        disabled={ur.id === user?.uid}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border ${
                          ur.approved ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-danger/10 border-danger/20 text-danger'
                        } disabled:opacity-50`}
                      >
                        {ur.approved ? 'OK' : 'PEND'}
                      </button>
                      <select 
                        value={ur.role || 'USER'}
                        onChange={(e) => updateDoc(doc(db, 'user_roles', ur.id), { role: e.target.value })}
                        disabled={ur.id === user?.uid}
                        className="bg-bg border border-border rounded-lg pl-1 pr-0 py-1 text-[10px] font-bold text-gray-400 outline-none focus:border-primary disabled:opacity-50 w-16"
                      >
                        <option value="ADMIN">ADM</option>
                        <option value="USER">USER</option>
                      </select>
                      <button
                        onClick={() => setUserRoleToDelete(ur)}
                        disabled={ur.id === user?.uid}
                        className="p-1.5 bg-red-500/15 hover:bg-red-500/30 text-red-400 rounded-lg transition-all disabled:opacity-50"
                        title="Excluir Acesso e Jogador"
                      >
                        <Trash2 size={12} fill="currentColor" className="fill-transparent" />
                      </button>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {activeSettingsTab === 'group' && isAdmin && (
        <div className="space-y-6">
          <div className="bg-card p-6 rounded-[32px] border border-border/50 space-y-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold tracking-[0.2em] text-primary uppercase">Acesso Rápido Financeiro</h3>
            </div>
            <button 
              onClick={() => {
                alert("Use o ícone de cifrão (R$) na barra inferior para acessar o Extrato completo.");
              }}
              className="w-full bg-bg p-4 rounded-2xl border border-border/50 flex items-center justify-between group active:scale-95 transition-all"
            >
              <div className="flex items-center space-x-3 text-primary">
                <div className="p-2 bg-primary/10 rounded-xl group-hover:bg-primary group-hover:text-bg transition-colors">
                  <DollarSign size={18} />
                </div>
                <span className="font-bold text-sm text-white">Visualizar Extrato (Financeiro)</span>
              </div>
              <ArrowRight size={16} className="text-gray-500 group-hover:text-white transition-colors" />
            </button>
          </div>

          <div className="bg-card p-6 rounded-[32px] border border-border/50 space-y-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold tracking-[0.2em] text-primary uppercase">Configurações Gerais</h3>
              {saving && <Loader2 className="animate-spin text-primary" size={16} />}
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              <SettingsInput 
                icon={<DollarSign size={14}/>} 
                label="Mensalidade" 
                value={localSettings.monthlyFee}
                isCurrency
                onChange={(v) => setLocalSettings({...localSettings, monthlyFee: Number(v)})}
              />
              <SettingsInput 
                icon={<DollarSign size={14}/>} 
                label="Diarista" 
                value={localSettings.dailyFee}
                isCurrency
                onChange={(v) => setLocalSettings({...localSettings, dailyFee: Number(v)})}
              />
              <SettingsInput 
                icon={<Calendar size={14}/>} 
                label="Dia Vencimento Mensalidade" 
                value={localSettings.monthlyFeeDueDay}
                onChange={(v) => setLocalSettings({...localSettings, monthlyFeeDueDay: Number(v)})}
              />
              <SettingsInput 
                icon={<Users size={14}/>} 
                label="Limite de Jogadores (Pelada)" 
                value={localSettings.maxPlayers}
                onChange={(v) => setLocalSettings({...localSettings, maxPlayers: Number(v)})}
              />
              <SettingsInput 
                icon={<Users size={14}/>} 
                label="Limite de Jogadores (Elenco)" 
                value={localSettings.maxSquadSize}
                onChange={(v) => setLocalSettings({...localSettings, maxSquadSize: Number(v)})}
              />
            </div>

            <button 
              onClick={handleSaveSettings}
              disabled={saving}
              className="w-full py-4 bg-primary text-bg rounded-2xl font-black uppercase tracking-widest mt-2 flex items-center justify-center space-x-2 shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
            >
              <Save size={18} />
              <span>Salvar Alterações</span>
            </button>
          </div>

          {isAdmin && (
            <div className="bg-card p-6 rounded-[32px] border border-border/50 space-y-6 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <h3 className="text-[11px] font-bold tracking-[0.2em] text-danger uppercase">Ferramentas de Manutenção</h3>
                </div>
                <span className="text-[10px] font-black bg-danger/10 text-danger px-2 py-0.5 rounded-full uppercase tracking-tighter">Admin Access</span>
              </div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tight leading-relaxed">
                Use esta ferramenta se as estatísticas do ranking estiverem incorretas ou se você excluiu partidas manualmente e os dados não foram sincronizados.
              </p>
              
              {!showRecalculateConfirm ? (
                <button 
                  onClick={() => setShowRecalculateConfirm(true)}
                  className="w-full py-4 bg-white/5 border border-danger/30 text-danger rounded-2xl font-black uppercase tracking-widest flex items-center justify-center space-x-2 hover:bg-danger/10 transition-all active:scale-95"
                >
                  <TrendingUp size={18} />
                  <span>Recalcular Estatísticas</span>
                </button>
              ) : (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
                  <p className="text-[10px] font-black text-danger text-center bg-danger/5 p-3 rounded-xl border border-danger/20">
                    TEM CERTEZA? ISSO IRÁ RESETAR E RECONSTRUIR TODO O RANKING.
                  </p>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setShowRecalculateConfirm(false)}
                      className="flex-1 py-4 bg-bg border border-border text-gray-500 rounded-xl text-[10px] font-black uppercase tracking-widest"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleRecalculate}
                      className="flex-[2] py-4 bg-danger text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-danger/20 active:scale-95 transition-all"
                    >
                      Confirmar Recálculo
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-card rounded-3xl border border-border/20 divide-y divide-border/20 overflow-hidden shadow-xl">
            <SettingsLink 
              icon={<Bell size={18}/>} 
              label="Notificações" 
              onClick={() => showFeedback('success', 'Central de notificações em desenvolvimento!')}
            />
          </div>

          <button 
            onClick={logout}
            className="w-full flex items-center justify-center space-x-2 py-6 text-danger font-black uppercase tracking-widest text-xs hover:bg-danger/5 transition-colors rounded-2xl"
          >
            <LogOut size={16} />
            <span>Sair (Logout)</span>
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {playerToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-6">
          <div className="bg-card w-full max-w-sm rounded-[44px] p-8 border border-border/50 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto mb-6">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-black text-center mb-2 text-white">Remover Jogador?</h3>
            <p className="text-gray-500 text-center text-sm mb-8">Esta ação não pode ser desfeita. O jogador será excluído permanentemente do elenco.</p>
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

      {/* Delete User Role & Player Confirmation Modal */}
      {userRoleToDelete && (() => {
        const matchedPlayer = players.find(p => p.id === userRoleToDelete.id) || (userRoleToDelete.email ? players.find(p => p.email?.trim().toLowerCase() === userRoleToDelete.email.trim().toLowerCase()) : null);
        const nameToShow = matchedPlayer ? (matchedPlayer.displayName || matchedPlayer.name) : (userRoleToDelete.displayName || userRoleToDelete.name || userRoleToDelete.email || 'Usuário');
        
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-6">
            <div className="bg-card w-full max-w-sm rounded-[44px] p-8 border border-border/50 shadow-2xl">
              <div className="w-16 h-16 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-black text-center mb-2 text-white">Excluir Acesso?</h3>
              <p className="text-gray-500 text-center text-sm mb-6">
                Deseja excluir permanentemente o cadastro de acesso de <strong>{nameToShow}</strong>?
              </p>
              <p className="text-xs text-danger/80 text-center font-semibold mb-8">
                Isso também excluirá o jogador correspondente do elenco de forma definitiva. Esta ação não poderá ser desfeita.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setUserRoleToDelete(null)}
                  className="flex-1 py-4 bg-white/5 border border-border text-gray-400 font-bold uppercase tracking-widest text-[10px] rounded-2xl"
                >
                  Cancelar
                </button>
                <button 
                  onClick={async () => {
                    try {
                      const ur = userRoleToDelete;
                      setUserRoleToDelete(null); // Close immediately first

                      // 1. Excluir da coleção user_roles
                      await deleteDoc(doc(db, 'user_roles', ur.id));

                      // 2. Excluir o jogador do elenco correspondente (por ID ou por email se os IDs diferirem)
                      const playerById = players.find(p => p.id === ur.id);
                      if (playerById) {
                        await deletePlayer(playerById.id);
                      } else if (ur.email) {
                        const trimmedEmail = ur.email.trim().toLowerCase();
                        const playerByEmail = players.find(p => p.email?.trim().toLowerCase() === trimmedEmail);
                        if (playerByEmail) {
                          await deletePlayer(playerByEmail.id);
                        }
                      }

                      showFeedback('success', `Acesso e jogador correspondente de "${nameToShow}" excluídos com sucesso!`);
                    } catch (err: any) {
                      console.error(err);
                      showFeedback('error', 'Erro ao excluir acesso do usuário.');
                    }
                  }}
                  className="flex-1 py-4 bg-danger text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-lg shadow-danger/20"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function SettingsLink({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className="flex items-center justify-between p-5 hover:bg-white/5 transition-colors cursor-pointer group"
    >
      <div className="flex items-center space-x-4">
        <div className="text-gray-500 flex items-center justify-center w-5 h-5 shrink-0 group-hover:text-primary transition-colors">{icon}</div>
        <span className="font-semibold text-sm">{label}</span>
      </div>
      <ChevronRight size={16} className="text-gray-700 group-hover:text-white transition-colors" />
    </div>
  );
}

function SettingsInput({ 
  icon, 
  label, 
  value, 
  onChange,
  isCurrency = false
}: { 
  icon: React.ReactNode, 
  label: string, 
  value: number, 
  onChange: (v: string) => void,
  isCurrency?: boolean
}) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val);
  };

  const [internalValue, setInternalValue] = React.useState(
    isCurrency ? formatCurrency(value) : value.toString()
  );

  React.useEffect(() => {
    if (isCurrency) {
      setInternalValue(formatCurrency(value));
    } else if (parseFloat(internalValue) !== value && internalValue !== "") {
      setInternalValue(value.toString());
    }
  }, [value, isCurrency]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value;

    if (isCurrency) {
      // Remove everything except digits
      const digits = v.replace(/\D/g, "");
      const numericValue = digits ? parseInt(digits, 10) / 100 : 0;
      
      setInternalValue(formatCurrency(numericValue));
      onChange(numericValue.toString());
    } else {
      setInternalValue(v);
      if (v !== "") {
        onChange(v);
      } else {
        onChange("0");
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center space-x-2 text-gray-500 mb-1">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <input 
        type={isCurrency ? "text" : "number"}
        inputMode={isCurrency ? "numeric" : "decimal"}
        className="w-full bg-bg border border-border rounded-xl p-3 text-white focus:border-primary outline-none text-sm transition-all shadow-inner"
        value={internalValue}
        onChange={handleInputChange}
        onBlur={() => {
          if (!isCurrency && internalValue === "") {
            setInternalValue(value.toString());
          }
        }}
      />
    </div>
  );
}

function StatBox({ 
  label, 
  value, 
  color, 
  editable, 
  onIncrement, 
  onDecrement 
}: { 
  label: string, 
  value: number | string, 
  color: string,
  editable?: boolean,
  onIncrement?: () => void,
  onDecrement?: () => void
}) {
  return (
    <div className="bg-bg/40 p-2 rounded-xl border border-border/20 text-center flex flex-col items-center justify-center relative group">
      <p className="text-[10px] font-black text-gray-500 uppercase tracking-tighter mb-0.5">{label}</p>
      <div className="flex items-center gap-1">
        {editable && (
          <button 
            onClick={(e) => { e.stopPropagation(); onDecrement?.(); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/10 hover:bg-white/20 rounded h-4 w-4 flex items-center justify-center -ml-1 text-[10px]"
          >
            -
          </button>
        )}
        <p className={`text-xs font-bold ${color}`}>{value}</p>
        {editable && (
          <button 
            onClick={(e) => { e.stopPropagation(); onIncrement?.(); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/10 hover:bg-white/20 rounded h-4 w-4 flex items-center justify-center -mr-1 text-[10px]"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}
