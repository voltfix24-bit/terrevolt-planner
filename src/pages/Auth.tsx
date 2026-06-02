import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Zap } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

export default function Auth() {
  const { session, loading, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (session) return <Navigate to="/overzicht" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } =
      mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (error) {
      toast({ title: "Mislukt", description: error, variant: "destructive" });
    } else if (mode === "signup") {
      toast({ title: "Account aangemaakt", description: "Je bent ingelogd." });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Zap className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div className="leading-tight">
            <div className="font-display text-[15px] font-bold tracking-tight text-foreground">
              TerreVolt
            </div>
            <div className="text-[11px] font-medium text-muted-foreground">Planner</div>
          </div>
        </div>

        <h1 className="mb-1 font-display text-xl font-semibold tracking-tight text-foreground">
          {mode === "signin" ? "Inloggen" : "Account aanmaken"}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Voer je gegevens in om verder te gaan."
            : "Maak een account aan om de planner te gebruiken."}
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Wachtwoord</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Bezig..." : mode === "signin" ? "Inloggen" : "Aanmaken"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "signin"
            ? "Nog geen account? Account aanmaken"
            : "Al een account? Inloggen"}
        </button>
      </div>
    </div>
  );
}
