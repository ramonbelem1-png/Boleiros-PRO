import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { safeStorage } from '../lib/storage';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  copied: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
    copied: false
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetAndReload = () => {
    try {
      safeStorage.clear();
      try { sessionStorage.clear(); } catch {}
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => caches.delete(name));
        });
      }
    } catch (e) {
      console.warn('Erro ao limpar cache:', e);
    }
    window.location.href = window.location.origin;
  };

  handleCopyError = () => {
    const { error, errorInfo } = this.state;
    const text = `Erro Boleiros PRO:
Mensagem: ${error?.message || 'Sem mensagem'}
Stack: ${error?.stack || 'Sem stack'}
Component Stack: ${errorInfo?.componentStack || 'Sem component stack'}
Navegador: ${navigator.userAgent}
URL: ${window.location.href}`;

    navigator.clipboard?.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }).catch(() => {
      prompt('Copie os detalhes do erro:', text);
    });
  };

  override render() {
    if (this.state.hasError) {
      const { error, showDetails, copied } = this.state;

      return (
        <div className="min-h-screen bg-[#0F172A] text-gray-100 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#1E293B] border border-red-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-400">
              <AlertTriangle size={36} />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-black text-white italic uppercase tracking-tight">
                Ops! Algo deu errado
              </h1>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                O aplicativo encontrou um problema inesperado ao carregar. Isso geralmente é resolvido recarregando ou limpando dados temporários.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleReload}
                className="w-full py-3.5 bg-[#00FFBB] text-[#0F172A] font-black text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center space-x-2 shadow-lg shadow-[#00FFBB]/10 active:scale-95 transition-all"
              >
                <RefreshCw size={16} />
                <span>Recarregar Aplicativo</span>
              </button>

              <button
                onClick={this.handleResetAndReload}
                className="w-full py-3.5 bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs uppercase tracking-wider rounded-2xl border border-white/10 flex items-center justify-center space-x-2 active:scale-95 transition-all"
              >
                <Trash2 size={16} />
                <span>Limpar Cache & Reiniciar</span>
              </button>
            </div>

            <div className="pt-2 border-t border-white/5 text-left">
              <button
                onClick={() => this.setState({ showDetails: !showDetails })}
                className="w-full flex items-center justify-between text-[11px] font-bold text-gray-400 hover:text-white uppercase tracking-wider py-1"
              >
                <span>Detalhes técnicos</span>
                {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showDetails && (
                <div className="mt-3 p-3 bg-black/40 rounded-xl border border-white/5 text-[10px] text-gray-300 font-mono overflow-x-auto space-y-3">
                  <p className="text-red-400 font-bold break-all">
                    {error?.name}: {error?.message}
                  </p>
                  <button
                    onClick={this.handleCopyError}
                    className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-sans font-bold transition-all"
                  >
                    {copied ? <Check size={12} className="text-[#00FFBB]" /> : <Copy size={12} />}
                    <span>{copied ? 'Copiado!' : 'Copiar Erro para Suporte'}</span>
                  </button>
                </div>
              )}
            </div>

            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
              Boleiros PRO • Sistema de Recuperação
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
