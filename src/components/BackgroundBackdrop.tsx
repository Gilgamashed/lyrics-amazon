import React from 'react';
import { BackgroundTheme } from '../types/lyrics';

interface BackgroundBackdropProps {
  theme: BackgroundTheme;
}

/**
 * Decorative backdrop behind the docked lyrics surface. The mock Amazon Music
 * navigation, the live-stream status panel and the floating backdrop switcher
 * were removed in the UX redesign; the theme is chosen from the Options menu.
 */
export const BackgroundBackdrop: React.FC<BackgroundBackdropProps> = ({ theme }) => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {theme === 'studio' ? (
        <div className="w-full h-full bg-[#070a13] relative">
          <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-cyan-600/15 rounded-full blur-3xl" />
          <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl" />
        </div>
      ) : theme === 'minimal' ? (
        <div className="w-full h-full bg-[#06080e]" />
      ) : (
        <div className="w-full h-full bg-slate-950 relative">
          <div className="absolute -top-24 left-1/4 w-[32rem] h-[32rem] bg-cyan-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-700/10 rounded-full blur-3xl" />
        </div>
      )}
    </div>
  );
};
