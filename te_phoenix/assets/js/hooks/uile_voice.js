/**
 * UileVoice Hook
 *
 * Provides two-way hands-free acoustic interface for Uile:
 * 1. Microphone Speech-to-Text via Web Speech API (webkitSpeechRecognition).
 * 2. Somatic Voice playback via Web Audio / SpeechSynthesis when audio_url is absent.
 */
export const UileVoice = {
  mounted() {
    this.isRecording = false
    this.recognition = null
    this.micBtn = this.el.querySelector("[data-role='mic-btn']")
    this.inputField = this.el.querySelector("input[name='message']")

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRec) {
      this.recognition = new SpeechRec()
      this.recognition.continuous = false
      this.recognition.interimResults = true
      this.recognition.lang = "en-US"

      this.recognition.onstart = () => {
        this.isRecording = true
        this.updateMicUi(true)
      }

      this.recognition.onresult = (event) => {
        let transcript = ""
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript
        }
        if (this.inputField) {
          this.inputField.value = transcript
        }
        if (event.results[0] && event.results[0].isFinal) {
          this.isRecording = false
          this.updateMicUi(false)
          this.pushEvent("send_message", { message: transcript })
        }
      }

      this.recognition.onerror = (err) => {
        console.warn("[UileVoice] Speech recognition error:", err)
        this.isRecording = false
        this.updateMicUi(false)
      }

      this.recognition.onend = () => {
        this.isRecording = false
        this.updateMicUi(false)
      }
    }

    if (this.micBtn) {
      this.micBtn.addEventListener("click", (e) => {
        e.preventDefault()
        this.toggleRecording()
      })
    }

    // Handle server-directed vocal speech
    this.handleEvent("uile_speak", ({ text, audio_url }) => {
      if (audio_url) {
        const audio = new Audio(audio_url)
        audio.play().catch(e => console.warn("[UileVoice] audio play failed:", e))
      } else if (text && window.speechSynthesis) {
        window.speechSynthesis.cancel()
        const clean = text.replace(/[*#_`]/g, "").trim()
        const utter = new SpeechSynthesisUtterance(clean)
        
        // Find Irish or Celtic/British voice if available
        const voices = window.speechSynthesis.getVoices()
        const preferred = voices.find(v => v.lang === "en-IE") || 
                          voices.find(v => v.lang === "en-GB") || 
                          voices.find(v => v.lang.startsWith("en"))
        if (preferred) utter.voice = preferred
        utter.pitch = 0.95
        utter.rate = 0.98
        window.speechSynthesis.speak(utter)
      }
    })
  },

  toggleRecording() {
    if (!this.recognition) {
      alert("Microphone speech recognition is not supported in this browser.")
      return
    }
    if (this.isRecording) {
      this.recognition.stop()
      this.isRecording = false
      this.updateMicUi(false)
    } else {
      try {
        this.recognition.start()
      } catch (e) {
        console.warn("[UileVoice] start failed:", e)
      }
    }
  },

  updateMicUi(active) {
    if (!this.micBtn) return
    if (active) {
      this.micBtn.classList.add("ring-4", "ring-rose-500", "bg-rose-600", "animate-pulse")
      this.micBtn.classList.remove("bg-stone-800")
      this.micBtn.setAttribute("title", "Listening to your voice... Speak now")
    } else {
      this.micBtn.classList.remove("ring-4", "ring-rose-500", "bg-rose-600", "animate-pulse")
      this.micBtn.classList.add("bg-stone-800")
      this.micBtn.setAttribute("title", "Click to speak to Uile")
    }
  },

  destroyed() {
    if (this.recognition && this.isRecording) {
      this.recognition.stop()
    }
  }
}
