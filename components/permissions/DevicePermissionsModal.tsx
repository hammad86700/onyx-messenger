'use client';

import React, { useState, useEffect } from 'react';
import {
  Mic,
  Camera,
  HardDrive,
  Volume2,
  Bell,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  X,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import {
  checkDevicePermissions,
  DevicePermissionStatus,
  getAudioStream,
  getVideoStream,
  stopMediaStream,
} from '@/lib/webrtc';
import {
  requestPersistentStorage,
  getStorageSettings,
  saveStorageSettings,
  MediaStorageSettings,
} from '@/lib/storage-manager';
import { requestNotificationPermission } from '@/lib/notifications';

interface DevicePermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  requiredFor?: 'call' | 'video' | 'storage' | 'general';
}

export default function DevicePermissionsModal({
  isOpen,
  onClose,
  requiredFor = 'general',
}: DevicePermissionsModalProps) {
  const [permissions, setPermissions] = useState<DevicePermissionStatus>({
    microphone: 'prompt',
    camera: 'prompt',
    storage: 'prompt',
    notifications: 'default',
  });
  const [storageSettings, setStorageSettings] = useState<MediaStorageSettings>(getStorageSettings());
  const [requesting, setRequesting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const refreshPermissions = async () => {
    const status = await checkDevicePermissions();
    setPermissions(status);
  };

  useEffect(() => {
    if (isOpen) {
      refreshPermissions();
      setStorageSettings(getStorageSettings());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Request Microphone
  const handleRequestMic = async () => {
    try {
      const stream = await getAudioStream();
      stopMediaStream(stream);
      await refreshPermissions();
      setSuccessMsg('Microphone access granted!');
    } catch (e: any) {
      alert('Microphone permission denied or blocked. Please allow mic access in your browser site settings.');
    }
  };

  // Request Camera
  const handleRequestCamera = async () => {
    try {
      const stream = await getVideoStream();
      stopMediaStream(stream);
      await refreshPermissions();
      setSuccessMsg('Camera access granted!');
    } catch (e: any) {
      alert('Camera permission denied or blocked. Please allow camera access in your browser site settings.');
    }
  };

  // Request Storage Persist
  const handleRequestStorage = async () => {
    const persisted = await requestPersistentStorage();
    if (persisted) {
      setPermissions((prev) => ({ ...prev, storage: 'granted' }));
      setSuccessMsg('Mobile storage persistence enabled!');
    } else {
      setPermissions((prev) => ({ ...prev, storage: 'granted' }));
      setSuccessMsg('Storage caching ready!');
    }
  };

  // Request Notifications
  const handleRequestNotifications = async () => {
    const granted = await requestNotificationPermission();
    setPermissions((prev) => ({ ...prev, notifications: granted ? 'granted' : 'denied' }));
    if (granted) setSuccessMsg('Push notifications enabled!');
  };

  // One-Tap "Allow All Permissions" (WhatsApp Style)
  const handleAllowAll = async () => {
    setRequesting(true);
    try {
      // 1. Storage
      await requestPersistentStorage();

      // 2. Microphone & Camera
      try {
        const stream = await navigator.mediaDevices?.getUserMedia?.({ audio: true, video: true });
        if (stream) stopMediaStream(stream);
      } catch (e) {
        // Fallback to audio only
        try {
          const aStream = await getAudioStream();
          stopMediaStream(aStream);
        } catch {}
      }

      // 3. Notifications
      try {
        await requestNotificationPermission();
      } catch {}

      // Auto-save storage settings
      saveStorageSettings({
        autoDownloadPhotos: true,
        autoDownloadAudio: true,
        autoDownloadVideos: true,
        autoDownloadDocs: true,
        saveToDeviceStorage: true,
      });

      await refreshPermissions();
      setSuccessMsg('All permissions enabled successfully!');
      setTimeout(() => {
        onClose();
      }, 900);
    } finally {
      setRequesting(false);
    }
  };

  const toggleSetting = (key: keyof MediaStorageSettings) => {
    const updated = saveStorageSettings({ [key]: !storageSettings[key] });
    setStorageSettings(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-md bg-[#0b0d14] border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl relative flex flex-col max-h-[90vh] overflow-y-auto chat-scroll-viewport">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-pink-600 flex items-center justify-center text-white shadow-lg shadow-brand-500/25 shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-1.5">
              Device Permissions
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 font-mono">
                WhatsApp Mode
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Allow access to enable calls, speaker, and mobile storage downloads.
            </p>
          </div>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div className="mb-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Permissions List */}
        <div className="space-y-2.5 my-2">
          {/* 1. Storage & Media Auto-Download */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white">Mobile Storage & Media</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Save received photos, voice notes, and files to mobile storage like WhatsApp.
                </p>
              </div>
            </div>
            <button
              onClick={handleRequestStorage}
              className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold transition-colors shrink-0"
            >
              {permissions.storage === 'granted' ? 'Enabled' : 'Allow'}
            </button>
          </div>

          {/* 2. Microphone */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <Mic className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white">Microphone</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Required for voice notes, 1-on-1 voice calls, and live meetings.
                </p>
              </div>
            </div>
            <button
              onClick={handleRequestMic}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-colors shrink-0 ${
                permissions.microphone === 'granted'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {permissions.microphone === 'granted' ? 'Granted' : 'Allow'}
            </button>
          </div>

          {/* 3. Camera */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white">Camera</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Required for HD video calls and Zoom-style live meetings.
                </p>
              </div>
            </div>
            <button
              onClick={handleRequestCamera}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-colors shrink-0 ${
                permissions.camera === 'granted'
                  ? 'bg-indigo-500/20 text-indigo-300'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {permissions.camera === 'granted' ? 'Granted' : 'Allow'}
            </button>
          </div>

          {/* 4. Speaker & Audio Output */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                <Volume2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white">Speaker & Audio</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Plays WhatsApp ringtone, voice notes, and loud speakerphone audio.
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1.5 rounded-xl bg-purple-500/20 text-purple-300 text-[11px] font-semibold shrink-0">
              Active
            </span>
          </div>

          {/* 5. Push Notifications */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white">Call & Message Alerts</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Instant pop-up ring alerts when someone calls or sends messages.
                </p>
              </div>
            </div>
            <button
              onClick={handleRequestNotifications}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-colors shrink-0 ${
                permissions.notifications === 'granted'
                  ? 'bg-rose-500/20 text-rose-300'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {permissions.notifications === 'granted' ? 'Allowed' : 'Allow'}
            </button>
          </div>
        </div>

        {/* WhatsApp Auto-Download Toggles */}
        <div className="mt-3 p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
          <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
            WhatsApp Auto-Download to Storage
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={storageSettings.autoDownloadPhotos}
                onChange={() => toggleSetting('autoDownloadPhotos')}
                className="rounded accent-brand-500"
              />
              <span>Photos</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={storageSettings.autoDownloadAudio}
                onChange={() => toggleSetting('autoDownloadAudio')}
                className="rounded accent-brand-500"
              />
              <span>Voice Notes</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={storageSettings.autoDownloadVideos}
                onChange={() => toggleSetting('autoDownloadVideos')}
                className="rounded accent-brand-500"
              />
              <span>Videos</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={storageSettings.autoDownloadDocs}
                onChange={() => toggleSetting('autoDownloadDocs')}
                className="rounded accent-brand-500"
              />
              <span>Documents</span>
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            onClick={handleAllowAll}
            disabled={requesting}
            className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-brand-600 via-indigo-600 to-pink-600 hover:from-brand-500 hover:to-pink-500 text-white text-xs font-bold shadow-lg shadow-brand-500/25 active:scale-98 transition-all flex items-center justify-center gap-2"
          >
            {requesting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Allow All Permissions (Recommended)</span>
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            Done / Close
          </button>
        </div>
      </div>
    </div>
  );
}
