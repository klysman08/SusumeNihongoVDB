import { useCallback, useEffect, useRef, useSyncExternalStore } from "react"

export type SoundEffect = "tap" | "navigate" | "success" | "error"

export const SOUND_STORAGE_KEY = "susume-sound-effects"
const SOUND_CHANGE_EVENT = "susume-sound-effects-change"

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext
  }

const soundProfiles: Record<
  SoundEffect,
  { frequency: number; duration: number; type: OscillatorType }
> = {
  tap: { frequency: 520, duration: 0.045, type: "sine" },
  navigate: { frequency: 660, duration: 0.055, type: "sine" },
  success: { frequency: 780, duration: 0.09, type: "sine" },
  error: { frequency: 190, duration: 0.13, type: "triangle" },
}

function soundEnabled() {
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

function subscribeToSound(onStoreChange: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === SOUND_STORAGE_KEY) onStoreChange()
  }

  window.addEventListener("storage", handleStorage)
  window.addEventListener(SOUND_CHANGE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener("storage", handleStorage)
    window.removeEventListener(SOUND_CHANGE_EVENT, onStoreChange)
  }
}

export function useSoundEffects() {
  const enabled = useSyncExternalStore(
    subscribeToSound,
    soundEnabled,
    () => false
  )
  const contextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    return () => {
      const context = contextRef.current
      contextRef.current = null
      if (context && context.state !== "closed") void context.close()
    }
  }, [])

  const playTone = useCallback((effect: SoundEffect) => {
    const AudioContextConstructor =
      window.AudioContext ?? (window as AudioWindow).webkitAudioContext
    if (!AudioContextConstructor) return

    const context = contextRef.current ?? new AudioContextConstructor()
    contextRef.current = context
    if (context.state === "suspended") void context.resume()

    const profile = soundProfiles[effect]
    const start = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = profile.type
    oscillator.frequency.setValueAtTime(profile.frequency, start)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.045, start + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + profile.duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + profile.duration)
  }, [])

  const playSound = useCallback(
    (effect: SoundEffect) => {
      if (enabled) playTone(effect)
    },
    [enabled, playTone]
  )

  const toggleSound = useCallback(() => {
    const next = !soundEnabled()
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, String(next))
    } catch {
      // The preference remains inactive when browser storage is unavailable.
    }
    window.dispatchEvent(new Event(SOUND_CHANGE_EVENT))
    if (next) playTone("success")
  }, [playTone])

  return { enabled, playSound, toggleSound }
}
