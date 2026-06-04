import React, { useState, useEffect } from 'react';
import { Player, Transaction, usePelada } from '../hooks/usePelada';
import { X, Calendar, DollarSign, Tag, UserPlus, Camera, Upload, Loader2, Edit, Trash2, AlertCircle, User, Check } from 'lucide-react';
import { storage } from '../lib/firebase';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { useAuth } from './AuthProvider';
import { compressImageToBase64 } from '../lib/imageUtils';
import ImageCropper from './ImageCropper';

interface ModalProps {
  type: 'match' | 'finance' | 'player' | null;
  editingPlayer?: Player | null;
  editingTransaction?: Transaction | null;
  onClose: () => void;
}

export default function ManagementModals({ type, editingPlayer, editingTransaction, onClose }: ModalProps) {
  const { createMatch, createTransaction, updateTransaction, addPlayer, updatePlayer } = usePelada();

  if (!type) return null;

  return (
    <div className="fixed inset-0 bg-bg/95 backdrop-blur-md z-[100] flex items-center justify-center p-6">
      <div className="bg-card w-full max-w-sm rounded-[44px] p-8 border border-border/50 shadow-2xl relative max-h-[90vh] overflow-hidden flex flex-col">
        <button onClick={onClose} className="absolute top-6 right-6 text-gray-500 hover:text-white transition-colors z-10"><X size={24}/></button>

        <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin">
          {type === 'match' && <CreateMatchModal onSave={createMatch} onClose={onClose} />}
          {type === 'finance' && (
            <TransactionModal 
              onSave={async (data: any) => {
                if (editingTransaction) {
                  await updateTransaction(editingTransaction.id, data);
                } else {
                  await createTransaction(data);
                }
              }} 
              onClose={onClose} 
              initialData={editingTransaction}
            />
          )}
          {type === 'player' && (
            <PlayerModal 
              onSave={async (data: any) => {
              try {
                if (editingPlayer) {
                  await updatePlayer(editingPlayer.id, data);
                } else {
                  await addPlayer(data);
                }
              } catch (err: any) {
                console.error("Erro no callback de salvamento:", err);
                alert("Erro ao processar: " + (err.message || "Erro desconhecido."));
                throw err;
              }
            }} 
            onClose={onClose} 
            initialData={editingPlayer}
          />
        )}
        </div>
      </div>
    </div>
  );
}

function CreateEventModal({ onSave, onClose }: any) {
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState('');

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-black italic tracking-tighter uppercase underline decoration-primary decoration-4 underline-offset-4 mb-8 text-white">Novo Churrasco</h3>
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">Nome do Evento</label>
        <input 
          className="w-full bg-bg border border-border rounded-2xl p-4 text-gray-100 focus:border-primary outline-none"
          placeholder="Ex: Resenha de Sexta"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">Custo Total (R$)</label>
        <input 
          type="number"
          className="w-full bg-bg border border-border rounded-2xl p-4 text-gray-100 focus:border-primary outline-none"
          placeholder="0,00"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />
      </div>
      <button 
        onClick={async () => {
          if(!title || !cost) return;
          await onSave({ title, totalCost: Number(cost), costPerPerson: Number(cost) / 10 }); // Dummy per person
          onClose();
        }}
        className="w-full py-5 bg-primary text-bg rounded-2xl font-black uppercase tracking-widest mt-4 shadow-lg shadow-primary/20 transition-all active:scale-95"
      >
        Agendar Resenha
      </button>
    </div>
  );
}

function CreateMatchModal({ onSave, onClose }: any) {
  const [date, setDate] = useState('');
  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-black italic tracking-tighter uppercase underline decoration-primary decoration-4 underline-offset-4 mb-8">Nova Pelada</h3>
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">Data e Hora</label>
        <input 
          type="datetime-local"
          className="w-full bg-bg border border-border rounded-2xl p-4 text-gray-100 focus:border-primary outline-none"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <button 
        onClick={async () => {
          if(!date) return;
          await onSave(new Date(date));
          onClose();
        }}
        className="w-full py-5 bg-primary text-bg rounded-2xl font-black uppercase tracking-widest mt-4 shadow-lg shadow-primary/20 transition-all active:scale-95"
      >
        Abrir Lista
      </button>
    </div>
  );
}

function TransactionModal({ onSave, onClose, initialData }: any) {
  const { players } = usePelada();
  
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val);
  };

  const [amount, setAmount] = useState(initialData?.amount || 0);
  const [displayAmount, setDisplayAmount] = useState(formatCurrency(initialData?.amount || 0));
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>(initialData?.type || 'INCOME');
  const [desc, setDesc] = useState(initialData?.description || '');
  const [category, setCategory] = useState(initialData?.category || 'OTHER');
  const [playerId, setPlayerId] = useState(initialData?.playerId || '');
  
  // Ref mensalidade
  const now = new Date();
  const [refMonth, setRefMonth] = useState(initialData?.referenceMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (category === 'MONTHLY') {
      const [year, month] = refMonth.split('-');
      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      setDesc(`Mensalidade - ${monthNames[parseInt(month) - 1]}/${year.substring(2)}`);
    } else if (category === 'DAILY') {
      setDesc('Diarista');
    }
  }, [category, refMonth]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    const digits = v.replace(/\D/g, "");
    const numericValue = digits ? parseInt(digits, 10) / 100 : 0;
    setAmount(numericValue);
    setDisplayAmount(formatCurrency(numericValue));
  };

  const categories = [
    { id: 'MONTHLY', label: 'Mensalidade' },
    { id: 'DAILY', label: 'Diarista' },
    { id: 'FIELD_RENT', label: 'Aluguel' },
    { id: 'BALL', label: 'Bola' },
    { id: 'OTHER', label: 'Outros' }
  ];

  const months = [
    { id: '01', name: 'Jan' }, { id: '02', name: 'Fev' }, { id: '03', name: 'Mar' }, { id: '04', name: 'Abr' },
    { id: '05', name: 'Mai' }, { id: '06', name: 'Jun' }, { id: '07', name: 'Jul' }, { id: '08', name: 'Ago' },
    { id: '09', name: 'Set' }, { id: '10', name: 'Out' }, { id: '11', name: 'Nov' }, { id: '12', name: 'Dez' }
  ];

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="space-y-6 pb-4">
      <h3 className="text-2xl font-black italic tracking-tighter uppercase underline decoration-primary decoration-4 underline-offset-4 mb-8">
        {initialData ? 'Editar Lançamento' : 'Novo Lançamento'}
      </h3>
      
      <div className="flex gap-2">
        {['INCOME', 'EXPENSE'].map(t => (
          <button 
            key={t}
            onClick={() => setType(t as any)}
            className={`flex-1 py-3 rounded-xl border text-[10px] font-black tracking-widest transition-all ${
              type === t ? 'bg-primary border-primary text-bg' : 'border-border text-gray-500'
            }`}
          >
            {t === 'INCOME' ? 'ENTRADA' : 'SAÍDA'}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">Categoria</label>
        <div className="grid grid-cols-2 gap-2">
          {categories.map(cat => (
            <button 
              key={cat.id}
              onClick={() => setCategory(cat.id as any)}
              className={`py-2 px-3 rounded-lg border text-[8px] font-black tracking-widest text-left flex items-center justify-between transition-all ${
                category === cat.id ? 'bg-primary/20 border-primary text-primary' : 'border-border text-gray-500'
              }`}
            >
              {cat.label.toUpperCase()}
              {category === cat.id && <Check size={10} />}
            </button>
          ))}
        </div>
      </div>

      {category === 'MONTHLY' && (
        <div className="space-y-2 p-3 bg-bg/50 rounded-2xl border border-border/50">
          <label className="text-[10px] font-bold uppercase tracking-widest text-primary px-1">Referência do Mês</label>
          <div className="grid grid-cols-4 gap-1">
            {months.map(m => (
              <button
                key={m.id}
                onClick={() => setRefMonth(`${refMonth.split('-')[0]}-${m.id}`)}
                className={`py-1.5 rounded-lg text-[9px] font-bold border ${
                  refMonth.split('-')[1] === m.id ? 'bg-primary text-bg border-primary' : 'border-border/30 text-gray-500'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
          <div className="flex gap-1 mt-2">
            {years.map(y => (
              <button
                key={y}
                onClick={() => setRefMonth(`${y}-${refMonth.split('-')[1]}`)}
                className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold border ${
                  Number(refMonth.split('-')[0]) === y ? 'bg-white/10 text-white border-white/20' : 'border-border/30 text-gray-500'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      )}

      {(category === 'MONTHLY' || category === 'DAILY') && (
        <div className="space-y-2">
          <div className="flex justify-between items-center px-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Jogador Responsável</label>
            {playerId && (
              <button onClick={() => setPlayerId('')} className="text-[10px] text-primary font-bold">Limpar</button>
            )}
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1 p-2 bg-bg/50 rounded-xl border border-border/50 scrollbar-thin">
            {players.map(p => (
              <button
                key={p.id}
                onClick={() => setPlayerId(p.id)}
                className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-all ${
                  playerId === p.id ? 'bg-primary text-bg' : 'hover:bg-white/5 text-gray-400'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    playerId === p.id ? 'bg-bg/20' : 'bg-gray-800'
                  }`}>
                    {(p.displayName || p.name).charAt(0)}
                  </div>
                  <span className="text-xs font-semibold truncate">{p.displayName || p.name}</span>
                </div>
                {playerId === p.id && <Check size={14} />}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">Valor</label>
        <div className="relative">
          <input 
            type="text"
            inputMode="numeric"
            className="w-full bg-bg border border-border rounded-2xl p-4 text-gray-100 focus:border-primary outline-none text-xl font-black"
            placeholder="R$ 0,00"
            value={displayAmount}
            onChange={handleAmountChange}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">Descrição</label>
        <input 
          className="w-full bg-bg border border-border rounded-2xl p-4 text-gray-100 focus:border-primary outline-none"
          placeholder="Ex: Mensalidade João, Aluguel Quadra..."
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
      </div>

      <button 
        disabled={saving}
        onClick={async () => {
          if(!amount || !desc) return;
          setSaving(true);
          try {
            await onSave({ 
              amount, 
              type, 
              description: desc, 
              category,
              referenceMonth: category === 'MONTHLY' ? refMonth : null,
              playerId: playerId || null 
            });
            onClose();
          } catch (e) {
            alert("Erro ao salvar lançamento");
          } finally {
            setSaving(false);
          }
        }}
        className="w-full py-5 bg-primary text-bg rounded-2xl font-black uppercase tracking-widest mt-4 shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving && <Loader2 className="animate-spin" size={18} />}
        {initialData ? 'Salvar Alterações' : 'Lançar no Caixa'}
      </button>
    </div>
  );
}

function PlayerModal({ onSave, onClose, initialData }: any) {
  const { players, settings } = usePelada();
  const { role, user } = useAuth();
  const isAdmin = role === 'ADMIN' || user?.email?.trim().toLowerCase() === 'ramonbelem1@gmail.com';
  const [fullName, setFullName] = useState(initialData?.fullName || '');
  const [displayName, setDisplayName] = useState(initialData?.displayName || initialData?.name || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [pos, setPos] = useState(initialData?.position || 'VOLANTE');
  const [secondaryPos, setSecondaryPos] = useState(initialData?.secondaryPosition || '');
  const [level, setLevel] = useState(initialData?.level || 3);
  const [type, setType] = useState(initialData?.type || 'DIARISTA');
  const [photoUrl, setPhotoUrl] = useState(initialData?.photoUrl || '');
  const [gols, setGols] = useState(initialData?.gols || 0);
  const [assistencias, setAssistencias] = useState(initialData?.assistencias || 0);
  const [vitorias, setVitorias] = useState(initialData?.vitorias || 0);
  const [derrotas, setDerrotas] = useState(initialData?.derrotas || 0);
  const [empates, setEmpates] = useState(initialData?.empates || 0);
  const [contra, setContra] = useState(initialData?.contra || 0);
  const [number, setNumber] = useState(initialData?.number !== undefined && initialData?.number !== null ? String(initialData.number) : '');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setFullName(initialData.fullName || '');
      setDisplayName(initialData.displayName || initialData.name || '');
      setEmail(initialData.email || '');
      setPos(initialData.position || 'VOLANTE');
      setSecondaryPos(initialData.secondaryPosition && initialData.secondaryPosition !== 'NENHUMA' ? initialData.secondaryPosition : '');
      setLevel(initialData.level || 3);
      setType(initialData.type || 'DIARISTA');
      setPhotoUrl(initialData.photoUrl || '');
      setGols(initialData.gols || 0);
      setAssistencias(initialData.assistencias || 0);
      setVitorias(initialData.vitorias || 0);
      setDerrotas(initialData.derrotas || 0);
      setEmpates(initialData.empates || 0);
      setContra(initialData.contra || 0);
      setNumber(initialData.number !== undefined && initialData.number !== null ? String(initialData.number) : '');
    } else {
      setFullName('');
      setDisplayName('');
      setEmail('');
      setPos('VOLANTE');
      setSecondaryPos('');
      setLevel(3);
      setType('DIARISTA');
      setPhotoUrl('');
      setGols(0);
      setAssistencias(0);
      setVitorias(0);
      setDerrotas(0);
      setEmpates(0);
      setContra(0);
      setNumber('');
    }
  }, [initialData]);

  const squadFull = !initialData && players.length >= settings.maxSquadSize;

  // Unicidade do número em tempo real
  const takenBy = number !== '' ? players.find(p => p.number === Number(number) && p.id !== initialData?.id) : null;
  const numberIsTaken = !!takenBy;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("A imagem deve ter no máximo 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const onCropComplete = (croppedImage: string) => {
    setPhotoUrl(croppedImage);
    setSelectedImage(null);
    showFeedback('success', "Foto recortada!");
  };

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleSave = async () => {
    if(!fullName || !displayName) {
      showFeedback('error', "Por favor, preencha os campos de nome.");
      return;
    }

    if (squadFull) {
      showFeedback('error', "Limite de elenco atingido! Aumente o limite nas configurações.");
      return;
    }

    if (numberIsTaken) {
      showFeedback('error', `O número ${number} já está sendo usado por ${takenBy?.displayName || takenBy?.name}!`);
      return;
    }
    
    setSaving(true);
    // Campos permitidos para usuários comuns nas regras do Firestore
    // Note: secondaryPosition must be string, not null, based on our previous logic
    const userData = {
      name: displayName.trim(), // Use display name for generic 'name' field if still needed elsewhere
      fullName: fullName.trim(),
      displayName: displayName.trim(),
      email: email.trim().toLowerCase(),
      position: pos,
      secondaryPosition: secondaryPos || "NENHUMA",
      photoUrl: photoUrl || "",
      number: number !== '' ? Number(number) : null
    };

    // Todos os campos para administradores
    const adminData = {
      ...userData,
      type,
      level,
      gols: Number(gols) || 0,
      assistencias: Number(assistencias) || 0,
      vitorias: Number(vitorias) || 0,
      derrotas: Number(derrotas) || 0,
      empates: Number(empates) || 0,
      contra: Number(contra) || 0
    };

    try {
      console.log(`[PlayerModal] Tentando salvar. UID Autenticado: ${user?.uid}, Email: ${user?.email}, Documento ID: ${initialData?.id || 'NOVO'}, Role: ${role}, isAdmin (calc): ${isAdmin}`);
      const payload = isAdmin ? adminData : userData;
      console.log("[PlayerModal] Payload final:", JSON.stringify(payload));
      await onSave(payload);
      console.log("[PlayerModal] Salvo com sucesso!");
      onClose();
    } catch (error: any) {
      console.error("Erro fatal ao salvar perfil:", error);
      let errorMsg = "Erro ao salvar perfil.";
      if (error.message?.includes('permission-denied')) {
        errorMsg = "Permissão negada no banco de dados. Verifique se você é o dono deste perfil.";
      }
      showFeedback('error', errorMsg + "\n" + (error.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const positions = ['GOLEIRO', 'ZAGUEIRO', 'LATERAL', 'VOLANTE', 'MEIA', 'ATACANTE'];

  return (
    <div className="space-y-6 max-h-[85vh] overflow-y-auto pr-2 scrollbar-thin">
      {selectedImage && (
        <ImageCropper 
          image={selectedImage} 
          onCropComplete={onCropComplete} 
          onCancel={() => setSelectedImage(null)} 
        />
      )}

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-2xl font-black italic tracking-tighter uppercase underline decoration-primary decoration-4 underline-offset-4 text-white">
          {initialData ? 'Editar Perfil' : 'Novo Jogador'}
        </h3>
        {!initialData && (
          <span className={`text-[10px] font-black px-2 py-1 rounded-full ${squadFull ? 'bg-danger/20 text-danger' : 'bg-primary/20 text-primary'}`}>
            ELENCO: {players.length}/{settings.maxSquadSize}
          </span>
        )}
      </div>

      {squadFull && (
        <div className="bg-danger/10 border border-danger/20 p-4 rounded-2xl flex items-start space-x-3 mb-4">
          <AlertCircle className="text-danger shrink-0" size={18} />
          <p className="text-[10px] text-danger font-bold uppercase leading-relaxed">
            Limite do elenco atingido ({settings.maxSquadSize}). 
            Aumente o limite nas configurações para adicionar novos jogadores.
          </p>
        </div>
      )}

      {/* Local Feedback Toast */}
      {feedback && (
        <div className={`fixed top-12 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-2 animate-in fade-in zoom-in duration-300 ${
          feedback.type === 'success' ? 'bg-primary text-bg' : 'bg-danger text-white'
        }`}>
          <span className="text-xs font-bold uppercase tracking-widest">{feedback.msg}</span>
        </div>
      )}
      
      <div className="flex flex-col items-center space-y-4 mb-4">
        <label className="relative group cursor-pointer">
          <div className="w-20 h-20 rounded-full bg-bg border-2 border-border/50 flex items-center justify-center overflow-hidden transition-all group-hover:border-primary">
            {photoUrl ? (
              <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="text-gray-600 flex flex-col items-center">
                {uploading ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
                <span className="text-[8px] font-black mt-1 uppercase">Foto</span>
              </div>
            )}
          </div>
          <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} disabled={uploading} />
          <div className="absolute -bottom-1 -right-1 bg-primary text-bg p-1.5 rounded-full shadow-lg">
            <Upload size={10} />
          </div>
        </label>
        {uploading && (
          <div className="w-full flex flex-col items-center space-y-2">
            <div className="w-full bg-bg border border-border h-2 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300" 
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-[10px] text-primary animate-pulse font-bold uppercase tracking-widest">
              Processando (v2.1)... {uploadProgress}%
            </p>
          </div>
        )}
        {(isAdmin || (initialData && initialData.id === user?.uid)) && (
          <div className="pt-2 w-full max-w-[120px] relative">
             <label className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500 block text-center mb-1">Nº Camisa</label>
             <input 
              type="number"
              className={`w-full bg-bg border ${numberIsTaken ? 'border-danger' : 'border-border'} rounded-xl p-2.5 text-center text-primary font-black outline-none focus:border-primary text-sm`}
              placeholder="00"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
            {numberIsTaken && (
              <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-48 text-center animate-in fade-in slide-in-from-top-1">
                <span className="text-[8px] font-black text-danger uppercase tracking-tighter bg-danger/10 px-2 py-1 rounded-md border border-danger/20 flex items-center justify-center gap-1">
                  <AlertCircle size={10} />
                  Já em uso por: {takenBy?.displayName || takenBy?.name}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">Nome Completo</label>
          <input 
            className="w-full bg-bg border border-border rounded-xl p-3 text-gray-100 focus:border-primary outline-none text-sm"
            placeholder="Ex: João Silva de Souza"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center px-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Nome de Exibição (Partidas)</label>
            <span className={`text-[10px] font-bold ${displayName.length >= 20 ? 'text-danger' : 'text-gray-600'}`}>
              {displayName.length}/20
            </span>
          </div>
          <input 
            className="w-full bg-bg border border-border rounded-xl p-3 text-gray-100 focus:border-primary outline-none text-sm"
            placeholder="Ex: João Silva"
            value={displayName}
            maxLength={20}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        {isAdmin && (
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">E-mail (Para login)</label>
            <input 
              className="w-full bg-bg border border-border rounded-xl p-3 text-gray-100 focus:border-primary outline-none text-sm"
              placeholder="exemplo@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">Vínculo</label>
            <div className="flex gap-1">
              {['MENSALISTA', 'DIARISTA'].map(t => (
                <button 
                  key={t}
                  disabled={!isAdmin}
                  onClick={() => setType(t as any)}
                  className={`flex-1 py-2 rounded-lg border text-[9px] font-bold tracking-wider disabled:opacity-50 ${
                    type === t ? 'bg-primary border-primary text-bg' : 'border-border text-gray-500'
                  }`}
                >
                  {t.substring(0, 4)}
                </button>
              ))}
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">Nível (1-5)</label>
            <div className="flex gap-1 justify-between">
              {[1, 2, 3, 4, 5].map(l => (
                <button 
                  key={l}
                  disabled={!isAdmin}
                  onClick={() => setLevel(l)}
                  className={`w-7 h-7 rounded-lg border text-[10px] font-black transition-all disabled:opacity-50 ${
                    level === l ? 'bg-primary border-primary text-bg' : 'border-border text-gray-500'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats Section */}
        {isAdmin && (
          <div className="p-4 bg-bg/50 rounded-2xl border border-border/50 space-y-4">
            <label className="text-[10px] font-bold uppercase tracking-widest text-primary block text-center">Estatísticas (Manual)</label>
            
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase text-gray-600 px-1">Gols</label>
                <input 
                  type="number"
                  className="w-full bg-bg border border-border rounded-lg p-2 text-white text-xs outline-none focus:border-primary"
                  value={gols}
                  onChange={(e) => setGols(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase text-gray-600 px-1">Assists.</label>
                <input 
                  type="number"
                  className="w-full bg-bg border border-border rounded-lg p-2 text-white text-xs outline-none focus:border-primary"
                  value={assistencias}
                  onChange={(e) => setAssistencias(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase text-gray-600 px-1">Contra</label>
                <input 
                  type="number"
                  className="w-full bg-bg border border-border rounded-lg p-2 text-white text-xs outline-none focus:border-primary"
                  value={contra}
                  onChange={(e) => setContra(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase text-gray-600 px-1">Vitórias</label>
                <input 
                  type="number"
                  className="w-full bg-bg border border-border rounded-lg p-2 text-white text-xs outline-none focus:border-primary"
                  value={vitorias}
                  onChange={(e) => setVitorias(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase text-gray-600 px-1">Derrotas</label>
                <input 
                  type="number"
                  className="w-full bg-bg border border-border rounded-lg p-2 text-white text-xs outline-none focus:border-primary"
                  value={derrotas}
                  onChange={(e) => setDerrotas(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase text-gray-600 px-1">Empates</label>
                <input 
                  type="number"
                  className="w-full bg-bg border border-border rounded-lg p-2 text-white text-xs outline-none focus:border-primary"
                  value={empates}
                  onChange={(e) => setEmpates(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">Posição Principal</label>
          <div className="grid grid-cols-3 gap-1">
            {positions.map(p => (
              <button 
                key={p}
                onClick={() => {
                  setPos(p);
                  if (secondaryPos === p) setSecondaryPos('');
                }}
                className={`py-2 rounded-lg border text-[9px] font-black ${
                  pos === p ? 'bg-primary border-primary text-bg' : 'border-border text-gray-500'
                }`}
              >
                {p.substring(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">Posição Secundária</label>
          <div className="grid grid-cols-3 gap-1">
            <button 
              onClick={() => setSecondaryPos('')}
              className={`py-2 rounded-lg border text-[9px] font-black ${
                secondaryPos === '' ? 'bg-white/10 border-white/20 text-white' : 'border-border text-gray-500'
              }`}
            >
              NEN.
            </button>
            {positions.filter(p => p !== pos).map(p => (
              <button 
                key={p}
                onClick={() => setSecondaryPos(p)}
                className={`py-2 rounded-lg border text-[9px] font-black ${
                  secondaryPos === p ? 'bg-primary border-primary text-bg' : 'border-border text-gray-500'
                }`}
              >
                {p.substring(0, 3)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button 
        disabled={uploading || saving}
        onClick={handleSave}
        className="w-full py-4 bg-primary text-bg rounded-2xl font-black uppercase tracking-widest mt-4 shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {(uploading || saving) && <Loader2 className="animate-spin" size={18} />}
        {uploading ? 'Aguarde o upload...' : saving ? 'Salvando...' : (initialData ? 'Salvar Alterações' : 'Criar Jogador')}
      </button>
    </div>
  );
}
