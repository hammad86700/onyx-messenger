'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  RefreshCw,
  Sparkles,
  Shield,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Profile } from '@/types/database';
import { callSound } from '@/lib/call-sound';
import {
  createPeerConnection,
  getAudioStream,
  getVideoStream,
  stopMediaStream,
} from '@/lib/webrtc';

export interface ActiveCallState {
  callId: string;
  type: 'voice' | 'video';
  direction: 'incoming' | 'outgoing';
  status: 'ringing' | 'connected' | 'ended';
  partner: Profile;
  conversationId: string;
}

interface CallOverlayProps {
  call: ActiveCallState | null;
  currentUser: Profile;
  onAcceptCall: () => void;
  onRejectCall: () => void;
  onEndCall: () => void;
  onSendSignal: (type: string, payload: any) => void;
  incomingSignal?: { type: string; payload: any } | null;
}

export default function CallOverlay({
  call,
  currentUser,
  onAcceptCall,
  onRejectCall,
  onEndCall,
  onSendSignal,
  incomingSignal,
}: CallOverlayProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [durationSeconds, setDurationSeconds] = useState(0);

  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<any>(null);

  // 1. Sound handling during ringing/calling
  useEffect(() => {
    if (!call) {
      callSound.stopAll();
      return;
    }

    if (call.status === 'ringing') {
      if (call.direction === 'incoming') {
        callSound.startRingtone();
      } else {
        callSound.startRingback();
      }
    } else if (call.status === 'connected') {
      callSound.stopAll();
      callSound.playCallConnected();
    } else if (call.status === 'ended') {
      callSound.stopAll();
      callSound.playCallEnded();
    }

    return () => {
      callSound.stopAll();
    };
  }, [call?.status, call?.direction]);

  // 2. Timer during active call
  useEffect(() => {
    if (call?.status === 'connected') {
      setDurationSeconds(0);
      timerRef.current = setInterval(() => {
        setDurationSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [call?.status]);

  // Format seconds to mm:ss
  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // 3. WebRTC lifecycle
  useEffect(() => {
    if (!call || call.status !== 'connected') return;

    let isCleanedUp = false;

    async function initWebRTC() {
      try {
        // Acquire user media based on call type
        const stream =
          call!.type === 'video'
            ? await getVideoStream(facingMode)
            : await getAudioStream();

        if (isCleanedUp) {
          stopMediaStream(stream);
          return;
        }

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Initialize PeerConnection
        const pc = createPeerConnection({
          onIceCandidate: (candidate) => {
            onSendSignal('ice_candidate', {
              callId: call!.callId,
              candidate,
            });
          },
          onTrack: (track, streams) => {
            const remoteStream = streams[0] || new MediaStream([track]);
            remoteStreamRef.current = remoteStream;
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
            }
            if (remoteAudioRef.current) {
              remoteAudioRef.current.srcObject = remoteStream;
            }
          },
        });

        // Add local tracks to peer connection
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        pcRef.current = pc;

        // Caller initiates SDP offer
        if (call!.direction === 'outgoing') {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          onSendSignal('call_offer', {
            callId: call!.callId,
            sdp: offer,
          });
        }
      } catch (err: any) {
        console.error('WebRTC initialization error:', err);
      }
    }

    initWebRTC();

    return () => {
      isCleanedUp = true;
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      stopMediaStream(localStreamRef.current);
      stopMediaStream(remoteStreamRef.current);
      localStreamRef.current = null;
      remoteStreamRef.current = null;
    };
  }, [call?.status, call?.callId]);

  // 4. Handle incoming WebRTC signals
  useEffect(() => {
    if (!incomingSignal || !pcRef.current || !call) return;
    const { type, payload } = incomingSignal;
    if (payload?.callId !== call.callId) return;

    async function handleSignal() {
      const pc = pcRef.current;
      if (!pc) return;

      try {
        if (type === 'call_offer' && payload.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          onSendSignal('call_answer', {
            callId: call!.callId,
            sdp: answer,
          });
        } else if (type === 'call_answer' && payload.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        } else if (type === 'ice_candidate' && payload.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      } catch (err) {
        console.warn('WebRTC signal handling notice:', err);
      }
    }

    handleSignal();
  }, [incomingSignal, call?.callId]);

  // Toggle Microphone
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Toggle Camera
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  // Flip Camera (Front/Back)
  const flipCamera = async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    try {
      const newStream = await getVideoStream(nextMode);
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (pcRef.current && localStreamRef.current) {
        const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
        if (sender && newVideoTrack) {
          sender.replaceTrack(newVideoTrack);
        }
        const oldTrack = localStreamRef.current.getVideoTracks()[0];
        if (oldTrack) oldTrack.stop();
        localStreamRef.current.removeTrack(oldTrack);
        localStreamRef.current.addTrack(newVideoTrack);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      }
    } catch (e) {
      console.warn('Camera flip error:', e);
    }
  };

  if (!call) return null;

  const partner = call.partner;

  // -------------------------------------------------------------
  // RENDER: Incoming Call Sheet (WhatsApp Style)
  // -------------------------------------------------------------
  if (call.status === 'ringing' && call.direction === 'incoming') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-2xl animate-fadeIn">
        <div className="w-full max-w-sm flex flex-col items-center text-center p-6 rounded-3xl bg-gradient-to-b from-slate-900/90 to-[#07080b] border border-white/10 shadow-2xl relative overflow-hidden">
          {/* Ambient Glow */}
          <div className="absolute top-1/4 w-48 h-48 rounded-full bg-brand-500/20 blur-3xl pointer-events-none animate-pulse" />

          {/* Call Type Indicator */}
          <div className="px-3 py-1 rounded-full bg-white/10 border border-white/10 text-[11px] font-semibold text-brand-300 flex items-center gap-1.5 mb-6">
            {call.type === 'video' ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
            <span>Incoming Onyx {call.type === 'video' ? 'Video' : 'Voice'} Call</span>
          </div>

          {/* Caller Avatar with WhatsApp Wave Rings */}
          <div className="relative mb-5">
            <div className="absolute -inset-4 rounded-full border-2 border-brand-500/30 animate-ping opacity-60 pointer-events-none" />
            <div className="absolute -inset-8 rounded-full border border-pink-500/20 animate-pulse pointer-events-none" />

            <div className="w-24 h-24 rounded-full bg-slate-800 border-2 border-brand-400 overflow-hidden shadow-2xl flex items-center justify-center text-2xl font-bold text-white relative z-10">
              {partner.avatar_url ? (
                <img src={partner.avatar_url} alt={partner.full_name} className="w-full h-full object-cover" />
              ) : (
                partner.full_name?.slice(0, 2).toUpperCase() || 'U'
              )}
            </div>
          </div>

          <h2 className="text-lg font-bold text-white tracking-tight">{partner.full_name}</h2>
          <p className="text-xs text-brand-400 font-mono mt-0.5">@{partner.username}</p>
          <p className="text-xs text-slate-400 mt-2">Onyx Encrypted Call...</p>

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-8 mt-10 w-full">
            {/* Decline */}
            <button
              onClick={onRejectCall}
              className="flex flex-col items-center gap-2 group"
              aria-label="Decline Call"
            >
              <div className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 active:scale-95 flex items-center justify-center text-white shadow-xl shadow-rose-600/40 transition-all">
                <PhoneOff className="w-7 h-7" />
              </div>
              <span className="text-xs font-semibold text-rose-400">Decline</span>
            </button>

            {/* Accept */}
            <button
              onClick={onAcceptCall}
              className="flex flex-col items-center gap-2 group"
              aria-label="Accept Call"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 flex items-center justify-center text-white shadow-xl shadow-emerald-600/40 transition-all animate-bounce">
                {call.type === 'video' ? <Video className="w-7 h-7" /> : <Phone className="w-7 h-7" />}
              </div>
              <span className="text-xs font-semibold text-emerald-400">Accept</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: Outgoing Call View
  // -------------------------------------------------------------
  if (call.status === 'ringing' && call.direction === 'outgoing') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-2xl animate-fadeIn">
        <div className="w-full max-w-sm flex flex-col items-center text-center p-6 rounded-3xl bg-gradient-to-b from-slate-900/90 to-[#07080b] border border-white/10 shadow-2xl relative overflow-hidden">
          <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-brand-500/50 overflow-hidden shadow-xl flex items-center justify-center text-xl font-bold text-white mb-4 animate-pulse">
            {partner.avatar_url ? (
              <img src={partner.avatar_url} alt={partner.full_name} className="w-full h-full object-cover" />
            ) : (
              partner.full_name?.slice(0, 2).toUpperCase() || 'U'
            )}
          </div>

          <h2 className="text-base font-bold text-white">{partner.full_name}</h2>
          <p className="text-xs text-brand-300 font-mono mt-0.5">@{partner.username}</p>
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 mt-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Ringing...</span>
          </div>

          <div className="mt-10">
            <button
              onClick={onEndCall}
              className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 active:scale-95 flex items-center justify-center text-white shadow-lg shadow-rose-600/40 transition-all"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
            <p className="text-[11px] text-slate-400 mt-2 font-medium">Cancel Call</p>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: Active Connected Call (Voice & Video Mode)
  // -------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#07080b] text-white overflow-hidden animate-fadeIn">
      {/* Hidden audio element for high fidelity voice playback */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Top Header Bar */}
      <div className="h-16 px-4 bg-black/40 backdrop-blur-md border-b border-white/10 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 overflow-hidden flex items-center justify-center text-xs font-bold">
            {partner.avatar_url ? (
              <img src={partner.avatar_url} alt={partner.full_name} className="w-full h-full object-cover" />
            ) : (
              partner.full_name?.slice(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <h3 className="text-xs font-bold text-white">{partner.full_name}</h3>
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{formatDuration(durationSeconds)}</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400">{call.type === 'video' ? 'HD Video' : 'HD Voice'}</span>
            </div>
          </div>
        </div>

        {call.type === 'video' && (
          <button
            onClick={flipCamera}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Switch Camera"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Main View Area */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center p-3">
        {call.type === 'video' ? (
          <div className="w-full h-full relative rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl flex items-center justify-center">
            {/* Remote Video (Full Size) */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />

            {/* Local PIP Video (Floating Bottom Right) */}
            <div className="absolute bottom-4 right-4 w-28 h-40 sm:w-36 sm:h-48 rounded-2xl overflow-hidden border-2 border-brand-500/60 shadow-2xl bg-slate-900 z-10">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {isVideoOff && (
                <div className="absolute inset-0 bg-slate-900/90 flex items-center justify-center text-[10px] text-slate-400">
                  Camera Off
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Voice-Only Acoustic Acoustic Visualizer */
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-6">
              <div className="absolute -inset-6 rounded-full bg-brand-500/10 animate-ping opacity-75" />
              <div className="absolute -inset-12 rounded-full border border-brand-500/20 animate-pulse" />
              <div className="w-32 h-32 rounded-full bg-slate-800 border-4 border-brand-400/80 overflow-hidden shadow-2xl flex items-center justify-center text-3xl font-bold">
                {partner.avatar_url ? (
                  <img src={partner.avatar_url} alt={partner.full_name} className="w-full h-full object-cover" />
                ) : (
                  partner.full_name?.slice(0, 2).toUpperCase() || 'U'
                )}
              </div>
            </div>

            <h2 className="text-xl font-bold text-white tracking-tight">{partner.full_name}</h2>
            <p className="text-xs text-brand-400 font-mono mt-1">@{partner.username}</p>
            <p className="text-xs text-slate-400 mt-2 font-mono">{formatDuration(durationSeconds)}</p>
          </div>
        )}
      </div>

      {/* Floating Bottom Control Bar */}
      <div className="h-24 px-6 pb-4 bg-gradient-to-t from-black via-black/80 to-transparent flex items-center justify-center gap-5 z-20 shrink-0">
        {/* Mute Mic */}
        <button
          onClick={toggleMute}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
            isMuted
              ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
              : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Video Toggle (if video call) */}
        {call.type === 'video' && (
          <button
            onClick={toggleVideo}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
              isVideoOff
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
            title={isVideoOff ? 'Enable Video' : 'Disable Video'}
          >
            {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>
        )}

        {/* Speakerphone Toggle */}
        <button
          onClick={() => setIsSpeakerOn(!isSpeakerOn)}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
            isSpeakerOn
              ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/30'
              : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          title="Speakerphone"
        >
          {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>

        {/* End Call Button */}
        <button
          onClick={onEndCall}
          className="w-14 h-14 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-95 flex items-center justify-center text-white shadow-xl shadow-rose-600/40 transition-all ml-2"
          title="End Call"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
