"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { useGame } from "@/lib/game-context"
import { Skull, Loader2, AlertCircle, Eye, EyeOff, Droplets } from "lucide-react"

// Server URL comes from NEXT_PUBLIC_API_URL — never from user input or localStorage.
// Identity is always from the session cookie / database, never from local state.

export function LoginScreen() {
  const { login, register, isLoading } = useGame()

  const [loginData, setLoginData] = useState({ username: "", password: "" })
  const [registerData, setRegisterData] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    characterName: ""
  })
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    if (!loginData.username || !loginData.password) {
      setLocalError("Please fill in all fields")
      return
    }
    const ok = await login(loginData.username, loginData.password)
    if (!ok) setLocalError("Invalid username or password")
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    if (!registerData.username || !registerData.password || !registerData.characterName) {
      setLocalError("Please fill in all fields")
      return
    }
    if (registerData.password !== registerData.confirmPassword) {
      setLocalError("Passwords do not match")
      return
    }
    if (registerData.password.length < 6) {
      setLocalError("Password must be at least 6 characters")
      return
    }
    await register(registerData.username, registerData.password, registerData.characterName)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Atmosphere */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />
      <div className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M30 0 L32 28 L60 30 L32 32 L30 60 L28 32 L0 30 L28 28Z'/%3E%3C/g%3E%3C/svg%3E")` }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 border border-primary/30 mb-4 blood-glow">
            <Skull className="w-10 h-10 text-primary rune-glow" />
          </div>
          <h1 className="text-4xl font-bold text-foreground blood-text tracking-wider">
            TWISTED ENGINE
          </h1>
          <p className="text-muted-foreground mt-2 flex items-center justify-center gap-2">
            <Droplets className="w-4 h-4 text-primary" />
            Enter the Void
            <Droplets className="w-4 h-4 text-primary" />
          </p>
        </div>

        <Card className="celtic-border panel-glow">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl">Portal of Souls</CardTitle>
            <CardDescription>
              Your soul is remembered by the server — no local data stored.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Return</TabsTrigger>
                <TabsTrigger value="register">Awaken</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-username">Username</Label>
                    <Input
                      id="login-username"
                      type="text"
                      placeholder="Enter your name..."
                      value={loginData.username}
                      onChange={(e) => setLoginData(prev => ({ ...prev, username: e.target.value }))}
                      className="bg-input"
                      autoComplete="username"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Your secret..."
                        value={loginData.password}
                        onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                        className="bg-input pr-10"
                        autoComplete="current-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword
                          ? <EyeOff className="h-4 w-4 text-muted-foreground" />
                          : <Eye className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                    </div>
                  </div>

                  {localError && (
                    <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{localError}</span>
                    </div>
                  )}

                  <Button type="submit" className="w-full blood-glow" disabled={isLoading}>
                    {isLoading
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Crossing the Threshold...</>
                      : "Enter the Realm"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-username">Username</Label>
                    <Input
                      id="register-username"
                      type="text"
                      placeholder="Choose your identity..."
                      value={registerData.username}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, username: e.target.value }))}
                      className="bg-input"
                      autoComplete="username"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-character">Character Name</Label>
                    <Input
                      id="register-character"
                      type="text"
                      placeholder="Name your soul..."
                      value={registerData.characterName}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, characterName: e.target.value }))}
                      className="bg-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <Input
                      id="register-password"
                      type="password"
                      placeholder="Guard your secret..."
                      value={registerData.password}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                      className="bg-input"
                      autoComplete="new-password"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-confirm">Confirm Password</Label>
                    <Input
                      id="register-confirm"
                      type="password"
                      placeholder="Seal your oath..."
                      value={registerData.confirmPassword}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      className="bg-input"
                      autoComplete="new-password"
                    />
                  </div>

                  {localError && (
                    <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{localError}</span>
                    </div>
                  )}

                  <Button type="submit" className="w-full blood-glow" disabled={isLoading}>
                    {isLoading
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Forging Your Soul...</>
                      : "Awaken"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Blood Oghams await. The void hungers.
        </p>
      </div>
    </div>
  )
}
