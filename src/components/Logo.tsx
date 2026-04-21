import React from 'react';
import { Trophy, Circle, Map as Pitch, Layout as Goal } from 'lucide-react';
import { motion } from 'motion/react';

export type LogoVariant = 'classic-ball' | 'modern-pitch' | 'winner-cup';

export default function Logo({ 
  className = '', 
  variant = 'winner-cup',
  size = 'md',
  vertical = false
}: { 
  className?: string;
  variant?: LogoVariant;
  size?: 'sm' | 'md' | 'lg';
  vertical?: boolean;
}) {
  const iconSizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-16 h-16'
  };

  const textSizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-3xl'
  };

  const renderIcon = () => {
    const iconSize = {
      sm: 18,
      md: 22,
      lg: 32
    }[size];

    switch (variant) {
      case 'classic-ball':
        return (
          <div className="relative">
            <div className={`${iconSizes[size]} bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/20 relative overflow-hidden group`}>
              <Circle size={iconSize} className="text-bg fill-bg" />
              {/* Ball pattern approximation */}
              <div className="absolute inset-0 border-[3px] border-white/20 rounded-full scale-75 rotate-45" />
              <div className="absolute inset-0 border-[3px] border-white/20 rounded-full scale-75 -rotate-45" />
              <div className="absolute w-2 h-2 bg-white/40 rounded-full top-2 left-2" />
            </div>
            <motion.div 
              animate={{ x: [0, 10, 0], opacity: [0, 1, 0] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="absolute -right-2 top-1/2 -translate-y-1/2 flex space-x-1"
            >
              <div className="w-1 h-3 bg-primary/30 rounded-full transform -skew-x-12" />
              <div className="w-1 h-2 bg-primary/20 rounded-full transform -skew-x-12" />
            </motion.div>
          </div>
        );
      
      case 'modern-pitch':
        return (
          <div className={`${iconSizes[size]} bg-emerald-600 rounded-lg flex items-center justify-center border-2 border-white/30 relative overflow-hidden`}>
            <Goal size={size === 'lg' ? 40 : 28} className="text-white/90" />
            <div className="absolute bottom-0 w-full h-1/2 border-t border-white/30" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-1/2 h-1/2 border border-white/20 rounded-full" />
            </div>
          </div>
        );

      case 'winner-cup':
        return (
          <div className={`${iconSizes[size]} relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-600 shadow-lg shadow-amber-500/20 overflow-hidden`}>
            <Trophy size={size === 'lg' ? 36 : 24} className="text-bg relative z-10 drop-shadow-sm transition-transform group-hover:scale-110 duration-300" />
            
            {/* Brilho Pulsante no Hover */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              <div className="absolute inset-0 bg-white/30 animate-pulse" />
              <motion.div 
                animate={{ 
                  x: ['-100%', '200%'],
                }}
                transition={{ 
                  repeat: Infinity, 
                  duration: 1.2,
                  ease: "easeInOut"
                }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent -skew-x-20" 
              />
            </div>

            <div className="absolute -top-1 -right-1 z-20">
              <div className="w-3 h-3 bg-white rounded-full animate-ping opacity-75" />
            </div>
          </div>
        );
    }
  };

  return (
    <div className={`flex group ${vertical ? 'flex-col space-y-3 items-center text-center' : 'items-center space-x-3'} ${className}`}>
      {renderIcon()}
      <div className={`flex flex-col ${vertical ? '-space-y-1' : '-space-y-1'}`}>
        <span className={`font-black italic tracking-tighter ${textSizes[size]} text-white leading-none`}>
          BOLEIROS
        </span>
        <span className={`font-black italic tracking-tighter ${textSizes[size]} text-primary leading-none`}>
          PRO
        </span>
      </div>
    </div>
  );
}
