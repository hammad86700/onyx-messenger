// Onyx WebRTC PeerConnection & Media Device Engine

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
};

export interface DevicePermissionStatus {
  microphone: 'granted' | 'prompt' | 'denied' | 'unsupported';
  camera: 'granted' | 'prompt' | 'denied' | 'unsupported';
  storage: 'granted' | 'prompt' | 'denied';
  notifications: 'granted' | 'default' | 'denied';
}

/**
 * Check browser permissions for microphone, camera, storage, and notifications
 */
export async function checkDevicePermissions(): Promise<DevicePermissionStatus> {
  const status: DevicePermissionStatus = {
    microphone: 'prompt',
    camera: 'prompt',
    storage: 'prompt',
    notifications: 'default',
  };

  if (typeof window === 'undefined') return status;

  // 1. Notifications
  if ('Notification' in window) {
    status.notifications = Notification.permission;
  }

  // 2. Storage persist
  if (navigator.storage && navigator.storage.persisted) {
    try {
      const persisted = await navigator.storage.persisted();
      status.storage = persisted ? 'granted' : 'prompt';
    } catch {}
  }

  // 3. Microphone & Camera via Permissions API
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const mic = await navigator.permissions.query({ name: 'microphone' as any });
      status.microphone = mic.state;
    } catch {
      status.microphone = 'unsupported';
    }

    try {
      const cam = await navigator.permissions.query({ name: 'camera' as any });
      status.camera = cam.state;
    } catch {
      status.camera = 'unsupported';
    }
  }

  return status;
}

/**
 * Request microphone stream with voice enhancements
 */
export async function getAudioStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access is not supported on this browser.');
  }

  return await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
}

/**
 * Request camera and microphone stream for video calls
 */
export async function getVideoStream(facingMode: 'user' | 'environment' = 'user'): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera access is not supported on this browser.');
  }

  return await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: {
      facingMode,
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
}

/**
 * Request screen sharing display media stream
 */
export async function getScreenShareStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Screen sharing is not supported on this device.');
  }

  return await navigator.mediaDevices.getDisplayMedia({
    video: { cursor: 'always' } as any,
    audio: true,
  });
}

/**
 * Stop all tracks of a media stream
 */
export function stopMediaStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {}
  });
}

/**
 * Initialize an RTCPeerConnection with event handlers
 */
export function createPeerConnection(callbacks: {
  onIceCandidate: (candidate: RTCIceCandidate) => void;
  onTrack: (track: MediaStreamTrack, streams: readonly MediaStream[]) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
}): RTCPeerConnection {
  const pc = new RTCPeerConnection(RTC_CONFIG);

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      callbacks.onIceCandidate(event.candidate);
    }
  };

  pc.ontrack = (event) => {
    callbacks.onTrack(event.track, event.streams);
  };

  pc.onconnectionstatechange = () => {
    if (callbacks.onConnectionStateChange) {
      callbacks.onConnectionStateChange(pc.connectionState);
    }
  };

  pc.oniceconnectionstatechange = () => {
    if (callbacks.onIceConnectionStateChange) {
      callbacks.onIceConnectionStateChange(pc.iceConnectionState);
    }
  };

  return pc;
}
