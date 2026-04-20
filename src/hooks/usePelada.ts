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
  getDocFromServer
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

export interface Match {
  id: string;
  date: any;
  status: 'OPEN' | 'FINISHED' | 'CANCELLED';
  confirmedIds: string[];
  absentIds: { userId: string; reason: string }[];
  waitingIds: string[];
  result?: { scoreA: number; scoreB: number };
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
  const { user } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<GroupSettings>({
    monthlyFee: 50,
    dailyFee: 15,
    maxPlayers: 20
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // Validate connection
    const testConn = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (e) {}
    };
    testConn();

    const qPlayers = query(collection(db, 'players'), orderBy('name'));
    const unsubPlayers = onSnapshot(qPlayers, (snap) => {
      setPlayers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player)));
    });

    const qMatches = query(collection(db, 'matches'), orderBy('date', 'desc'), limit(10));
    const unsubMatches = onSnapshot(qMatches, (snap) => {
      setMatches(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match)));
    });

    const qTransactions = query(collection(db, 'transactions'), orderBy('date', 'desc'), limit(50));
    const unsubTransactions = onSnapshot(qTransactions, (snap) => {
      setTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction)));
    });

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
  }, [user]);

  const updateSettings = async (newSettings: GroupSettings) => {
    await setDoc(doc(db, 'groups', 'main'), newSettings, { merge: true });
  };

  const confirmPresence = async (matchId: string, playerId: string) => {
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

    await updateDoc(doc(db, 'matches', matchId), {
      confirmedIds: newConfirmed,
      waitingIds: newWaiting,
      absentIds: match.absentIds.filter(a => a.userId !== playerId)
    });
  };

  const markAbsent = async (matchId: string, playerId: string, reason: string) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    let newConfirmed = match.confirmedIds.filter(id => id !== playerId);
    let newWaiting = match.waitingIds.filter(id => id !== playerId);
    const newAbsent = [...match.absentIds, { userId: playerId, reason }];

    // If someone leaves confirmed and there is a waitlist, move the first in waitlist to confirmed
    if (match.confirmedIds.includes(playerId) && newWaiting.length > 0) {
      const nextInLine = newWaiting.shift();
      if (nextInLine) newConfirmed.push(nextInLine);
    }

    await updateDoc(doc(db, 'matches', matchId), {
      absentIds: newAbsent,
      confirmedIds: newConfirmed,
      waitingIds: newWaiting
    });
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
    await addDoc(collection(db, 'transactions'), {
      ...data,
      date: Timestamp.fromDate(new Date())
    });
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
    await updateDoc(doc(db, 'players', playerId), data);
  };

  const deletePlayer = async (playerId: string) => {
    await deleteDoc(doc(db, 'players', playerId));
  };

  return { 
    players, 
    matches, 
    transactions, 
    settings,
    loading, 
    confirmPresence, 
    markAbsent, 
    createMatch, 
    createTransaction, 
    addPlayer,
    updatePlayer,
    deletePlayer,
    updateSettings
  };
}
