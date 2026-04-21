import React, { useState } from 'react';
import { usePelada, Player } from '../hooks/usePelada';
import { useAuth } from './AuthProvider';
import { Shuffle, Users, Trophy } from 'lucide-react';
import { motion } from 'motion/react';

export default function TeamDraw() {
  const { players, matches, setMatchTeams } = usePelada();
  const { user, role } = useAuth();
  const isAdmin = role === 'ADMIN' || user?.email === 'ramonbelem1@gmail.com';
  const nextMatch = matches.find(m => m.status === 'OPEN');
  const confirmedPlayers = players.filter(p => nextMatch?.confirmedIds.includes(p.id));

  const [teams, setTeams] = useState<Player[][]>([]);
  const [saving, setSaving] = useState(false);

  const confirmTeams = async () => {
    if (!nextMatch) return;
    setSaving(true);
    try {
      const teamsIds = teams.map(team => team.map(p => p.id));
      await setMatchTeams(nextMatch.id, teamsIds);
      alert("Times definidos com sucesso! Vá para a aba 'Ao Vivo' para gerenciar os jogos.");
      setTeams([]);
    } catch (error) {
      console.error("Erro ao salvar times:", error);
      alert("Erro ao salvar times.");
    } finally {
      setSaving(false);
    }
  };

  const drawTeams = () => {
    if (confirmedPlayers.length < 2) return;

    // 1. Identify number of teams (aiming for 5-7 players per team)
    const playersPerTeam = 5;
    const numTeams = Math.max(2, Math.ceil(confirmedPlayers.length / playersPerTeam));
    const result: Player[][] = Array.from({ length: numTeams }, () => []);

    // 2. Separate Goalkeepers
    const goalkeepers = confirmedPlayers.filter(p => p.position === 'GOLEIRO' || p.secondaryPosition === 'GOLEIRO');
    const fieldPlayers = confirmedPlayers.filter(p => !goalkeepers.find(gk => gk.id === p.id));

    // 3. Sort by level (descending) to use in distribution
    const sortedGKs = [...goalkeepers].sort((a, b) => b.level - a.level);
    const sortedField = [...fieldPlayers].sort((a, b) => b.level - a.level);

    // 4. Distribute Goalkeepers (prioritize primary position)
    const primaryGKs = sortedGKs.filter(p => p.position === 'GOLEIRO');
    const secondaryGKs = sortedGKs.filter(p => p.position !== 'GOLEIRO');
    
    const allGKsToDistribute = [...primaryGKs, ...secondaryGKs];
    allGKsToDistribute.forEach((gk, index) => {
      result[index % numTeams].push(gk);
    });

    // 5. Distribute Field Players using greedy balancing
    // We want to balance: Total Level AND Positions
    sortedField.forEach((player) => {
      // Find team with:
      // 1. the least number of players
      // 2. then the lowest total level
      // 3. (Optional) check if team needs this player's position
      
      let targetTeamIdx = 0;
      let minPlayers = Infinity;
      let minLevel = Infinity;

      for (let i = 0; i < numTeams; i++) {
        const teamSize = result[i].length;
        const teamLevel = result[i].reduce((sum, p) => sum + p.level, 0);

        if (teamSize < minPlayers) {
          minPlayers = teamSize;
          minLevel = teamLevel;
          targetTeamIdx = i;
        } else if (teamSize === minPlayers && teamLevel < minLevel) {
          minLevel = teamLevel;
          targetTeamIdx = i;
        }
      }

      result[targetTeamIdx].push(player);
    });

    // Shuffle each team internally for UI variety
    result.forEach(team => team.sort(() => Math.random() - 0.5));

    setTeams(result);
  };

  return (
    <div className="space-y-6">
      <div className="bg-primary/10 border border-primary/20 p-4 rounded-3xl mb-4">
        <p className="text-secondary text-xs text-center font-medium">
          Sorteio baseado em <span className="font-bold">{confirmedPlayers.length}</span> jogadores confirmados.
        </p>
      </div>

      {teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center space-y-6">
          <div className="w-24 h-24 rounded-full bg-card border border-border flex items-center justify-center">
            <Shuffle size={40} className="text-primary" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold">Pronto para o Jogo?</h3>
            <p className="text-gray-500 text-sm max-w-[240px]">
              O algoritmo irá equilibrar os times por nível técnico e posição.
            </p>
          </div>
          <button 
            onClick={drawTeams}
            disabled={confirmedPlayers.length < 2}
            className="bg-primary text-bg px-8 py-4 rounded-2xl font-black uppercase tracking-widest disabled:opacity-50 disabled:grayscale transition-all"
          >
            Sortear Times
          </button>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
          {teams.map((team, idx) => (
            <div key={idx} className="space-y-4">
              <div className="flex items-center space-x-2 px-2">
                <div className="w-8 h-8 rounded-lg bg-primary text-bg flex items-center justify-center font-black text-sm">
                  {idx + 1}
                </div>
                <h3 className="text-lg font-bold">Time {idx + 1}</h3>
                <div className="h-[1px] flex-1 bg-border/50 ml-2" />
                {isAdmin && <span className="text-[10px] font-bold text-gray-500 uppercase">Level: {team.reduce((acc, p) => acc + p.level, 0)}</span>}
              </div>
              
              <div className="grid grid-cols-1 gap-2">
                {team.map(player => (
                  <div key={player.id} className="bg-card p-3 rounded-2xl border border-border/50 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full bg-bg border border-border flex items-center justify-center text-[10px] font-bold overflow-hidden ${
                        player.position === 'GOLEIRO' ? 'text-yellow-500' : 'text-gray-500'
                      }`}>
                        {player.photoUrl ? (
                          <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          player.name.charAt(0)
                        )}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm">{player.name}</h4>
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-tighter">{player.position}</span>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex space-x-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div key={i} className={`w-1 h-1 rounded-full ${i < player.level ? 'bg-primary' : 'bg-gray-800'}`} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          
          <div className="flex gap-4">
            <button 
              onClick={() => setTeams([])}
              className="flex-1 py-4 bg-white/5 border border-border text-gray-500 font-bold uppercase tracking-widest text-[11px] rounded-2xl active:scale-95 transition-all"
            >
              Refazer Sorteio
            </button>
            {isAdmin && (
              <button 
                onClick={confirmTeams}
                className="flex-1 py-4 bg-primary text-bg font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-lg shadow-primary/20 active:scale-95 transition-all"
              >
                Definir Times
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
