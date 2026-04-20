import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User 
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { LogIn } from 'lucide-react';
import { motion } from 'motion/react';

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

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (u) {
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
        
        setRole(assignedRole);
        setUser(u);
      } else {
        setUser(null);
        setRole('USER');
      }
      setLoading(false);
    });

    return () => unsubAuth();
  }, []);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
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
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6 text-center">
        <div className="mb-12 space-y-4">
          <div className="w-24 h-24 bg-card border border-border rounded-[40px] mx-auto flex items-center justify-center shadow-2xl">
            <LogIn size={40} className="text-primary" />
          </div>
          <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase">
            Boleiros <span className="text-primary truncate">PRO</span>
          </h1>
          <p className="text-gray-400 max-w-[280px] mx-auto text-sm">
            Gestão profissional para sua pelada. Presença, financeiro e estatísticas.
          </p>
        </div>
        
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={signIn}
          className="w-full max-w-xs py-5 bg-white text-bg rounded-3xl font-black uppercase tracking-widest flex items-center justify-center space-x-3 shadow-xl shadow-white/5"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
          <span>Entrar com Google</span>
        </motion.button>
        
        <p className="mt-8 text-[10px] text-gray-600 font-bold uppercase tracking-[0.2em]">
          Powered by AI Studio
        </p>
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
