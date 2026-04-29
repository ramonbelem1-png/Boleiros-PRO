import React, { useState } from 'react';
import { Player, Evaluation, usePelada } from '../hooks/usePelada';
import { useAuth } from './AuthProvider';
import { Star, Send, X, TrendingUp, Heart, ShieldCheck, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface EvaluationDialogProps {
  matchId: string;
  playersToEvaluate: Player[];
  onClose: () => void;
}

export default function EvaluationDialog({ matchId, playersToEvaluate, onClose }: EvaluationDialogProps) {
  const { user } = useAuth();
  const { submitEvaluation, evaluations } = usePelada();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [ratings, setRatings] = useState({
    technical: 3,
    effort: 3,
    fairplay: 3,
    comment: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentPlayer = playersToEvaluate[currentIndex];
  
  // Skip evaluations for oneself
  const filteredPlayers = playersToEvaluate.filter(p => {
      // Find matches where user email (or some unique identifier) matches player name/email
      // For now, let's assume we don't evaluate ourselves if we can identify our own player object
      // This logic depends on how user correlates to Player
      return true; // Simplified for now
  });

  const handleNext = async () => {
    if (!currentPlayer || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      await submitEvaluation({
        matchId,
        evaluatorId: user?.uid || 'anonymous',
        targetId: currentPlayer.id,
        technical: ratings.technical,
        effort: ratings.effort,
        fairplay: ratings.fairplay,
        comment: ratings.comment
      });

      if (currentIndex < playersToEvaluate.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setRatings({ technical: 3, effort: 3, fairplay: 3, comment: '' });
      } else {
        onClose();
      }
    } catch (error) {
      console.error("Erro ao enviar avaliação:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentPlayer) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-bg/95 backdrop-blur-xl"
        onClick={onClose}
      />
      
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-full max-w-md bg-card border border-border/50 rounded-[2.5rem] shadow-2xl overflow-hidden"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-gray-500 hover:text-white">
          <X size={20} />
        </button>

        <div className="p-8 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">Avaliação Pós-Pelada</h2>
            <div className="flex items-center justify-center space-x-2">
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-black uppercase tracking-widest">
                  Jogador {currentIndex + 1} de {playersToEvaluate.length}
                </span>
            </div>
          </div>

          <div className="flex flex-col items-center space-y-4 py-4">
             <div className="w-24 h-24 rounded-full bg-bg border-4 border-primary/20 p-1">
                <div className="w-full h-full rounded-full bg-card flex items-center justify-center overflow-hidden">
                   {currentPlayer.photoUrl ? (
                      <img src={currentPlayer.photoUrl} alt={currentPlayer.displayName} className="w-full h-full object-cover" />
                   ) : (
                      <User size={32} className="text-gray-700" />
                   )}
                </div>
             </div>
             <div className="text-center">
                <h3 className="text-xl font-extrabold text-white">{currentPlayer.displayName || currentPlayer.name}</h3>
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest">{currentPlayer.position}</p>
             </div>
          </div>

          <div className="space-y-6">
            {/* Technical */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center space-x-2 text-primary">
                  <TrendingUp size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Nível Técnico</span>
                </div>
                <span className="text-xs font-black text-white">{ratings.technical}/5</span>
              </div>
              <div className="flex justify-between gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                   <button 
                    key={star}
                    onClick={() => setRatings({...ratings, technical: star})}
                    className={`flex-1 h-12 rounded-2xl flex items-center justify-center transition-all ${
                      ratings.technical >= star ? 'bg-primary text-bg' : 'bg-bg text-gray-700 border border-border/50'
                    }`}
                   >
                     <Star size={20} fill={ratings.technical >= star ? "currentColor" : "none"} />
                   </button>
                ))}
              </div>
            </div>

            {/* Effort */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center space-x-2 text-danger">
                  <Heart size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Esforço / Raça</span>
                </div>
                <span className="text-xs font-black text-white">{ratings.effort}/5</span>
              </div>
              <div className="flex justify-between gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                   <button 
                    key={star}
                    onClick={() => setRatings({...ratings, effort: star})}
                    className={`flex-1 h-12 rounded-2xl flex items-center justify-center transition-all ${
                      ratings.effort >= star ? 'bg-danger text-white shadow-lg shadow-danger/20' : 'bg-bg text-gray-700 border border-border/50'
                    }`}
                   >
                     <Star size={20} fill={ratings.effort >= star ? "currentColor" : "none"} />
                   </button>
                ))}
              </div>
            </div>

            {/* Fairplay */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center space-x-2 text-blue-400">
                  <ShieldCheck size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Fair Play / Postura</span>
                </div>
                <span className="text-xs font-black text-white">{ratings.fairplay}/5</span>
              </div>
              <div className="flex justify-between gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                   <button 
                    key={star}
                    onClick={() => setRatings({...ratings, fairplay: star})}
                    className={`flex-1 h-12 rounded-2xl flex items-center justify-center transition-all ${
                      ratings.fairplay >= star ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-bg text-gray-700 border border-border/50'
                    }`}
                   >
                     <Star size={20} fill={ratings.fairplay >= star ? "currentColor" : "none"} />
                   </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
               <div className="flex items-center space-x-2 px-2 text-gray-500">
                  <MessageSquare size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Comentário (Opcional)</span>
               </div>
               <textarea 
                value={ratings.comment}
                onChange={(e) => setRatings({...ratings, comment: e.target.value})}
                placeholder="Ex: Jogou muito hoje! / Deu o sangue..."
                className="w-full bg-bg border border-border/50 rounded-2xl p-4 text-sm text-white focus:border-primary outline-none resize-none h-20"
               />
            </div>
          </div>

          <button 
            onClick={handleNext}
            disabled={isSubmitting}
            className="w-full py-4 bg-primary text-bg rounded-2xl font-black uppercase tracking-widest flex items-center justify-center space-x-2 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-primary/20 disabled:opacity-50"
          >
            {isSubmitting ? (
               <span className="animate-pulse">Enviando...</span>
            ) : (
              <>
                <span>{currentIndex < playersToEvaluate.length - 1 ? 'Próximo Jogador' : 'Finalizar Avaliações'}</span>
                <Send size={16} />
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Internal User Component for the icon
function User({ size, className }: { size: number, className: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
