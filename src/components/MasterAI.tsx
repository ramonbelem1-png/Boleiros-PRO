import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Send, 
  Loader2, 
  ShieldCheck, 
  Bot, 
  User, 
  HelpCircle, 
  Calendar, 
  Trophy, 
  Coins, 
  Users, 
  Copy, 
  Check, 
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { usePelada } from '../hooks/usePelada';
import { useAuth } from './AuthProvider';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

export default function MasterAI() {
  const { players, transactions, matches, settings } = usePelada();
  const { user, role, isCreator } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: `Olá, **Mestre**! Sou o seu assistente de Inteligência Artificial com acesso a todo o banco de dados do **Boleiros PRO**.\n\nVocê pode me fazer qualquer pergunta sobre:\n- **Meses ativos & mensalidades**: Quem contribuiu mais meses, quem está pendente.\n- **Assiduidade**: Quem jogou mais peladas ou quem faltou mais.\n- **Estatísticas de futebol**: Artilharia de gols, assistências, vitórias e aproveitamento.\n- **Finanças**: Total arrecadado, balanço de custos e caixas.\n\nEscolha uma das sugestões abaixo ou digite sua pergunta livremente!`,
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Monta o resumo dos dados estruturado para envio ao backend
  const buildGroupContext = () => {
    // Mapeia histórico de pagamentos por atleta
    const playerContributions: Record<string, { totalMonths: number; months: string[]; totalPaid: number }> = {};
    
    transactions.forEach(t => {
      if (t.playerId && t.type === 'INCOME' && (t.category === 'MONTHLY' || t.category === 'DAILY')) {
        if (!playerContributions[t.playerId]) {
          playerContributions[t.playerId] = { totalMonths: 0, months: [], totalPaid: 0 };
        }
        playerContributions[t.playerId].totalPaid += Number(t.amount) || 0;
        if (t.referenceMonth && !playerContributions[t.playerId].months.includes(t.referenceMonth)) {
          playerContributions[t.playerId].months.push(t.referenceMonth);
          playerContributions[t.playerId].totalMonths = playerContributions[t.playerId].months.length;
        }
      }
    });

    const sanitizedPlayers = players.map(p => ({
      id: p.id,
      name: p.displayName || p.fullName || p.name,
      type: p.type,
      position: p.position,
      active: p.active,
      goals: p.gols || 0,
      assists: p.assistencias || 0,
      victories: p.vitorias || 0,
      defeats: p.derrotas || 0,
      draws: p.empates || 0,
      balance: p.balance || 0,
      contributions: playerContributions[p.id] || { totalMonths: 0, months: [], totalPaid: 0 }
    }));

    const sanitizedMatches = matches.map(m => {
      const matchDateStr = m.date?.toDate ? m.date.toDate().toISOString() : m.date;
      return {
        id: m.id,
        date: matchDateStr,
        status: m.status,
        confirmedCount: (m.confirmedIds || []).length,
        absentCount: (m.absentIds || []).length,
        waitingCount: (m.waitingIds || []).length,
        confirmedPlayerNames: (m.confirmedIds || []).map(id => {
          const pl = players.find(p => p.id === id);
          return pl ? (pl.displayName || pl.fullName || pl.name) : id;
        })
      };
    });

    const totalIncome = transactions.filter(t => t.type === 'INCOME').reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    const totalExpense = transactions.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

    return {
      settings: {
        monthlyFee: settings.monthlyFee,
        dailyFee: settings.dailyFee,
        monthlyFeeDueDay: settings.monthlyFeeDueDay,
        maxPlayers: settings.maxPlayers
      },
      summary: {
        totalPlayers: players.length,
        activePlayers: players.filter(p => p.active).length,
        totalMatches: matches.length,
        totalTransactions: transactions.length,
        totalIncome,
        totalExpense,
        cashBalance: totalIncome - totalExpense
      },
      players: sanitizedPlayers,
      matches: sanitizedMatches.slice(0, 30)
    };
  };

  const handleSendMessage = async (textToSend?: string) => {
    const question = (textToSend || inputValue).trim();
    if (!question || isLoading) return;

    const userMsg: Message = {
      id: String(Date.now()),
      sender: 'user',
      text: question,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const context = buildGroupContext();
      const res = await fetch('/api/ai-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: question,
          context,
          userEmail: user?.email,
          userRole: role
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro no servidor de IA.');
      }

      const aiMsg: Message = {
        id: String(Date.now() + 1),
        sender: 'ai',
        text: data.answer || 'Resposta vazia retornada.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err: any) {
      console.error('Erro ao consultar IA Master:', err);
      const errorMsg: Message = {
        id: String(Date.now() + 1),
        sender: 'ai',
        text: `⚠️ **Ops, ocorreu um erro ao consultar a IA:**\n\n${err.message || 'Erro desconhecido. Tente novamente em instantes.'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const suggestedQuestions = [
    {
      title: "Meses Ativos & Mensalidades",
      query: "Quero a lista detalhada dos atletas que têm mais meses ativos na pelada contribuindo com mensalidade, e também os que têm menos meses ou estão zerados.",
      icon: <Coins size={14} className="text-amber-400" />
    },
    {
      title: "Artilharia & Mais Jogos",
      query: "Quem participou de mais jogos na história da pelada e quem fez mais gols e assistências? Traga o ranking dos melhores.",
      icon: <Trophy size={14} className="text-primary" />
    },
    {
      title: "Quem tem mais vitórias?",
      query: "Quais são os jogadores com maior número de vitórias e melhor aproveitamento no grupo?",
      icon: <Users size={14} className="text-emerald-400" />
    },
    {
      title: "Resumo Financeiro & Caixa",
      query: "Faça um diagnóstico das finanças da pelada: total arrecadado, despesas, saldo em caixa e previsão de arrecadação.",
      icon: <Calendar size={14} className="text-cyan-400" />
    }
  ];

  if (!isCreator) {
    return (
      <div className="bg-card border border-danger/30 rounded-3xl p-8 text-center space-y-4 max-w-md mx-auto my-12">
        <AlertTriangle className="text-danger mx-auto" size={48} />
        <h2 className="text-xl font-black uppercase text-white">Acesso Restrito</h2>
        <p className="text-sm text-gray-400">
          Esta aba de Inteligência Artificial é reservada exclusivamente para o <strong>Administrador Master</strong> do grupo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-xl mx-auto pb-6">
      {/* Top Banner Exclusivo */}
      <div className="bg-gradient-to-r from-card via-[#16222F] to-card border border-primary/30 rounded-3xl p-4 shadow-xl relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-28 h-28 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shadow-lg shadow-primary/20">
              <Sparkles size={20} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-black uppercase tracking-tight text-white">IA Boleiros Master</h2>
                <span className="bg-primary/20 text-primary text-[9px] font-black px-1.5 py-0.5 rounded border border-primary/30 uppercase tracking-widest flex items-center gap-0.5">
                  <ShieldCheck size={10} /> MASTER
                </span>
              </div>
              <p className="text-[11px] text-gray-400 font-medium">
                Analista inteligente dos dados da sua pelada (atletas, mensalidades, jogos).
              </p>
            </div>
          </div>
          
          <button
            onClick={() => setMessages([messages[0]])}
            className="p-2 text-gray-500 hover:text-gray-300 rounded-xl bg-bg/50 border border-border/50 text-xs flex items-center gap-1"
            title="Limpar conversa"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Suggested Questions Grid */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1 flex items-center gap-1">
          <HelpCircle size={12} /> Perguntas Rápidas Sugeridas
        </span>
        <div className="grid grid-cols-2 gap-2">
          {suggestedQuestions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(q.query)}
              disabled={isLoading}
              className="text-left p-2.5 rounded-2xl bg-card/80 hover:bg-card border border-border/70 hover:border-primary/50 transition-all text-xs text-gray-200 group active:scale-95 disabled:opacity-50 flex flex-col justify-between"
            >
              <div className="flex items-center gap-1.5 mb-1">
                {q.icon}
                <span className="font-bold text-[11px] text-white group-hover:text-primary transition-colors">
                  {q.title}
                </span>
              </div>
              <span className="text-[10px] text-gray-400 line-clamp-2 leading-tight">
                {q.query}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages Container */}
      <div className="bg-card/40 border border-border/60 rounded-3xl p-4 min-h-[380px] max-h-[520px] overflow-y-auto space-y-4 scrollbar-thin">
        {messages.map((m) => {
          const isAI = m.sender === 'ai';
          return (
            <div
              key={m.id}
              className={`flex flex-col ${isAI ? 'items-start' : 'items-end'} space-y-1`}
            >
              <div className="flex items-center space-x-1 px-1">
                {isAI ? (
                  <>
                    <Bot size={12} className="text-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Boleiros IA</span>
                  </>
                ) : (
                  <>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Você (Master)</span>
                    <User size={12} className="text-gray-400" />
                  </>
                )}
                <span className="text-[9px] text-gray-600">
                  {m.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div
                className={`max-w-[92%] sm:max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed relative group ${
                  isAI
                    ? 'bg-card border border-border text-gray-200 shadow-md'
                    : 'bg-primary text-bg font-medium rounded-tr-none shadow-md shadow-primary/10'
                }`}
              >
                {/* Render text with basic markdown formatting */}
                <div className="whitespace-pre-wrap space-y-2">
                  {m.text.split('\n').map((line, i) => {
                    // Check for headers or list bullets
                    if (line.startsWith('### ')) {
                      return <h4 key={i} className="text-sm font-black text-white pt-1">{line.replace('### ', '')}</h4>;
                    }
                    if (line.startsWith('## ')) {
                      return <h3 key={i} className="text-base font-black text-primary pt-2">{line.replace('## ', '')}</h3>;
                    }
                    if (line.startsWith('# ')) {
                      return <h2 key={i} className="text-lg font-black text-white pt-2">{line.replace('# ', '')}</h2>;
                    }
                    
                    // Format bold text **text**
                    const formattedParts = line.split(/(\*\*.*?\*\*)/g).map((part, partIdx) => {
                      if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={partIdx} className={isAI ? "text-white font-bold" : "font-black"}>{part.slice(2, -2)}</strong>;
                      }
                      return part;
                    });

                    return (
                      <p key={i} className={line.startsWith('- ') || line.startsWith('• ') ? "pl-2 flex items-start" : ""}>
                        {formattedParts}
                      </p>
                    );
                  })}
                </div>

                {isAI && (
                  <button
                    onClick={() => copyToClipboard(m.text, m.id)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-bg/80 border border-border/80 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Copiar resposta"
                  >
                    {copiedId === m.id ? <Check size={12} className="text-primary" /> : <Copy size={12} />}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex flex-col items-start space-y-1 animate-pulse">
            <div className="flex items-center space-x-1 px-1">
              <Bot size={12} className="text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Boleiros IA analisando...</span>
            </div>
            <div className="bg-card border border-primary/30 rounded-2xl p-4 text-xs text-gray-300 flex items-center space-x-3 shadow-md">
              <Loader2 className="animate-spin text-primary shrink-0" size={16} />
              <span>Cruzando dados de atletas, jogos e mensalidades...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="flex items-center space-x-2 bg-card border border-border/80 focus-within:border-primary/80 rounded-2xl p-2 transition-all shadow-xl"
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Pergunte sobre atletas, meses ativos, gols, jogos..."
          disabled={isLoading}
          className="flex-1 bg-transparent px-3 py-2 text-xs text-gray-100 placeholder:text-gray-500 outline-none"
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || isLoading}
          className="w-10 h-10 rounded-xl bg-primary text-bg flex items-center justify-center font-bold shadow-md shadow-primary/20 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 transition-all shrink-0"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>
    </div>
  );
}
