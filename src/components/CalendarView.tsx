import React, { useState } from 'react';
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
import { ChevronLeft, ChevronRight, X, Clock, Users, Trophy, UserX } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function CalendarView() {
  const { matches, players } = usePelada();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

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

  return (
    <div className="space-y-6">
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

      {/* Match Detail Modal */}
      <AnimatePresence>
        {selectedMatch && (
          <MatchModal 
            match={selectedMatch} 
            players={players} 
            onClose={() => setSelectedMatch(null)} 
          />
        )}
      </AnimatePresence>
      
      <div className="px-4 text-[10px] font-bold text-gray-600 uppercase tracking-widest text-center">
        Toque em uma data com marcador para ver detalhes
      </div>
    </div>
  );
}

function MatchModal({ match, players, onClose }: { match: Match, players: Player[], onClose: () => void }) {
  const matchDate = match.date.toDate ? match.date.toDate() : new Date(match.date);
  
  const confirmed = players.filter(p => match.confirmedIds.includes(p.id));
  const absentEntries = match.absentIds.map(a => ({
    player: players.find(p => p.id === a.userId),
    reason: a.reason
  })).filter(entry => entry.player);

  return (
    <div className="fixed inset-0 bg-bg/95 backdrop-blur-md z-[100] flex items-end sm:items-center justify-center p-4">
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
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-2 block text-center">Resultado Final</span>
            <div className="flex items-center justify-center space-x-8">
              <div className="text-center">
                <div className="text-4xl font-black text-white italic">{match.result.scoreA}</div>
                <div className="text-[9px] font-bold text-gray-500 uppercase">Time A</div>
              </div>
              <div className="text-2xl text-primary font-black">X</div>
              <div className="text-center">
                <div className="text-4xl font-black text-white italic">{match.result.scoreB}</div>
                <div className="text-[9px] font-bold text-gray-500 uppercase">Time B</div>
              </div>
            </div>
          </div>
        )}

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
                     {p.photoUrl ? <img src={p.photoUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full flex items-center justify-center font-bold text-[10px]">{p.name.charAt(0)}</div>}
                   </div>
                   <span className="text-sm font-bold text-white">{p.name}</span>
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
                     <span className="text-xs font-bold text-gray-400">{e.player?.name}</span>
                     <span className="text-[9px] font-bold text-gray-600 italic">"{e.reason}"</span>
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
