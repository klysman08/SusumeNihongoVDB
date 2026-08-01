import { useCallback, useSyncExternalStore } from "react"

export type Theme = "light" | "dark"

export const THEME_STORAGE_KEY = "susume-theme"
const THEME_CHANGE_EVENT = "susume-theme-change"

const themeColors: Record<Theme, string> = {
  light: "#ffffff",
  dark: "#17191a",
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark")
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", themeColors[theme])
}

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === "light" || stored === "dark" ? stored : null
  } catch {
    return null
  }
}

function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

function subscribeToTheme(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)")

  function handleSystemChange(event: MediaQueryListEvent) {
    if (readStoredTheme()) return
    applyTheme(event.matches ? "dark" : "light")
    onStoreChange()
  }

  media.addEventListener("change", handleSystemChange)
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange)
  return () => {
    media.removeEventListener("change", handleSystemChange)
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange)
  }
}

export function useTheme() {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    currentTheme,
    () => "light" as Theme
  )

  const toggleTheme = useCallback(() => {
    const next: Theme = document.documentElement.classList.contains("dark")
      ? "light"
      : "dark"
    applyTheme(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // The visual preference still applies when storage is unavailable.
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  }, [])

  return { theme, toggleTheme }
}
