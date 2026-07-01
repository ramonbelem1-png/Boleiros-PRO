/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, 
  Coins, 
  Dices, 
  Trophy, 
  Settings as SettingsIcon,
  Plus,
  Activity,
  LogOut,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from './lib/firebase';
import { collection, getDocs, addDoc, Timestamp } from 'firebase/firestore';

// Screens
import MatchList from './components/MatchList';
import Financial from './components/Financial';
import TeamDraw from './components/TeamDraw';
import LiveMatch from './components/LiveMatch';
import SocialStats from './components/SocialStats';
import Settings from './components/Settings';
import ManagementModals from './components/ManagementModals';
import { usePelada, Player, Transaction } from './hooks/usePelada';
import Logo from './components/Logo';
import { useAuth } from './components/AuthProvider';
import OnboardingProfile from './components/OnboardingProfile';
import PullToRefresh from './components/PullToRefresh';

type Tab = 'list' | 'finance' | 'play' | 'live' | 'social' | 'settings';

export default function App() {
  const { players, updatePlayer, settings, updateSettings, loading } = usePelada();
  const { role, user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('list');
  const [modalType, setModalType] = useState<'match' | 'finance' | 'player' | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const isAdmin = role === 'ADMIN' || user?.email?.trim().toLowerCase() === 'ramonbelem1@gmail.com';

  const currentUserPlayer = user ? players.find(p => p.id === user.uid) : null;
  const isProfileIncomplete = user && currentUserPlayer && currentUserPlayer.profileCompleted === false;

  useEffect(() => {
    // Test connection to Firestore
    const testConnection = async () => {
      try {
        const { doc, getDocFromServer } = await import('firebase/firestore');
        await getDocFromServer(doc(db, 'test', 'connection'));
        console.log("Conexão com Firestore: OK");
      } catch (error: any) {
        if (error.message?.includes('offline')) {
          console.error("Conexão com Firestore falhou: O cliente está offline ou o domínio não está autorizado.");
        } else {
          console.error("Erro ao testar conexão com Firestore:", error);
        }
      }
    };
    if (user && !isProfileIncomplete) testConnection();
  }, [user, isProfileIncomplete]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="animate-spin text-primary" size={32} />
          <span className="text-gray-500 text-xs font-bold uppercase tracking-widest animate-pulse">Carregando dados...</span>
        </div>
      </div>
    );
  }

  if (isProfileIncomplete) {
    return (
      <OnboardingProfile 
        user={user} 
        players={players} 
        onSave={async (data) => {
          await updatePlayer(user.uid, data);
        }} 
        onLogout={logout} 
      />
    );
  }

  const handlePlusClick = () => {
    if (!isAdmin) return;
    if (activeTab === 'list') setModalType('match');
    if (activeTab === 'finance') {
      setEditingTransaction(null);
      setModalType('finance');
    }
    if (activeTab === 'settings') {
      setEditingPlayer(null);
      setModalType('player');
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'list': return <MatchList />;
      case 'finance': return isAdmin ? (
        <Financial 
          onEditTransaction={(t) => {
            setEditingTransaction(t);
            setModalType('finance');
          }}
          onLaunchPayment={(p) => {
            setEditingTransaction({
              id: '',
              amount: p.type === 'MENSALISTA' ? settings.monthlyFee : 0,
              type: 'INCOME',
              category: p.type === 'MENSALISTA' ? 'MONTHLY' : 'DAILY',
              playerId: p.id,
              description: p.type === 'MENSALISTA' ? 'Mensalidade' : 'Diarista',
              date: null
            } as any);
            setModalType('finance');
          }}
        />
      ) : <MatchList />;
      case 'play': return <TeamDraw />;
      case 'live': return <LiveMatch />;
      case 'social': return isAdmin ? <SocialStats /> : <MatchList />;
      case 'settings': return (
        <Settings 
          onAddPlayer={() => {
            if (!isAdmin) return;
            setEditingPlayer(null);
            setModalType('player');
          }}
          onEditPlayer={(player) => {
            if (!isAdmin && player.id !== user?.uid) return;
            setEditingPlayer(player);
            setModalType('player');
          }}
          updatePlayer={updatePlayer}
          settings={settings}
          onUpdateSettings={updateSettings}
        />
      );
      default: return <MatchList />;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-bg text-gray-100 pb-24">
      {/* ... header remains same ... */}
      <header className="px-6 pt-8 pb-4 bg-bg border-b border-white/5 z-10 transition-all duration-300">
        <div className="flex flex-col space-y-4">
          <div className="flex justify-between items-start">
            <Logo />
            <div className="flex items-center space-x-3">
              {isAdmin && ['list', 'finance', 'settings'].includes(activeTab) && (
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handlePlusClick}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-bg shadow-lg transition-all bg-primary shadow-primary/20"
                >
                  <Plus size={24} />
                </motion.button>
              )}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={logout}
                className="w-10 h-10 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center text-danger hover:bg-danger hover:text-bg transition-all"
                title="Sair"
              >
                <LogOut size={20} />
              </motion.button>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <h1 className="text-3xl font-bold text-white tracking-tight">
              {activeTab === 'list' && 'Próxima Pelada'}
              {activeTab === 'finance' && 'Financeiro'}
              {activeTab === 'play' && 'Sorteio de Times'}
              {activeTab === 'live' && 'Jogo ao Vivo'}
              {activeTab === 'social' && 'Rankings'}
              {activeTab === 'settings' && 'Ajustes'}
            </h1>
            {isAdmin && (
              <span className="bg-primary/20 text-primary text-[10px] font-black px-1.5 py-0.5 rounded border border-primary/30 uppercase tracking-tighter">
                ADMIN
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-2 sm:px-4 w-full max-w-lg mx-auto">
        <div key={activeTab} className="animate-in fade-in duration-150">
          <PullToRefresh>
            {renderContent()}
          </PullToRefresh>
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bottom-nav-blur safe-area-bottom z-50">
        <div className={`grid ${isAdmin ? 'grid-cols-6' : 'grid-cols-4'} items-center h-20 px-1 max-w-lg mx-auto`}>
          <NavButton 
            active={activeTab === 'list'} 
            onClick={() => setActiveTab('list')}
            icon={<ClipboardList size={20} />}
            label="Lista"
          />
          
          {isAdmin && (
            <NavButton 
              active={activeTab === 'finance'} 
              onClick={() => setActiveTab('finance')}
              icon={<Coins size={20} />}
              label="Finanças"
            />
          )}
          
          <NavButton 
            active={activeTab === 'play'} 
            onClick={() => setActiveTab('play')}
            icon={<Dices size={20} />}
            label="Sorteio"
          />

          <NavButton 
            active={activeTab === 'live'} 
            onClick={() => setActiveTab('live')}
            icon={<Activity size={20} />}
            label="Ao Vivo"
          />

          {isAdmin && (
            <NavButton 
              active={activeTab === 'social'} 
              onClick={() => setActiveTab('social')}
              icon={<Trophy size={20} />}
              label="Ranking"
            />
          )}
          <NavButton 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')}
            icon={<SettingsIcon size={20} />}
            label="Ajustes"
          />
        </div>
      </nav>

      <ManagementModals 
        type={modalType} 
        editingPlayer={editingPlayer}
        editingTransaction={editingTransaction}
        onClose={() => {
          setModalType(null);
          setEditingPlayer(null);
          setEditingTransaction(null);
        }} 
      />
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center justify-center space-y-1 transition-colors ${
        active ? 'text-primary' : 'text-gray-500 hover:text-gray-300'
      }`}
    >
      <div className={`p-1.5 rounded-xl transition-colors ${active ? 'bg-primary/10' : ''}`}>
        {icon}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}
