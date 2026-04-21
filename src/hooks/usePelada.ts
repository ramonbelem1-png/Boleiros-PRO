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
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export type PlayerPosition = 'GOLEIRO' | 'ZAGUEIRO' | 'LATERAL' | 'VOLANTE' | 'MEIA' | 'ATACANTE';

export interface Player {
  id: string;
  name: string;
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
}

export interface GameEvent {
  type: 'GOAL';
  playerId: string;
  assistId?: string;
  timestamp: any;
  teamSide: 'A' | 'B';
}

export interface Game {
  id: string;
  teamA_ids: string[];
  teamB_ids: string[];
  scoreA: number;
  scoreB: number;
  startTime: any;
  endTime?: any;
  status: 'RUNNING' | 'FINISHED';
  events: GameEvent[];
}

export interface Match {
  id: string;
  date: any;
  status: 'OPEN' | 'FINISHED' | 'CANCELLED';
  confirmedIds: string[];
  absentIds: { userId: string; reason: string }[];
  waitingIds: string[];
  result?: { scoreA: number; scoreB: number };
  teams?: string[][]; // Array of player UIDs for each team
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
  const { user, role } = useAuth();
  const isAdmin = role === 'ADMIN';
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [liveGame, setLiveGame] = useState<Game | null>(null);
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

    const unsubMatches = onSnapshot(query(collection(db, 'matches'), orderBy('date', 'desc'), limit(10)), (snap) => {
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

  // Effect specifically for handling the live game listener
  useEffect(() => {
    if (!user) return;
    const activeMatch = matches.find(m => m.status === 'OPEN');
    if (!activeMatch) {
      setLiveGame(null);
      return;
    }

    const qLive = query(
      collection(db, 'matches', activeMatch.id, 'games'),
      where('status', '==', 'RUNNING'),
      limit(1)
    );
    
    const unsubLiveGame = onSnapshot(qLive, (snap) => {
      if (!snap.empty) {
        setLiveGame({ id: snap.docs[0].id, ...snap.docs[0].data() } as Game);
      } else {
        setLiveGame(null);
      }
    });

    return () => unsubLiveGame();
  }, [user, matches.find(m => m.status === 'OPEN')?.id]);

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
      console.error("Erro ao marcar ausência:", error);
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
      console.error("Erro ao criar transação:", error);
      throw error;
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
      console.log(`[usePelada] Atualizando jogador ${playerId}...`, data);
      const { serverTimestamp } = await import('firebase/firestore');
      await updateDoc(doc(db, 'players', playerId), {
        ...data,
        updatedAt: serverTimestamp()
      });
      console.log(`[usePelada] Jogador ${playerId} atualizado com sucesso!`);
    } catch (error) {
      console.error(`[usePelada] Erro ao atualizar jogador ${playerId}:`, error);
      throw error;
    }
  };

  const deletePlayer = async (playerId: string) => {
    await deleteDoc(doc(db, 'players', playerId));
  };

  const setMatchTeams = async (matchId: string, teamsIds: string[][]) => {
    await updateDoc(doc(db, 'matches', matchId), { teams: teamsIds });
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
    const gameSnap = await getDoc(gameRef);
    if (!gameSnap.exists()) return;
    
    const data = gameSnap.data() as Game;
    const eventWithTime = { ...event, timestamp: Timestamp.now() };
    const newEvents = [...(data.events || []), eventWithTime];
    
    let newScoreA = data.scoreA;
    let newScoreB = data.scoreB;

    if (event.type === 'GOAL') {
      if (event.teamSide === 'A') newScoreA++;
      else newScoreB++;

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
    }

    await updateDoc(gameRef, { 
      events: newEvents,
      scoreA: newScoreA,
      scoreB: newScoreB
    });
  };

  const finishGame = async (matchId: string, gameId: string, result: { scoreA: number, scoreB: number, teamA: string[], teamB: string[] }) => {
    const gameRef = doc(db, 'matches', matchId, 'games', gameId);
    await updateDoc(gameRef, { 
      status: 'FINISHED',
      endTime: serverTimestamp()
    });

    const isDraw = result.scoreA === result.scoreB;
    
    const updateStats = async (ids: string[], isWinner: boolean, isDrawing: boolean) => {
      for (const id of ids) {
        const pRef = doc(db, 'players', id);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          const stats = pSnap.data();
          if (isDrawing) {
            await updateDoc(pRef, { empates: (stats.empates || 0) + 1 });
          } else if (isWinner) {
            await updateDoc(pRef, { vitorias: (stats.vitorias || 0) + 1 });
          } else {
            await updateDoc(pRef, { derrotas: (stats.derrotas || 0) + 1 });
          }
        }
      }
    };

    await updateStats(result.teamA, result.scoreA > result.scoreB, isDraw);
    await updateStats(result.teamB, result.scoreB > result.scoreA, isDraw);
  };

  return {
    players,
    matches,
    transactions,
    settings,
    loading,
    liveGame,
    confirmPresence,
    markAbsent,
    createMatch,
    createTransaction,
    addPlayer,
    updatePlayer,
    deletePlayer,
    updateSettings,
    setMatchTeams,
    startLiveGame,
    addGameEvent,
    finishGame
  };
}
