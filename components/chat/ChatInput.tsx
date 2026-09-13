'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Message } from '@/types/database';
import {
  Send,
  Paperclip,
  Image as ImageIcon,
  FileText,
  X,
  Mic,
  Square,
  Flame,
  AlertCircle,
  CornerDownRight,
  Trash2,
  Play,
  Pause,
} from 'lucide-react';
import { compressImage, isCompressibleImage } from '@/lib/image-compression';

interface ChatInputProps {
  conversationId: string;
  onSendMessage: (
    content: string,
    file?: File | null,
    previewUrl?: string | null,
    options?: {
      reply_to_id?: string;
      view_once?: boolean;
    }
  ) => Promise<void>;
  onTyping: () => void;
  replyingTo: Message | null;
  onCancelReply: () => void;
  disabled?: boolean;
}

export default function ChatInput({
  conversationId,
  onSendMessage,
  onTyping,
  replyingTo,
  onCancelReply,
  disabled = false,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isViewOnce, setIsViewOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Synchronize ref with state
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // File Select Handler with instant 0ms optimistic preview & background compression
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      setError('File size exceeds 25MB limit.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);

    if (file.type.startsWith('image/')) {
      // 0ms instant preview without blocking the main thread
      const preview = URL.createObjectURL(file);
      setFilePreview(preview);

      // Pre-compress in the background before user presses Send
      if (isCompressibleImage(file)) {
        compressImage(file)
          .then((res) => {
            setSelectedFile(res.file);
          })
          .catch((err) => {
            console.warn('Background compression warning:', err);
          });
      }
    } else {
      setFilePreview(null);
      setIsViewOnce(false);
    }
  };

  const clearSelectedFile = () => {
    if (filePreview && filePreview.startsWith('blob:')) {
      URL.revokeObjectURL(filePreview);
    }
    setSelectedFile(null);
    setFilePreview(null);
    setIsViewOnce(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Real-Time Canvas Waveform Visualizer
  const startWaveformVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const render = () => {
        if (!isRecordingRef.current) return;
        animFrameRef.current = requestAnimationFrame(render);

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (isPausedRef.current) {
          // Draw muted horizontal line when paused
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(0, canvas.height / 2 - 1, canvas.width, 2);
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barCount = 14;
        const barWidth = 3;
        const barSpacing = 4;
        const totalWidth = barCount * (barWidth + barSpacing) - barSpacing;
        const startX = (canvas.width - totalWidth) / 2;

        for (let i = 0; i < barCount; i++) {
          const sample = dataArray[i * 2] || 0;
          const ratio = sample / 255;
          const barHeight = Math.max(3, ratio * (canvas.height - 4));
          const x = startX + i * (barWidth + barSpacing);
          const y = (canvas.height - barHeight) / 2;

          ctx.fillStyle = '#f43f5e';
          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 2);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, barWidth, barHeight);
          }
        }
      };

      render();
    } catch (e) {
      console.warn('AudioContext visualizer unsupported:', e);
    }
  };

  const cleanupAudio = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
  };

  // Voice Recording Engine
  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        cleanupAudio();
      };

      recorder.start(100);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingSeconds(0);

      startWaveformVisualizer(stream);

      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        if (!isPausedRef.current) {
          setRecordingSeconds((prev) => prev + 1);
        }
      }, 1000);
    } catch (err: any) {
      console.error('Voice record error:', err);
      setError('Microphone access denied or unavailable.');
    }
  };

  const togglePauseRecording = () => {
    if (!mediaRecorderRef.current) return;
    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    } else if (mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  };

  const cancelRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    cleanupAudio();
    setIsRecording(false);
    setIsPaused(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
  };

  const stopAndSendRecording = async () => {
    if (!mediaRecorderRef.current) return;

    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    mediaRecorderRef.current.onstop = async () => {
      cleanupAudio();
      const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      const voiceFile = new File([audioBlob], `voice_note_${Date.now()}.webm`, {
        type: mimeType,
      });

      setIsRecording(false);
      setIsPaused(false);
      setRecordingSeconds(0);
      audioChunksRef.current = [];

      try {
        await onSendMessage('', voiceFile, null, {
          reply_to_id: replyingTo ? replyingTo.id : undefined,
        });
        if (replyingTo) onCancelReply();
      } catch (err: any) {
        setError(err.message || 'Failed to send voice note');
      }
    };

    mediaRecorderRef.current.stop();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    onTyping();
  };

  const handleSubmit = async () => {
    const currentText = text.trim();
    let currentFile = selectedFile;
    const currentPreview = filePreview;
    const currentViewOnce = isViewOnce;
    const currentReplyToId = replyingTo ? replyingTo.id : undefined;

    if ((!currentText && !currentFile) || disabled) return;

    setError(null);

    // If file is an image, ensure compressed to webp before sending
    if (currentFile && isCompressibleImage(currentFile)) {
      try {
        const comp = await compressImage(currentFile);
        currentFile = comp.file;
      } catch (err) {
        console.warn('Compression fallback during submit:', err);
      }
    }

    // Immediately clear all inputs
    setText('');
    clearSelectedFile();
    if (replyingTo) onCancelReply();

    try {
      await onSendMessage(currentText, currentFile, currentPreview, {
        reply_to_id: currentReplyToId,
        view_once: currentViewOnce,
      });
    } catch (err: any) {
      console.error('Error sending message:', err);
      setError(err.message || 'Failed to send message.');
    }
  };

  const isImageSelected = selectedFile && selectedFile.type.startsWith('image/');

  return (
    <div className="border-t border-white/10 bg-slate-950/80 backdrop-blur-xl transition-all">
      {/* Quoted Reply Banner */}
      {replyingTo && (
        <div className="px-4 py-2 bg-slate-900/90 border-b border-white/10 flex items-center justify-between text-xs animate-fadeIn">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-6 h-6 rounded-lg bg-brand-500/20 text-brand-300 flex items-center justify-center shrink-0">
              <CornerDownRight className="w-3.5 h-3.5" />
            </div>
            <div className="overflow-hidden">
              <p className="font-bold text-white text-[11px] truncate">
                Replying to {replyingTo.sender?.full_name || 'User'}
              </p>
              <p className="text-slate-400 text-[10px] truncate">
                {replyingTo.content || (replyingTo.media_type === 'image' ? '📷 Photo' : '📎 Attachment')}
              </p>
            </div>
          </div>
          <button
            onClick={onCancelReply}
            className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="mx-4 mt-2 p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-white">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Selected File Preview Pill */}
      {selectedFile && (
        <div className="mx-4 mt-2 p-2 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-between max-w-sm animate-fadeIn">
          <div className="flex items-center gap-2.5 overflow-hidden">
            {filePreview ? (
              <img
                src={filePreview}
                alt="Upload preview"
                className="w-9 h-9 rounded-lg object-cover border border-white/10"
              />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
            )}
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-white truncate">{selectedFile.name}</p>
              <p className="text-[10px] text-slate-400 font-mono">
                {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* View Once Toggle Button for Images */}
            {isImageSelected && (
              <button
                type="button"
                onClick={() => setIsViewOnce(!isViewOnce)}
                title={isViewOnce ? 'View once active' : 'Toggle view once'}
                className={`w-7 h-7 rounded-full text-xs font-bold transition-all flex items-center justify-center ${
                  isViewOnce
                    ? 'bg-pink-600 text-white shadow-md shadow-pink-500/30 scale-105'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                1
              </button>
            )}

            <button
              type="button"
              onClick={clearSelectedFile}
              className="p-1 rounded-lg text-slate-400 hover:text-rose-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Input or Voice Recording Row */}
      <div className="p-2.5 sm:p-4 pb-[max(0.6rem,env(safe-area-inset-bottom,0px))]">
        {isRecording ? (
          /* Active Voice Recording UI with Web Audio API Waveform & Controls */
          <div className="flex items-center justify-between gap-2 p-2 rounded-2xl bg-rose-950/40 border border-rose-500/30 animate-fadeIn">
            <div className="flex items-center gap-1.5 sm:gap-3 overflow-hidden">
              <span
                className={`w-2.5 h-2.5 rounded-full bg-rose-500 ${
                  isPaused ? 'opacity-50' : 'animate-ping'
                } shrink-0`}
              />
              <div className="flex items-center gap-1 text-rose-300 font-mono font-bold text-xs">
                <span className="hidden sm:inline">Voice Note:</span>
                <span>
                  {Math.floor(recordingSeconds / 60)}:
                  {Math.floor(recordingSeconds % 60).toString().padStart(2, '0')}
                </span>
                {isPaused && (
                  <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/20 px-1 py-0.2 rounded ml-0.5">
                    Paused
                  </span>
                )}
              </div>

              {/* Real-time Web Audio API waveform canvas */}
              <canvas
                ref={canvasRef}
                width={100}
                height={22}
                className="hidden sm:block rounded bg-black/20"
              />
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Pause / Resume Button */}
              <button
                type="button"
                onClick={togglePauseRecording}
                className={`p-2 rounded-xl transition-colors ${
                  isPaused
                    ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title={isPaused ? 'Resume Recording' : 'Pause Recording'}
              >
                {isPaused ? <Play className="w-4 h-4 fill-amber-300" /> : <Pause className="w-4 h-4" />}
              </button>

              {/* Cancel Button */}
              <button
                type="button"
                onClick={cancelRecording}
                className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-300 transition-colors"
                title="Cancel Recording"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              {/* Send Voice Note */}
              <button
                type="button"
                onClick={stopAndSendRecording}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-600/30 transition-all"
                title="Send Voice Note"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Send</span>
              </button>
            </div>
          </div>
        ) : (
          /* Standard Input Bar */
          <div className="flex items-end gap-1.5 sm:gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.zip,.tar,.gz,audio/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Attach File Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach media or document"
              disabled={disabled}
              className="p-2 sm:p-2.5 rounded-xl text-slate-400 hover:text-brand-400 hover:bg-slate-800/80 transition-colors shrink-0"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Text input - text-base prevents iOS Safari zoom-in on focus */}
            <div className="flex-1 relative">
              <textarea
                rows={1}
                value={text}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                placeholder={
                  selectedFile
                    ? 'Add a caption...'
                    : 'Message... (Enter to send)'
                }
                className="glass-input w-full px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-base sm:text-sm placeholder:text-slate-500 resize-none max-h-32 min-h-[40px] leading-relaxed block focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {/* Voice Record or Send Button */}
            {!text.trim() && !selectedFile ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={disabled}
                title="Record Voice Note"
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-brand-600 text-slate-300 hover:text-white transition-all shrink-0 group"
              >
                <Mic className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={disabled}
                title="Send Message"
                className="p-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white transition-all shadow-md shadow-brand-500/25 shrink-0 group"
              >
                <Send className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
