import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, FileText, Search, Target, ListChecks, Wand2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const steps = [
  { icon: FileText, title: "Upload resume", body: "Structured skills, titles, experience — parsed once, reused everywhere." },
  { icon: Search, title: "Search SEEK", body: "Import listings by keyword, location, and filters — right into your Inbox." },
  { icon: Target, title: "Score fit", body: "Rubric-based match scores with pros, cons, gaps, and strategic advice." },
  { icon: ListChecks, title: "Shortlist / reject", body: "Move roles through Inbox → Shortlist → Not a Fit with a click." },
  { icon: Wand2, title: "Tailor & apply", body: "Generate a tailored resume and cover letter for high-fit roles." },
];

const problems = [
  "Too many listings, no way to compare them fairly.",
  "Hard to know which ones are actually worth the effort.",
  "Tailoring a resume for every role eats hours.",
  "Job search turns into a messy spreadsheet fast.",
];

export default function Landing() {
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      {/* Top bar */}
      <header className="border-b border-border/60 backdrop-blur supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-semibold tracking-tight">Seek Smarter</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/guest">Try guest demo</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(60% 40% at 50% 0%, hsl(var(--primary) / 0.10), transparent 70%)",
          }}
        />
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge variant="secondary" className="mb-4">
                Private AI cockpit for your job search
              </Badge>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
                Stop guessing which jobs are worth applying to.
              </h1>
              <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-xl">
                Seek Smarter scores SEEK listings against your resume, explains the fit,
                and helps you build a focused application pipeline.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/guest">
                    Try guest demo <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/auth">Sign in</Link>
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Guest demo uses sample data. No live APIs are called.
              </p>
            </div>

            {/* Cockpit preview */}
            <div className="lg:pl-6">
              <Card className="relative overflow-hidden border-border/60 shadow-xl bg-card/80 backdrop-blur">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                <div className="p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      Pipeline preview
                    </div>
                    <Badge variant="outline" className="text-[10px]">demo</Badge>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {steps.map((s) => (
                      <div key={s.title} className="rounded-md border border-border/60 bg-background/60 p-2 flex flex-col items-center text-center gap-1">
                        <s.icon className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-medium leading-tight">{s.title}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 space-y-2">
                    {[
                      { title: "Senior Product Engineer", company: "Canva", score: 88, rec: "Strong Apply" },
                      { title: "Full Stack Engineer", company: "Culture Amp", score: 76, rec: "Apply" },
                      { title: "Salesforce Admin", company: "Enterprise Co", score: 22, rec: "Skip" },
                    ].map((row) => (
                      <div key={row.title} className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/70 px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{row.title}</div>
                          <div className="text-xs text-muted-foreground truncate">{row.company}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold tabular-nums ${row.score >= 70 ? "text-primary" : row.score >= 50 ? "text-foreground" : "text-muted-foreground"}`}>
                            {row.score}
                          </span>
                          <Badge variant={row.score >= 70 ? "default" : "outline"} className="text-[10px]">
                            {row.rec}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Job searching is noisy.</h2>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            SEEK gives you thousands of listings. It doesn't tell you which ones are worth your time.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {problems.map((p) => (
              <div key={p} className="rounded-lg border border-border/60 bg-card/50 p-4 text-sm">
                {p}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product loop */}
      <section className="border-t border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">The loop</h2>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            One focused workflow from resume to sent application.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {steps.map((s, i) => (
              <Card key={s.title} className="p-4 border-border/60">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                    <s.icon className="h-4 w-4" />
                  </div>
                  <div className="text-xs text-muted-foreground">Step {i + 1}</div>
                </div>
                <div className="text-sm font-semibold">{s.title}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.body}</div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20">
          <div className="flex items-start gap-4 max-w-3xl">
            <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Honest about what this is</h2>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>• Designed as a private job-search workspace.</li>
                <li>• Guest demo uses sample data — no live APIs are called.</li>
                <li>• For production use, keep resumes in authenticated private storage.</li>
                <li>• Your account workspace keeps your pipeline separate once data isolation is configured.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border/60 bg-gradient-to-b from-transparent to-muted/40">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Want to see it without signing up?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Try the guest demo — sample resume, sample jobs, real UI.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/guest">
                Try guest demo <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        Seek Smarter · Turn SEEK listings into a ranked application plan.
      </footer>
    </div>
  );
}
