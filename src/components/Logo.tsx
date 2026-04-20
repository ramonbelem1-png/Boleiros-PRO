import React from 'react';
import { Trophy } from 'lucide-react';

export default function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className="bg-primary p-1.5 rounded-lg">
        <Trophy size={20} className="text-bg" />
      </div>
      <span className="font-black italic tracking-tighter text-xl text-white">BOLEIROS <span className="text-primary">PRO</span></span>
    </div>
  );
}
