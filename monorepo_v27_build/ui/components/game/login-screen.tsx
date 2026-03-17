"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { useGame } from "@/lib/game-context"
import { api } from "@/lib/game-api"
import { Skull, Loader2, AlertCircle, Eye, EyeOff, Droplets, Check, X } from "lucide-react"

// =================================================================
// PASSWORD STRENGTH SCORER
// TEACHING: Simple rules-based scorer instead of loading zxcvbn (200kb).
// Score 0–4 mirrors the vanilla login's zxcvbn scale.
// =================================================================
function scorePassword(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 6)  score++
  if (pw.length >= 10) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  if (/^(123456|password|qwerty|111111|abc123)/i.test(pw)) score = Math.max(score - 3, 0)
  score = Math.min(score, 4)
  const LABELS = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong']
  const COLORS = ['bg-red-600','bg-orange-500','bg-yellow-500','bg-lime-500','bg-green-500']
  return { score, label: LABELS[score], color: COLORS[score] }
}

// Field status indicator
type FieldStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

function StatusBadge({ status, takenText = 'Taken' }: { status: FieldStatus; takenText?: string }) {
  if (status === 'idle') return null
  if (status === 'checking') return <span className="text-[10px] text-muted-foreground animate-pulse">checking…</span>
  if (status === 'available') return <span className="text-[10px] text-green-400 flex items-center gap-0.5"><Check className="w-3 h-3" />Available</span>
  if (status === 'taken') return <span className="text-[10px] text-red-400 flex items-center gap-0.5"><X className="w-3 h-3" />{takenText}</span>
  if (status === 'invalid') return <span className="text-[10px] text-red-400">Invalid format</span>
  return null
}

// =================================================================
// LOGIN SCREEN
// =================================================================
export function LoginScreen() {
  const { login, register, isLoading } = useGame()

  const [loginData, setLoginData] = useState({ username: "", password: "" })
  const [registerData, setRegisterData] = useState({
    username: "", email: "", password: "", confirmPassword: "", characterName: ""
  })
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  // ── Live field check state ──────────────────────────────────────
  const [usernameStatus, setUsernameStatus] = useState<FieldStatus>('idle')
  const [emailStatus, setEmailStatus] = useState<FieldStatus>('idle')
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pwStrength = scorePassword(registerData.password)
  const passwordsMatch = registerData.confirmPassword.length > 0 &&
    registerData.password === registerData.confirmPassword

  // ── Debounced check: username (500ms) ───────────────────────────
  const checkUsername = useCallback((value: string) => {
    if (usernameTimer.current) clearTimeout(usernameTimer.current)
    if (value.length < 3) { setUsernameStatus('idle'); return }
    if (!/^[a-zA-Z0-9_]+$/.test(value)) { setUsernameStatus('invalid'); return }
    setUsernameStatus('checking')
    usernameTimer.current = setTimeout(async () => {
      try {
        const res = await api.auth.checkField('username', value)
        const taken = res.data?.taken ?? (res as unknown as Record<string,unknown>).taken
        setUsernameStatus(taken ? 'taken' : 'available')
      } catch { setUsernameStatus('idle') }
    }, 500)
  }, [])

  // ── Debounced check: email (500ms) ──────────────────────────────
  const checkEmail = useCallback((value: string) => {
    if (emailTimer.current) clearTimeout(emailTimer.current)
    if (value.length < 3) { setEmailStatus('idle'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { setEmailStatus('invalid'); return }
    setEmailStatus('checking')
    emailTimer.current = setTimeout(async () => {
      try {
        const res = await api.auth.checkField('email', value)
        const taken = res.data?.taken ?? (res as unknown as Record<string,unknown>).taken
        setEmailStatus(taken ? 'taken' : 'available')
      } catch { setEmailStatus('idle') }
    }, 500)
  }, [])

  useEffect(() => { checkUsername(registerData.username) }, [registerData.username, checkUsername])
  useEffect(() => { checkEmail(registerData.email) }, [registerData.email, checkEmail])

  // ── Handlers ────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    if (!loginData.username || !loginData.password) { setLocalError("Please fill in all fields"); return }
    const ok = await login(loginData.username, loginData.password)
    if (!ok) setLocalError("Invalid username or password")
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    if (!registerData.username || !registerData.email || !registerData.password || !registerData.characterName) {
      setLocalError("Please fill in all fields"); return
    }
    if (usernameStatus === 'taken') { setLocalError("Username is already taken"); return }
    if (emailStatus === 'taken') { setLocalError("Email is already registered"); return }
    if (usernameStatus === 'invalid') { setLocalError("Username: letters, numbers, underscores only"); return }
    if (emailStatus === 'invalid') { setLocalError("Invalid email format"); return }
    if (registerData.password !== registerData.confirmPassword) { setLocalError("Passwords do not match"); return }
    if (registerData.password.length < 6) { setLocalError("Password must be at least 6 characters"); return }
    if (pwStrength.score < 1) { setLocalError("Password is too weak — try adding numbers or symbols"); return }
    await register(registerData.username, registerData.email, registerData.password, registerData.characterName)
  }

  const fieldBorder = (status: FieldStatus) =>
    status === 'available' ? 'border-green-600/50 focus:border-green-500' :
    status === 'taken' || status === 'invalid' ? 'border-red-600/50 focus:border-red-500' : ''

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />
      <div className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M30 0 L32 28 L60 30 L32 32 L30 60 L28 32 L0 30 L28 28Z'/%3E%3C/g%3E%3C/svg%3E")` }}
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 border border-primary/30 mb-4 blood-glow">
            <Skull className="w-10 h-10 text-primary rune-glow" />
          </div>
          <h1 className="text-4xl font-bold text-foreground blood-text tracking-wider">TWISTED ENGINE</h1>
          <p className="text-muted-foreground mt-2 flex items-center justify-center gap-2">
            <Droplets className="w-4 h-4 text-primary" /> Enter the Void <Droplets className="w-4 h-4 text-primary" />
          </p>
        </div>

        <Card className="celtic-border panel-glow">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl">Portal of Souls</CardTitle>
            <CardDescription>Your soul is remembered by the server — no local data stored.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Return</TabsTrigger>
                <TabsTrigger value="register">Awaken</TabsTrigger>
              </TabsList>

              {/* ═══════════ LOGIN TAB ═══════════ */}
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-username">Username</Label>
                    <Input id="login-username" type="text" placeholder="Enter your name..."
                      value={loginData.username}
                      onChange={(e) => setLoginData(prev => ({ ...prev, username: e.target.value }))}
                      className="bg-input" autoComplete="username" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <div className="relative">
                      <Input id="login-password" type={showPassword ? "text" : "password"} placeholder="Your secret..."
                        value={loginData.password}
                        onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                        className="bg-input pr-10" autoComplete="current-password" />
                      <Button type="button" variant="ghost" size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                    </div>
                  </div>
                  {localError && (
                    <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
                      <AlertCircle className="h-4 w-4 shrink-0" /><span>{localError}</span>
                    </div>
                  )}
                  <Button type="submit" className="w-full blood-glow" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Crossing the Threshold...</> : "Enter the Realm"}
                  </Button>
                </form>
              </TabsContent>

              {/* ═══════════ REGISTER TAB ═══════════ */}
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">

                  {/* Username — live taken check */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="register-username">Username</Label>
                      <StatusBadge status={usernameStatus} />
                    </div>
                    <Input id="register-username" type="text" placeholder="Choose your identity..."
                      value={registerData.username} maxLength={20}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, username: e.target.value }))}
                      className={`bg-input ${fieldBorder(usernameStatus)}`} autoComplete="username" />
                    {registerData.username.length > 0 && registerData.username.length < 3 && (
                      <p className="text-[10px] text-muted-foreground">Must be 3–20 characters</p>
                    )}
                  </div>

                  {/* Email — live taken check */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="register-email">Email</Label>
                      <StatusBadge status={emailStatus} takenText="Already registered" />
                    </div>
                    <Input id="register-email" type="email" placeholder="Enter your email..."
                      value={registerData.email}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, email: e.target.value }))}
                      className={`bg-input ${fieldBorder(emailStatus)}`} autoComplete="email" />
                  </div>

                  {/* Character Name */}
                  <div className="space-y-2">
                    <Label htmlFor="register-character">Character Name</Label>
                    <Input id="register-character" type="text" placeholder="Name your soul..."
                      value={registerData.characterName} maxLength={20}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, characterName: e.target.value }))}
                      className="bg-input" />
                  </div>

                  {/* Password + strength meter */}
                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <Input id="register-password" type="password" placeholder="Guard your secret..."
                      value={registerData.password}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                      className="bg-input" autoComplete="new-password" />
                    {registerData.password.length > 0 && (
                      <div className="space-y-1">
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-300 ${pwStrength.color}`}
                            style={{ width: `${((pwStrength.score + 1) / 5) * 100}%` }} />
                        </div>
                        <p className={`text-[10px] ${pwStrength.score <= 1 ? 'text-red-400' : pwStrength.score === 2 ? 'text-yellow-400' : 'text-green-400'}`}>
                          {pwStrength.label}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password — match indicator */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="register-confirm">Confirm Password</Label>
                      {registerData.confirmPassword.length > 0 && (
                        passwordsMatch
                          ? <span className="text-[10px] text-green-400 flex items-center gap-0.5"><Check className="w-3 h-3" />Match</span>
                          : <span className="text-[10px] text-red-400 flex items-center gap-0.5"><X className="w-3 h-3" />No match</span>
                      )}
                    </div>
                    <Input id="register-confirm" type="password" placeholder="Seal your oath..."
                      value={registerData.confirmPassword}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      className={`bg-input ${registerData.confirmPassword.length > 0 ? (passwordsMatch ? 'border-green-600/50' : 'border-red-600/50') : ''}`}
                      autoComplete="new-password" />
                  </div>

                  {localError && (
                    <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
                      <AlertCircle className="h-4 w-4 shrink-0" /><span>{localError}</span>
                    </div>
                  )}
                  <Button type="submit" className="w-full blood-glow" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Forging Your Soul...</> : "Awaken"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">Blood Oghams await. The void hungers.</p>
      </div>
    </div>
  )
}
