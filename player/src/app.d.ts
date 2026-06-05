// See https://kit.svelte.dev/docs/types#app
declare global {
  namespace App {
    interface Error {}
    interface Locals {
      user?: { id: number; username: string; role: string } | null
    }
    interface PageData {}
    interface PageState {}
    interface Platform {}
  }
}

export {}
