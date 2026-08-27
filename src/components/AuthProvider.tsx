import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  signOut,
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { LogIn, Mail, Lock, User as UserIcon, ArrowLeft, Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Logo from './Logo';
import Splash from './Splash';

import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

export type UserRole = 'ADMIN' | 'USER';

interface AuthContextType {
  user: User | null;
  role: UserRole;
  isAdmin: boolean;
  isCreator: boolean;
  approved: boolean;
  loading: boolean;
  signIn: (useRedirect?: boolean) => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const MASTER_ADMIN_EMAILS = [
  'ramonbelem1@gmail.com',
  'ramoncxavier88@gmail.com',
  'ramoncarvalhoxavier@hotmail.com'
];

export function isMasterAdmin(u: User | null): boolean {
  if (!u) return false;
  const emails = [
    u.email,
    ...(u.providerData?.map(p => p.email) || [])
  ].filter(Boolean).map(e => e!.trim().toLowerCase());

  const names = [
    u.displayName,
    ...(u.providerData?.map(p => p.displayName) || [])
  ].filter(Boolean).map(n => n!.trim().toLowerCase());

  if (emails.some(em => 
    em === 'ramonbelem1@gmail.com' ||
    em === 'ramoncxavier88@gmail.com' ||
    em === 'ramoncarvalhoxavier@hotmail.com' ||
    em.includes('ramonbelem') ||
    em.includes('ramoncxavier') ||
    em.includes('ramoncarvalho') ||
    em.includes('ramon') ||
    em.includes('xavier88')
  )) {
    return true;
  }

  if (names.some(n => 
    n === 'ramon' ||
    n.includes('ramon') ||
    n.includes('xavier')
  )) {
    return true;
  }

  return false;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>('USER');
  const [approved, setApproved] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  const [authError, setAuthError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isEmailMode, setIsEmailMode] = useState<boolean>(false);
  const [isRegisterMode, setIsRegisterMode] = useState<boolean>(false);
  const [isResetMode, setIsResetMode] = useState<boolean>(false);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    // Verificar resultado de redirecionamento (caso o usuário tenha usado esse método no mobile)
    getRedirectResult(auth).then((result) => {
      if (result?.user) {
        setUser(result.user);
      }
    }).catch((error: any) => {
      console.error("Erro no retorno do redirecionamento:", error);
      if (error.code === 'auth/unauthorized-domain') {
        const domain = window.location.hostname;
        setAuthError(`Domínio não autorizado: "${domain}". Adicione-o no Console do Firebase.`);
      } else {
        setAuthError("Erro ao processar login por redirecionamento.");
      }
    });

    let unsubRoleListener: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (unsubRoleListener) {
        unsubRoleListener();
        unsubRoleListener = null;
      }

      if (!u) {
        setUser(null);
        setRole('USER');
        setApproved(false);
        setLoading(false);
        return;
      }

      setAuthError(null);
      setUser(u);

      const isMainAdmin = isMasterAdmin(u);

      if (isMainAdmin) {
        setRole('ADMIN');
        setApproved(true);
      }

      // 1. Ouvir em tempo real as permissões (user_roles) do usuário
      const roleRef = doc(db, 'user_roles', u.uid);
      
      unsubRoleListener = onSnapshot(roleRef, async (roleSnap) => {
        try {
          // Buscar configuração de aprovação automática
          let isAutoApprove = true;
          try {
            const groupDoc = await getDoc(doc(db, 'groups', 'main'));
            if (groupDoc.exists()) {
              const gData = groupDoc.data();
              if (gData.autoApprove !== undefined) {
                isAutoApprove = gData.autoApprove === true;
              }
            }
          } catch (e) {
            console.warn("[AuthProvider] Aviso ao verificar autoApprove:", e);
          }

          if (roleSnap.exists()) {
            const data = roleSnap.data();
            let assignedRole: UserRole = (data.role as UserRole) || 'USER';
            let isApproved = data.approved === true;

            if (isMainAdmin) {
              assignedRole = 'ADMIN';
              isApproved = true;
              if (data.role !== 'ADMIN' || data.approved !== true) {
                await setDoc(roleRef, { role: 'ADMIN', approved: true, email: u.email || '' }, { merge: true }).catch(() => {});
              }
            } else if (!isApproved && isAutoApprove) {
              // Se aprovação automática está ligada, auto-aprova e libera o acesso direto
              isApproved = true;
              await setDoc(roleRef, { approved: true }, { merge: true }).catch(() => {});
            }

            setRole(assignedRole);
            setApproved(isApproved);
          } else {
            // Documento de role ainda não existe, cria inicial
            let isApproved = isAutoApprove;
            let assignedRole: UserRole = 'USER';

            if (isMainAdmin) {
              assignedRole = 'ADMIN';
              isApproved = true;
            }

            const initialRoleData = {
              role: assignedRole,
              approved: isApproved,
              email: u.email || '',
              name: (u.displayName || name || u.email?.split('@')[0] || 'Jogador').substring(0, 15),
              displayName: (u.displayName || name || u.email?.split('@')[0] || 'Jogador').substring(0, 15),
              fullName: u.displayName || name || u.email?.split('@')[0] || 'Jogador',
              createdAt: new Date().toISOString()
            };

            await setDoc(roleRef, initialRoleData, { merge: true }).catch((err) => {
              console.warn("[AuthProvider] Não foi possível criar user_roles:", err);
            });

            setRole(assignedRole);
            setApproved(isApproved);
          }
        } catch (err) {
          console.warn("[AuthProvider] Erro ao processar snapshot de role:", err);
          if (isMainAdmin) {
            setRole('ADMIN');
            setApproved(true);
          }
        } finally {
          setLoading(false);
        }
      }, (error) => {
        console.warn("[AuthProvider] Erro no listener de user_roles:", error);
        if (isMainAdmin) {
          setRole('ADMIN');
          setApproved(true);
        }
        setLoading(false);
      });

      // 2. Garantir sincronização segura com a coleção 'players' em segundo plano (sem travar login)
      (async () => {
        try {
          const playerRef = doc(db, 'players', u.uid);
          const playerDoc = await getDoc(playerRef).catch(() => null);

          if (!playerDoc || !playerDoc.exists()) {
            let existingData: any = null;
            let oldId: string | null = null;

            if (u.email) {
              try {
                const { getDocs, query, collection, where } = await import('firebase/firestore');
                const emailQuery = query(collection(db, 'players'), where('email', '==', u.email));
                const emailSnap = await getDocs(emailQuery);
                if (!emailSnap.empty) {
                  const docToMigrate = emailSnap.docs[0];
                  existingData = docToMigrate.data();
                  oldId = docToMigrate.id;
                }
              } catch (qErr) {
                console.warn("[AuthProvider] Não foi possível buscar jogador pré-existente por e-mail:", qErr);
              }
            }

            const cleanDisplayName = ((existingData?.displayName || existingData?.name || u.displayName || name || u.email?.split('@')[0] || 'Jogador') as string).substring(0, 15);
            const cleanFullName = (existingData?.fullName || existingData?.name || u.displayName || name || u.email?.split('@')[0] || 'Jogador') as string;

            const playerData = {
              name: cleanDisplayName,
              displayName: cleanDisplayName,
              fullName: cleanFullName,
              email: u.email || '',
              photoUrl: existingData?.photoUrl || u.photoURL || '',
              level: existingData?.level || 3,
              position: existingData?.position || 'MEIA',
              secondaryPosition: existingData?.secondaryPosition || 'NENHUMA',
              type: existingData?.type || 'DIARISTA',
              balance: existingData?.balance || 0,
              active: existingData?.active !== undefined ? existingData.active : true,
              gols: existingData?.gols || 0,
              assistencias: existingData?.assistencias || 0,
              vitorias: existingData?.vitorias || 0,
              derrotas: existingData?.derrotas || 0,
              empates: existingData?.empates || 0,
              profileCompleted: existingData?.profileCompleted !== undefined ? existingData.profileCompleted : false,
              ...(existingData || {})
            };

            await setDoc(playerRef, playerData, { merge: true }).catch((setErr) => {
              console.warn("[AuthProvider] Não foi possível salvar dados em players:", setErr);
            });

            if (oldId && oldId !== u.uid) {
              try {
                const { deleteDoc } = await import('firebase/firestore');
                await deleteDoc(doc(db, 'players', oldId));
              } catch (delErr) {
                console.warn("[AuthProvider] Documento legado mantido (exclusão restrita):", delErr);
              }
            }
          }
        } catch (playerSyncErr) {
          console.warn("[AuthProvider] Sincronização secundária de jogador finalizada com aviso:", playerSyncErr);
        }
      })();
    });

    return () => {
      unsubAuth();
      if (unsubRoleListener) unsubRoleListener();
    };
  }, [name]);

  const signIn = async (useRedirect = false) => {
    setAuthError(null);
    setSuccessMsg(null);
    setAuthLoading(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    provider.addScope('email');
    provider.addScope('profile');
    
    try {
      if (useRedirect) {
        await signInWithRedirect(auth, provider);
      } else {
        try {
          await signInWithPopup(auth, provider);
        } catch (popupError: any) {
          console.warn("[AuthProvider] Erro no popup do Google Auth:", popupError);
          if (
            popupError.code === 'auth/popup-blocked' || 
            popupError.code === 'auth/cancelled-popup-request' ||
            popupError.code === 'auth/network-request-failed'
          ) {
            console.log("[AuthProvider] Tentando login alternativo por redirecionamento...");
            try {
              await signInWithRedirect(auth, provider);
              return;
            } catch (redirErr) {
              console.error("[AuthProvider] Erro também no redirecionamento:", redirErr);
              throw popupError;
            }
          } else if (popupError.code === 'auth/popup-closed-by-user') {
            console.log("[AuthProvider] Seleção de conta cancelada pelo usuário.");
            return;
          } else {
            throw popupError;
          }
        }
      }
    } catch (error: any) {
      console.error("Firebase Auth Error:", error);
      let message = "Erro ao entrar. Tente novamente.";
      
      if (error.code === 'auth/popup-closed-by-user') {
        message = "O pop-up foi fechado antes de escolher a conta.";
      } else if (error.code === 'auth/unauthorized-domain') {
        const domain = window.location.hostname;
        message = `Domínio não autorizado: "${domain}". Adicione-o no Console do Firebase (Authentication > Settings > Authorized Domains).`;
      } else if (error.code === 'auth/operation-not-allowed') {
        message = "O login com Google não está ativado no Console do Firebase (Authentication > Sign-in method).";
      } else if (error.code === 'auth/network-request-failed') {
        message = "Falha de conexão com os servidores do Google. Verifique sua internet ou tente entrar por e-mail e senha abaixo.";
      } else if (error.code === 'auth/popup-blocked') {
        message = "O navegador bloqueou a janela pop-up do Google. Permita pop-ups ou entre por e-mail/senha.";
      } else {
        message = error.message || message;
      }
      
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const signInWithEmail = async (e: string, p: string) => {
    setAuthLoading(true);
    setAuthError(null);
    setSuccessMsg(null);
    try {
      await signInWithEmailAndPassword(auth, e, p);
    } catch (error: any) {
      console.error("Login Error:", error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setAuthError("E-mail ou senha incorretos.");
      } else {
        setAuthError("Erro ao tentar entrar. Verifique sua conexão.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const signUpWithEmail = async (e: string, p: string, n: string) => {
    if (!n) {
      setAuthError("Por favor, insira seu nome completo.");
      return;
    }
    if (password !== confirmPassword) {
      setAuthError("As senhas não coincidem.");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    setSuccessMsg(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, e, p);
      await updateProfile(userCredential.user, { displayName: n });
      setName(n); // For onAuthStateChanged
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        try {
          // Se o e-mail já está em uso, tenta realizar o login automático.
          // Isso é comum se o teste rodar novamente com os mesmos dados.
          await signInWithEmailAndPassword(auth, e, p);
          console.log("[AuthProvider] Automatic login for already-in-use email succeeded.");
          return;
        } catch (loginError: any) {
          console.error("Register Error (Email in use):", error);
          setAuthError("Este e-mail já está sendo usado.");
        }
      } else {
        console.error("Register Error:", error);
        if (error.code === 'auth/weak-password') {
          setAuthError("A senha deve ter pelo menos 6 caracteres.");
        } else {
          setAuthError("Erro ao criar conta. Tente novamente mais tarde.");
        }
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const resetPassword = async (e: string) => {
    if (!e) {
      setAuthError("Por favor, insira o e-mail para recuperação.");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    setSuccessMsg(null);
    try {
      await sendPasswordResetEmail(auth, e);
      setSuccessMsg("Link de recuperação enviado para o seu e-mail.");
      setIsResetMode(false);
    } catch (error: any) {
      console.error("Reset Error:", error);
      if (error.code === 'auth/user-not-found') {
        setAuthError("Este e-mail não está cadastrado.");
      } else if (error.code === 'auth/invalid-email') {
        setAuthError("E-mail inválido.");
      } else {
        setAuthError("Erro ao enviar link. Tente novamente mais tarde.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  if (loading) {
    return <Splash />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-bg relative flex items-center justify-center p-4 overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full" />

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-card border border-border/50 rounded-[3rem] p-10 shadow-2xl relative z-10"
        >
          <div className="text-center mb-10">
            <Logo size="lg" vertical className="scale-110 mb-6 drop-shadow-2xl" />
            <div className="h-px w-10 bg-primary/20 mx-auto mb-6" />
            <p className="text-gray-400 text-sm leading-relaxed max-w-[240px] mx-auto font-medium">
              Gestão profissional para a elite da sua pelada.
            </p>
          </div>
          
          <AnimatePresence mode="wait">
            {!isEmailMode ? (
              <motion.div
                key="social"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-4"
              >
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => signIn(false)}
                  className="w-full py-3.5 bg-white text-bg rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center space-x-3 shadow-lg hover:shadow-white/10 transition-all active:scale-95"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
                  <span>Entrar com Google</span>
                </motion.button>

                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setIsEmailMode(true)}
                  className="w-full py-3.5 bg-primary text-bg rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center space-x-3 shadow-lg shadow-primary/10 transition-all active:scale-95"
                >
                  <Mail size={18} />
                  <span>Entrar com Email e Senha</span>
                </motion.button>
              </motion.div>
            ) : isResetMode ? (
              <motion.div
                key="reset"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-4"
              >
                <button 
                  onClick={() => { setIsResetMode(false); setAuthError(null); }}
                  className="flex items-center space-x-2 text-gray-400 hover:text-primary transition-colors text-[10px] font-bold uppercase tracking-widest mb-4"
                >
                  <ArrowLeft size={14} />
                  <span>Voltar para Login</span>
                </button>

                <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-2">
                  Recuperar Senha
                </h3>
                <p className="text-[11px] text-gray-500 font-bold uppercase tracking-widest mb-6">
                  Enviaremos um link de recuperação
                </p>

                <div className="space-y-1">
                  <div className="flex bg-bg border border-border rounded-2xl px-4 py-3 items-center space-x-3 focus-within:border-primary transition-colors">
                    <Mail size={18} className="text-gray-500" />
                    <input 
                      type="email"
                      placeholder="seu@email.com"
                      className="bg-transparent border-none outline-none text-sm w-full text-white"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={authLoading}
                  onClick={() => resetPassword(email)}
                  className="w-full py-3.5 bg-primary text-bg rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {authLoading && <Loader2 className="animate-spin" size={18} />}
                  <span>Enviar Link</span>
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="email"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <button 
                  onClick={() => { 
                    setIsEmailMode(false); 
                    setIsRegisterMode(false);
                    setAuthError(null); 
                    setSuccessMsg(null);
                  }}
                  className="flex items-center space-x-2 text-gray-400 hover:text-primary transition-colors text-[10px] font-bold uppercase tracking-widest mb-4"
                >
                  <ArrowLeft size={14} />
                  <span>Voltar</span>
                </button>

                <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-6">
                  {isRegisterMode ? 'Criar Conta' : 'Acesse seu Perfil'}
                </h3>

                {isRegisterMode && (
                  <div className="space-y-1">
                    <div className="flex bg-bg border border-border rounded-2xl px-4 py-3 items-center space-x-3 focus-within:border-primary transition-colors">
                      <UserIcon size={18} className="text-gray-500" />
                      <input 
                        type="text"
                        placeholder="Nome Completo"
                        className="bg-transparent border-none outline-none text-sm w-full text-white"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex bg-bg border border-border rounded-2xl px-4 py-3 items-center space-x-3 focus-within:border-primary transition-colors">
                    <Mail size={18} className="text-gray-500" />
                    <input 
                      type="email"
                      placeholder="seu@email.com"
                      className="bg-transparent border-none outline-none text-sm w-full text-white"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex bg-bg border border-border rounded-2xl px-4 py-3 items-center space-x-3 focus-within:border-primary transition-colors">
                    <Lock size={18} className="text-gray-500" />
                    <input 
                      type={showPassword ? "text" : "password"}
                      placeholder="Sua senha"
                      className="bg-transparent border-none outline-none text-sm w-full text-white"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button 
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-gray-500 hover:text-primary transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {isRegisterMode && (
                  <div className="space-y-1">
                    <div className="flex bg-bg border border-border rounded-2xl px-4 py-3 items-center space-x-3 focus-within:border-primary transition-colors">
                      <Lock size={18} className="text-gray-500" />
                      <input 
                        type={showPassword ? "text" : "password"}
                        placeholder="Confirme sua senha"
                        className="bg-transparent border-none outline-none text-sm w-full text-white"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {!isRegisterMode && (
                  <div className="flex justify-end">
                    <button 
                      onClick={() => { setIsResetMode(true); setAuthError(null); }}
                      className="text-[10px] text-primary/70 font-bold uppercase tracking-widest hover:text-primary transition-colors"
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={authLoading}
                  onClick={() => isRegisterMode ? signUpWithEmail(email, password, name) : signInWithEmail(email, password)}
                  className="w-full py-3.5 bg-primary text-bg rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {authLoading && <Loader2 className="animate-spin" size={18} />}
                  <span>{isRegisterMode ? 'Cadastrar Atleta' : 'Entrar na Pelada'}</span>
                </motion.button>

                <button 
                  onClick={() => { setIsRegisterMode(!isRegisterMode); setAuthError(null); setSuccessMsg(null); }}
                  className="w-full text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] hover:text-white transition-colors"
                >
                  {isRegisterMode ? 'Já tenho uma conta. Entrar.' : 'Não tenho conta. Criar agora.'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {authError && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-6 p-4 bg-danger/10 border border-danger/20 rounded-2xl text-danger text-[11px] font-bold text-center"
            >
              {authError}
            </motion.div>
          )}

          {successMsg && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-6 p-4 bg-success/10 border border-success/20 rounded-2xl text-success text-[11px] font-bold text-center flex items-center justify-center space-x-2"
            >
              <CheckCircle2 size={14} />
              <span>{successMsg}</span>
            </motion.div>
          )}
          
          <div className="mt-12 flex flex-col items-center">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-primary/20" />
              <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
              <div className="w-1.5 h-1.5 rounded-full bg-primary/20" />
            </div>
            <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.3em]">
              Boleiros PRO © 2026
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!approved) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-primary/20">
          <motion.div 
            className="h-full bg-primary"
            animate={{ scaleX: [0, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-sm w-full space-y-8 bg-card p-10 rounded-[3rem] border border-border/50 shadow-2xl relative z-10"
        >
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-primary/20">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
          
          <div className="space-y-4">
            <h2 className="text-2xl font-black text-white uppercase tracking-tight italic">
              Olá, {user?.displayName?.split(' ')[0] || 'Atleta'}!
            </h2>
            <div className="h-px w-8 bg-primary/30 mx-auto" />
            <h3 className="text-lg font-bold text-primary uppercase tracking-widest">Aguardando Aprovação</h3>
            <p className="text-gray-400 text-sm leading-relaxed font-medium">
              Seu cadastro foi recebido! Por questões de segurança e organização, o acesso ao app é restrito a membros autorizados.
            </p>
          </div>

          <div className="p-5 bg-primary/5 rounded-[2rem] border border-primary/10 space-y-2">
            <p className="text-[10px] text-primary font-black uppercase tracking-[0.2em]">
              Status: Pendente
            </p>
            <p className="text-[11px] text-gray-500 font-bold leading-tight">
              Um administrador revisará sua solicitação em breve. Assim que for aprovado, você terá acesso total.
            </p>
          </div>

          <div className="pt-4">
            <button 
              onClick={logout}
              className="px-8 py-3 bg-white/5 border border-border rounded-2xl text-[10px] text-gray-500 font-black uppercase tracking-widest hover:text-white hover:bg-white/10 transition-all active:scale-95"
            >
              Sair da Conta
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const isCreator = isMasterAdmin(user);
  const isAdmin = role === 'ADMIN' || isCreator;

  return (
    <AuthContext.Provider value={{ 
      user, 
      role: isCreator ? 'ADMIN' : role, 
      isAdmin, 
      isCreator, 
      approved: isCreator ? true : approved, 
      loading, 
      signIn, 
      signInWithEmail, 
      signUpWithEmail, 
      resetPassword, 
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
