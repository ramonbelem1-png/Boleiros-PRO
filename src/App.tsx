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
  Activity
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
import { usePelada, Player } from './hooks/usePelada';
import Logo from './components/Logo';
import { useAuth } from './components/AuthProvider';

type Tab = 'list' | 'finance' | 'play' | 'live' | 'social' | 'settings';

export default function App() {
  const { players, updatePlayer, settings, updateSettings } = usePelada();
  const { role, user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('list');
  const [modalType, setModalType] = useState<'match' | 'finance' | 'player' | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  const isAdmin = role === 'ADMIN' || user?.email === 'ramonbelem1@gmail.com';

  const handlePlusClick = () => {
    if (!isAdmin) return;
    if (activeTab === 'list') setModalType('match');
    if (activeTab === 'finance') setModalType('finance');
    if (activeTab === 'settings') {
      setEditingPlayer(null);
      setModalType('player');
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'list': return <MatchList />;
      case 'finance': return isAdmin ? <Financial /> : <MatchList />;
      case 'play': return <TeamDraw />;
      case 'live': return <LiveMatch />;
      case 'social': return <SocialStats />;
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
      <header className="px-6 pt-8 pb-4 bg-bg/80 backdrop-blur-md z-10 transition-all duration-300">
        <div className="flex justify-between items-end">
          <div>
            <Logo className="mb-2" />
            <div className="flex items-center space-x-2">
              <h1 className="text-3xl font-bold text-white">
                {activeTab === 'list' && 'Próxima Pelada'}
                {activeTab === 'finance' && 'Financeiro'}
                {activeTab === 'play' && 'Sorteio de Times'}
                {activeTab === 'live' && 'Jogo ao Vivo'}
                {activeTab === 'social' && 'Rankings'}
                {activeTab === 'settings' && 'Ajustes'}
              </h1>
              {isAdmin && (
                <span className="bg-primary/20 text-primary text-[8px] font-black px-1.5 py-0.5 rounded border border-primary/30 uppercase tracking-tighter">
                  ADMIN
                </span>
              )}
            </div>
          </div>
          {isAdmin && ['list', 'finance', 'settings'].includes(activeTab) && (
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handlePlusClick}
              className="w-12 h-12 rounded-full flex items-center justify-center text-bg shadow-lg transition-all bg-primary shadow-primary/20"
            >
              <Plus size={28} />
            </motion.button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bottom-nav-blur safe-area-bottom z-50">
        <div className={`grid ${isAdmin ? 'grid-cols-6' : 'grid-cols-5'} items-center h-20 px-1 max-w-lg mx-auto`}>
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
              label="Caixa"
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

          <NavButton 
            active={activeTab === 'social'} 
            onClick={() => setActiveTab('social')}
            icon={<Trophy size={20} />}
            label="Ranking"
          />
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
        onClose={() => {
          setModalType(null);
          setEditingPlayer(null);
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
