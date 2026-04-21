import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  signOut,
  User,
  browserPopupRedirectResolver
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { LogIn } from 'lucide-react';
import { motion } from 'motion/react';
import Logo from './Logo';

import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

export type UserRole = 'ADMIN' | 'USER';

interface AuthContextType {
  user: User | null;
  role: UserRole;
  loading: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>('USER');
  const [loading, setLoading] = useState(true);

  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Verificar resultado de redirecionamento (caso o usuário tenha usado esse método)
    getRedirectResult(auth).catch((error: any) => {
      console.error("Erro no retorno do redirecionamento:", error);
      if (error.code === 'auth/unauthorized-domain') {
        const domain = window.location.hostname;
        setAuthError(`Domínio não autorizado: "${domain}". Adicione-o no Console do Firebase.`);
      } else {
        setAuthError("Erro ao processar login por redirecionamento.");
      }
    });

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      try {
        if (u) {
          setAuthError(null);
          // Obter papel do usuário
          const roleDoc = await getDoc(doc(db, 'user_roles', u.uid));
          let assignedRole: UserRole = 'USER';

          if (roleDoc.exists()) {
            assignedRole = roleDoc.data().role as UserRole;
            
            // Garantir que o email solicitado seja ADMIN
            if (u.email === 'ramonbelem1@gmail.com' && assignedRole !== 'ADMIN') {
              assignedRole = 'ADMIN';
              await setDoc(doc(db, 'user_roles', u.uid), { role: 'ADMIN' }, { merge: true });
            }
          } else {
            // Se não houver configurações, o primeiro a logar vira admin (bootstrap)
            const firstUserCheck = await getDoc(doc(db, 'groups', 'main'));
            
            if (!firstUserCheck.exists() || u.email === 'ramonbelem1@gmail.com') {
              assignedRole = 'ADMIN';
            }
            
            await setDoc(doc(db, 'user_roles', u.uid), { 
              role: assignedRole,
              email: u.email,
              name: u.displayName
            });
          }

          // Garantir que o usuário exista na coleção 'players' para poder marcar presença
          const playerRef = doc(db, 'players', u.uid);
          const playerDoc = await getDoc(playerRef);
          
          if (!playerDoc.exists()) {
            // Se não existir pelo UID, tenta buscar por email (caso um admin tenha criado manualmente)
            const { getDocs, query, collection, where, deleteDoc } = await import('firebase/firestore');
            const emailQuery = query(collection(db, 'players'), where('email', '==', u.email));
            const emailSnap = await getDocs(emailQuery);

            if (!emailSnap.empty) {
              const docToMigrate = emailSnap.docs[0];
              const existingData = docToMigrate.data();
              const oldId = docToMigrate.id;
              console.log(`[AuthProvider] Migrando jogador do email ${u.email} (ID antigo: ${oldId}) para o UID: ${u.uid}`);

              await setDoc(playerRef, {
                level: 3,
                position: 'MEIA',
                secondaryPosition: 'NENHUMA',
                type: 'DIARISTA',
                balance: 0,
                active: true,
                gols: 0,
                assistencias: 0,
                vitorias: 0,
                derrotas: 0,
                empates: 0,
                ...existingData,
                name: existingData.name || u.displayName || u.email?.split('@')[0] || 'Jogador',
                photoUrl: existingData.photoUrl || u.photoURL || '',
                email: u.email
              });

              if (oldId !== u.uid) {
                console.log(`[AuthProvider] Deletando documento antigo: ${oldId}`);
                await deleteDoc(doc(db, 'players', oldId));
              }
              console.log(`[AuthProvider] Migração concluída com sucesso!`);
            } else {
              await setDoc(playerRef, {
                name: u.displayName || u.email?.split('@')[0] || 'Jogador',
                email: u.email,
                photoUrl: u.photoURL || '',
                level: 3,
                position: 'MEIA',
                secondaryPosition: 'NENHUMA',
                type: 'DIARISTA',
                balance: 0,
                active: true,
                gols: 0,
                assistencias: 0,
                vitorias: 0,
                derrotas: 0,
                empates: 0
              });
            }
          }
          
          setRole(assignedRole);
          setUser(u);
        } else {
          setUser(null);
          setRole('USER');
        }
      } catch (err: any) {
        console.error("Erro na autenticação:", err);
        setAuthError("Erro de conexão com o banco de dados.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubAuth();
  }, []);

  const signIn = async (useRedirect = false) => {
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    try {
      if (useRedirect) {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider, browserPopupRedirectResolver);
      }
    } catch (error: any) {
      console.error("Firebase Auth Error:", error);
      let message = "Erro ao entrar. Tente novamente.";
      
      if (error.code === 'auth/popup-closed-by-user') {
        message = "O pop-up foi fechado antes de completar o login.";
      } else if (error.code === 'auth/unauthorized-domain') {
        const domain = window.location.hostname;
        message = `Domínio não autorizado: "${domain}". Você deve adicioná-lo no Console do Firebase (Authentication > Settings > Authorized Domains).`;
      } else if (error.code === 'auth/operation-not-allowed') {
        message = "O login com Google não está ativado no Console do Firebase (Authentication > Sign-in method).";
      } else {
        message = error.message || message;
      }
      
      setAuthError(message);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
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
          
          <div className="space-y-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => signIn(false)}
              className="w-full py-5 bg-white text-bg rounded-2xl font-black uppercase tracking-widest flex items-center justify-center space-x-3 shadow-lg hover:shadow-white/10 transition-all active:scale-95"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
              <span>Entrar com Google</span>
            </motion.button>

            <button 
              onClick={() => signIn(true)}
              className="w-full py-3 text-[10px] text-gray-400 font-bold uppercase tracking-widest hover:text-primary transition-colors flex items-center justify-center space-x-2"
            >
              <span>Problemas com o pop-up?</span>
              <span className="underline decoration-primary/30 underline-offset-4">Tente por aqui</span>
            </button>

            {authError && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 bg-danger/10 border border-danger/20 rounded-2xl text-danger text-[11px] font-bold text-center"
              >
                {authError}
              </motion.div>
            )}
          </div>
          
          <div className="mt-12 flex flex-col items-center">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-primary/20" />
              <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
              <div className="w-1.5 h-1.5 rounded-full bg-primary/20" />
            </div>
            <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.3em]">
              Boleiros PRO © 2024
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, signIn, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
