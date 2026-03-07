import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";
import { setAuthToken } from "@/lib/queryClient";

interface Props {
  onLogin: () => Promise<void>;
}

export default function Login({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) setAuthToken(data.token);
        await onLogin();
      } else {
        setError("Invalid username or password.");
      }
    } catch {
      setError("Could not connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto font-bold text-white text-lg">CB</div>
          <h1 className="text-white text-xl font-bold">CB Provider Intelligence</h1>
          <p className="text-slate-400 text-sm">Sign in to access the platform</p>
        </div>

        <Card className="border-slate-800 bg-slate-900 shadow-xl">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-sm">Username</Label>
                <Input
                  data-testid="input-username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
                  placeholder="Enter username"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-sm">Password</Label>
                <Input
                  data-testid="input-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
                  placeholder="Enter password"
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm text-center" data-testid="text-login-error">{error}</p>
              )}

              <Button
                data-testid="button-login"
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={loading}
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                ) : (
                  <><Lock className="w-4 h-4 mr-2" />Sign In</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
