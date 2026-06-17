import React, { useState, useEffect } from 'react';
import { User, Image as ImageIcon, Loader2, PlayCircle, LogOut, ShieldAlert, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Player, PlayerPosition, formatPosition } from '../hooks/usePelada';
import ImageCropper from './ImageCropper';
import Logo from './Logo';

interface OnboardingProfileProps {
  user: any;
  players: Player[];
  onSave: (data: any) => Promise<void>;
  onLogout: () => Promise<void>;
}

export default function OnboardingProfile({ user, players, onSave, onLogout }: OnboardingProfileProps) {
  const [fullName, setFullName] = useState(user?.displayName || '');
  const [displayName, setDisplayName] = useState((user?.displayName || '').substring(0, 15));
  const [position, setPosition] = useState<PlayerPosition | ''>('');
  const [secondaryPosition, setSecondaryPosition] = useState<PlayerPosition | 'NENHUMA'>('NENHUMA');
  const [number, setNumber] = useState('');
  const [photoUrl, setPhotoUrl] = useState(user?.photoURL || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Imagem e Crop
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Unicidade do número da camisa
  const chosenNum = number !== '' ? Number(number) : null;
  const takenBy = chosenNum !== null ? players.find(p => p.number === chosenNum) : null;
  const numberIsTaken = !!takenBy;

  const positions: PlayerPosition[] = ['GOLEIRO', 'ZAGUEIRO', 'LATERAL', 'VOLANTE', 'MEIA', 'ATACANTE'];

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
  };

  const currentCroppingPlayerId = null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!fullName.trim()) {
      setErrorMsg("O nome completo é obrigatório.");
      return;
    }

    if (!displayName.trim()) {
      setErrorMsg("O nome na pelada / apelido é obrigatório.");
      return;
    }

    if (displayName.trim().length > 15) {
      setErrorMsg("O nome de exibição deve ter no máximo 15 caracteres.");
      return;
    }

    if (!position) {
      setErrorMsg("Você deve escolher pelo menos a posição principal.");
      return;
    }

    if (number === '' || number === null || number === undefined) {
      setErrorMsg("O número da camisa é obrigatório.");
      return;
    }

    if (numberIsTaken) {
      setErrorMsg(`O número ${number} já está sendo usado por ${takenBy?.displayName || takenBy?.name}.`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        fullName: fullName.trim(),
        displayName: displayName.trim(),
        name: displayName.trim(),
        position: position,
        secondaryPosition: secondaryPosition,
        photoUrl: photoUrl || '',
        number: Number(number),
        profileCompleted: true // Crucial flag!
      };

      await onSave(payload);
    } catch (err: any) {
      console.error("Erro ao salvar perfil onboarding:", err);
      setErrorMsg(err.message || "Ocorreu um erro ao salvar o seu perfil. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-bg overflow-y-auto flex items-center justify-center p-4 sm:p-6 md:p-8">
      {/* Decorative Blur Backgrounds */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full point-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full point-events-none" />

      {selectedImage && (
        <ImageCropper 
          image={selectedImage} 
          onCropComplete={onCropComplete} 
          onCancel={() => setSelectedImage(null)} 
        />
      )}

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-xl bg-card border border-border/50 rounded-[3rem] p-6 sm:p-10 shadow-2xl relative z-10 space-y-8"
      >
        <div className="text-center relative">
          <Logo size="lg" className="mx-auto scale-90 mb-4" />
          <div className="h-px w-10 bg-primary/20 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-white uppercase italic tracking-tight">Completar Meu Perfil</h2>
          <p className="text-gray-400 text-xs font-semibold leading-relaxed max-w-sm mx-auto mt-2">
            Seja bem-vindo! Antes de entrar de fato na quadra, precisamos de alguns dados importantes sobre o seu futebol.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Foto do Perfil */}
          <div className="flex flex-col items-center space-y-3">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Avatar do Atleta</label>
            <div className="relative group cursor-pointer">
              <div className="w-24 h-24 rounded-[2rem] bg-bg border-2 border-border/60 hover:border-primary/50 transition-all overflow-hidden flex items-center justify-center">
                {photoUrl ? (
                  <img src={photoUrl} alt="Preview" className="w-full h-full object-cover animate-fade-in" />
                ) : (
                  <ImageIcon size={32} className="text-gray-600 group-hover:text-primary transition-all" />
                )}
              </div>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleFileChange} 
                className="absolute inset-0 opacity-0 cursor-pointer" 
              />
            </div>
            <p className="text-[10px] text-gray-500 font-bold hover:text-primary/70 transition-colors">
              Clique acima para colocar sua foto oficial
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Nome Completo */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 block px-1">
                Nome Completo <span className="text-primary font-bold">(Obrigatório)</span>
              </label>
              <input 
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  // Auto-complete display name if valid length and matching before
                  if (!displayName || displayName === user?.displayName?.substring(0, 15)) {
                    setDisplayName(e.target.value.substring(0, 15));
                  }
                }}
                className="w-full bg-bg border border-border/50 rounded-2xl py-4 px-4 text-sm focus:border-primary outline-none text-white transition-all placeholder:text-gray-600 font-semibold"
                placeholder="Ex: Ronaldo Luís Nazário"
                required
              />
            </div>

            {/* Nome de Exibição / Apelido */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 block px-1">
                Nome de Exibição <span className="text-primary font-bold">(Obrigatório)</span>
              </label>
              <input 
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.substring(0, 15))}
                className="w-full bg-bg border border-border/50 rounded-2xl py-4 px-4 text-sm focus:border-primary outline-none text-white transition-all placeholder:text-gray-600 font-semibold"
                placeholder="Ex: Ronaldo 9"
                maxLength={15}
                required
              />
            </div>
          </div>

          {/* GRID de Posições */}
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 block px-1">
              Posição Principal <span className="text-primary font-bold">(Obrigatório)</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {positions.map((pos) => (
                <button
                  type="button"
                  key={pos}
                  onClick={() => setPosition(pos)}
                  className={`py-3.5 px-2 rounded-2xl text-[10px] sm:text-xs font-black tracking-widest uppercase border transition-all text-center ${
                    position === pos 
                      ? 'bg-primary border-primary text-bg shadow-[0_0_12px_rgba(234,179,8,0.25)] scale-102' 
                      : 'bg-bg border-border/50 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {formatPosition(pos)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Posição Secundária */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 block px-1">
                Posição Secundária
              </label>
              <select 
                value={secondaryPosition}
                onChange={(e) => setSecondaryPosition(e.target.value as any)}
                className="w-full bg-bg border border-border/50 rounded-2xl py-4 px-4 text-sm focus:border-primary outline-none text-white transition-all font-semibold"
              >
                <option value="NENHUMA" className="bg-bg text-white">NENHUMA</option>
                {positions.filter(p => p !== position).map((pos) => (
                  <option key={pos} value={pos} className="bg-bg text-white">{formatPosition(pos)}</option>
                ))}
              </select>
            </div>

            {/* Número da Camisa */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 block px-1">
                Número da Camisa <span className="text-primary font-bold">(Obrigatório)</span>
              </label>
              <div className="relative">
                <input 
                  type="number"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className={`w-full bg-bg border ${numberIsTaken ? 'border-danger/60 focus:border-danger' : 'border-border/50 focus:border-primary'} rounded-2xl py-4 px-4 text-sm outline-none text-white transition-all placeholder:text-gray-600 font-bold`}
                  placeholder="Ex: 10"
                  required
                />
                {numberIsTaken && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-danger flex items-center space-x-1">
                    <AlertCircle size={14} />
                    <span className="text-[10px] font-black tracking-widest uppercase">Ocupada</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mensagens de Erro */}
          <AnimatePresence>
            {errorMsg && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 bg-danger/10 border border-danger/20 text-danger text-xs font-bold rounded-2xl flex items-center space-x-2 shadow-inner"
              >
                <ShieldAlert size={16} className="shrink-0" />
                <span>{errorMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Botões de Ação */}
          <div className="pt-4 flex flex-col gap-3">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-5 bg-primary text-bg rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.01] hover:shadow-primary/30 active:scale-98 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  <span>Salvando Perfil...</span>
                </>
              ) : (
                <>
                  <PlayCircle size={18} />
                  <span>Entrar no Aplicativo</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="w-full py-4 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-2xl font-black uppercase tracking-widest text-[10px] border border-border/40 transition-all flex items-center justify-center gap-2"
            >
              <LogOut size={12} />
              <span>Sair da Conta (Logout)</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
