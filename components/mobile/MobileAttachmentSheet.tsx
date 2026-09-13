'use client';

import React, { useRef } from 'react';
import { Image as ImageIcon, FileText, Mic, Flame, X } from 'lucide-react';

interface MobileAttachmentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFile: (file: File, isViewOnce?: boolean) => void;
  onStartVoiceRecord?: () => void;
}

export default function MobileAttachmentSheet({
  isOpen,
  onClose,
  onSelectFile,
  onStartVoiceRecord,
}: MobileAttachmentSheetProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const viewOnceInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectFile(file, false);
      onClose();
    }
  };

  const handleDocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectFile(file, false);
      onClose();
    }
  };

  const handleViewOnceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectFile(file, true);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0e1017] border-t border-white/10 rounded-t-3xl p-5 shadow-2xl animate-fadeIn gpu-accelerated"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle Indicator */}
        <div className="w-12 h-1.5 rounded-full bg-slate-700/80 mx-auto mb-4" />

        <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/5">
          <h3 className="text-sm font-bold text-white">Share Content</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/5 transition-colors touch-manipulation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Hidden File Inputs */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoChange}
        />
        <input
          ref={docInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          className="hidden"
          onChange={handleDocChange}
        />
        <input
          ref={viewOnceInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleViewOnceChange}
        />

        {/* 4 Attachment Tiles */}
        <div className="grid grid-cols-4 gap-3 py-2">
          {/* Photos */}
          <button
            onClick={() => photoInputRef.current?.click()}
            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800/90 border border-white/5 active:scale-95 transition-all touch-manipulation group"
          >
            <div className="w-12 h-12 rounded-2xl bg-brand-500/20 text-brand-400 border border-brand-500/30 flex items-center justify-center group-hover:scale-105 transition-transform shadow-lg shadow-brand-500/10">
              <ImageIcon className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-medium text-slate-200">Gallery</span>
          </button>

          {/* Document */}
          <button
            onClick={() => docInputRef.current?.click()}
            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800/90 border border-white/5 active:scale-95 transition-all touch-manipulation group"
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center group-hover:scale-105 transition-transform shadow-lg shadow-indigo-500/10">
              <FileText className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-medium text-slate-200">Document</span>
          </button>

          {/* Voice Note */}
          <button
            onClick={() => {
              onClose();
              if (onStartVoiceRecord) onStartVoiceRecord();
            }}
            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800/90 border border-white/5 active:scale-95 transition-all touch-manipulation group"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center group-hover:scale-105 transition-transform shadow-lg shadow-emerald-500/10">
              <Mic className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-medium text-slate-200">Voice</span>
          </button>

          {/* View-Once Photo */}
          <button
            onClick={() => viewOnceInputRef.current?.click()}
            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800/90 border border-white/5 active:scale-95 transition-all touch-manipulation group"
          >
            <div className="w-12 h-12 rounded-2xl bg-pink-500/20 text-pink-400 border border-pink-500/30 flex items-center justify-center group-hover:scale-105 transition-transform shadow-lg shadow-pink-500/10">
              <Flame className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-medium text-slate-200">View-Once</span>
          </button>
        </div>
      </div>
    </div>
  );
}
