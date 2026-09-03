import { useState, useEffect, useCallback } from 'react';
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
  getDocs,
  getDocFromServer,
  serverTimestamp,
  writeBatch,
  increment
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase';

export type PlayerPosition = 'GOLEIRO' | 'ZAGUEIRO' | 'LATERAL' | 'VOLANTE' | 'MEIA' | 'ATACANTE';

export const formatPosition = (position: string | undefined | null): string => {
  if (!position) return '';
  const posUpper = position.toUpperCase();
  switch (posUpper) {
    case 'GOLEIRO': return 'GOL';
    case 'ZAGUEIRO': return 'ZAG';
    case 'LATERAL': return 'LAT';
    case 'VOLANTE': return 'VOL';
    case 'MEIA': return 'MEI';
    case 'ATACANTE': return 'ATA';
    default: return posUpper.substring(0, 3);
  }
};

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
  email?: string;
  profileCompleted?: boolean;
}

export interface GameEvent {
  type: 'GOAL' | 'OWN_GOAL';
  playerId: string;
  assistId?: string;
  timestamp: any;
  teamSide: 'A' | 'B'; // The team that gets the point
  isGoalkeeperGoal?: boolean;
  isGoalkeeperOwnGoal?: boolean;
}

export interface Game {
  id: string;
  teamA_ids: string[];
  teamB_ids: string[];
  startingTeamA_ids?: string[];
  startingTeamB_ids?: string[];
  teamA_name?: string;
  teamB_name?: string;
  scoreA: number;
  scoreB: number;
  startTime: any;
  endTime?: any;
  status: 'SCHEDULED' | 'RUNNING' | 'FINISHED';
  events: GameEvent[];
  isPaused?: boolean;
  accumulatedTime?: number; // ms
  lastStartedAt?: any; // Timestamp
  bandeiras_ids?: string[];
  drawStayTeam?: 'A' | 'B';
  drawFirstTeam?: 'A' | 'B';
}

export interface Match {
  id: string;
  date: any;
  status: 'OPEN' | 'FINISHED' | 'CANCELLED';
  confirmedIds: string[];
  absentIds: { userId: string; reason: string }[];
  waitingIds: string[];
  drawPresentIds?: string[]; // UIDs of players checked-in / present for team draw
  result?: { scoreA: number; scoreB: number };
  teams?: Record<string, string[]>; // Map of team index to player UIDs
  teamCreatedTimes?: Record<string, number>; // Map of team index to creation timestamp
  nextTeamIndex?: number;
  playersPerTeam?: number;
  gameRules?: string;
  confirmations?: Record<string, string>; // playerId -> ISO timestamp
  paidIds?: string[];
  drawOrder?: Record<string, number>; // playerId -> order number (1, 2, 3...)
  isListClosed?: boolean; // Fechamento manual ou automático da lista
  autoCloseEnabled?: boolean; // Se fechamento automático está configurado
  autoCloseTime?: string | null; // ISO string ou horário de fechamento
}

export const isMatchListClosed = (match?: Match | null): boolean => {
  if (!match) return false;
  if (match.status !== 'OPEN') return true;
  if (match.isListClosed === true) return true;
  if (match.isListClosed === false && !match.autoCloseEnabled) return false;
  if (match.autoCloseEnabled && match.autoCloseTime) {
    const closeTime = new Date(match.autoCloseTime).getTime();
    if (!isNaN(closeTime) && Date.now() >= closeTime) {
      return true;
    }
  }
  return false;
};

export interface Transaction {
  id: string;
  date: any;
  amount: number;
  type: 'INCOME' | 'EXPENSE';
  category: 'MONTHLY' | 'DAILY' | 'FIELD_RENT' | 'BALL' | 'REFEREE' | 'OTHER';
  description: string;
  playerId?: string;
  referenceMonth?: string;
}

export interface GroupSettings {
  monthlyFee: number;
  monthlyFeeDueDay: number;
  dailyFee: number;
  maxPlayers: number;
  maxSquadSize: number;
  autoApprove?: boolean;
}

import { useAuth } from '../components/AuthProvider';

export function usePelada() {
  const { role, user, approved, isAdmin } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [liveGame, setLiveGame] = useState<Game | null>(null);
  const [activeGames, setActiveGames] = useState<Game[]>([]);
  const [settings, setSettings] = useState<GroupSettings>({
    monthlyFee: 50,
    monthlyFeeDueDay: 10,
    dailyFee: 15,
    maxPlayers: 20,
    maxSquadSize: 30,
    autoApprove: true
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubPlayers = onSnapshot(query(collection(db, 'players'), orderBy('name')), (snap) => {
      setPlayers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player)));
    }, (error) => {
      handleFirestoreError(error, 'get', 'players');
    });

    const unsubMatches = onSnapshot(query(collection(db, 'matches'), orderBy('date', 'desc'), limit(50)), (snap) => {
      const fetchedMatches = snap.docs.map(doc => {
        const data = doc.data() as Omit<Match, 'id'>;
        let cleanAbsentIds = data.absentIds || [];
        if (cleanAbsentIds.length > 1) {
          const seen = new Set<string>();
          const uniqueAbsents: { userId: string; reason: string }[] = [];
          for (let i = cleanAbsentIds.length - 1; i >= 0; i--) {
            const current = cleanAbsentIds[i];
            if (current && current.userId && !seen.has(current.userId)) {
              seen.add(current.userId);
              uniqueAbsents.unshift(current);
            }
          }
          cleanAbsentIds = uniqueAbsents;
        }
        return {
          id: doc.id,
          ...data,
          absentIds: cleanAbsentIds
        } as Match;
      });
      setMatches(fetchedMatches);
    }, (error) => {
      handleFirestoreError(error, 'get', 'matches');
    });

    let unsubTransactions: () => void = () => {};
    if (user && (approved || isAdmin)) {
      unsubTransactions = onSnapshot(query(collection(db, 'transactions'), orderBy('date', 'desc'), limit(200)), (snap) => {
        setTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction)));
      }, (error) => {
        handleFirestoreError(error, 'get', 'transactions');
      });
    }

    const unsubSettings = onSnapshot(doc(db, 'groups', 'main'), (snap) => {
      if (snap.exists()) {
        setSettings(prev => ({ ...prev, ...snap.data() }));
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, 'get', 'groups/main');
      setLoading(false);
    });

    return () => {
      unsubPlayers();
      unsubMatches();
      unsubTransactions();
      unsubSettings();
    };
  }, [user, isAdmin, approved]);

  // Auto-finish expired matches (Triggered by admin login)
  useEffect(() => {
    if (!isAdmin || matches.length === 0) return;
    
    const now = new Date();
    matches.forEach(async (match) => {
      if (match.status === 'OPEN') {
        const matchDate = match.date.toDate();
        // Finaliza automaticamente às 23:59 do dia da rodada
        const autoFinishTime = new Date(matchDate);
        autoFinishTime.setHours(23, 59, 0, 0);

        if (now >= autoFinishTime) {
          console.log(`[Auto-Finish] Encerrando pelada expirada: ${match.id} (Data: ${matchDate})`);
          await finishMatch(match.id);
        }
      }
    });
  }, [matches, isAdmin]);

  // Fechamento automático de listas quando atinge o horário configurado
  useEffect(() => {
    const checkAutoClose = async () => {
      const now = Date.now();
      for (const match of matches) {
        if (match.status === 'OPEN' && !match.isListClosed && match.autoCloseEnabled && match.autoCloseTime) {
          const closeTime = new Date(match.autoCloseTime).getTime();
          if (!isNaN(closeTime) && now >= closeTime) {
            console.log(`[Auto-Close] Horário atingido. Fechando lista da pelada ${match.id} automaticamente.`);
            try {
              await updateDoc(doc(db, 'matches', match.id), {
                isListClosed: true
              });
            } catch (err) {
              console.warn("[Auto-Close] Aviso ao persistir fechamento da lista:", err);
            }
          }
        }
      }
    };

    checkAutoClose();
    const interval = setInterval(checkAutoClose, 15000); // Checa a cada 15 segundos
    return () => clearInterval(interval);
  }, [matches]);

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
      handleFirestoreError(error, 'get', `matches/${openMatchId}/games (sub: RUNNING)`);
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
    }, (error) => {
      handleFirestoreError(error, 'get', `matches/${openMatchId}/games`);
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

  const createScheduledGame = async (matchId: string, teamA_ids: string[], teamB_ids: string[], teamA_name?: string, teamB_name?: string, bandeiras_ids?: string[]) => {
    const gameData = {
      teamA_ids,
      teamB_ids,
      startingTeamA_ids: teamA_ids,
      startingTeamB_ids: teamB_ids,
      teamA_name: teamA_name || null,
      teamB_name: teamB_name || null,
      scoreA: 0,
      scoreB: 0,
      startTime: serverTimestamp(),
      status: 'SCHEDULED',
      events: [],
      bandeiras_ids: bandeiras_ids || []
    };
    await addDoc(collection(db, 'matches', matchId, 'games'), gameData);
  };

  const startGame = async (matchId: string, gameId: string, bandeiras_ids?: string[]) => {
    const gameRef = doc(db, 'matches', matchId, 'games', gameId);
    const gameSnap = await getDoc(gameRef);
    const updateData: any = { 
      status: 'RUNNING',
      startTime: serverTimestamp(),
      lastStartedAt: serverTimestamp(),
      accumulatedTime: 0,
      isPaused: false
    };
    if (gameSnap.exists()) {
      const current = gameSnap.data();
      if (!current.startingTeamA_ids) {
        updateData.startingTeamA_ids = current.teamA_ids || [];
      }
      if (!current.startingTeamB_ids) {
        updateData.startingTeamB_ids = current.teamB_ids || [];
      }
    }
    if (bandeiras_ids) {
      updateData.bandeiras_ids = bandeiras_ids;
    }
    await updateDoc(gameRef, updateData);
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

    if (isMatchListClosed(match) && !isAdmin) {
      console.warn("[usePelada] Tentativa de confirmação em lista já fechada.");
      throw new Error("A lista de presença está fechada para novas confirmações.");
    }

    if (match.confirmedIds.includes(playerId)) return;
    
    const newConfirmed = [...match.confirmedIds];
    const newWaiting = [...match.waitingIds];

    const player = players.find(p => p.id === playerId);
    const isMensalista = player ? player.type === 'MENSALISTA' : false;

    if (isMensalista) {
      if (!newConfirmed.includes(playerId)) {
        newConfirmed.push(playerId);
      }
      // Remove from waiting list just in case
      const waitingIdx = newWaiting.indexOf(playerId);
      if (waitingIdx !== -1) {
        newWaiting.splice(waitingIdx, 1);
      }
    } else {
      // Diarista: always placed on the waiting list by default as per new requirements
      if (!newWaiting.includes(playerId)) {
        newWaiting.push(playerId);
      }
    }

    const currentConfirmations = match.confirmations || {};
    const newConfirmations = {
      ...currentConfirmations,
      [playerId]: new Date().toISOString()
    };

    // If drawPresentIds exists or not, keep drawPresentIds synced with newConfirmed
    const currentDrawPresent = match.drawPresentIds ?? [];

    try {
      await updateDoc(doc(db, 'matches', matchId), {
        confirmedIds: newConfirmed,
        waitingIds: newWaiting,
        confirmations: newConfirmations,
        drawPresentIds: currentDrawPresent,
        absentIds: match.absentIds.filter(a => a.userId !== playerId)
      });
    } catch (error) {
      console.error("Erro ao confirmar presença:", error);
    }
  };

  const promotePlayer = async (matchId: string, playerId: string) => {
    if (!isAdmin) {
      throw new Error("Apenas administradores podem promover jogadores para a lista dentro.");
    }
    if (!playerId) return;
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const newConfirmed = [...match.confirmedIds];
    const newWaiting = match.waitingIds.filter(id => id !== playerId);

    if (!newConfirmed.includes(playerId)) {
      newConfirmed.push(playerId);
    }

    const currentDrawPresent = match.drawPresentIds ?? [];

    try {
      await updateDoc(doc(db, 'matches', matchId), {
        confirmedIds: newConfirmed,
        waitingIds: newWaiting,
        drawPresentIds: currentDrawPresent
      });
    } catch (error) {
      console.error("Erro ao promover jogador:", error);
      handleFirestoreError(error, 'update', `matches/${matchId}`);
    }
  };

  const demotePlayer = async (matchId: string, playerId: string) => {
    if (!isAdmin) {
      throw new Error("Apenas administradores podem descer jogadores para a lista de espera.");
    }
    if (!playerId) return;
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const newConfirmed = match.confirmedIds.filter(id => id !== playerId);
    const newWaiting = [...match.waitingIds];

    if (!newWaiting.includes(playerId)) {
      newWaiting.push(playerId);
    }

    const currentDrawPresent = (match.drawPresentIds ?? []).filter(id => id !== playerId);

    try {
      await updateDoc(doc(db, 'matches', matchId), {
        confirmedIds: newConfirmed,
        waitingIds: newWaiting,
        drawPresentIds: currentDrawPresent
      });
    } catch (error) {
      console.error("Erro ao mover jogador para a lista de espera:", error);
      handleFirestoreError(error, 'update', `matches/${matchId}`);
    }
  };

  const markAbsent = async (matchId: string, playerId: string, reason: string) => {
    if (!playerId) return;
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    let newConfirmed = match.confirmedIds.filter(id => id !== playerId);
    let newWaiting = match.waitingIds.filter(id => id !== playerId);
    const newAbsent = [...match.absentIds.filter(a => a.userId !== playerId), { userId: playerId, reason }];

    const currentConfirmations = match.confirmations || {};
    const newConfirmations = { ...currentConfirmations };
    delete newConfirmations[playerId];

    // Diaristas NÃO sobem automaticamente: a promoção da fila de espera é estritamente manual por um Administrador.

    const currentDrawPresent = (match.drawPresentIds ?? []).filter(id => newConfirmed.includes(id));

    try {
      await updateDoc(doc(db, 'matches', matchId), {
        absentIds: newAbsent,
        confirmedIds: newConfirmed,
        waitingIds: newWaiting,
        confirmations: newConfirmations,
        drawPresentIds: currentDrawPresent
      });
    } catch (error) {
      handleFirestoreError(error, 'update', `matches/${matchId}`);
    }
  };

  const toggleDrawPresence = async (matchId: string, playerId: string) => {
    if (!playerId) return;
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const currentDrawPresent = match.drawPresentIds ?? [];
    const isNowPresent = !currentDrawPresent.includes(playerId);
    let newDrawPresent: string[];
    if (isNowPresent) {
      newDrawPresent = [...currentDrawPresent, playerId];
    } else {
      newDrawPresent = currentDrawPresent.filter(id => id !== playerId);
    }

    try {
      await updateDoc(doc(db, 'matches', matchId), {
        drawPresentIds: newDrawPresent
      });
    } catch (error) {
      console.error("Erro ao alterar presença no sorteio:", error);
    }
  };

  const createMatch = async (data: Date | { date: Date; autoCloseEnabled?: boolean; autoCloseTime?: string | null }) => {
    const matchDate = data instanceof Date ? data : data.date;
    const autoCloseEnabled = data instanceof Date ? false : (data.autoCloseEnabled ?? false);
    const autoCloseTime = data instanceof Date ? null : (data.autoCloseTime ?? null);

    await addDoc(collection(db, 'matches'), {
      date: Timestamp.fromDate(matchDate),
      status: 'OPEN',
      confirmedIds: [],
      absentIds: [],
      waitingIds: [],
      confirmations: {},
      isListClosed: false,
      autoCloseEnabled: autoCloseEnabled,
      autoCloseTime: autoCloseTime
    });
  };

  const toggleMatchListClosed = async (matchId: string, isClosed: boolean) => {
    try {
      if (isClosed) {
        await updateDoc(doc(db, 'matches', matchId), {
          isListClosed: true
        });
      } else {
        await updateDoc(doc(db, 'matches', matchId), {
          isListClosed: false,
          autoCloseEnabled: false,
          autoCloseTime: null
        });
      }
    } catch (error) {
      console.error("Erro ao alterar fechamento da lista:", error);
      handleFirestoreError(error, 'update', `matches/${matchId}`);
    }
  };

  const setMatchAutoClose = async (matchId: string, enabled: boolean, autoCloseTime?: string | null) => {
    try {
      const payload: Record<string, any> = {
        autoCloseEnabled: enabled,
        autoCloseTime: enabled && autoCloseTime ? autoCloseTime : null
      };
      if (enabled && autoCloseTime) {
        const closeDate = new Date(autoCloseTime).getTime();
        if (!isNaN(closeDate) && Date.now() < closeDate) {
          payload.isListClosed = false;
        }
      }
      await updateDoc(doc(db, 'matches', matchId), payload);
    } catch (error) {
      console.error("Erro ao configurar fechamento automático:", error);
      handleFirestoreError(error, 'update', `matches/${matchId}`);
    }
  };

  const createTransaction = async (data: Omit<Transaction, 'id'>) => {
    try {
      const docRef = await addDoc(collection(db, 'transactions'), {
        ...data,
        date: data.date || serverTimestamp()
      });

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

  const updateTransaction = async (id: string, data: Partial<Transaction>) => {
    try {
      const transRef = doc(db, 'transactions', id);
      const transSnap = await getDoc(transRef);
      if (!transSnap.exists()) return;
      const oldTrans = { id: transSnap.id, ...transSnap.data() } as Transaction;

      await updateDoc(transRef, data);

      // Re-calculate balance if amount, type or playerId changed
      const amountChanged = data.amount !== undefined && data.amount !== oldTrans.amount;
      const typeChanged = data.type !== undefined && data.type !== oldTrans.type;
      const playerChanged = data.playerId !== undefined && data.playerId !== oldTrans.playerId;

      if (amountChanged || typeChanged || playerChanged) {
        // 1. Revert Old Impact
        if (oldTrans.playerId) {
          const oldPRef = doc(db, 'players', oldTrans.playerId);
          const oldPSnap = await getDoc(oldPRef);
          if (oldPSnap.exists()) {
            const oldImpact = oldTrans.type === 'INCOME' ? oldTrans.amount : -oldTrans.amount;
            await updateDoc(oldPRef, { balance: (oldPSnap.data().balance || 0) - oldImpact });
          }
        }

        // 2. Apply New Impact
        const finalTrans = { ...oldTrans, ...data };
        if (finalTrans.playerId) {
          const newPRef = doc(db, 'players', finalTrans.playerId);
          const newPSnap = await getDoc(newPRef);
          if (newPSnap.exists()) {
            const newImpact = finalTrans.type === 'INCOME' ? finalTrans.amount : -finalTrans.amount;
            await updateDoc(newPRef, { balance: (newPSnap.data().balance || 0) + newImpact });
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, 'update', `transactions/${id}`);
    }
  };

  const deleteTransaction = async (id: string) => {
    try {
      console.log(`[usePelada] Excluindo transação: ${id}`);
      const transRef = doc(db, 'transactions', id);
      const transSnap = await getDoc(transRef);
      
      if (!transSnap.exists()) {
        console.warn("[usePelada] Transação não encontrada para exclusão");
        return;
      }
      
      const t = { id: transSnap.id, ...transSnap.data() } as Transaction;

      if (t.playerId) {
        const pRef = doc(db, 'players', t.playerId);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          const impact = t.type === 'INCOME' ? t.amount : -t.amount;
          console.log(`[usePelada] Revertendo impacto de ${impact} no saldo do jogador ${t.playerId}`);
          await updateDoc(pRef, { balance: (pSnap.data().balance || 0) - impact });
        }
      }
      
      await deleteDoc(transRef);
      console.log("[usePelada] Transação excluída com sucesso");
    } catch (error) {
      console.error("[usePelada] Erro ao excluir transação:", error);
      handleFirestoreError(error, 'delete', `transactions/${id}`);
    }
  };

  const addPlayer = async (data: Omit<Player, 'id' | 'gols' | 'assistencias' | 'vitorias' | 'derrotas' | 'empates' | 'active' | 'balance'>) => {
    const docRef = await addDoc(collection(db, 'players'), {
      gols: 0,
      assistencias: 0,
      vitorias: 0,
      derrotas: 0,
      empates: 0,
      ...data,
      active: true,
      balance: 0
    });

    try {
      await setDoc(doc(db, 'user_roles', docRef.id), {
        role: 'USER',
        approved: true,
        email: data.email || '',
        name: data.displayName || data.name || 'Jogador',
        displayName: data.displayName || data.name || 'Jogador',
        fullName: data.fullName || data.name || 'Jogador',
        createdAt: new Date().toISOString()
      });
      console.log(`[usePelada] Auto-created user_roles for manual player: ${docRef.id}`);
    } catch (err: any) {
      console.error("[usePelada] Custom user_roles creation error during addPlayer:", err);
    }
  };

  const updatePlayer = async (playerId: string, data: Partial<Player>) => {
    try {
      console.log(`[usePelada] Iniciando updateDoc para jogador ${playerId}...`);
      
      // Clean undefined properties
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== undefined)
      );

      await updateDoc(doc(db, 'players', playerId), {
        ...cleanData,
        updatedAt: serverTimestamp()
      });
      console.log(`[usePelada] Jogador ${playerId} atualizado na coleção players!`);

      // Se o jogador virou MENSALISTA, promove automaticamente em peladas abertas
      if (data.type === 'MENSALISTA') {
        const openMatches = matches.filter(m => m.status === 'OPEN');
        for (const match of openMatches) {
          if (match.waitingIds && match.waitingIds.includes(playerId)) {
            const newConfirmed = [...match.confirmedIds];
            if (!newConfirmed.includes(playerId)) {
              newConfirmed.push(playerId);
            }
            const newWaiting = match.waitingIds.filter(id => id !== playerId);
            try {
              await updateDoc(doc(db, 'matches', match.id), {
                confirmedIds: newConfirmed,
                waitingIds: newWaiting
              });
              console.log(`[usePelada] Jogador ${playerId} promovido automaticamente da fila para confirmado por virar MENSALISTA.`);
            } catch (matchErr) {
              console.error(`[usePelada] Erro ao promover jogador ${playerId} na pelada ${match.id}:`, matchErr);
            }
          }
        }
      }

      // Sincronizar dados com a coleção 'user_roles' caso as informações fundamentais tenham sido alteradas
      try {
        const userRolesRef = doc(db, 'user_roles', playerId);
        const userRolesSnap = await getDoc(userRolesRef);
        if (userRolesSnap.exists()) {
          const roleData: any = {};
          if (data.displayName !== undefined) {
            roleData.displayName = data.displayName;
            roleData.name = data.displayName;
          }
          if (data.fullName !== undefined) {
            roleData.fullName = data.fullName;
          }
          if (data.email !== undefined) {
            roleData.email = data.email;
          }
          if (Object.keys(roleData).length > 0) {
            await updateDoc(userRolesRef, roleData);
            console.log(`[usePelada] Tabela de acesso 'user_roles' sincronizada para o jogador ${playerId}`);
          }
        }
      } catch (roleErr) {
        console.log(`[usePelada] Erro não-fatal ao sincronizar com user_roles para jogador ${playerId}:`, roleErr);
      }
    } catch (error: any) {
      console.error(`[usePelada] ERRO ao atualizar jogador ${playerId}:`, error);
      throw error;
    }
  };

  const deletePlayer = async (playerId: string) => {
    try {
      console.log(`[usePelada] Iniciando exclusão do jogador: ${playerId}`);
      
      // 1. Obter informações do jogador antes de deletar para pegar o e-mail
      const playerRef = doc(db, 'players', playerId);
      const playerSnap = await getDoc(playerRef);
      let playerEmail: string | undefined = undefined;
      if (playerSnap.exists()) {
        playerEmail = playerSnap.data()?.email;
      }

      // 2. Deletar o jogador da coleção 'players'
      await deleteDoc(playerRef);
      console.log(`[usePelada] Jogador ${playerId} removido de 'players'`);

      // 3. Deletar documento correspondente em 'user_roles' por ID (se houver)
      const userRolesRef = doc(db, 'user_roles', playerId);
      const userRolesSnap = await getDoc(userRolesRef);
      if (userRolesSnap.exists()) {
        await deleteDoc(userRolesRef);
        console.log(`[usePelada] Documento da lista de acessos correspondente ao ID ${playerId} removido.`);
      }

      // 4. Deletar quaisquer outros documentos correspondentes em 'user_roles' pelo e-mail do jogador (tratando maiúsculo/minúsculo)
      if (playerEmail) {
        const { getDocs, query, collection, where } = await import('firebase/firestore');
        const q = query(collection(db, 'user_roles'), where('email', '==', playerEmail.trim().toLowerCase()));
        const qSnap = await getDocs(q);
        for (const docSingle of qSnap.docs) {
          await deleteDoc(docSingle.ref);
          console.log(`[usePelada] Documento da lista de acessos correspondente ao e-mail ${playerEmail} removido.`);
        }
      }
    } catch (error: any) {
      console.error("[usePelada] Erro ao excluir jogador e seu acesso associado:", error);
      throw error;
    }
  };

  const setMatchTeams = async (matchId: string, teamsIds: string[][], extraData?: { playersPerTeam?: number; gameRules?: string; drawOrder?: Record<string, number> }) => {
    // Firestore does not support nested arrays. Convert to object.
    const teamsObj: Record<string, string[]> = {};
    teamsIds.forEach((ids, idx) => {
      teamsObj[String(idx)] = ids;
    });
    await updateDoc(doc(db, 'matches', matchId), { 
      teams: teamsObj,
      nextTeamIndex: teamsIds.length,
      ...extraData
    });
  };

  const updateMatch = async (matchId: string, data: Partial<Match>) => {
    await updateDoc(doc(db, 'matches', matchId), data);
  };

  const finishMatch = async (matchId: string) => {
    await updateDoc(doc(db, 'matches', matchId), { status: 'FINISHED' });
  };

  const startLiveGame = async (matchId: string, teamAIds: string[], teamBIds: string[], teamA_name?: string, teamB_name?: string, bandeiras_ids?: string[]) => {
    const gameData = {
      teamA_ids: teamAIds,
      teamB_ids: teamBIds,
      startingTeamA_ids: teamAIds,
      startingTeamB_ids: teamBIds,
      teamA_name: teamA_name || null,
      teamB_name: teamB_name || null,
      scoreA: 0,
      scoreB: 0,
      startTime: serverTimestamp(),
      lastStartedAt: serverTimestamp(),
      accumulatedTime: 0,
      isPaused: false,
      status: 'RUNNING',
      events: [],
      bandeiras_ids: bandeiras_ids || []
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

        // Personal stats only for normal goals (NOT goalkeeper goals and NOT anonymous/ninguem)
        if (!event.isGoalkeeperGoal && event.playerId && event.playerId !== 'ninguem' && event.playerId !== 'goleiro') {
          const pRef = doc(db, 'players', event.playerId);
          const pSnap = await getDoc(pRef);
          if (pSnap.exists()) {
            await updateDoc(pRef, { gols: (pSnap.data().gols || 0) + 1 });
          }

          if (event.assistId && event.assistId !== 'ninguem' && event.assistId !== 'goleiro') {
            const aRef = doc(db, 'players', event.assistId);
            const aSnap = await getDoc(aRef);
            if (aSnap.exists()) {
              await updateDoc(aRef, { assistencias: (aSnap.data().assistencias || 0) + 1 });
            }
          }
        }
      } else if (event.type === 'OWN_GOAL') {
        // Own goal scores for the opposite team side
        if (event.teamSide === 'A') newScoreB++;
        else newScoreA++;
        
        // Own goal deducts personal player points via -1 in ranking, we save this stat in 'contra'
        if (!event.isGoalkeeperOwnGoal && event.playerId && event.playerId !== 'ninguem' && event.playerId !== 'goleiro') {
          const pRef = doc(db, 'players', event.playerId);
          const pSnap = await getDoc(pRef);
          if (pSnap.exists()) {
            await updateDoc(pRef, { contra: (pSnap.data().contra || 0) + 1 });
          }
        }
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
        if (!oldEvent.isGoalkeeperGoal && oldEvent.playerId && oldEvent.playerId !== 'ninguem' && oldEvent.playerId !== 'goleiro') {
          const oldPRef = doc(db, 'players', oldEvent.playerId);
          const oldPSnap = await getDoc(oldPRef);
          if (oldPSnap.exists()) {
            await updateDoc(oldPRef, { gols: Math.max(0, (oldPSnap.data().gols || 0) - 1) });
          }
          if (oldEvent.assistId && oldEvent.assistId !== 'ninguem' && oldEvent.assistId !== 'goleiro') {
            const oldARef = doc(db, 'players', oldEvent.assistId);
            const oldASnap = await getDoc(oldARef);
            if (oldASnap.exists()) {
              await updateDoc(oldARef, { assistencias: Math.max(0, (oldASnap.data().assistencias || 0) - 1) });
            }
          }
        }
      } else if (oldEvent.type === 'OWN_GOAL') {
        if (!oldEvent.isGoalkeeperOwnGoal && oldEvent.playerId && oldEvent.playerId !== 'ninguem' && oldEvent.playerId !== 'goleiro') {
          const oldPRef = doc(db, 'players', oldEvent.playerId);
          const oldPSnap = await getDoc(oldPRef);
          if (oldPSnap.exists()) {
            await updateDoc(oldPRef, { contra: Math.max(0, (oldPSnap.data().contra || 0) - 1) });
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
        if (!updatedEvent.isGoalkeeperGoal && updatedEvent.playerId && updatedEvent.playerId !== 'ninguem' && updatedEvent.playerId !== 'goleiro') {
          const newPRef = doc(db, 'players', updatedEvent.playerId);
          const newPSnap = await getDoc(newPRef);
          if (newPSnap.exists()) {
            await updateDoc(newPRef, { gols: (newPSnap.data().gols || 0) + 1 });
          }
          if (updatedEvent.assistId && updatedEvent.assistId !== 'ninguem' && updatedEvent.assistId !== 'goleiro') {
            const newARef = doc(db, 'players', updatedEvent.assistId);
            const newASnap = await getDoc(newARef);
            if (newASnap.exists()) {
              await updateDoc(newARef, { assistencias: (newASnap.data().assistencias || 0) + 1 });
            }
          }
        }
      } else if (updatedEvent.type === 'OWN_GOAL') {
        if (!updatedEvent.isGoalkeeperOwnGoal && updatedEvent.playerId && updatedEvent.playerId !== 'ninguem' && updatedEvent.playerId !== 'goleiro') {
          const newPRef = doc(db, 'players', updatedEvent.playerId);
          const newPSnap = await getDoc(newPRef);
          if (newPSnap.exists()) {
            await updateDoc(newPRef, { contra: (newPSnap.data().contra || 0) + 1 });
          }
        }
      }

      // 3. Update event in array
      const newEvents = [...data.events];
      newEvents[eventIdx] = updatedEvent;
      
      // Recalculate whole score from the live events so they are always in sync!
      let newScoreA = 0;
      let newScoreB = 0;
      newEvents.forEach(ev => {
        if (ev.type === 'GOAL') {
          if (ev.teamSide === 'A') newScoreA++;
          else newScoreB++;
        } else if (ev.type === 'OWN_GOAL') {
          if (ev.teamSide === 'A') newScoreB++;
          else newScoreA++;
        }
      });
      
      await updateDoc(gameRef, { 
        events: newEvents,
        scoreA: newScoreA,
        scoreB: newScoreB
      });
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
        if (!oldEvent.isGoalkeeperGoal && oldEvent.playerId && oldEvent.playerId !== 'ninguem' && oldEvent.playerId !== 'goleiro') {
          const oldPRef = doc(db, 'players', oldEvent.playerId);
          const oldPSnap = await getDoc(oldPRef);
          if (oldPSnap.exists()) {
            await updateDoc(oldPRef, { gols: Math.max(0, (oldPSnap.data().gols || 0) - 1) });
          }
          if (oldEvent.assistId && oldEvent.assistId !== 'ninguem' && oldEvent.assistId !== 'goleiro') {
            const oldARef = doc(db, 'players', oldEvent.assistId);
            const oldASnap = await getDoc(oldARef);
            if (oldASnap.exists()) {
              await updateDoc(oldARef, { assistencias: Math.max(0, (oldASnap.data().assistencias || 0) - 1) });
            }
          }
        }
      } else if (oldEvent.type === 'OWN_GOAL') {
        if (!oldEvent.isGoalkeeperOwnGoal && oldEvent.playerId && oldEvent.playerId !== 'ninguem' && oldEvent.playerId !== 'goleiro') {
          const oldPRef = doc(db, 'players', oldEvent.playerId);
          const oldPSnap = await getDoc(oldPRef);
          if (oldPSnap.exists()) {
            await updateDoc(oldPRef, { contra: Math.max(0, (oldPSnap.data().contra || 0) - 1) });
          }
        }
      }

      // 2. Adjust score
      let newScoreA = data.scoreA;
      let newScoreB = data.scoreB;
      if (oldEvent.type === 'GOAL') {
        if (oldEvent.teamSide === 'A') newScoreA = Math.max(0, newScoreA - 1);
        else newScoreB = Math.max(0, newScoreB - 1);
      } else if (oldEvent.type === 'OWN_GOAL') {
        if (oldEvent.teamSide === 'A') newScoreB = Math.max(0, newScoreB - 1);
        else newScoreA = Math.max(0, newScoreA - 1);
      }

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

  const finishGame = async (matchId: string, gameId: string, result: { scoreA: number, scoreB: number, teamA: string[], teamB: string[], drawStayTeam?: 'A' | 'B', drawFirstTeam?: 'A' | 'B' }) => {
    console.log("[usePelada] finishGame: Início do processamento", { matchId, gameId, scoreA: result.scoreA });
    
    if (!matchId || !gameId) {
      throw new Error("IDs de identificação da partida ou jogo estão ausentes.");
    }

    try {
      const batch = writeBatch(db);
      const gameRef = doc(db, 'matches', matchId, 'games', gameId);
      
      const gameSnap = await getDoc(gameRef);
      let startingA = result.teamA || [];
      let startingB = result.teamB || [];
      if (gameSnap.exists()) {
        const gameData = gameSnap.data();
        if (gameData.startingTeamA_ids && Array.isArray(gameData.startingTeamA_ids)) {
          startingA = gameData.startingTeamA_ids;
        }
        if (gameData.startingTeamB_ids && Array.isArray(gameData.startingTeamB_ids)) {
          startingB = gameData.startingTeamB_ids;
        }
      }

      // 1. Marcar partida como finalizada
      const sA = Number(result.scoreA) || 0;
      const sB = Number(result.scoreB) || 0;

      const updatePayload: any = { 
        status: 'FINISHED',
        endTime: serverTimestamp(),
        scoreA: sA,
        scoreB: sB
      };
      if (result.drawStayTeam) updatePayload.drawStayTeam = result.drawStayTeam;
      if (result.drawFirstTeam) updatePayload.drawFirstTeam = result.drawFirstTeam;

      batch.update(gameRef, updatePayload);

      const isDraw = sA === sB;
      const winA = sA > sB;
      const winB = sB > sA;
      
      // 2. Coletar IDs únicos de jogadores que iniciaram a partida
      const allPlayerIds = Array.from(new Set([...startingA, ...startingB])).filter(id => id && typeof id === 'string');
      
      console.log(`[usePelada] 2. Aplicando incrementos para ${allPlayerIds.length} jogadores.`);

      allPlayerIds.forEach(id => {
        const pRef = doc(db, 'players', id);
        const isTeamA = startingA.includes(id);
        
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

  const recalculateAllStats = async () => {
    console.log("[usePelada] Iniciando recalculateAllStats...");
    if (!isAdmin) {
      console.error("[usePelada] Acesso negado: Usuário não é administrador.");
      return;
    }
    try {
      setLoading(true);
      console.log("[usePelada] Iniciando recálculo total de estatísticas...");
      
      // 1. Get all players to reset their stats
      const playersSnap = await getDocs(collection(db, 'players'));
      let batch = writeBatch(db);
      let opCount = 0;

      console.log(`[usePelada] Resetando ${playersSnap.docs.length} jogadores...`);
      for (const pDoc of playersSnap.docs) {
        batch.update(pDoc.ref, {
          gols: 0,
          assistencias: 0,
          vitorias: 0,
          derrotas: 0,
          empates: 0,
          contra: 0
        });
        opCount++;
        if (opCount >= 450) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      }
      if (opCount > 0) {
        await batch.commit();
      }

      // 2. Map to accumulate new stats
      const statsMap: Record<string, { gols: number, assistencias: number, vitorias: number, derrotas: number, empates: number, contra: number }> = {};
      const ensurePlayer = (id: string) => {
        if (!statsMap[id]) statsMap[id] = { gols: 0, assistencias: 0, vitorias: 0, derrotas: 0, empates: 0, contra: 0 };
      };

      // 3. Get all matches
      const matchesSnap = await getDocs(collection(db, 'matches'));
      console.log(`[usePelada] Escaneando ${matchesSnap.docs.length} peladas...`);
      let matchesProcessed = 0;
      let gamesProcessed = 0;

      for (const mDoc of matchesSnap.docs) {
        try {
          const gamesRef = collection(db, 'matches', mDoc.id, 'games');
          const gamesSnap = await getDocs(gamesRef);
          matchesProcessed++;
          gamesProcessed += gamesSnap.docs.length;
          
          for (const gDoc of gamesSnap.docs) {
            const game = gDoc.data() as Game;
            
            // Count Goals and Assists
            if (game.events) {
              game.events.forEach(ev => {
                if (ev.type === 'GOAL') {
                  if (!ev.isGoalkeeperGoal) {
                    const pId = ev.playerId;
                    if (pId && typeof pId === 'string' && pId !== 'ninguem' && pId !== 'goleiro') {
                      ensurePlayer(pId);
                      statsMap[pId].gols++;
                    }
                    
                    const aId = ev.assistId;
                    if (aId && typeof aId === 'string' && aId !== 'ninguem' && aId !== 'goleiro') {
                      ensurePlayer(aId);
                      statsMap[aId].assistencias++;
                    }
                  }
                } else if (ev.type === 'OWN_GOAL') {
                  if (!ev.isGoalkeeperOwnGoal) {
                    const pId = ev.playerId;
                    if (pId && typeof pId === 'string' && pId !== 'ninguem' && pId !== 'goleiro') {
                      ensurePlayer(pId);
                      statsMap[pId].contra++;
                    }
                  }
                }
              });
            }

            // Count Wins/Losses/Draws (only for finished games)
            if (game.status === 'FINISHED') {
              const sA = game.scoreA || 0;
              const sB = game.scoreB || 0;
              const startA = game.startingTeamA_ids || game.teamA_ids || [];
              const startB = game.startingTeamB_ids || game.teamB_ids || [];
              const isDraw = sA === sB;
              const winA = sA > sB;
              const winB = sB > sA;
              
              const allInGame = Array.from(new Set([...(startA || []), ...(startB || [])])).filter(id => id && typeof id === 'string');
              allInGame.forEach(id => {
                ensurePlayer(id);
                const isTeamA = (startA || []).includes(id);
                if (isDraw) {
                  statsMap[id].empates++;
                } else if ((isTeamA && winA) || (!isTeamA && winB)) {
                  statsMap[id].vitorias++;
                } else {
                  statsMap[id].derrotas++;
                }
              });
            }
          }
        } catch (matchErr) {
          console.error(`[usePelada] Erro ao processar pelada ${mDoc.id}:`, matchErr);
        }
      }

      // 4. Update players with new totals
      console.log("[usePelada] Aplicando novos totais aos jogadores...");
      const existingPlayerIds = new Set(playersSnap.docs.map(doc => doc.id));
      batch = writeBatch(db);
      opCount = 0;
      
      for (const [playerId, stats] of Object.entries(statsMap)) {
        if (!existingPlayerIds.has(playerId)) continue;
        const pRef = doc(db, 'players', playerId);
        batch.update(pRef, stats);
        opCount++;
        if (opCount >= 450) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      }
      if (opCount > 0) {
        await batch.commit();
      }
      
      console.log("[usePelada] Recálculo concluído com sucesso!");
    } catch (error) {
      console.error("[usePelada] Erro ao recalcular estatísticas:", error);
      handleFirestoreError(error, 'write' as any, 'recompute_all');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const deleteGame = async (matchId: string, gameId: string) => {
    console.log(`[usePelada] Tentando excluir partida. MatchID: ${matchId}, GameID: ${gameId}`);
    if (!matchId || !gameId) {
      console.error("[usePelada] ID de match ou game ausente para exclusão");
      return;
    }
    try {
      const gameRef = doc(db, 'matches', matchId, 'games', gameId);
      const gameSnap = await getDoc(gameRef);
      
      if (gameSnap.exists()) {
        const game = gameSnap.data() as Game;
        const batch = writeBatch(db);
        const existingPlayerIds = new Set(players.map(p => p.id));

        // 1. Revert Score and Personal Stats (Goals/Assists)
        if (game.events && game.events.length > 0) {
          for (const event of game.events) {
            if (event.type === 'GOAL') {
              if (event.playerId && event.playerId !== 'ninguem' && event.playerId !== 'goleiro' && existingPlayerIds.has(event.playerId)) {
                const pRef = doc(db, 'players', event.playerId);
                batch.update(pRef, { gols: increment(-1) });
              }

              if (event.assistId && event.assistId !== 'ninguem' && event.assistId !== 'goleiro' && existingPlayerIds.has(event.assistId)) {
                const aRef = doc(db, 'players', event.assistId);
                batch.update(aRef, { assistencias: increment(-1) });
              }
            } else if (event.type === 'OWN_GOAL') {
              if (event.playerId && event.playerId !== 'ninguem' && event.playerId !== 'goleiro' && existingPlayerIds.has(event.playerId)) {
                const pRef = doc(db, 'players', event.playerId);
                batch.update(pRef, { contra: increment(-1) });
              }
            }
          }
        }

        // 2. Revert Win/Loss/Draw stats if finished
        if (game.status === 'FINISHED') {
          const sA = game.scoreA || 0;
          const sB = game.scoreB || 0;
          const isDraw = sA === sB;
          const winA = sA > sB;
          const winB = sB > sA;

          const teamA = game.startingTeamA_ids || game.teamA_ids || [];
          const teamB = game.startingTeamB_ids || game.teamB_ids || [];
          const allPlayerIds = Array.from(new Set([...teamA, ...teamB])).filter(id => id && typeof id === 'string');

          allPlayerIds.forEach(id => {
            if (existingPlayerIds.has(id)) {
              const pRef = doc(db, 'players', id);
              const isTeamA = teamA.includes(id);

              if (isDraw) {
                batch.update(pRef, { empates: increment(-1) });
              } else if ((isTeamA && winA) || (!isTeamA && winB)) {
                batch.update(pRef, { vitorias: increment(-1) });
              } else {
                batch.update(pRef, { derrotas: increment(-1) });
              }
            }
          });
        }

        // 3. Delete the game
        batch.delete(gameRef);
        await batch.commit();
        console.log("[usePelada] Partida e estatísticas relacionadas excluídas com sucesso");
      } else {
        await deleteDoc(gameRef);
      }
      
      alert("Partida excluída com sucesso!");
    } catch (error) {
      console.error("[usePelada] Erro ao excluir partida:", error);
      alert("Erro ao excluir partida. Verifique o console.");
      handleFirestoreError(error, 'delete', `matches/${matchId}/games/${gameId}`);
    }
  };

  const deleteMatch = async (matchId: string) => {
    console.log("[usePelada] deleteMatch iniciado para:", matchId);
    if (!isAdmin) {
      console.error("[usePelada] Usuário não é ADMIN. Abortando.");
      return;
    }

    try {
      setLoading(true);
      console.log(`[usePelada] Iniciando exclusão da pelada: ${matchId}`);
      
      const gamesRef = collection(db, 'matches', matchId, 'games');
      const gamesSnap = await getDocs(gamesRef);
      
      let currentBatch = writeBatch(db);
      let opCount = 0;
      const MAX_OPS = 450; // Guard channel for batch limit
      const existingPlayerIds = new Set(players.map(p => p.id));

      const commitIfFull = async () => {
        if (opCount >= MAX_OPS) {
          console.log(`[usePelada] Limit de batch atingido (${opCount}). Commitando e criando novo...`);
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          opCount = 0;
        }
      };

      console.log(`[usePelada] Revertendo estatísticas de ${gamesSnap.docs.length} jogos...`);

      for (const gameDoc of gamesSnap.docs) {
        const game = gameDoc.data() as Game;
        
        if (game.events && game.events.length > 0) {
          for (const event of game.events) {
            if (event.type === 'GOAL') {
              if (existingPlayerIds.has(event.playerId)) {
                const pRef = doc(db, 'players', event.playerId);
                currentBatch.update(pRef, { gols: increment(-1) });
                opCount++;
                await commitIfFull();
              }

              if (event.assistId && existingPlayerIds.has(event.assistId)) {
                const aRef = doc(db, 'players', event.assistId);
                currentBatch.update(aRef, { assistencias: increment(-1) });
                opCount++;
                await commitIfFull();
              }
            }
          }
        }

        if (game.status === 'FINISHED') {
          const sA = game.scoreA || 0;
          const sB = game.scoreB || 0;
          const isDraw = sA === sB;
          const winA = sA > sB;
          const winB = sB > sA;
          const teamA = game.startingTeamA_ids || game.teamA_ids || [];
          const teamB = game.startingTeamB_ids || game.teamB_ids || [];
          const allPlayerIds = Array.from(new Set([...(teamA || []), ...(teamB || [])])).filter(id => id && typeof id === 'string');

          for (const id of allPlayerIds) {
            if (existingPlayerIds.has(id)) {
              const pRef = doc(db, 'players', id);
              const isTeamA = (teamA || []).includes(id);
              if (isDraw) {
                currentBatch.update(pRef, { empates: increment(-1) });
              } else if ((isTeamA && winA) || (!isTeamA && winB)) {
                currentBatch.update(pRef, { vitorias: increment(-1) });
              } else {
                currentBatch.update(pRef, { derrotas: increment(-1) });
              }
              opCount++;
              await commitIfFull();
            }
          }
        }
        
        currentBatch.delete(gameDoc.ref);
        opCount++;
        await commitIfFull();
      }

      currentBatch.delete(doc(db, 'matches', matchId));
      opCount++;
      
      await currentBatch.commit();
      console.log("[usePelada] Pelada e todos os dados relacionados excluídos com sucesso");
      alert("Pelada excluída com sucesso!");
    } catch (error) {
      console.error("[usePelada] Erro ao excluir pelada:", error);
      handleFirestoreError(error, 'delete', `matches/${matchId}`);
      alert("Erro ao excluir pelada. Verifique os logs.");
    } finally {
      setLoading(false);
    }
  };

  const getMatchGames = useCallback(async (matchId: string) => {
    const q = query(
      collection(db, 'matches', matchId, 'games'),
      orderBy('startTime', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Game));
  }, []);

  return {
    players,
    matches,
    transactions,
    settings,
    loading,
    liveGame,
    activeGames,
    confirmPresence,
    promotePlayer,
    demotePlayer,
    markAbsent,
    toggleDrawPresence,
    toggleMatchListClosed,
    setMatchAutoClose,
    createMatch,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    addPlayer,
    updatePlayer,
    deletePlayer,
    getMatchGames,
    updateSettings,
    setMatchTeams,
    updateMatch,
    finishMatch,
    recalculateAllStats,
    deleteMatch,
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
