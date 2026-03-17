"use client"

import { useEffect } from "react"
import { GameProvider, useGame } from "@/lib/game-context"
import { AudioProvider } from "@/lib/audio-context"
import { SettingsProvider } from "@/lib/settings-context"
import { ThemeProvider } from "@/lib/theme-context"
import { AchievementsProvider } from "@/lib/achievements-context"
import { GameLayout } from "@/components/game/game-layout"
import { LoginScreen } from "@/components/game/login-screen"
import { SplashScreen } from "@/components/game/splash-screen"
import { TutorialOverlay } from "@/components/game/tutorial-overlay"
import { DailyRewardModal } from "@/components/game/daily-reward-modal"
import { AchievementToast } from "@/components/game/achievement-toast"
import { WeatherEffects, AmbientParticles } from "@/components/game/weather-effects"
import { useState } from "react"

function GameContent() {
  const {
    isAuthenticated,
    isLoading,
    pendingDailyReward,
    clearDailyReward,
    showTutorial,
    dismissTutorial,
    socket,
  } = useGame()

  // TEACHING: We do NOT use localStorage to decide tutorial visibility anymore.
  // Instead game-context listens to the `init_self` socket event.
  // The server includes `tutorial_done` in the character's state_json.
  // If it's missing → show tutorial. If set → skip it.
  // This means a player on a new device won't see it again.

  const handleTutorialComplete = () => {
    dismissTutorial()
    // Tell server to save tutorial_done so it won't show again on any device
    if (socket) {
      socket.emit('tutorial_complete')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Entering the void...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginScreen />
  }

  return (
    <>
      <GameLayout />
      <AmbientParticles />
      <WeatherEffects weather="embers" />
      <AchievementToast />

      {/* Daily reward — shown before tutorial so player sees their gold first */}
      {pendingDailyReward && !showTutorial && (
        <DailyRewardModal
          reward={pendingDailyReward}
          onClose={clearDailyReward}
        />
      )}

      {/* Tutorial overlay — triggers after init_self confirms fresh character */}
      {showTutorial && (
        <TutorialOverlay
          onComplete={handleTutorialComplete}
          onSkip={handleTutorialComplete}
        />
      )}
    </>
  )
}

function AppWithSplash() {
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    const skipSplash = sessionStorage.getItem('twisted_splash_shown')
    if (skipSplash) {
      setShowSplash(false)
    }
  }, [])

  const handleSplashComplete = () => {
    sessionStorage.setItem('twisted_splash_shown', 'true')
    setShowSplash(false)
  }

  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} minDuration={2500} />
  }

  return <GameContent />
}

export default function GamePage() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <AudioProvider>
          <AchievementsProvider>
            <GameProvider>
              <AppWithSplash />
            </GameProvider>
          </AchievementsProvider>
        </AudioProvider>
      </SettingsProvider>
    </ThemeProvider>
  )
}
