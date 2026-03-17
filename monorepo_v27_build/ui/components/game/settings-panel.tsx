"use client"

import { useState } from 'react'
import { X, Volume2, VolumeX, Keyboard, Monitor, RotateCcw, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useAudio } from '@/lib/audio-context'
import { useSettings, type KeyBindings } from '@/lib/settings-context'
import { ThemeSelector } from './theme-selector'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

type SettingsTab = 'audio' | 'keybinds' | 'display' | 'theme'

// Group keybinds by category for display
const KEYBIND_CATEGORIES: { name: string; keys: (keyof KeyBindings)[] }[] = [
  {
    name: 'Movement',
    keys: ['moveUp', 'moveDown', 'moveLeft', 'moveRight'],
  },
  {
    name: 'UI Navigation',
    keys: ['openInventory', 'openCharacter', 'openQuests', 'openMap', 'openParty', 'openGuild', 'openOghams', 'openSettings', 'closePanel'],
  },
  {
    name: 'Combat',
    keys: ['attack', 'defend', 'useSkill1', 'useSkill2', 'useSkill3', 'useSkill4', 'useItem', 'flee', 'limitBreak'],
  },
  {
    name: 'Quick Slots',
    keys: ['quickSlot1', 'quickSlot2', 'quickSlot3', 'quickSlot4', 'quickSlot5'],
  },
  {
    name: 'Misc',
    keys: ['interact', 'openChat', 'toggleMinimap'],
  },
]

// Format action name for display
function formatActionName(action: string): string {
  return action
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .replace(/(\d)/g, ' $1')
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('audio')
  const audio = useAudio()
  const settingsContext = useSettings()
  
  if (!isOpen) return null
  
  const { settings, updateUISetting, isBindingKey, startBindingKey, cancelBindingKey, formatKeybind, resetKeybinds, resetUISettings } = settingsContext
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[80vh] bg-card border border-border rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30">
          <h2 className="text-xl font-bold text-foreground">Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b border-border">
          {[
            { id: 'audio' as const, label: 'Audio', icon: Volume2 },
            { id: 'keybinds' as const, label: 'Keybinds', icon: Keyboard },
            { id: 'display' as const, label: 'Display', icon: Monitor },
            { id: 'theme' as const, label: 'Theme', icon: Palette },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id 
                  ? 'bg-secondary text-foreground border-b-2 border-primary' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
        
        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
          {/* Audio Tab */}
          {activeTab === 'audio' && (
            <div className="space-y-6">
              {/* Master Mute */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
                <div className="flex items-center gap-3">
                  {audio.state.settings.muted ? (
                    <VolumeX className="w-5 h-5 text-destructive" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-primary" />
                  )}
                  <span className="font-medium">Master Audio</span>
                </div>
                <Switch
                  checked={!audio.state.settings.muted}
                  onCheckedChange={() => audio.toggleMute()}
                />
              </div>
              
              {/* Volume Sliders */}
              <div className="space-y-4">
                <VolumeSlider
                  label="Master Volume"
                  value={audio.state.settings.masterVolume}
                  onChange={(v) => audio.setVolume('master', v)}
                  disabled={audio.state.settings.muted}
                />
                <VolumeSlider
                  label="Music Volume"
                  value={audio.state.settings.musicVolume}
                  onChange={(v) => audio.setVolume('music', v)}
                  disabled={audio.state.settings.muted}
                />
                <VolumeSlider
                  label="Sound Effects"
                  value={audio.state.settings.sfxVolume}
                  onChange={(v) => audio.setVolume('sfx', v)}
                  disabled={audio.state.settings.muted}
                />
                <VolumeSlider
                  label="Ambient Sounds"
                  value={audio.state.settings.ambientVolume}
                  onChange={(v) => audio.setVolume('ambient', v)}
                  disabled={audio.state.settings.muted}
                />
              </div>
              
              {/* Test Sounds */}
              <div className="pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground mb-3">Test Sounds</p>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => audio.playSfx('ui-click')}>
                    UI Click
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => audio.playSfx('combat-hit')}>
                    Combat Hit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => audio.playSfx('combat-crit')}>
                    Critical
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => audio.playSfx('ui-success')}>
                    Success
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          {/* Keybinds Tab */}
          {activeTab === 'keybinds' && (
            <div className="space-y-6">
              {/* Reset Button */}
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={resetKeybinds} className="gap-2">
                  <RotateCcw className="w-4 h-4" />
                  Reset to Defaults
                </Button>
              </div>
              
              {/* Listening overlay */}
              {isBindingKey && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
                  <div className="text-center">
                    <p className="text-xl font-bold mb-2">Press any key...</p>
                    <p className="text-muted-foreground mb-4">
                      Binding: {formatActionName(isBindingKey)}
                    </p>
                    <Button variant="outline" onClick={cancelBindingKey}>Cancel</Button>
                  </div>
                </div>
              )}
              
              {/* Keybind Categories */}
              {KEYBIND_CATEGORIES.map(category => (
                <div key={category.name}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">{category.name}</h3>
                  <div className="space-y-1">
                    {category.keys.map(action => (
                      <div 
                        key={action}
                        className="flex items-center justify-between py-2 px-3 rounded hover:bg-secondary/30"
                      >
                        <span className="text-sm">{formatActionName(action)}</span>
                        <button
                          onClick={() => startBindingKey(action)}
                          className="px-3 py-1 min-w-[100px] text-sm font-mono bg-secondary rounded border border-border hover:border-primary transition-colors"
                        >
                          {formatKeybind(settings.keybinds[action])}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Display Tab */}
          {activeTab === 'display' && (
            <div className="space-y-6">
              {/* Reset Button */}
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={resetUISettings} className="gap-2">
                  <RotateCcw className="w-4 h-4" />
                  Reset to Defaults
                </Button>
              </div>
              
              {/* UI Scale */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">UI Scale</span>
                  <span className="text-sm text-muted-foreground">{Math.round(settings.ui.uiScale * 100)}%</span>
                </div>
                <Slider
                  value={[settings.ui.uiScale]}
                  onValueChange={([v]) => updateUISetting('uiScale', v)}
                  min={0.8}
                  max={1.2}
                  step={0.05}
                />
              </div>
              
              {/* Chat Opacity */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Chat Opacity</span>
                  <span className="text-sm text-muted-foreground">{Math.round(settings.ui.chatOpacity * 100)}%</span>
                </div>
                <Slider
                  value={[settings.ui.chatOpacity]}
                  onValueChange={([v]) => updateUISetting('chatOpacity', v)}
                  min={0.3}
                  max={1}
                  step={0.1}
                />
              </div>
              
              {/* Minimap Size */}
              <div>
                <span className="text-sm font-medium block mb-2">Minimap Size</span>
                <div className="flex gap-2">
                  {(['small', 'medium', 'large'] as const).map(size => (
                    <button
                      key={size}
                      onClick={() => updateUISetting('minimapSize', size)}
                      className={`px-4 py-2 rounded text-sm capitalize transition-colors ${
                        settings.ui.minimapSize === size
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary hover:bg-secondary/80'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Tooltip Delay */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Tooltip Delay</span>
                  <span className="text-sm text-muted-foreground">{settings.ui.tooltipDelay}ms</span>
                </div>
                <Slider
                  value={[settings.ui.tooltipDelay]}
                  onValueChange={([v]) => updateUISetting('tooltipDelay', v)}
                  min={0}
                  max={1000}
                  step={100}
                />
              </div>
              
              {/* Toggle Options */}
              <div className="space-y-3 pt-4 border-t border-border">
                <ToggleOption
                  label="Show Damage Numbers"
                  description="Display floating damage values in combat"
                  checked={settings.ui.showDamageNumbers}
                  onChange={(v) => updateUISetting('showDamageNumbers', v)}
                />
                <ToggleOption
                  label="Show Minimap"
                  description="Display the minimap in the corner"
                  checked={settings.ui.showMinimap}
                  onChange={(v) => updateUISetting('showMinimap', v)}
                />
                <ToggleOption
                  label="Show Player Names"
                  description="Display names above other players"
                  checked={settings.ui.showPlayerNames}
                  onChange={(v) => updateUISetting('showPlayerNames', v)}
                />
                <ToggleOption
                  label="Show Health Bars"
                  description="Display health bars above entities"
                  checked={settings.ui.showHealthBars}
                  onChange={(v) => updateUISetting('showHealthBars', v)}
                />
                <ToggleOption
                  label="Screen Shake"
                  description="Enable camera shake on critical hits"
                  checked={settings.ui.screenShake}
                  onChange={(v) => updateUISetting('screenShake', v)}
                />
                <ToggleOption
                  label="Reduced Motion"
                  description="Minimize animations for accessibility"
                  checked={settings.ui.reducedMotion}
                  onChange={(v) => updateUISetting('reducedMotion', v)}
                />
                <ToggleOption
                  label="High Contrast"
                  description="Increase contrast for better visibility"
                  checked={settings.ui.highContrast}
                  onChange={(v) => updateUISetting('highContrast', v)}
                />
              </div>
            </div>
          )}
          
          {/* Theme Tab */}
          {activeTab === 'theme' && (
            <div className="space-y-6">
              <ThemeSelector />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// =================================================================
// SUB-COMPONENTS
// =================================================================
function VolumeSlider({ label, value, onChange, disabled }: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div className={disabled ? 'opacity-50' : ''}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">{Math.round(value * 100)}%</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={0}
        max={1}
        step={0.05}
        disabled={disabled}
      />
    </div>
  )
}

function ToggleOption({ label, description, checked, onChange }: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
