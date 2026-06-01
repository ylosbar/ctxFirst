import { Button } from "@/components/ui/button"

const App = () => {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background text-foreground">
      <h1 className="text-3xl font-semibold tracking-tight">@ctxfirst/web</h1>
      <p className="text-muted-foreground">React + Vite + Tailwind v4 + shadcn/ui</p>
      <Button>Click me</Button>
    </main>
  )
}

export default App
