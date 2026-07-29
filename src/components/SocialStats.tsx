import React from 'react';
import { usePelada, formatPosition } from '../hooks/usePelada';
import { Trophy, Star, Medal, Share2, Frown, ShieldAlert, TrendingUp } from 'lucide-react';

export default function SocialStats() {
  const { players, matches, loading, getMatchGames } = usePelada();
  const [rankingTab, setRankingTab] = React.useState<'total' | 'gols' | 'assists' | 'wins'>('total');
  const [period, setPeriod] = React.useState<'geral' | 'temporada' | 'mes' | 'rodada'>('geral');
  const [periodStats, setPeriodStats] = React.useState<Record<string, any>>({});
  const [calculating, setCalculating] = React.useState(false);

  // States for selected historical metrics
  const [selectedMatchId, setSelectedMatchId] = React.useState<string>('');
  const [selectedMonthKey, setSelectedMonthKey] = React.useState<string>('');
  const [selectedYear, setSelectedYear] = React.useState<number | null>(null);

  const finishedMatches = React.useMemo(() => {
    return matches.filter(m => m.status === 'FINISHED');
  }, [matches]);

  const availableMonths = React.useMemo(() => {
    const monthsMap = new Map<string, { year: number; month: number; label: string }>();
    finishedMatches.forEach(m => {
      const mDate = m.date?.toDate();
      if (!mDate) return;
      const year = mDate.getFullYear();
      const month = mDate.getMonth(); // 0-indexed
      const key = `${year}-${month}`;
      if (!monthsMap.has(key)) {
        const monthName = mDate.toLocaleDateString('pt-BR', { month: 'long' });
        const capitalizedMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        monthsMap.set(key, {
          year,
          month,
          label: `${capitalizedMonthName} de ${year}`
        });
      }
    });
    return Array.from(monthsMap.entries()).map(([key, value]) => ({
      key,
      ...value
    })).sort((a, b) => {
      const [yearA, monthA] = a.key.split('-').map(Number);
      const [yearB, monthB] = b.key.split('-').map(Number);
      if (yearA !== yearB) return yearB - yearA;
      return monthB - monthA;
    });
  }, [finishedMatches]);

  const availableYears = React.useMemo(() => {
    const yearsSet = new Set<number>();
    finishedMatches.forEach(m => {
      const mDate = m.date?.toDate();
      if (mDate) {
        yearsSet.add(mDate.getFullYear());
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [finishedMatches]);

  const activeMatchId = selectedMatchId || (finishedMatches[0]?.id || '');
  const activeMonthKey = selectedMonthKey || (availableMonths[0]?.key || '');
  const activeYear = selectedYear || (availableYears[0] || new Date().getFullYear());

  const selectedMatch = React.useMemo(() => {
    return finishedMatches.find(m => m.id === activeMatchId);
  }, [selectedMatchId, finishedMatches, activeMatchId]);

  const selectedMatchLabel = React.useMemo(() => {
    if (!selectedMatch) return 'Sem Rodada';
    const mDate = selectedMatch.date?.toDate();
    const formattedDate = mDate ? mDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    const isLatest = finishedMatches[0]?.id === selectedMatch.id;
    return isLatest ? `Última Rodada (${formattedDate})` : `Rodada de ${formattedDate}`;
  }, [selectedMatch, finishedMatches]);

  const selectedMonthLabel = React.useMemo(() => {
    const found = availableMonths.find(m => m.key === activeMonthKey);
    return found ? found.label : 'Mês atual';
  }, [availableMonths, activeMonthKey]);

  const selectedYearLabel = `Temporada ${activeYear}`;

  const handleShare = async () => {
    const periodLabel = period === 'geral' ? 'Geral' : period === 'temporada' ? 'Temporada' : period === 'mes' ? 'Mês' : 'Rodada';

    const scorerText = goleadores.length > 0
      ? `${goleadores.map(p => p.displayName || p.name).join(', ')} - ${goleadores[0].gols} ${goleadores[0].gols === 1 ? 'gol' : 'gols'}`
      : '-';

    const assisterText = garcons.length > 0 
      ? `${garcons.map(p => p.displayName || p.name).join(', ')} - ${garcons[0].assistencias} assist.`
      : '-';

    const pointsText = craques.length > 0 
      ? `${craques.map(p => p.displayName || p.name).join(', ')} - ${craques[0].totalPts} ${craques[0].totalPts === 1 ? 'pt' : 'pts'}`
      : '-';

    const perebaText = perebas.length > 0 
      ? `${perebas.map(p => p.displayName || p.name).join(', ')} - ${perebas[0].totalPts} ${perebas[0].totalPts === 1 ? 'pt' : 'pts'}`
      : '-';

    const shareUrl = window.location.origin.includes('localhost') || window.location.origin.includes('ais-dev') || window.location.origin.includes('ais-pre')
      ? 'https://boleiros-pro.vercel.app/' 
      : window.location.origin;

    const text = `🏆 Ranking (${periodLabel}) - Boleiros PRO\n\n⚽ Artilheiro: ${scorerText}\n🎯 Garçom: ${assisterText}\n🔥 Maior Pontuação: ${pointsText}\n🐢 Pereba: ${perebaText}\n\n#Futebol #Pelada #BoleirosPRO ${shareUrl}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `Ranking ${periodLabel}`,
          text: text,
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
      
      let targetMatches = [...finishedMatches];

      if (period === 'rodada') {
        if (activeMatchId) {
          targetMatches = targetMatches.filter(m => m.id === activeMatchId);
        } else {
          targetMatches = targetMatches.slice(0, 1);
        }
      } else if (period === 'mes') {
        if (activeMonthKey) {
          const [year, month] = activeMonthKey.split('-').map(Number);
          targetMatches = targetMatches.filter(m => {
            const mDate = m.date?.toDate();
            return mDate && mDate.getFullYear() === year && mDate.getMonth() === month;
          });
        } else {
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          targetMatches = targetMatches.filter(m => m.date.toDate() >= startOfMonth);
        }
      } else if (period === 'temporada') {
        if (activeYear) {
          targetMatches = targetMatches.filter(m => {
            const mDate = m.date?.toDate();
            return mDate && mDate.getFullYear() === activeYear;
          });
        } else {
          const now = new Date();
          const startOfYear = new Date(now.getFullYear(), 0, 1);
          targetMatches = targetMatches.filter(m => m.date.toDate() >= startOfYear);
        }
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
              if (event.playerId && event.playerId !== 'ninguem' && event.playerId !== 'goleiro' && !event.isGoalkeeperGoal) {
                if (!stats[event.playerId]) stats[event.playerId] = { gols: 0, assistencias: 0, vitorias: 0, derrotas: 0, empates: 0, contra: 0 };
                stats[event.playerId].gols++;
              }
              
              if (event.assistId && event.assistId !== 'ninguem' && event.assistId !== 'goleiro') {
                if (!stats[event.assistId]) stats[event.assistId] = { gols: 0, assistencias: 0, vitorias: 0, derrotas: 0, empates: 0, contra: 0 };
                stats[event.assistId].assistencias++;
              }
            } else if (event.type === 'OWN_GOAL') {
              if (event.playerId && event.playerId !== 'ninguem' && event.playerId !== 'goleiro' && !event.isGoalkeeperOwnGoal) {
                if (!stats[event.playerId]) stats[event.playerId] = { gols: 0, assistencias: 0, vitorias: 0, derrotas: 0, empates: 0, contra: 0 };
                stats[event.playerId].contra++;
              }
            }
          });

          // Determining wins/losses per game
          const isDraw = game.scoreA === game.scoreB;
          const teamA_ids = game.startingTeamA_ids || game.teamA_ids || [];
          const teamB_ids = game.startingTeamB_ids || game.teamB_ids || [];
          const winners = game.scoreA > game.scoreB ? teamA_ids : teamB_ids;
          const losers = game.scoreA > game.scoreB ? teamB_ids : teamA_ids;
          const allPlayers = [...teamA_ids, ...teamB_ids];

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
  }, [period, finishedMatches, activeMatchId, activeMonthKey, activeYear, getMatchGames]);

  const getSortedRanking = () => {
    let list = players.map(p => {
      const stats = period === 'geral' ? p : (periodStats[p.id] || { gols: 0, assistencias: 0, vitorias: 0, derrotas: 0, empates: 0, contra: 0 });
      const gamesPlayed = (stats.vitorias || 0) + (stats.derrotas || 0) + (stats.empates || 0);
      return { 
        ...p, 
        ...stats,
        gamesPlayed,
        totalPts: ((stats.gols || 0) * 2) + (stats.assistencias || 0) + ((stats.vitorias || 0) * 2) + (stats.empates || 0) + gamesPlayed
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

  // Always derive period highlights from the total list of active/period-involved players
  const periodRanking = React.useMemo(() => {
    let list = players.map(p => {
      const stats = period === 'geral' ? p : (periodStats[p.id] || { gols: 0, assistencias: 0, vitorias: 0, derrotas: 0, empates: 0, contra: 0 });
      const gamesPlayed = (stats.vitorias || 0) + (stats.derrotas || 0) + (stats.empates || 0);
      return { 
        ...p, 
        ...stats,
        gamesPlayed,
        totalPts: ((stats.gols || 0) * 2) + (stats.assistencias || 0) + ((stats.vitorias || 0) * 2) + (stats.empates || 0) + gamesPlayed
      };
    });

    if (period !== 'geral') {
      list = list.filter(p => p.totalPts > 0 || (p.vitorias || 0) > 0 || (p.derrotas || 0) > 0 || (p.empates || 0) > 0);
    }

    return list;
  }, [players, period, periodStats]);

  const craques = React.useMemo(() => {
    if (periodRanking.length === 0) return [];
    const maxPts = Math.max(...periodRanking.map(p => p.totalPts));
    if (maxPts < 0) return [];
    return periodRanking.filter(p => p.totalPts === maxPts);
  }, [periodRanking]);

  const goleadores = React.useMemo(() => {
    if (periodRanking.length === 0) return [];
    const maxGols = Math.max(...periodRanking.map(p => p.gols || 0));
    if (maxGols <= 0) return [];
    return periodRanking.filter(p => (p.gols || 0) === maxGols);
  }, [periodRanking]);

  const garcons = React.useMemo(() => {
    if (periodRanking.length === 0) return [];
    const maxAssists = Math.max(...periodRanking.map(p => p.assistencias || 0));
    if (maxAssists <= 0) return [];
    return periodRanking.filter(p => (p.assistencias || 0) === maxAssists);
  }, [periodRanking]);

  const perebas = React.useMemo(() => {
    if (periodRanking.length === 0) return [];
    const activePlayers = periodRanking.filter(p => (p.gamesPlayed || 0) > 0);
    const candidates = activePlayers.length > 0 ? activePlayers : periodRanking;
    if (candidates.length === 0) return [];
    const minPts = Math.min(...candidates.map(p => p.totalPts));
    return candidates.filter(p => p.totalPts === minPts);
  }, [periodRanking]);

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
      <section className="space-y-4 animate-in fade-in duration-300 isolate transform-gpu backface-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
          <div className="flex flex-col">
            <h3 className="text-[11px] font-bold tracking-[0.2em] text-primary uppercase">
              Ranking {period === 'geral' ? 'Geral' : period === 'temporada' ? 'Temporada' : period === 'mes' ? 'Mês' : 'Rodada'}
            </h3>
            <div className="flex items-center space-x-1 text-gray-600 mt-1">
              <TrendingUp size={10} />
              <span className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                {period === 'geral' ? 'Todo o Histórico' : 
                 period === 'temporada' ? selectedYearLabel :
                 period === 'mes' ? selectedMonthLabel :
                 selectedMatchLabel}
              </span>
            </div>
          </div>
          
          <div className="flex bg-card p-1 rounded-xl border border-border/50 self-start sm:self-center">
            {([['total', 'Pontos'], ['gols', 'Gols'], ['assists', 'Assists'], ['wins', 'Vits']] as const).map(([tab, label]) => (
              <button 
                key={tab}
                onClick={() => setRankingTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${rankingTab === tab ? 'bg-primary text-bg shadow-sm' : 'text-gray-500 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Historical Selection Dropdowns */}
        {period !== 'geral' && (
          <div className="mx-2 p-3 bg-card/40 rounded-2xl border border-border/40 flex flex-col gap-1.5 shadow-inner isolate transform-gpu backface-hidden">
            <span className="text-[9px] font-black uppercase tracking-[0.15em] text-primary/80">
              Histórico / Filtrar por {period === 'rodada' ? 'Rodada' : period === 'mes' ? 'Mês' : 'Temporada'}
            </span>
            
            {period === 'rodada' && (
              <div className="relative">
                <select
                  value={activeMatchId}
                  onChange={(e) => setSelectedMatchId(e.target.value)}
                  className="w-full bg-bg border border-border/60 hover:border-primary/50 rounded-xl py-2 pl-3 pr-10 text-xs font-semibold text-gray-100 outline-none cursor-pointer transition-all appearance-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  {finishedMatches.map((m, idx) => {
                    const mDate = m.date?.toDate();
                    const formattedDate = mDate ? mDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
                    return (
                      <option key={m.id} value={m.id} className="bg-card text-gray-100">
                        {idx === 0 ? `Última Rodada (${formattedDate})` : `Rodada de ${formattedDate}`}
                      </option>
                    );
                  })}
                  {finishedMatches.length === 0 && (
                    <option value="" className="bg-card text-gray-500">Nenhuma rodada finalizada</option>
                  )}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                  <svg className="fill-current h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
            )}

            {period === 'mes' && (
              <div className="relative">
                <select
                  value={activeMonthKey}
                  onChange={(e) => setSelectedMonthKey(e.target.value)}
                  className="w-full bg-bg border border-border/60 hover:border-primary/50 rounded-xl py-2 pl-3 pr-10 text-xs font-semibold text-gray-100 outline-none cursor-pointer transition-all appearance-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  {availableMonths.map((m) => (
                    <option key={m.key} value={m.key} className="bg-card text-gray-100">
                      {m.label}
                    </option>
                  ))}
                  {availableMonths.length === 0 && (
                    <option value="" className="bg-card text-gray-500">Nenhum mês com partidas</option>
                  )}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                  <svg className="fill-current h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
            )}

            {period === 'temporada' && (
              <div className="relative">
                <select
                  value={activeYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-full bg-bg border border-border/60 hover:border-primary/50 rounded-xl py-2 pl-3 pr-10 text-xs font-semibold text-gray-100 outline-none cursor-pointer transition-all appearance-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  {availableYears.map((year) => (
                    <option key={year} value={year} className="bg-card text-gray-100">
                      Temporada de {year}
                    </option>
                  ))}
                  {availableYears.length === 0 && (
                    <option value="" className="bg-card text-gray-500">Nenhuma temporada registrada</option>
                  )}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                  <svg className="fill-current h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
            )}
          </div>
        )}

        {calculating ? (
          <div className="p-20 text-center space-y-4 animate-in fade-in duration-500">
            <div className="relative w-12 h-12 mx-auto">
              <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
            </div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Calculando Estatísticas...</p>
          </div>
        ) : (
          <div className="bg-card rounded-[32px] border border-border/50 divide-y divide-border/30 overflow-hidden shadow-xl animate-in slide-in-from-bottom-2 duration-500 isolate transform-gpu backface-hidden">
            {currentRanking.map((player, idx) => (
              <div key={`${player.id}-${idx}`} className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
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
                        <img src={player.photoUrl} alt={player.displayName || player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider truncate">{formatPosition(player.position)}</p>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {rankingTab === 'total' && (
                    <>
                      <div className="text-sm font-black text-white">{player.totalPts} pts</div>
                      <div className="text-[10px] font-bold text-gray-600 uppercase">
                        {player.gamesPlayed || 0}J • {player.gols || 0}G • {player.assistencias || 0}A • {player.vitorias || 0}V • {player.empates || 0}E
                      </div>
                    </>
                  )}
                  {rankingTab === 'gols' && (
                    <div className="text-sm font-black text-primary">{(player.gols || 0)} <span className="text-[10px] uppercase font-bold ml-0.5">Gols</span></div>
                  )}
                  {rankingTab === 'assists' && (
                    <div className="text-sm font-black text-primary">{(player.assistencias || 0)} <span className="text-[10px] uppercase font-bold ml-0.5">Assists</span></div>
                  )}
                  {rankingTab === 'wins' && (
                    <>
                      <div className="text-sm font-black text-primary">{(player.vitorias || 0)} <span className="text-[10px] uppercase font-bold ml-0.5">Vitórias</span></div>
                      <div className="text-[10px] font-bold text-gray-600 uppercase">
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
                  <p className="text-[10px] text-gray-600">Não há partidas finalizadas neste período.</p>
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
              <AwardItem 
                label="CRAQUE" 
                name={craques.length > 0 ? craques.map(p => p.displayName || p.name).join(', ') : "-"} 
                icon={<Trophy size={14} />} 
              />
              <AwardItem 
                label="GOLEADOR" 
                name={goleadores.length > 0 ? `${goleadores.map(p => p.displayName || p.name).join(', ')} - ${goleadores[0].gols} ${goleadores[0].gols === 1 ? 'gol' : 'gols'}` : "-"} 
                icon={<Star size={14} />} 
              />
              <AwardItem 
                label="GARÇOM" 
                name={garcons.length > 0 ? `${garcons.map(p => p.displayName || p.name).join(', ')} - ${garcons[0].assistencias} assist.` : "-"} 
                icon={<Star size={14} />} 
              />
              <AwardItem 
                label="PONTUAÇÃO" 
                name={craques.length > 0 ? `${craques.map(p => p.displayName || p.name).join(', ')} - ${craques[0].totalPts} ${craques[0].totalPts === 1 ? 'pt' : 'pts'}` : "-"} 
                icon={<TrendingUp size={14} />} 
              />
              <div className="col-span-2 pt-4 border-t border-white/5">
                <AwardItem 
                  label="PEREBA" 
                  name={perebas.length > 0 ? `${perebas.map(p => p.displayName || p.name).join(', ')} - ${perebas[0].totalPts} ${perebas[0].totalPts === 1 ? 'pt' : 'pts'}` : "-"} 
                  icon={<span className="text-sm">🐢</span>} 
                  isBad={true} 
                />
              </div>
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
        <span className="text-[10px] font-black uppercase tracking-widest leading-none">{label}</span>
      </div>
      <p className="text-sm font-bold text-white leading-tight break-words">{name}</p>
    </div>
  );
}

function AlertCircleIcon() {
  return <div className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center text-[10px] font-bold">!</div>;
}
