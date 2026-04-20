import React from 'react';
import { usePelada } from '../hooks/usePelada';
import { Trophy, Star, Medal, Share2, Frown, ShieldAlert, TrendingUp } from 'lucide-react';

export default function SocialStats() {
  const { players, loading } = usePelada();
  const [rankingTab, setRankingTab] = React.useState<'total' | 'gols' | 'assists' | 'wins'>('total');
  
  const handleShare = async () => {
    const topScorer = [...players].sort((a, b) => (b.gols || 0) - (a.gols || 0))[0];
    const topAssister = [...players].sort((a, b) => (b.assistencias || 0) - (a.assistencias || 0))[0];
    const topWinner = [...players].sort((a, b) => (b.vitorias || 0) - (a.vitorias || 0))[0];
    const text = `🏆 Ranking - Boleiros PRO\n\n⚽ Artilheiro: ${topScorer?.name || '-'}\n🎯 Garçom: ${topAssister?.name || '-'}\n🔥 Vencedor: ${topWinner?.name || '-'}\n\n#Futebol #Pelada #BoleirosPRO`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Ranking da Pelada',
          text: text,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(text);
        alert('Resumo copiado!');
      }
    } catch (err) {}
  };

  // Sorts
  const sortedByPerformance = [...players].sort((a, b) => 
    ((b.gols || 0) + (b.assistencias || 0)) - ((a.gols || 0) + (a.assistencias || 0))
  );
  const sortedByGols = [...players].sort((a, b) => (b.gols || 0) - (a.gols || 0));
  const sortedByAssistencias = [...players].sort((a, b) => (b.assistencias || 0) - (a.assistencias || 0));
  const sortedByWins = [...players].sort((a, b) => (b.vitorias || 0) - (a.vitorias || 0));

  const topScorer = sortedByGols[0];
  const topAssister = sortedByAssistencias[0];
  const topWinner = sortedByWins[0];
  const topOverall = sortedByPerformance[0];

  const currentRanking = rankingTab === 'total' ? sortedByPerformance : 
                       rankingTab === 'gols' ? sortedByGols : 
                       rankingTab === 'assists' ? sortedByAssistencias :
                       sortedByWins;

  if (loading) return <div className="p-8 text-center text-gray-500 text-xs font-bold uppercase tracking-widest animate-pulse">Carregando Rankings...</div>;

  return (
    <div className="space-y-8 pb-8">
      {/* Ranking Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <div className="flex flex-col">
            <h3 className="text-[11px] font-bold tracking-[0.2em] text-primary uppercase">Rankings Detalhados</h3>
            <div className="flex items-center space-x-1 text-gray-600 mt-1">
              <TrendingUp size={10} />
              <span className="text-[9px] font-bold uppercase tracking-tight">Temporada {new Date().getFullYear()}</span>
            </div>
          </div>
          
          <div className="flex bg-card p-1 rounded-xl border border-border/50">
            <button 
              onClick={() => setRankingTab('total')}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${rankingTab === 'total' ? 'bg-primary text-bg' : 'text-gray-500 hover:text-white'}`}
            >
              G+A
            </button>
            <button 
              onClick={() => setRankingTab('gols')}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${rankingTab === 'gols' ? 'bg-primary text-bg' : 'text-gray-500 hover:text-white'}`}
            >
              Gols
            </button>
            <button 
              onClick={() => setRankingTab('assists')}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${rankingTab === 'assists' ? 'bg-primary text-bg' : 'text-gray-500 hover:text-white'}`}
            >
              Assists
            </button>
            <button 
              onClick={() => setRankingTab('wins')}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${rankingTab === 'wins' ? 'bg-primary text-bg' : 'text-gray-500 hover:text-white'}`}
            >
              Vits
            </button>
          </div>
        </div>

        <div className="bg-card rounded-[32px] border border-border/50 divide-y divide-border/30 overflow-hidden shadow-xl">
          {currentRanking.slice(0, 10).filter(p => {
            if(rankingTab === 'total') return (p.gols||0)+(p.assistencias||0) > 0;
            if(rankingTab === 'gols') return (p.gols||0) > 0;
            if(rankingTab === 'assists') return (p.assistencias||0) > 0;
            if(rankingTab === 'wins') return (p.vitorias||0) > 0;
            return true;
          }).map((player, idx) => (
            <div key={player.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
              <div className="flex items-center space-x-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs ${
                  idx === 0 ? 'bg-yellow-500 text-bg' : 
                  idx === 1 ? 'bg-gray-300 text-bg' : 
                  idx === 2 ? 'bg-amber-700 text-bg' : 
                  'bg-bg text-gray-500'
                }`}>
                  {idx < 3 ? <Medal size={14} /> : idx + 1}
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-9 h-9 rounded-lg bg-bg border border-border flex items-center justify-center font-bold text-gray-500 overflow-hidden">
                    {player.photoUrl ? (
                      <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      player.name.charAt(0)
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm tracking-tight text-white">{player.name}</h4>
                    <p className="text-[8px] text-gray-500 font-bold uppercase tracking-wider">{player.position}</p>
                  </div>
                </div>
              </div>
              <div className="text-right">
                {rankingTab === 'total' && (
                  <>
                    <div className="text-sm font-black text-white">{(player.gols || 0) + (player.assistencias || 0)} pts</div>
                    <div className="text-[8px] font-bold text-gray-600 uppercase">
                      {player.gols || 0}G • {player.assistencias || 0}A
                    </div>
                  </>
                )}
                {rankingTab === 'gols' && (
                  <div className="text-sm font-black text-primary">{(player.gols || 0)} <span className="text-[9px] uppercase font-bold ml-0.5">Gols</span></div>
                )}
                {rankingTab === 'assists' && (
                  <div className="text-sm font-black text-primary">{(player.assistencias || 0)} <span className="text-[9px] uppercase font-bold ml-0.5">Assists</span></div>
                )}
                {rankingTab === 'wins' && (
                  <>
                    <div className="text-sm font-black text-primary">{(player.vitorias || 0)} <span className="text-[9px] uppercase font-bold ml-0.5">Vitórias</span></div>
                    <div className="text-[8px] font-bold text-gray-600 uppercase">
                      {player.derrotas || 0}D • {player.empates || 0}E
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
          {currentRanking.filter(p => {
             if(rankingTab === 'total') return (p.gols||0)+(p.assistencias||0) > 0;
             if(rankingTab === 'gols') return (p.gols||0) > 0;
             if(rankingTab === 'assists') return (p.assistencias||0) > 0;
             if(rankingTab === 'wins') return (p.vitorias||0) > 0;
             return true;
          }).length === 0 && (
            <div className="p-10 text-center space-y-2">
              <Frown className="mx-auto text-gray-700" size={32} />
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Nenhum dado registrado</p>
            </div>
          )}
        </div>
      </section>

      {/* Destaques Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-[11px] font-bold tracking-[0.2em] text-primary uppercase">Destaques</h3>
          <button 
            onClick={handleShare}
            className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors"
          >
            <Share2 size={16} />
          </button>
        </div>

        {/* This is the shareable card UI */}
        <div className="bg-gradient-to-br from-card to-bg p-6 rounded-[40px] border border-primary/20 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Trophy size={160} />
          </div>
          
          <div className="relative z-10 space-y-6">
            <div className="text-center pb-4 border-bottom border-border/10">
              <h2 className="text-2xl font-black text-white tracking-tighter italic uppercase underline decoration-primary decoration-4 underline-offset-4">Top Performance</h2>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-2">Acumulado da Temporada</p>
            </div>

            <div className="grid grid-cols-2 gap-y-6 gap-x-4">
              <AwardItem label="CRAQUE GERAL" name={topOverall?.name || "-"} icon={<Trophy size={14} />} />
              <AwardItem label="GOLEADOR" name={topScorer?.name || "-"} icon={<Star size={14} />} />
              <AwardItem label="GARÇOM" name={topAssister?.name || "-"} icon={<Star size={14} />} />
              <AwardItem label="PARTICIPAÇÃO" name={`${(topOverall?.gols || 0) + (topOverall?.assistencias || 0)} G+A`} icon={<TrendingUp size={14} />} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function AwardItem({ label, name, icon, isBad = false }: { label: string, name: string, icon: React.ReactNode, isBad?: boolean }) {
  return (
    <div className="space-y-1">
      <div className={`flex items-center space-x-1.5 ${isBad ? 'text-danger' : 'text-primary'}`}>
        <div className="flex-shrink-0 flex items-center justify-center">
          {icon}
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest leading-none">{label}</span>
      </div>
      <p className="text-sm font-bold text-white truncate">{name}</p>
    </div>
  );
}

function AlertCircleIcon() {
  return <div className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center text-[8px] font-bold">!</div>;
}
