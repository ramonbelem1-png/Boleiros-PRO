import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowDown, Loader2 } from 'lucide-react';

interface PullToRefreshProps {
  children: React.ReactNode;
}

export default function PullToRefresh({ children }: PullToRefreshProps) {
  const [pullOffset, setPullOffset] = useState(0);
  const [status, setStatus] = useState<'idle' | 'pulling' | 'ready' | 'refreshing'>('idle');
  const startRef = useRef({ y: 0, x: 0 });
  const isAtTopRef = useRef(false);
  const isDraggingRef = useRef(false);
  const touchActiveRef = useRef(false);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      // Check if scroll is at top
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      if (scrollY <= 5) {
        isAtTopRef.current = true;
        startRef.current = { 
          y: e.touches[0].clientY,
          x: e.touches[0].clientX
        };
        touchActiveRef.current = true;
      } else {
        isAtTopRef.current = false;
        touchActiveRef.current = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isAtTopRef.current || !touchActiveRef.current) return;

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const diffY = currentY - startRef.current.y;
      const diffX = currentX - startRef.current.x;

      // Ensure vertical swipe (ignore diagonal/horizontal swipes)
      if (Math.abs(diffX) > Math.abs(diffY) && pullOffset === 0) {
        touchActiveRef.current = false;
        return;
      }

      if (diffY > 0) {
        // Prevent default scrolling down when pulling at top
        if (e.cancelable) {
          e.preventDefault();
        }
        
        // Logarithmic resistance
        const resistance = 0.45;
        const offset = Math.min(120, diffY * resistance);
        setPullOffset(offset);

        if (offset >= 75) {
          setStatus('ready');
        } else {
          setStatus('pulling');
        }
      } else if (pullOffset > 0) {
        setPullOffset(0);
        setStatus('idle');
      }
    };

    const handleTouchEnd = () => {
      touchActiveRef.current = false;
      if (!isAtTopRef.current) return;

      if (status === 'ready' || pullOffset >= 75) {
        triggerRefresh();
      } else {
        resetPull();
      }
    };

    // POINTER EVENTS for desktop mouse dragging
    const handlePointerDown = (e: PointerEvent) => {
      // Only handle drag with left-button / primary pointer
      if (e.button !== 0) return;
      
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      if (scrollY <= 5) {
        isAtTopRef.current = true;
        startRef.current = { y: e.clientY, x: e.clientX };
        isDraggingRef.current = true;
      } else {
        isAtTopRef.current = false;
        isDraggingRef.current = false;
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isAtTopRef.current || !isDraggingRef.current) return;

      const currentY = e.clientY;
      const currentX = e.clientX;
      const diffY = currentY - startRef.current.y;
      const diffX = currentX - startRef.current.x;

      // Minimum vertical drag threshold to begin pull-to-refresh
      if (diffY < 15 && pullOffset === 0) return;

      if (Math.abs(diffX) > Math.abs(diffY) && pullOffset === 0) {
        isDraggingRef.current = false;
        return;
      }

      if (diffY > 0) {
        const resistance = 0.45;
        const offset = Math.min(120, diffY * resistance);
        setPullOffset(offset);

        if (offset >= 75) {
          setStatus('ready');
        } else {
          setStatus('pulling');
        }
      } else if (pullOffset > 0) {
        setPullOffset(0);
        setStatus('idle');
      }
    };

    const handlePointerUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      if (status === 'ready' || pullOffset >= 75) {
        triggerRefresh();
      } else {
        resetPull();
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);

      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [status, pullOffset]);

  const triggerRefresh = () => {
    setStatus('refreshing');
    setPullOffset(75);
    
    // Simulate real web browser page refresh by reloading window
    setTimeout(() => {
      window.location.reload();
    }, 850);
  };

  const resetPull = () => {
    setPullOffset(0);
    setStatus('idle');
  };

  return (
    <>
      {/* Pull To Refresh Indicator */}
      <AnimatePresence>
        {(pullOffset > 0 || status === 'refreshing') && (
          <motion.div
            initial={{ opacity: 0, y: -45 }}
            animate={{ 
              opacity: 1, 
              y: pullOffset - 35, // Position cleanly above content
            }}
            exit={{ opacity: 0, y: -45 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            className="fixed top-0 left-0 right-0 z-[100] flex justify-center pointer-events-none"
          >
            <div className="bg-zinc-900/95 border border-white/10 rounded-full py-2 px-3.5 shadow-2xl flex items-center space-x-2.5 backdrop-blur-md">
              <div className="relative w-5 h-5 flex items-center justify-center">
                {status === 'refreshing' ? (
                  <Loader2 className="animate-spin text-primary w-4 h-4" />
                ) : (
                  <motion.div
                    animate={{ rotate: Math.min(360, (pullOffset / 75) * 180) }}
                    transition={{ type: 'spring', damping: 15 }}
                    className="flex items-center justify-center"
                  >
                    <ArrowDown className={`w-4 h-4 ${status === 'ready' ? 'text-primary' : 'text-gray-400'}`} />
                  </motion.div>
                )}
              </div>
              <span className="text-[10px] uppercase font-black tracking-widest text-zinc-300">
                {status === 'refreshing' && 'Atualizando...'}
                {status === 'ready' && 'Solte para atualizar'}
                {status === 'pulling' && 'Puxe para atualizar'}
                {status === 'idle' && 'Puxe para atualizar'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Elastic shifting wrapper container */}
      <motion.div
        animate={{ 
          y: status === 'refreshing' ? 50 : pullOffset / 2.2
        }}
        transition={{ type: 'spring', damping: 26, stiffness: 180 }}
        className="w-full flex-1 flex flex-col min-h-full origin-top"
      >
        {children}
      </motion.div>
    </>
  );
}
