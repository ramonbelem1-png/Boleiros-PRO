import * as XLSX from 'xlsx';
import { Transaction, Player, GroupSettings, formatPosition } from '../hooks/usePelada';

const categoryLabels: Record<string, string> = {
  MONTHLY: 'Mensalidade',
  DAILY: 'Diarista',
  FIELD_RENT: 'Aluguel Quadra/Campo',
  BALL: 'Bola',
  REFEREE: 'Arbitragem',
  OTHER: 'Outros'
};

export const formatMoneyBRL = (val: number): string => {
  if (val === undefined || val === null || isNaN(val)) return 'R$ 0,00';
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  const formatted = absVal.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return isNegative ? `-R$ ${formatted}` : `R$ ${formatted}`;
};

export interface ExportFinancialOptions {
  transactions: Transaction[];
  players: Player[];
  settings: GroupSettings;
  filterMonth: string; // "YYYY-MM"
  getPlayerStatus: (player: Player, targetMonthStr: string) => string;
  getPlayerMonthContribution: (player: Player, targetMonthStr: string) => number;
  exportScope?: 'all' | 'filtered_month';
}

export function exportFinancialToExcel({
  transactions,
  players,
  settings,
  filterMonth,
  getPlayerStatus,
  getPlayerMonthContribution
}: ExportFinancialOptions) {
  const [year, month] = filterMonth.split('-');
  const monthFormatted = `${month}/${year}`;

  // Filter transactions for the selected month
  const filteredTransactions = transactions.filter(t => {
    const tDate = t.date?.toDate ? t.date.toDate() : (t.date instanceof Date ? t.date : new Date(t.date || Date.now()));
    const tMonthStr = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}`;
    return tMonthStr === filterMonth;
  });

  // Calculate stats
  const monthlyIncome = filteredTransactions.filter(t => t.type === 'INCOME').reduce((acc, t) => acc + t.amount, 0);
  const monthlyExpense = filteredTransactions.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + t.amount, 0);
  const monthlyBalance = monthlyIncome - monthlyExpense;

  const totalIncome = transactions.filter(t => t.type === 'INCOME').reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + t.amount, 0);
  const totalBalance = totalIncome - totalExpense;

  const totalMensalistas = players.filter(p => p.type === 'MENSALISTA').length;
  const mensalistasEmDia = players.filter(p => p.type === 'MENSALISTA' && getPlayerStatus(p, filterMonth) === 'EM DIA').length;
  const mensalistasPendentes = players.filter(p => p.type === 'MENSALISTA' && getPlayerStatus(p, filterMonth) !== 'EM DIA').length;

  const expectedMonthlyFeeTotal = totalMensalistas * (settings.monthlyFee || 0);
  const paidMonthlyFeeTotal = transactions
    .filter(t => t.category === 'MONTHLY' && t.type === 'INCOME' && t.referenceMonth === filterMonth)
    .reduce((acc, t) => acc + t.amount, 0);
  const remainingMonthlyFeeTotal = Math.max(0, expectedMonthlyFeeTotal - paidMonthlyFeeTotal);

  // 1. Sheet: Resumo
  const resumoData = [
    { 'MÉTRICA / INDICADOR': 'Mês de Referência Selecionado', 'VALOR': monthFormatted },
    { 'MÉTRICA / INDICADOR': 'Data de Geração do Relatório', 'VALOR': new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) },
    { 'MÉTRICA / INDICADOR': '', 'VALOR': '' },
    { 'MÉTRICA / INDICADOR': '--- CAIXA GERAL (HISTÓRICO) ---', 'VALOR': '' },
    { 'MÉTRICA / INDICADOR': 'Total Geral de Entradas', 'VALOR': formatMoneyBRL(totalIncome) },
    { 'MÉTRICA / INDICADOR': 'Total Geral de Saídas', 'VALOR': formatMoneyBRL(totalExpense) },
    { 'MÉTRICA / INDICADOR': 'Saldo Geral em Caixa', 'VALOR': formatMoneyBRL(totalBalance) },
    { 'MÉTRICA / INDICADOR': '', 'VALOR': '' },
    { 'MÉTRICA / INDICADOR': `--- MOVIMENTAÇÃO DO MÊS (${monthFormatted}) ---`, 'VALOR': '' },
    { 'MÉTRICA / INDICADOR': 'Entradas no Mês', 'VALOR': formatMoneyBRL(monthlyIncome) },
    { 'MÉTRICA / INDICADOR': 'Saídas no Mês', 'VALOR': formatMoneyBRL(monthlyExpense) },
    { 'MÉTRICA / INDICADOR': 'Saldo Líquido do Mês', 'VALOR': formatMoneyBRL(monthlyBalance) },
    { 'MÉTRICA / INDICADOR': '', 'VALOR': '' },
    { 'MÉTRICA / INDICADOR': `--- MENSALIDADES (${monthFormatted}) ---`, 'VALOR': '' },
    { 'MÉTRICA / INDICADOR': 'Valor Individual da Mensalidade', 'VALOR': formatMoneyBRL(settings.monthlyFee || 0) },
    { 'MÉTRICA / INDICADOR': 'Dia de Vencimento', 'VALOR': `Dia ${settings.monthlyFeeDueDay || 10}` },
    { 'MÉTRICA / INDICADOR': 'Total de Mensalistas Cadastrados', 'VALOR': totalMensalistas },
    { 'MÉTRICA / INDICADOR': 'Mensalistas em Dia', 'VALOR': mensalistasEmDia },
    { 'MÉTRICA / INDICADOR': 'Mensalistas com Pendência/Atraso', 'VALOR': mensalistasPendentes },
    { 'MÉTRICA / INDICADOR': 'Meta de Arrecadação do Mês', 'VALOR': formatMoneyBRL(expectedMonthlyFeeTotal) },
    { 'MÉTRICA / INDICADOR': 'Total Arrecadado no Mês (Ref)', 'VALOR': formatMoneyBRL(paidMonthlyFeeTotal) },
    { 'MÉTRICA / INDICADOR': 'Falta Arrecadar no Mês', 'VALOR': formatMoneyBRL(remainingMonthlyFeeTotal) },
  ];

  const wsResumo = XLSX.utils.json_to_sheet(resumoData);
  wsResumo['!cols'] = [
    { wch: 42 },
    { wch: 25 }
  ];

  // 2. Sheet: Lançamentos do Mês
  const formatTx = (t: Transaction) => {
    const tDate = t.date?.toDate ? t.date.toDate() : (t.date instanceof Date ? t.date : new Date(t.date || Date.now()));
    const player = players.find(p => p.id === t.playerId);
    const refMonthFormatted = t.referenceMonth ? `${t.referenceMonth.split('-')[1]}/${t.referenceMonth.split('-')[0]}` : '-';

    return {
      'Data': tDate.toLocaleDateString('pt-BR'),
      'Tipo': t.type === 'INCOME' ? 'ENTRADA' : 'SAÍDA',
      'Categoria': categoryLabels[t.category] || t.category || 'Outros',
      'Descrição': t.description || '',
      'Atleta / Pagador': player ? (player.displayName || player.name) : '-',
      'Nº Camisa': player?.number !== undefined && player?.number !== null ? `#${player.number}` : '-',
      'Mês Referência': refMonthFormatted,
      'Valor': formatMoneyBRL(t.type === 'INCOME' ? t.amount : -t.amount)
    };
  };

  const lancamentosMesData = filteredTransactions.map(formatTx);
  const wsLancamentosMes = XLSX.utils.json_to_sheet(
    lancamentosMesData.length > 0
      ? lancamentosMesData
      : [{ 'Aviso': `Nenhum lançamento registrado no mês ${monthFormatted}` }]
  );
  wsLancamentosMes['!cols'] = [
    { wch: 14 },
    { wch: 12 },
    { wch: 24 },
    { wch: 35 },
    { wch: 28 },
    { wch: 12 },
    { wch: 16 },
    { wch: 18 }
  ];

  // 3. Sheet: Mensalidades e Atletas
  const atletasData = players
    .map(p => {
      const status = getPlayerStatus(p, filterMonth);
      const contribution = getPlayerMonthContribution(p, filterMonth);
      return {
        'Nº': p.number !== undefined && p.number !== null ? p.number : '-',
        'Nome Completo': p.fullName || p.name || '',
        'Apelido / Exibição': p.displayName || p.name || '',
        'Tipo': p.type || 'DIARISTA',
        'Posição': formatPosition(p.position),
        [`Status (${monthFormatted})`]: status,
        [`Pago no Mês`]: formatMoneyBRL(contribution),
        'Saldo Acumulado': formatMoneyBRL(p.balance || 0),
        'E-mail': p.email || '-'
      };
    })
    .sort((a, b) => {
      // Sort by Mensalista first, then by name
      if (a.Tipo === 'MENSALISTA' && b.Tipo !== 'MENSALISTA') return -1;
      if (a.Tipo !== 'MENSALISTA' && b.Tipo === 'MENSALISTA') return 1;
      return (a['Nome Completo'] || '').localeCompare(b['Nome Completo'] || '');
    });

  const wsAtletas = XLSX.utils.json_to_sheet(atletasData);
  wsAtletas['!cols'] = [
    { wch: 6 },
    { wch: 26 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 26 }
  ];

  // 4. Sheet: Histórico Completo de Transações
  const sortedAllTransactions = [...transactions].sort((a, b) => {
    const dateA = a.date?.toDate ? a.date.toDate() : (a.date instanceof Date ? a.date : new Date(a.date || 0));
    const dateB = b.date?.toDate ? b.date.toDate() : (b.date instanceof Date ? b.date : new Date(b.date || 0));
    return dateB.getTime() - dateA.getTime();
  });

  const historicoData = sortedAllTransactions.map(formatTx);
  const wsHistorico = XLSX.utils.json_to_sheet(
    historicoData.length > 0
      ? historicoData
      : [{ 'Aviso': 'Nenhum lançamento registrado no sistema' }]
  );
  wsHistorico['!cols'] = [
    { wch: 14 },
    { wch: 12 },
    { wch: 24 },
    { wch: 35 },
    { wch: 28 },
    { wch: 12 },
    { wch: 16 },
    { wch: 18 }
  ];

  // Create Workbook and append sheets
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo Geral');
  XLSX.utils.book_append_sheet(wb, wsLancamentosMes, `Extrato ${month}-${year}`);
  XLSX.utils.book_append_sheet(wb, wsAtletas, 'Mensalidades e Atletas');
  XLSX.utils.book_append_sheet(wb, wsHistorico, 'Histórico Completo');

  // Generate file name and download
  const fileName = `Financeiro_Boleiros_${year}_${month}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
