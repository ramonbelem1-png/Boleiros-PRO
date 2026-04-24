import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  updateDoc, 
  setDoc,
  addDoc, 
  deleteDoc,
  orderBy, 
  limit,
  Timestamp,
  where,
  getDoc,
  getDocFromServer,
  serverTimestamp,
  writeBatch,
  increment
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase';

export type PlayerPosition = 'GOLEIRO' | 'ZAGUEIRO' | 'LATERAL' | 'VOLANTE' | 'MEIA' | 'ATACANTE';

export interface Player {
  id: string;
  name: string; // Keep as fallback/internal
  fullName: string;
  displayName: string;
  photoUrl?: string;
  position: PlayerPosition;
  secondaryPosition?: PlayerPosition;
  level: number;
  type: 'MENSALISTA' | 'DIARISTA';
  balance: number;
  active: boolean;
  gols: number;
  assistencias: number;
  vitorias: number;
  derrotas: number;
  empates: number;
  number?: number;
}

export interface GameEvent {
  type: 'GOAL' | 'OWN_GOAL';
  playerId: string;
  assistId?: string;
  timestamp: any;
  teamSide: 'A' | 'B'; // The team that gets the point
}

export interface Game {
  id: string;
  teamA_ids: string[];
  teamB_ids: string[];
  scoreA: number;
  scoreB: number;
  startTime: any;
  endTime?: any;
  status: 'SCHEDULED' | 'RUNNING' | 'FINISHED';
  events: GameEvent[];
  isPaused?: boolean;
  accumulatedTime?: number; // ms
  lastStartedAt?: any; // Timestamp
}

export interface Match {
  id: string;
  date: any;
  status: 'OPEN' | 'FINISHED' | 'CANCELLED';
  confirmedIds: string[];
  absentIds: { userId: string; reason: string }[];
  waitingIds: string[];
  result?: { scoreA: number; scoreB: number };
  teams?: Record<string, string[]>; // Map of team index to player UIDs
  playersPerTeam?: number;
  gameRules?: string;
}

export interface Transaction {
  id: string;
  date: any;
  amount: number;
  type: 'INCOME' | 'EXPENSE';
  category: 'MONTHLY' | 'DAILY' | 'FIELD_RENT' | 'BALL' | 'OTHER';
  description: string;
  playerId?: string;
}

export interface GroupSettings {
  monthlyFee: number;
  dailyFee: number;
  maxPlayers: number;
}

import { useAuth } from '../components/AuthProvider';

export function usePelada() {
  const { role, user } = useAuth();
  const isAdmin = role === 'ADMIN' || user?.email?.trim().toLowerCase() === 'ramonbelem1@gmail.com';
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [liveGame, setLiveGame] = useState<Game | null>(null);
  const [activeGames, setActiveGames] = useState<Game[]>([]);
  const [settings, setSettings] = useState<GroupSettings>({
    monthlyFee: 50,
    dailyFee: 15,
    maxPlayers: 20
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubPlayers = onSnapshot(query(collection(db, 'players'), orderBy('name')), (snap) => {
      setPlayers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player)));
    });

    const unsubMatches = onSnapshot(query(collection(db, 'matches'), orderBy('date', 'desc'), limit(50)), (snap) => {
      setMatches(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match)));
    });

    let unsubTransactions: () => void = () => {};
    if (isAdmin) {
      unsubTransactions = onSnapshot(query(collection(db, 'transactions'), orderBy('date', 'desc'), limit(50)), (snap) => {
        setTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction)));
      });
    }

    const unsubSettings = onSnapshot(doc(db, 'groups', 'main'), (snap) => {
      if (snap.exists()) {
        setSettings(snap.data() as GroupSettings);
      }
      setLoading(false);
    });

    return () => {
      unsubPlayers();
      unsubMatches();
      unsubTransactions();
      unsubSettings();
    };
  }, [user, isAdmin]);

  // Auto-finish expired matches (Triggered by admin login)
  useEffect(() => {
    if (!isAdmin || matches.length === 0) return;
    
    const now = new Date();
    matches.forEach(async (match) => {
      if (match.status === 'OPEN') {
        const matchDate = match.date.toDate();
        // A pelada só deve ser encerrada às 23:59:59 da data da pelada.
        // Ou seja, ela é encerrada quando o dia atual for maior que o dia da pelada.
        const dayAfterMatch = new Date(matchDate);
        dayAfterMatch.setDate(dayAfterMatch.getDate() + 1);
        dayAfterMatch.setHours(0, 0, 0, 0);

        if (now >= dayAfterMatch) {
          console.log(`[Auto-Finish] Encerrando pelada expirada: ${match.id} (Data: ${matchDate})`);
          await finishMatch(match.id);
        }
      }
    });
  }, [matches, isAdmin]);

  // Effect specifically for handling the live game listener
  useEffect(() => {
    if (!user) return;
    
    // Fallback detection for active match to ensure listener attaches properly
    const openMatchId = matches.find(m => m.status === 'OPEN')?.id;

    if (!openMatchId) {
      setLiveGame(null);
      setActiveGames([]);
      return;
    }

    console.log(`[usePelada] Ativando listeners para MatchID: ${openMatchId}`);

    // 1. Snapshot para o jogo AO VIVO (RUNNING)
    const qLive = query(
      collection(db, 'matches', openMatchId, 'games'),
      where('status', '==', 'RUNNING')
    );
    
    const unsubLiveGame = onSnapshot(qLive, (snap) => {
      if (!snap.empty) {
        // Encontra o mais recente se houver mais de um, embora deva ser apenas 1
        const doc = snap.docs[0];
        const gameData = { id: doc.id, ...doc.data() } as Game;
        console.log("[usePelada] Jogo ao vivo detectado:", gameData.id, gameData);
        setLiveGame(gameData);
      } else {
        console.log("[usePelada] Nenhum jogo ao vivo (RUNNING) no momento.");
        setLiveGame(null);
      }
    }, (error) => {
      console.error("[usePelada] Erro no snapshot de liveGame:", error);
    });

    // 2. Snapshot para TODOS os jogos da pelada atual (histórico do dia)
    const qAllGames = query(
      collection(db, 'matches', openMatchId, 'games'),
      orderBy('startTime', 'desc')
    );

    const unsubAllGames = onSnapshot(qAllGames, (snap) => {
      const games = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Game));
      console.log(`[usePelada] Atualizando lista de jogos (${games.length} encontrados)`);
      setActiveGames(games);
    });

    return () => {
      console.log("[usePelada] Limpando listeners de games.");
      unsubLiveGame();
      unsubAllGames();
    };
  }, [user, matches.find(m => m.status === 'OPEN')?.id]);

  const updateGameTeams = async (matchId: string, gameId: string, teamA_ids: string[], teamB_ids: string[]) => {
    const gameRef = doc(db, 'matches', matchId, 'games', gameId);
    await updateDoc(gameRef, { teamA_ids, teamB_ids });
  };

  const createScheduledGame = async (matchId: string, teamA_ids: string[], teamB_ids: string[]) => {
    const gameData = {
      teamA_ids,
      teamB_ids,
      scoreA: 0,
      scoreB: 0,
      startTime: serverTimestamp(),
      status: 'SCHEDULED',
      events: []
    };
    await addDoc(collection(db, 'matches', matchId, 'games'), gameData);
  };

  const startGame = async (matchId: string, gameId: string) => {
    const gameRef = doc(db, 'matches', matchId, 'games', gameId);
    await updateDoc(gameRef, { 
      status: 'RUNNING',
      startTime: serverTimestamp(),
      lastStartedAt: serverTimestamp(),
      accumulatedTime: 0,
      isPaused: false
    });
  };

  const pauseGame = async (matchId: string, gameId: string) => {
    const gameRef = doc(db, 'matches', matchId, 'games', gameId);
    const gameSnap = await getDoc(gameRef);
    if (!gameSnap.exists()) return;
    const game = gameSnap.data() as Game;
    
    if (game.isPaused) return;

    const lastStarted = game.lastStartedAt?.toDate()?.getTime() || Date.now();
    const sessionId = Date.now() - lastStarted;
    const newAccumulated = (game.accumulatedTime || 0) + sessionId;

    await updateDoc(gameRef, {
      isPaused: true,
      accumulatedTime: newAccumulated
    });
  };

  const resumeGame = async (matchId: string, gameId: string) => {
    const gameRef = doc(db, 'matches', matchId, 'games', gameId);
    await updateDoc(gameRef, {
      isPaused: false,
      lastStartedAt: serverTimestamp()
    });
  };

  const updateSettings = async (newSettings: GroupSettings) => {
    await setDoc(doc(db, 'groups', 'main'), newSettings, { merge: true });
  };

  const confirmPresence = async (matchId: string, playerId: string) => {
    if (!playerId) {
      console.error("Tentativa de confirmar presença sem playerId");
      return;
    }
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    if (match.confirmedIds.includes(playerId)) return;
    
    const newConfirmed = [...match.confirmedIds];
    const newWaiting = [...match.waitingIds];

    if (newConfirmed.length < settings.maxPlayers) {
      newConfirmed.push(playerId);
    } else if (!newWaiting.includes(playerId)) {
      newWaiting.push(playerId);
    }

    try {
      await updateDoc(doc(db, 'matches', matchId), {
        confirmedIds: newConfirmed,
        waitingIds: newWaiting,
        absentIds: match.absentIds.filter(a => a.userId !== playerId)
      });
    } catch (error) {
      console.error("Erro ao confirmar presença:", error);
    }
  };

  const markAbsent = async (matchId: string, playerId: string, reason: string) => {
    if (!playerId) return;
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    let newConfirmed = match.confirmedIds.filter(id => id !== playerId);
    let newWaiting = match.waitingIds.filter(id => id !== playerId);
    const newAbsent = [...match.absentIds, { userId: playerId, reason }];

    // Se alguém sair dos confirmados e houver fila, o primeiro da fila entra
    if (match.confirmedIds.includes(playerId) && newWaiting.length > 0) {
      const nextInLine = newWaiting.shift();
      if (nextInLine) newConfirmed.push(nextInLine);
    }

    try {
      await updateDoc(doc(db, 'matches', matchId), {
        absentIds: newAbsent,
        confirmedIds: newConfirmed,
        waitingIds: newWaiting
      });
    } catch (error) {
      handleFirestoreError(error, 'update', `matches/${matchId}`);
    }
  };

  const createMatch = async (date: Date) => {
    await addDoc(collection(db, 'matches'), {
      date: Timestamp.fromDate(date),
      status: 'OPEN',
      confirmedIds: [],
      absentIds: [],
      waitingIds: []
    });
  };

  const createTransaction = async (data: Omit<Transaction, 'id'>) => {
    try {
      const docRef = await addDoc(collection(db, 'transactions'), {
        ...data,
        date: Timestamp.fromDate(new Date())
      });

      // Se for uma transação associada a um jogador, atualiza o saldo dele
      if (data.playerId) {
        const player = players.find(p => p.id === data.playerId);
        if (player) {
          const newBalance = (player.balance || 0) + (data.type === 'INCOME' ? data.amount : -data.amount);
          await updatePlayer(data.playerId, { balance: newBalance });
        }
      }
      return docRef;
    } catch (error) {
      handleFirestoreError(error, 'create', 'transactions');
    }
  };

  const addPlayer = async (data: Omit<Player, 'id' | 'gols' | 'assistencias' | 'vitorias' | 'derrotas' | 'empates' | 'active' | 'balance'>) => {
    await addDoc(collection(db, 'players'), {
      gols: 0,
      assistencias: 0,
      vitorias: 0,
      derrotas: 0,
      empates: 0,
      ...data,
      active: true,
      balance: 0
    });
  };

  const updatePlayer = async (playerId: string, data: Partial<Player>) => {
    try {
      console.log(`[usePelada] Iniciando updateDoc para jogador ${playerId}...`);
      await updateDoc(doc(db, 'players', playerId), {
        ...data,
        updatedAt: serverTimestamp()
      });
      console.log(`[usePelada] Jogador ${playerId} atualizado!`);
    } catch (error: any) {
      console.error(`[usePelada] ERRO ao atualizar jogador ${playerId}:`, error);
      throw error;
    }
  };

  const deletePlayer = async (playerId: string) => {
    await deleteDoc(doc(db, 'players', playerId));
  };

  const setMatchTeams = async (matchId: string, teamsIds: string[][], extraData?: { playersPerTeam?: number; gameRules?: string }) => {
    // Firestore does not support nested arrays. Convert to object.
    const teamsObj: Record<string, string[]> = {};
    teamsIds.forEach((ids, idx) => {
      teamsObj[String(idx)] = ids;
    });
    await updateDoc(doc(db, 'matches', matchId), { 
      teams: teamsObj,
      ...extraData
    });
  };

  const updateMatch = async (matchId: string, data: Partial<Match>) => {
    await updateDoc(doc(db, 'matches', matchId), data);
  };

  const finishMatch = async (matchId: string) => {
    await updateDoc(doc(db, 'matches', matchId), { status: 'FINISHED' });
  };

  const startLiveGame = async (matchId: string, teamAIds: string[], teamBIds: string[]) => {
    const gameData = {
      teamA_ids: teamAIds,
      teamB_ids: teamBIds,
      scoreA: 0,
      scoreB: 0,
      startTime: serverTimestamp(),
      status: 'RUNNING',
      events: []
    };
    await addDoc(collection(db, 'matches', matchId, 'games'), gameData);
  };

  const addGameEvent = async (matchId: string, gameId: string, event: Omit<GameEvent, 'timestamp'>) => {
    const gameRef = doc(db, 'matches', matchId, 'games', gameId);
    try {
      const gameSnap = await getDoc(gameRef);
      if (!gameSnap.exists()) return;
      
      const data = gameSnap.data() as Game;
      const eventWithTime: any = { ...event, timestamp: Timestamp.now() };
      
      // Sanitização: Firestore não aceita valores undefined
      if (eventWithTime.assistId === undefined) {
        delete eventWithTime.assistId;
      }
      
      const newEvents = [...(data.events || []), eventWithTime];
      
      let newScoreA = data.scoreA;
      let newScoreB = data.scoreB;

      if (event.type === 'GOAL') {
        if (event.teamSide === 'A') newScoreA++;
        else newScoreB++;

        // Personal stats only for normal goals
        const pRef = doc(db, 'players', event.playerId);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          await updateDoc(pRef, { gols: (pSnap.data().gols || 0) + 1 });
        }

        if (event.assistId) {
          const aRef = doc(db, 'players', event.assistId);
          const aSnap = await getDoc(aRef);
          if (aSnap.exists()) {
            await updateDoc(aRef, { assistencias: (aSnap.data().assistencias || 0) + 1 });
          }
        }
      } else if (event.type === 'OWN_GOAL') {
        if (event.teamSide === 'A') newScoreA++;
        else newScoreB++;
        // Own goals don't count for personal "gols" stat currently (can be added if needed)
      }

      await updateDoc(gameRef, { 
        events: newEvents,
        scoreA: newScoreA,
        scoreB: newScoreB
      });
    } catch (error) {
      handleFirestoreError(error, 'update', `matches/${matchId}/games/${gameId}`);
    }
  };

  const updateGameEvent = async (matchId: string, gameId: string, eventIdx: number, newEventData: Partial<GameEvent>) => {
    const gameRef = doc(db, 'matches', matchId, 'games', gameId);
    try {
      const gameSnap = await getDoc(gameRef);
      if (!gameSnap.exists()) return;
      
      const data = gameSnap.data() as Game;
      const oldEvent = data.events[eventIdx];
      if (!oldEvent) return;

      // 1. Revert old stats
      if (oldEvent.type === 'GOAL') {
        const oldPRef = doc(db, 'players', oldEvent.playerId);
        const oldPSnap = await getDoc(oldPRef);
        if (oldPSnap.exists()) {
          await updateDoc(oldPRef, { gols: Math.max(0, (oldPSnap.data().gols || 0) - 1) });
        }
        if (oldEvent.assistId) {
          const oldARef = doc(db, 'players', oldEvent.assistId);
          const oldASnap = await getDoc(oldARef);
          if (oldASnap.exists()) {
            await updateDoc(oldARef, { assistencias: Math.max(0, (oldASnap.data().assistencias || 0) - 1) });
          }
        }
      }

      // 2. Apply new stats
      const updatedEvent: any = { ...oldEvent, ...newEventData };
      
      // Sanitização: Firestore não aceita valores undefined
      if (updatedEvent.assistId === undefined) {
        delete updatedEvent.assistId;
      }

      if (updatedEvent.type === 'GOAL') {
        const newPRef = doc(db, 'players', updatedEvent.playerId);
        const newPSnap = await getDoc(newPRef);
        if (newPSnap.exists()) {
          await updateDoc(newPRef, { gols: (newPSnap.data().gols || 0) + 1 });
        }
        if (updatedEvent.assistId) {
          const newARef = doc(db, 'players', updatedEvent.assistId);
          const newASnap = await getDoc(newARef);
          if (newASnap.exists()) {
            await updateDoc(newARef, { assistencias: (newASnap.data().assistencias || 0) + 1 });
          }
        }
      }

      // 3. Update event in array
      const newEvents = [...data.events];
      newEvents[eventIdx] = updatedEvent;
      
      await updateDoc(gameRef, { events: newEvents });
    } catch (error) {
      console.error("Erro ao atualizar evento:", error);
    }
  };

  const removeGameEvent = async (matchId: string, gameId: string, eventIdx: number) => {
    const gameRef = doc(db, 'matches', matchId, 'games', gameId);
    try {
      const gameSnap = await getDoc(gameRef);
      if (!gameSnap.exists()) return;
      
      const data = gameSnap.data() as Game;
      const oldEvent = data.events[eventIdx];
      if (!oldEvent) return;

      // 1. Revert stats
      if (oldEvent.type === 'GOAL') {
        const oldPRef = doc(db, 'players', oldEvent.playerId);
        const oldPSnap = await getDoc(oldPRef);
        if (oldPSnap.exists()) {
          await updateDoc(oldPRef, { gols: Math.max(0, (oldPSnap.data().gols || 0) - 1) });
        }
        if (oldEvent.assistId) {
          const oldARef = doc(db, 'players', oldEvent.assistId);
          const oldASnap = await getDoc(oldARef);
          if (oldASnap.exists()) {
            await updateDoc(oldARef, { assistencias: Math.max(0, (oldASnap.data().assistencias || 0) - 1) });
          }
        }
      }

      // 2. Adjust score
      let newScoreA = data.scoreA;
      let newScoreB = data.scoreB;
      if (oldEvent.teamSide === 'A') newScoreA = Math.max(0, newScoreA - 1);
      else newScoreB = Math.max(0, newScoreB - 1);

      // 3. Update Firestore
      const newEvents = data.events.filter((_, i) => i !== eventIdx);
      await updateDoc(gameRef, { 
        events: newEvents,
        scoreA: newScoreA,
        scoreB: newScoreB
      });
    } catch (error) {
      console.error("Erro ao remover evento:", error);
    }
  };

  const finishGame = async (matchId: string, gameId: string, result: { scoreA: number, scoreB: number, teamA: string[], teamB: string[] }) => {
    console.log("[usePelada] finishGame: Início do processamento", { matchId, gameId, scoreA: result.scoreA });
    
    if (!matchId || !gameId) {
      throw new Error("IDs de identificação da partida ou jogo estão ausentes.");
    }

    try {
      const batch = writeBatch(db);
      const gameRef = doc(db, 'matches', matchId, 'games', gameId);
      
      // 1. Marcar partida como finalizada
      const sA = Number(result.scoreA) || 0;
      const sB = Number(result.scoreB) || 0;

      batch.update(gameRef, { 
        status: 'FINISHED',
        endTime: serverTimestamp(),
        scoreA: sA,
        scoreB: sB
      });

      const isDraw = sA === sB;
      const winA = sA > sB;
      const winB = sB > sA;
      
      // 2. Coletar IDs únicos de jogadores
      const teamA = result.teamA || [];
      const teamB = result.teamB || [];
      const allPlayerIds = Array.from(new Set([...teamA, ...teamB])).filter(id => id && typeof id === 'string');
      
      console.log(`[usePelada] 2. Aplicando incrementos para ${allPlayerIds.length} jogadores.`);

      allPlayerIds.forEach(id => {
        const pRef = doc(db, 'players', id);
        const isTeamA = teamA.includes(id);
        
        if (isDraw) {
          batch.update(pRef, { empates: increment(1) });
        } else if ((isTeamA && winA) || (!isTeamA && winB)) {
          batch.update(pRef, { vitorias: increment(1) });
        } else {
          batch.update(pRef, { derrotas: increment(1) });
        }
      });

      // 5. Executar batch
      console.log("[usePelada] 3. Commitando batch com Firestore.");
      await batch.commit();
      console.log("[usePelada] SUCESSO TOTAL!");
    } catch (error: any) {
      console.error("[usePelada] ERRO no batch:", error);
      handleFirestoreError(error, 'write', `matches/${matchId}/games/${gameId}`);
      throw error;
    }
  };

  const deleteGame = async (matchId: string, gameId: string) => {
    console.log(`[usePelada] Tentando excluir partida. MatchID: ${matchId}, GameID: ${gameId}`);
    if (!matchId || !gameId) {
      console.error("[usePelada] ID de match ou game ausente para exclusão");
      return;
    }
    try {
      await deleteDoc(doc(db, 'matches', matchId, 'games', gameId));
      console.log("[usePelada] Partida excluída com sucesso");
      alert("Partida excluída com sucesso!");
    } catch (error) {
      console.error("[usePelada] Erro ao excluir partida:", error);
      alert("Erro ao excluir partida. Verifique o console.");
      handleFirestoreError(error, 'delete', `matches/${matchId}/games/${gameId}`);
    }
  };

  const getMatchGames = async (matchId: string) => {
    const { getDocs } = await import('firebase/firestore');
    const q = query(
      collection(db, 'matches', matchId, 'games'),
      orderBy('startTime', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Game));
  };

  return {
    players,
    matches,
    transactions,
    settings,
    loading,
    liveGame,
    activeGames,
    confirmPresence,
    markAbsent,
    createMatch,
    createTransaction,
    addPlayer,
    updatePlayer,
    deletePlayer,
    getMatchGames,
    updateSettings,
    setMatchTeams,
    updateMatch,
    finishMatch,
    startLiveGame,
    startGame,
    createScheduledGame,
    updateGameTeams,
    addGameEvent,
    updateGameEvent,
    removeGameEvent,
    finishGame,
    deleteGame,
    pauseGame,
    resumeGame
  };
}
