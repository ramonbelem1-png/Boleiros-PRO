import { Trophy } from 'lucide-react';
import { motion } from 'motion/react';

export default function Logo({ 
  className = '', 
  size = 'md',
  vertical = false
}: { 
  className?: string;
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

  const iconSizeValue = {
    sm: 18,
    md: 22,
    lg: 32
  }[size];

  return (
    <div className={`flex group ${vertical ? 'flex-col space-y-3 items-center text-center' : 'items-center space-x-3'} ${className}`}>
      <div className={`${iconSizes[size]} relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-600 shadow-lg shadow-amber-500/20 overflow-hidden`}>
        <Trophy size={size === 'lg' ? 36 : iconSizeValue} className="text-bg relative z-10 drop-shadow-sm transition-transform group-hover:scale-110 duration-300" />
        
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

      <div className="flex flex-col -space-y-1">
        <span className={`font-black italic tracking-tighter ${textSizes[size]} text-white leading-none`}>
          BOLEIROS
        </span>
        <span className={`font-black italic tracking-tighter ${textSizes[size]} text-transparent bg-clip-text bg-gradient-to-br from-yellow-400 to-amber-500 leading-none`}>
          PRO
        </span>
      </div>
    </div>
  );
}
