<script lang="ts">
  import { onMount } from 'svelte'

  type Direction = 'up' | 'down' | 'left' | 'right'

  interface Props {
    onmove: (dir: Direction) => void
    oninteract: () => void
    ontogglepanel: (panel: 'inventory' | 'chat') => void
    ontogglestance?: () => void
    ontogglegodseye?: () => void
    onpinggodseye?: () => void
  }
  let { onmove, oninteract, ontogglepanel, ontogglestance, ontogglegodseye, onpinggodseye }: Props = $props()

  function handleKey(e: KeyboardEvent) {
    // Skip if user is typing in a form field.
    const t = e.target as HTMLElement
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return

    // Stance toggle: Control key, C, or X
    if (e.key === 'Control' || e.key === 'c' || e.key === 'C' || e.key === 'x' || e.key === 'X') {
      ontogglestance?.()
      e.preventDefault()
      return
    }

    switch (e.key) {
      case 'ArrowUp':    case 'w': case 'W': onmove('up'); e.preventDefault(); break
      case 'ArrowDown':  case 's': case 'S': onmove('down'); e.preventDefault(); break
      case 'ArrowLeft':  case 'a': case 'A': onmove('left'); e.preventDefault(); break
      case 'ArrowRight': case 'd': case 'D': onmove('right'); e.preventDefault(); break
      case ' ': case 'e': case 'E': oninteract(); e.preventDefault(); break
      case 'i': case 'I': ontogglepanel('inventory'); e.preventDefault(); break
      case 'Enter': case 't': case 'T': ontogglepanel('chat'); e.preventDefault(); break
      case 'g': case 'G': ontogglegodseye?.(); e.preventDefault(); break
      case 'p': case 'P': onpinggodseye?.(); e.preventDefault(); break
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })
</script>
