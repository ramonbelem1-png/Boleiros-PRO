import React, { useState } from 'react';
import { Transaction, usePelada } from '../hooks/usePelada';
import { TrendingUp, TrendingDown, Wallet, Users, ArrowUpRight, ArrowDownRight, Edit2, Trash2 } from 'lucide-react';

type SubTab = 'resumo' | 'extrato' | 'jogadores';

interface FinancialProps {
  onEditTransaction: (t: Transaction) => void;
}

export default function Financial({ onEditTransaction }: FinancialProps) {
  const { transactions, players, settings, deleteTransaction } = usePelada();
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('resumo');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Month filtering for Extrato
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [filterMonth, setFilterMonth] = useState(currentMonthStr);

  const getPlayerStatus = (player: any, targetMonthStr: string) => {
    if (player.type === 'DIARISTA') return player.balance < 0 ? 'DÉBITO' : 'EM DIA';
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();
    const dueDay = settings.monthlyFeeDueDay || 10;

    const [targetYear, targetMonth] = targetMonthStr.split('-').map(Number);
    
    // Get previous month of the target month
    let prevMonth = targetMonth - 1;
    let prevYear = targetYear;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = targetYear - 1;
    }
    const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

    // Helper to check if a player has paid for a specific reference month
    const hasPaid = (monthStr: string) => {
      return transactions.some(t => 
        t.playerId === player.id && 
        t.category === 'MONTHLY' && 
        t.type === 'INCOME' && 
        t.referenceMonth === monthStr
      );
    };

    const paidTarget = hasPaid(targetMonthStr);
    const paidPrev = hasPaid(prevMonthStr);

    // Determine relationship of today with target month
    const todayMonthValue = currentYear * 12 + currentMonth;
    const targetMonthValue = targetYear * 12 + targetMonth;

    if (targetMonthValue < todayMonthValue) {
      // Past month: must have paid for this target month to be EM DIA
      return paidTarget ? 'EM DIA' : (player.balance < 0 ? 'EM ATRASO' : 'PENDENTE');
    } else if (targetMonthValue > todayMonthValue) {
      // Future month: if they prepaid target month, they are EM DIA, otherwise PENDENTE
      return paidTarget ? 'EM DIA' : 'PENDENTE';
    } else {
      // Current active month
      if (currentDay <= dueDay) {
        // Before or on due date: player is EM DIA if prepaid for previous or current month
        if (paidPrev || paidTarget) {
          return 'EM DIA';
        } else {
          return player.balance < 0 ? 'EM ATRASO' : 'PENDENTE';
        }
      } else {
        // After due date: player MUST have prepaid for the current month to be EM DIA
        if (paidTarget) {
          return 'EM DIA';
        } else {
          return player.balance < 0 ? 'EM ATRASO' : 'PENDENTE';
        }
      }
    }
  };

  // Filtered transactions for the selected month to show in the extrato
  const filteredTransactions = transactions.filter(t => {
    const tDate = t.date?.toDate() || new Date();
    const tMonthStr = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}`;
    return tMonthStr === filterMonth;
  });

  // Selected Month calculations from Extrato
  const monthlyIncome = filteredTransactions.filter(t => t.type === 'INCOME').reduce((acc, t) => acc + t.amount, 0);
  const monthlyExpense = filteredTransactions.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + t.amount, 0);
  const monthlyBalance = monthlyIncome - monthlyExpense;

  // Global historical totals
  const totalIncome = transactions.filter(t => t.type === 'INCOME').reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + t.amount, 0);
  const balance = totalIncome - totalExpense;

  // Monthly Reference specific fee paid this month
  const paidMonthlyFeeTotal = transactions
    .filter(t => t.category === 'MONTHLY' && t.type === 'INCOME' && t.referenceMonth === filterMonth)
    .reduce((acc, t) => acc + t.amount, 0);

  const totalMensalistas = players.filter(p => p.type === 'MENSALISTA').length;
  const expectedMonthlyFeeTotal = totalMensalistas * settings.monthlyFee;

  return (
    <div className="space-y-6">
      {/* Title & Month Selector */}
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-xl font-black italic uppercase tracking-tighter text-white">
          {activeSubTab === 'resumo' ? 'Resumo' : activeSubTab === 'extrato' ? 'Lançamentos' : 'Mensalidades'}
        </h3>
        <div className="flex items-center gap-1.5 bg-card border border-border/50 rounded-lg px-2 py-1">
          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Mês:</span>
          <input 
            type="month" 
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="bg-transparent text-[10px] font-black text-primary outline-none cursor-pointer"
          />
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex bg-card p-1 rounded-2xl border border-border/50">
        {(['resumo', 'extrato', 'jogadores'] as SubTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
              activeSubTab === tab ? 'bg-primary text-bg shadow-lg shadow-primary/20' : 'text-gray-500'
            }`}
          >
            {tab === 'extrato' ? 'Extrato' : tab === 'jogadores' ? 'Mensalidades' : tab}
          </button>
        ))}
      </div>

      {activeSubTab === 'resumo' && (
        <div className="space-y-4">
          {/* Main Card: Saldo Geral em Caixa */}
          <div className="bg-card p-6 rounded-[32px] border border-border/50 shadow-xl overflow-hidden relative">
            <div className="relative z-10">
              <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Saldo Geral em Caixa</span>
              <div className="text-4xl font-black text-white mt-1">R$ {balance.toFixed(2)}</div>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-2">Diferença de todas as entradas e saídas</p>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-5">
              <Wallet size={120} />
            </div>
          </div>

          {/* Monthly stats from selected month calculated automatically from Extrato */}
          <div className="bg-card p-5 rounded-3xl border border-border/50 space-y-4">
            <h4 className="text-[10px] font-bold tracking-[0.2em] text-primary uppercase flex items-center justify-between">
              <span>Lançamentos no Mês</span>
              <span className="text-[9px] px-2 py-0.5 rounded bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors uppercase">
                {filterMonth.split('-')[1]}/{filterMonth.split('-')[0]}
              </span>
            </h4>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-bg/40 p-3 rounded-2xl border border-border/30 text-center">
                <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wider block mb-1">Entradas</span>
                <span className="text-sm font-black text-primary">R$ {monthlyIncome.toFixed(2)}</span>
              </div>
              <div className="bg-bg/40 p-3 rounded-2xl border border-border/30 text-center">
                <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wider block mb-1">Saídas</span>
                <span className="text-sm font-black text-danger">R$ {monthlyExpense.toFixed(2)}</span>
              </div>
              <div className="bg-bg/40 p-3 rounded-2xl border border-border/30 text-center">
                <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wider block mb-1">Saldo Mês</span>
                <span className={`text-sm font-black ${monthlyBalance >= 0 ? 'text-primary' : 'text-danger'}`}>
                  R$ {monthlyBalance.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Monthly Fee Stats and Expected Revenue */}
          <div className="bg-card p-6 rounded-3xl border border-border/50 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-bold tracking-[0.2em] text-gray-500 uppercase">Resumo das Mensalidades</h4>
              <span className="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">Vencimento: Dia {settings.monthlyFeeDueDay}</span>
            </div>
            <div className="space-y-3">
              <StatRow icon={<Users size={16}/>} label="Mensalistas em dia" value={players.filter(p => p.type === 'MENSALISTA' && getPlayerStatus(p, filterMonth) === 'EM DIA').length.toString()} />
              <StatRow icon={<TrendingDown size={16} className="text-danger"/>} label="Mensalistas com pendências" value={players.filter(p => p.type === 'MENSALISTA' && getPlayerStatus(p, filterMonth) !== 'EM DIA').length.toString()} color="text-danger" />
              <StatRow icon={<Wallet size={16}/>} label="Valor Individual" value={`R$ ${settings.monthlyFee.toFixed(2)}`} />
              
              <div className="border-t border-border/20 pt-4 mt-4 grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wider block mb-0.5">Previsão Meta</span>
                  <span className="text-lg font-black text-white">R$ {expectedMonthlyFeeTotal.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wider block mb-0.5">Arrecadado Real</span>
                  <span className="text-lg font-black text-primary">R$ {paidMonthlyFeeTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="bg-bg/60 p-3 rounded-2xl border border-border/35 flex justify-between items-center text-xs mt-2">
                <span className="font-bold text-gray-400">Total Falta Arrecadar:</span>
                <span className={`font-black uppercase text-xs ${expectedMonthlyFeeTotal - paidMonthlyFeeTotal > 0 ? 'text-yellow-500' : 'text-primary'}`}>
                  R$ {Math.max(0, expectedMonthlyFeeTotal - paidMonthlyFeeTotal).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'jogadores' && (
        <div className="space-y-3">
          {players.map(player => {
            const status = getPlayerStatus(player, filterMonth);
            return (
              <div key={player.id} className="bg-card p-4 rounded-3xl border border-border/50 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-bg border border-border flex items-center justify-center font-bold text-gray-400 overflow-hidden shrink-0">
                    {player.photoUrl ? (
                      <img src={player.photoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (player.displayName || player.name).charAt(0)
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm tracking-tight text-white">{player.displayName || player.name}</h4>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wider">{player.type}</span>
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${
                        status === 'EM DIA' ? 'bg-primary/20 text-primary' : status === 'PENDENTE' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-danger/20 text-danger'
                      }`}>
                        {status}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={`font-black text-sm ${player.balance < 0 ? 'text-danger' : 'text-primary'}`}>
                  R$ {player.balance.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeSubTab === 'extrato' && (
        <div className="space-y-4">
          <div className="space-y-3">
            {filteredTransactions.length === 0 ? (
              <div className="bg-card/50 p-10 rounded-3xl border border-dashed border-border flex flex-col items-center justify-center text-center">
                <Wallet className="text-gray-700 mb-2" size={32} />
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Nenhum lançamento este mês</p>
              </div>
            ) : filteredTransactions.map(t => {
              const player = players.find(p => p.id === t.playerId);
              return (
                <div key={t.id} className="group bg-card p-4 rounded-3xl border border-border/50 flex items-center justify-between gap-4">
                  <div className="flex items-center space-x-4 min-w-0">
                    <div className={`p-2 rounded-xl shrink-0 ${t.type === 'INCOME' ? 'bg-primary/10 text-primary' : 'bg-danger/10 text-danger'}`}>
                      {t.type === 'INCOME' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs tracking-tight uppercase text-white truncate">{t.description}</h4>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                        <p className="text-[9px] text-gray-500 font-bold">{t.date?.toDate().toLocaleDateString('pt-BR')}</p>
                        {t.referenceMonth && (
                          <span className="text-[8px] bg-primary/10 text-primary px-1 rounded font-black italic">
                            REF: {t.referenceMonth.split('-')[1]}/{t.referenceMonth.split('-')[0].substring(2)}
                          </span>
                        )}
                        {player && (
                          <span className="text-[9px] text-primary font-black uppercase">● {player.displayName || player.name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <div className="text-right">
                      <div className={`font-black text-sm ${t.type === 'INCOME' ? 'text-primary' : 'text-danger'}`}>
                        {t.type === 'INCOME' ? '+' : '-'} R$ {t.amount.toFixed(2)}
                      </div>
                      <span className="text-[8px] text-gray-600 font-bold uppercase">{t.category}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {confirmDeleteId === t.id ? (
                        <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2 duration-200">
                          <button 
                            onClick={() => {
                              deleteTransaction(t.id);
                              setConfirmDeleteId(null);
                            }}
                            className="px-3 py-2 bg-danger text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-danger/20 active:scale-95"
                          >
                            Confirmar
                          </button>
                          <button 
                            onClick={() => setConfirmDeleteId(null)}
                            className="p-2 bg-white/10 text-gray-400 rounded-xl transition-all"
                          >
                            <Trash2 size={14} className="rotate-45" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button 
                            onClick={() => onEditTransaction(t)}
                            className="p-2 bg-white/5 hover:bg-primary/20 text-gray-400 hover:text-primary rounded-xl transition-all active:scale-90"
                            title="Editar"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={() => setConfirmDeleteId(t.id)}
                            className="p-2 bg-white/5 hover:bg-danger/20 text-gray-400 hover:text-danger rounded-xl transition-all active:scale-90"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
