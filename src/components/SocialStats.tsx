import React from 'react';
import { usePelada } from '../hooks/usePelada';
import { Trophy, Star, Medal, Share2, Frown, ShieldAlert, TrendingUp } from 'lucide-react';

export default function SocialStats() {
  const { players, matches, loading, getMatchGames } = usePelada();
  const [rankingTab, setRankingTab] = React.useState<'total' | 'gols' | 'assists' | 'wins'>('total');
  const [period, setPeriod] = React.useState<'geral' | 'temporada' | 'mes' | 'rodada'>('geral');
  const [periodStats, setPeriodStats] = React.useState<Record<string, any>>({});
  const [calculating, setCalculating] = React.useState(false);

  const handleShare = async () => {
    const list = getSortedRanking();
    
    const topScorerShare = [...list].sort((a, b) => {
      if ((b.gols || 0) !== (a.gols || 0)) return (b.gols || 0) - (a.gols || 0);
      return b.totalPts - a.totalPts;
    })[0];
    
    const topAssisterShare = [...list].sort((a, b) => {
      if ((b.assistencias || 0) !== (a.assistencias || 0)) return (b.assistencias || 0) - (a.assistencias || 0);
      return b.totalPts - a.totalPts;
    })[0];
    
    const topWinnerShare = [...list].sort((a, b) => {
      if ((b.vitorias || 0) !== (a.vitorias || 0)) return (b.vitorias || 0) - (a.vitorias || 0);
      return b.totalPts - a.totalPts;
    })[0];
    
    const periodLabel = period === 'geral' ? 'Geral' : period === 'temporada' ? 'Temporada' : period === 'mes' ? 'Mês' : 'Rodada';
    const text = `🏆 Ranking (${periodLabel}) - Boleiros PRO\n\n⚽ Artilheiro: ${topScorerShare?.displayName || topScorerShare?.name || '-'}\n🎯 Garçom: ${topAssisterShare?.displayName || topAssisterShare?.name || '-'}\n🔥 Vencedor: ${topWinnerShare?.displayName || topWinnerShare?.name || '-'}\n\n#Futebol #Pelada #BoleirosPRO`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Ranking ${periodLabel}`,
          text: text,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(text);
        alert('Resumo copiado!');
      }
    } catch (err) {}
  };

  // Logic to calculate stats by period
  React.useEffect(() => {
    if (period === 'geral') {
      setPeriodStats({});
      return;
    }

    async function calculate() {
      setCalculating(true);
      const stats: Record<string, any> = {};
      
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      let targetMatches = matches.filter(m => m.status === 'FINISHED');

      if (period === 'rodada') {
        targetMatches = targetMatches.slice(0, 1);
      } else if (period === 'mes') {
        targetMatches = targetMatches.filter(m => m.date.toDate() >= startOfMonth);
      } else if (period === 'temporada') {
        targetMatches = targetMatches.filter(m => m.date.toDate() >= startOfYear);
      }

      const matchesWithGames = await Promise.all(targetMatches.map(async m => {
        const games = await getMatchGames(m.id);
        return games;
      }));

      for (const games of matchesWithGames) {
        games.forEach(game => {
          if (game.status !== 'FINISHED') return;

          // Aggregating goals/assists
          game.events?.forEach(event => {
            if (event.type === 'GOAL') {
              if (!stats[event.playerId]) stats[event.playerId] = { gols: 0, assistencias: 0, vitorias: 0, derrotas: 0, empates: 0, contra: 0 };
              stats[event.playerId].gols++;
              
              if (event.assistId) {
                if (!stats[event.assistId]) stats[event.assistId] = { gols: 0, assistencias: 0, vitorias: 0, derrotas: 0, empates: 0, contra: 0 };
                stats[event.assistId].assistencias++;
              }
            } else if (event.type === 'OWN_GOAL') {
              if (!stats[event.playerId]) stats[event.playerId] = { gols: 0, assistencias: 0, vitorias: 0, derrotas: 0, empates: 0, contra: 0 };
              stats[event.playerId].contra++;
            }
          });

          // Determining wins/losses per game
          const isDraw = game.scoreA === game.scoreB;
          const winners = game.scoreA > game.scoreB ? game.teamA_ids : game.teamB_ids;
          const losers = game.scoreA > game.scoreB ? game.teamB_ids : game.teamA_ids;
          const allPlayers = [...game.teamA_ids, ...game.teamB_ids];

          if (isDraw) {
            allPlayers.forEach(id => {
              if (!stats[id]) stats[id] = { gols: 0, assistencias: 0, vitorias: 0, derrotas: 0, empates: 0, contra: 0 };
              stats[id].empates++;
            });
          } else {
            winners.forEach(id => {
              if (!stats[id]) stats[id] = { gols: 0, assistencias: 0, vitorias: 0, derrotas: 0, empates: 0, contra: 0 };
              stats[id].vitorias++;
            });
            losers.forEach(id => {
              if (!stats[id]) stats[id] = { gols: 0, assistencias: 0, vitorias: 0, derrotas: 0, empates: 0, contra: 0 };
              stats[id].derrotas++;
            });
          }
        });
      }

      setPeriodStats(stats);
      setCalculating(false);
    }

    calculate();
  }, [period, matches]);

  const getSortedRanking = () => {
    let list = players.map(p => {
      const stats = period === 'geral' ? p : (periodStats[p.id] || { gols: 0, assistencias: 0, vitorias: 0, derrotas: 0, empates: 0, contra: 0 });
      return { 
        ...p, 
        ...stats,
        totalPts: ((stats.gols || 0) * 2) + (stats.assistencias || 0) + ((stats.vitorias || 0) * 2) + (stats.empates || 0)
      };
    });

    // Remove people with 0 stats if not geral
    if (period !== 'geral') {
      list = list.filter(p => p.totalPts > 0 || (p.vitorias || 0) > 0 || (p.derrotas || 0) > 0 || (p.empates || 0) > 0);
    }

    if (rankingTab === 'total') {
      return list.sort((a, b) => {
        if (b.totalPts !== a.totalPts) return b.totalPts - a.totalPts;
        if ((b.gols || 0) !== (a.gols || 0)) return (b.gols || 0) - (a.gols || 0);
        if ((b.vitorias || 0) !== (a.vitorias || 0)) return (b.vitorias || 0) - (a.vitorias || 0);
        return (b.assistencias || 0) - (a.assistencias || 0);
      });
    }
    if (rankingTab === 'gols') {
      return list.sort((a, b) => {
        if ((b.gols || 0) !== (a.gols || 0)) return (b.gols || 0) - (a.gols || 0);
        return b.totalPts - a.totalPts;
      });
    }
    if (rankingTab === 'assists') {
      return list.sort((a, b) => {
        if ((b.assistencias || 0) !== (a.assistencias || 0)) return (b.assistencias || 0) - (a.assistencias || 0);
        return b.totalPts - a.totalPts;
      });
    }
    return list.sort((a, b) => {
      if ((b.vitorias || 0) !== (a.vitorias || 0)) return (b.vitorias || 0) - (a.vitorias || 0);
      return b.totalPts - a.totalPts;
    });
  };

  const currentRanking = getSortedRanking();
  const topOverall = currentRanking[0];
  
  // Scorer, Assister and Winner derived from full list with robust sorting
  const topScorer = [...currentRanking].sort((a, b) => {
    if ((b.gols || 0) !== (a.gols || 0)) return (b.gols || 0) - (a.gols || 0);
    return b.totalPts - a.totalPts;
  })[0];
  
  const topAssister = [...currentRanking].sort((a, b) => {
    if ((b.assistencias || 0) !== (a.assistencias || 0)) return (b.assistencias || 0) - (a.assistencias || 0);
    return b.totalPts - a.totalPts;
  })[0];

  const topWinner = [...currentRanking].sort((a, b) => {
    if ((b.vitorias || 0) !== (a.vitorias || 0)) return (b.vitorias || 0) - (a.vitorias || 0);
    return b.totalPts - a.totalPts;
  })[0];

  if (loading) return <div className="p-8 text-center text-gray-500 text-xs font-bold uppercase tracking-widest animate-pulse">Carregando Rankings...</div>;

  return (
    <div className="space-y-8 pb-8">
      {/* Period Selection */}
      <div className="flex bg-card p-1 rounded-2xl border border-border/50 shadow-sm mx-2">
        {(['geral', 'temporada', 'mes', 'rodada'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all duration-300 ${
              period === p ? 'bg-primary text-bg shadow-lg shadow-primary/20 scale-105 z-10' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {p === 'mes' ? 'Mês' : p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Ranking Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
          <div className="flex flex-col">
            <h3 className="text-[11px] font-bold tracking-[0.2em] text-primary uppercase">
              Ranking {period === 'geral' ? 'Geral' : period === 'temporada' ? 'Temporada' : period === 'mes' ? 'Mês' : 'Rodada'}
            </h3>
            <div className="flex items-center space-x-1 text-gray-600 mt-1">
              <TrendingUp size={10} />
              <span className="text-[9px] font-bold uppercase tracking-tight">
                {period === 'geral' ? 'Todo o Histórico' : 
                 period === 'temporada' ? `Temporada ${new Date().getFullYear()}` :
                 period === 'mes' ? `Filtro Mensal` :
                 `Última Rodada`}
              </span>
            </div>
          </div>
          
          <div className="flex bg-card p-1 rounded-xl border border-border/50 self-start sm:self-center">
            {([['total', 'Pontos'], ['gols', 'Gols'], ['assists', 'Assists'], ['wins', 'Vits']] as const).map(([tab, label]) => (
              <button 
                key={tab}
                onClick={() => setRankingTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${rankingTab === tab ? 'bg-primary text-bg shadow-sm' : 'text-gray-500 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {calculating ? (
          <div className="p-20 text-center space-y-4 animate-in fade-in duration-500">
            <div className="relative w-12 h-12 mx-auto">
              <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
            </div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Calculando Estatísticas...</p>
          </div>
        ) : (
          <div className="bg-card rounded-[32px] border border-border/50 divide-y divide-border/30 overflow-hidden shadow-xl animate-in slide-in-from-bottom-2 duration-500">
            {currentRanking.map((player, idx) => (
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
                    <div className="w-9 h-9 rounded-lg bg-bg border border-border flex items-center justify-center font-bold text-gray-500 overflow-hidden shadow-inner">
                      {player.photoUrl ? (
                        <img src={player.photoUrl} alt={player.displayName || player.name} className="w-full h-full object-cover" />
                      ) : (
                        (player.displayName || player.name).charAt(0)
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                         <h4 className="font-bold text-sm tracking-tight text-white truncate">{player.displayName || player.name}</h4>
                        {player.number && (
                          <span className="text-[10px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded-md leading-none shrink-0">
                            #{player.number}
                          </span>
                        )}
                      </div>
                      <p className="text-[8px] text-gray-500 font-bold uppercase tracking-wider truncate">{player.position}</p>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {rankingTab === 'total' && (
                    <>
                      <div className="text-sm font-black text-white">{player.totalPts} pts</div>
                      <div className="text-[8px] font-bold text-gray-600 uppercase">
                        {player.gols || 0}G • {player.assistencias || 0}A • {player.vitorias || 0}V • {player.empates || 0}E
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
            {currentRanking.length === 0 && (
              <div className="p-16 text-center space-y-4">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                  <Frown className="text-gray-700" size={32} />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Nenhum dado registrado</p>
                  <p className="text-[9px] text-gray-600">Não há partidas finalizadas neste período.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Destaques Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-[11px] font-bold tracking-[0.2em] text-primary uppercase">Destaques {period === 'geral' ? 'Geral' : 'do Período'}</h3>
          <button 
            onClick={handleShare}
            className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors shadow-lg active:scale-95"
          >
            <Share2 size={16} />
          </button>
        </div>

        <div className="bg-gradient-to-br from-card to-bg p-8 rounded-[40px] border border-primary/20 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <Trophy size={200} />
          </div>
          
          <div className="relative z-10 space-y-8">
            <div className="text-center pb-6 border-b border-white/5">
              <h2 className="text-3xl font-black text-white tracking-tighter italic uppercase underline decoration-primary decoration-8 underline-offset-4">Top Performance</h2>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.3em] mt-4">
                {period === 'geral' ? 'TODO O HISTÓRICO' : period.toUpperCase()}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-y-8 gap-x-6">
              <AwardItem label="CRAQUE" name={topOverall ? (topOverall.displayName || topOverall.name) : "-"} icon={<Trophy size={14} />} />
              <AwardItem label="GOLEADOR" name={topScorer ? (topScorer.displayName || topScorer.name) : "-"} icon={<Star size={14} />} />
              <AwardItem label="GARÇOM" name={topAssister ? (topAssister.displayName || topAssister.name) : "-"} icon={<Star size={14} />} />
              <AwardItem label="PONTUAÇÃO" name={`${(topOverall?.totalPts || 0)} PTS`} icon={<TrendingUp size={14} />} />
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
