import React, { useState } from 'react';
import { Player, usePelada } from '../hooks/usePelada';
import { X, Calendar, DollarSign, Tag, UserPlus, Camera, Upload, Loader2, Edit, Trash2 } from 'lucide-react';
import { storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from './AuthProvider';

interface ModalProps {
  type: 'match' | 'finance' | 'player' | null;
  editingPlayer?: Player | null;
  onClose: () => void;
}

export default function ManagementModals({ type, editingPlayer, onClose }: ModalProps) {
  const { createMatch, createTransaction, addPlayer, updatePlayer } = usePelada();

  if (!type) return null;

  return (
    <div className="fixed inset-0 bg-bg/95 backdrop-blur-md z-[100] flex items-center justify-center p-6">
      <div className="bg-card w-full max-w-sm rounded-[44px] p-8 border border-border/50 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-6 right-6 text-gray-500 hover:text-white transition-colors"><X size={24}/></button>

        {type === 'match' && <CreateMatchModal onSave={createMatch} onClose={onClose} />}
        {type === 'finance' && <CreateTransactionModal onSave={createTransaction} onClose={onClose} />}
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

function CreateTransactionModal({ onSave, onClose }: any) {
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('INCOME');
  const [desc, setDesc] = useState('');

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-black italic tracking-tighter uppercase underline decoration-primary decoration-4 underline-offset-4 mb-8">Novo Lançamento</h3>
      <div className="flex gap-2">
        {['INCOME', 'EXPENSE'].map(t => (
          <button 
            key={t}
            onClick={() => setType(t as any)}
            className={`flex-1 py-3 rounded-xl border text-[10px] font-black tracking-widest ${
              type === t ? 'bg-primary border-primary text-bg' : 'border-border text-gray-500'
            }`}
          >
            {t === 'INCOME' ? 'ENTRADA' : 'SAÍDA'}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">Valor (R$)</label>
        <input 
          type="number"
          className="w-full bg-bg border border-border rounded-2xl p-4 text-gray-100 focus:border-primary outline-none"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">Descrição</label>
        <input 
          className="w-full bg-bg border border-border rounded-2xl p-4 text-gray-100 focus:border-primary outline-none"
          placeholder="Ex: Mensalidade, Aluguel..."
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
      </div>
      <button 
        onClick={async () => {
          if(!amount || !desc) return;
          await onSave({ amount: Number(amount), type, description: desc, category: 'OTHER' });
          onClose();
        }}
        className="w-full py-5 bg-primary text-bg rounded-2xl font-black uppercase tracking-widest mt-4 shadow-lg shadow-primary/20 transition-all active:scale-95"
      >
        Lançar no Caixa
      </button>
    </div>
  );
}

function PlayerModal({ onSave, onClose, initialData }: any) {
  const { role, user } = useAuth();
  const isAdmin = role === 'ADMIN' || user?.email === 'ramonbelem1@gmail.com';
  const [name, setName] = useState(initialData?.name || '');
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
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic size check (2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert("A imagem deve ter no máximo 2MB.");
      return;
    }

    setUploading(true);
    try {
      console.log("Iniciando upload de foto...");
      const storageRef = ref(storage, `players/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      console.log("Upload concluído, obtendo URL...");
      const url = await getDownloadURL(snapshot.ref);
      setPhotoUrl(url);
      console.log("URL de foto salva no estado:", url);
    } catch (error: any) {
      console.error("Erro ao subir imagem:", error);
      alert("Erro ao subir imagem: " + (error.message || "Erro desconhecido."));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if(!name) {
      alert("Por favor, insira o nome.");
      return;
    }
    
    setSaving(true);
    // Campos permitidos para usuários comuns nas regras do Firestore
    // Note: secondaryPosition must be string, not null, based on our previous logic
    const userData = {
      name: name.trim(),
      position: pos,
      secondaryPosition: secondaryPos || "NENHUMA",
      photoUrl: photoUrl || ""
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
      empates: Number(empates) || 0
    };

    try {
      const payload = isAdmin ? adminData : userData;
      console.log(`[PlayerModal] Tentando salvar. Usuário: ${user?.email}, Role: ${role}, isAdmin (calc): ${isAdmin}`);
      console.log("[PlayerModal] Payload:", payload);
      await onSave(payload);
      console.log("[PlayerModal] Salvo com sucesso!");
      onClose();
    } catch (error: any) {
      console.error("Erro fatal ao salvar perfil:", error);
      let errorMsg = "Erro ao salvar perfil.";
      if (error.message?.includes('permission-denied')) {
        errorMsg = "Permissão negada no banco de dados. Verifique se você é o dono deste perfil.";
      }
      alert(errorMsg + "\n" + (error.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const positions = ['GOLEIRO', 'ZAGUEIRO', 'LATERAL', 'VOLANTE', 'MEIA', 'ATACANTE'];

  return (
    <div className="space-y-6 max-h-[85vh] overflow-y-auto pr-2 scrollbar-thin">
      <h3 className="text-2xl font-black italic tracking-tighter uppercase underline decoration-primary decoration-4 underline-offset-4 mb-4 text-white">
        {initialData ? 'Editar Perfil' : 'Novo Jogador'}
      </h3>
      
      <div className="flex flex-col items-center space-y-4 mb-4">
        <label className="relative group cursor-pointer">
          <div className="w-20 h-20 rounded-full bg-bg border-2 border-border/50 flex items-center justify-center overflow-hidden transition-all group-hover:border-primary">
            {photoUrl ? (
              <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
        {uploading && <p className="text-[10px] text-primary animate-pulse font-bold uppercase">Enviando foto...</p>}
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">Nome</label>
          <input 
            className="w-full bg-bg border border-border rounded-xl p-3 text-gray-100 focus:border-primary outline-none text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

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
            
            <div className="grid grid-cols-2 gap-3">
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
