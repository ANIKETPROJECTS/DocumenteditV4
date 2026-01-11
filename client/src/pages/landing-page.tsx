import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogIn } from "lucide-react";

export default function LandingPage() {
  const handleLogin = () => {
    window.location.href = "https://docedit.airavatatechnologies.com/auth";
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
      <Card className="w-full max-w-md border-none shadow-xl bg-white/80 dark:bg-slate-800/80 backdrop-blur">
        <CardContent className="pt-10 pb-10 flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Welcome to Cipla Portal
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Your secure gateway for image processing and document management
            </p>
          </div>

          <Button 
            size="lg" 
            className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"
            onClick={handleLogin}
          >
            Click here to Login
          </Button>

          <p className="text-sm text-slate-400 dark:text-slate-500 pt-4">
            Cipla Healthcare Portal
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
