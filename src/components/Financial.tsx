import React, { useState } from 'react';
import { usePelada } from '../hooks/usePelada';
import { TrendingUp, TrendingDown, Wallet, Users, ArrowUpRight, ArrowDownRight } from 'lucide-react';

type SubTab = 'resumo' | 'caixa' | 'jogadores';

export default function Financial() {
  const { transactions, players, loading } = usePelada();
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('resumo');

  const totalIncome = transactions.filter(t => t.type === 'INCOME').reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + t.amount, 0);
  const balance = totalIncome - totalExpense;

  return (
    <div className="space-y-6">
      {/* Sub Tabs */}
      <div className="flex bg-card p-1 rounded-2xl border border-border/50">
        {(['resumo', 'caixa', 'jogadores'] as SubTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-all ${
              activeSubTab === tab ? 'bg-bg text-primary shadow-sm' : 'text-gray-500'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeSubTab === 'resumo' && (
        <div className="space-y-4">
          <div className="bg-card p-6 rounded-[32px] border border-border/50 shadow-xl overflow-hidden relative">
            <div className="relative z-10">
              <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Saldo em Caixa</span>
              <div className="text-4xl font-black text-white mt-1">R$ {balance.toFixed(2)}</div>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-5">
              <Wallet size={120} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card p-5 rounded-3xl border border-border/50">
              <div className="flex items-center space-x-2 text-primary mb-2">
                <ArrowUpRight size={16} />
                <span className="text-[10px] font-bold uppercase tracking-widest">A Receber</span>
              </div>
              <div className="text-xl font-bold text-white">
                R$ {players.reduce((acc, p) => acc + (p.balance < 0 ? Math.abs(p.balance) : 0), 0).toFixed(2)}
              </div>
            </div>
            <div className="bg-card p-5 rounded-3xl border border-border/50">
              <div className="flex items-center space-x-2 text-danger mb-2">
                <ArrowDownRight size={16} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Despesas</span>
              </div>
              <div className="text-xl font-bold text-white">R$ {totalExpense.toFixed(2)}</div>
            </div>
          </div>

          <div className="bg-card p-6 rounded-3xl border border-border/50 space-y-4">
            <h4 className="text-[11px] font-bold tracking-[0.2em] text-gray-500 uppercase">Resumo Mensal</h4>
            <div className="space-y-3">
              <StatRow icon={<Users size={16}/>} label="Jogadores em dia" value={players.filter(p => p.balance >= 0).length.toString()} />
              <StatRow icon={<TrendingDown size={16} className="text-danger"/>} label="Com saldo devedor" value={players.filter(p => p.balance < 0).length.toString()} color="text-danger" />
              <StatRow icon={<Wallet size={16}/>} label="Mensalidade" value="R$ 50,00" />
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'jogadores' && (
        <div className="space-y-3">
          {players.map(player => (
            <div key={player.id} className="bg-card p-4 rounded-3xl border border-border/50 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-bg border border-border flex items-center justify-center font-bold text-gray-500">
                  {(player.displayName || player.name).charAt(0)}
                </div>
                <div>
                  <h4 className="font-bold text-sm tracking-tight">{player.displayName || player.name}</h4>
                  <p className="text-[10px] text-gray-500 font-bold uppercase">{player.type}</p>
                </div>
              </div>
              <div className={`font-bold text-sm ${player.balance < 0 ? 'text-danger' : 'text-primary'}`}>
                {player.balance < 0 ? `-R$ ${Math.abs(player.balance).toFixed(2)}` : 'Em dia'}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSubTab === 'caixa' && (
        <div className="space-y-3">
          {transactions.map(t => (
            <div key={t.id} className="bg-card p-4 rounded-3xl border border-border/50 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className={`p-2 rounded-xl ${t.type === 'INCOME' ? 'bg-primary/10 text-primary' : 'bg-danger/10 text-danger'}`}>
                  {t.type === 'INCOME' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                </div>
                <div>
                  <h4 className="font-bold text-xs tracking-tight uppercase">{t.description}</h4>
                  <p className="text-[10px] text-gray-500 font-bold">{new Date().toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
              <div className={`font-bold text-sm ${t.type === 'INCOME' ? 'text-primary' : 'text-danger'}`}>
                {t.type === 'INCOME' ? '+' : '-'} R$ {t.amount.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatRow({ icon, label, value, color = "text-white" }: { icon: React.ReactNode, label: string, value: string, color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2 text-gray-400">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
  );
}
