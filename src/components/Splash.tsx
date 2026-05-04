import React from 'react';
import { Trophy } from 'lucide-react';
import { motion } from 'motion/react';

export default function Splash() {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-primary/5 blur-[120px] rounded-full" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 flex flex-col items-center"
      >
        <div className="w-48 h-48 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center shadow-2xl shadow-amber-500/20 mb-12">
          <Trophy size={100} className="text-bg drop-shadow-lg" />
        </div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="absolute bottom-16 left-0 right-0 text-center z-10"
      >
        <span className="text-2xl font-black italic tracking-tighter text-white">
          BOLEIROS
        </span>
        <span className="text-2xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-yellow-400 to-amber-500 ml-2">
          PRO
        </span>
      </motion.div>

      {/* Loading Bar */}
      <div className="absolute bottom-0 left-0 w-full h-1 bg-white/5 overflow-hidden">
        <motion.div 
          className="h-full bg-primary"
          animate={{ x: ['-100%', '100%'] }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        />
      </div>
    </div>
  );
}
