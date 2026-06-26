import React, { useState, useEffect, useCallback } from "react";
import { Toaster, toast } from "sonner";
import {
  LayoutDashboard, Wand2, History, Bookmark, User, Settings,
  Info, LogOut, Search, Bell, ChevronDown, ChevronRight,
  ChevronLeft, Copy, Share2, Maximize2, Star, Download, Trash2,
  Eye, EyeOff, TrendingUp, CheckCircle, Menu, X, ArrowRight,
  Zap, Shield, Globe, BarChart3, Brain, Target, Award, Github,
  Twitter, Check, Mail, Lock, Edit3, Sparkles, Layers, Activity,
  Briefcase, BookOpen, AlertCircle, RefreshCw, Code2, List,
  ExternalLink,
} from "lucide-react";
import { useAuthContext } from "./context/AuthContext";
import { login, logout as firebaseLogout, signUp, resetPassword, getAuthErrorMessage, updateUserProfile } from "./services/auth";
import { generateQuestions, isGraniteConfigured } from "./services/granite";
// isGraniteConfigured now checks VITE_GEMINI_API_KEY internally
import { generatePDF } from "./utils/pdf";
import { useHistory } from "./hooks/useHistory";
import type { HistorySession } from "./utils/history";

// ─────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

// ─────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────

type Page =
  | "landing" | "login" | "register"
  | "dashboard" | "generate" | "history"
  | "saved" | "profile" | "settings" | "about";

type Difficulty = "Easy" | "Medium" | "Hard";

interface Question {
  id: string;
  number: number;
  difficulty: Difficulty;
  category: string;
  question: string;
  answer: string;
  tags: string[];
  saved: boolean;
}

interface Session {
  id: string;
  role: string;
  level: string;
  questionCount: number;
  date: string;
  difficulty: string;
  type: string;
}

// ─────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────

const BASE_QUESTIONS: Omit<Question, "id" | "number" | "saved">[] = [
  {
    difficulty: "Medium",
    category: "Behavioral",
    question:
      "Tell me about a time you had to deal with a difficult team member. How did you handle it and what was the outcome?",
    answer:
      "Use the STAR method (Situation, Task, Action, Result). Describe the team context and the specific conflict. Explain the steps you took: requesting a private conversation, actively listening to understand their perspective, identifying the root cause, and collaborating on a resolution. Conclude with the measurable outcome — improved team dynamics, on-time delivery, or a mutual understanding. Emphasize empathy and professionalism throughout. Interviewers want to see emotional intelligence and leadership potential, not finger-pointing.",
    tags: ["Communication", "Teamwork", "EQ"],
  },
  {
    difficulty: "Hard",
    category: "System Design",
    question:
      "Design a scalable URL shortening service like bit.ly. Walk through your architecture choices and explain the trade-offs.",
    answer:
      "Requirements: ~100M URL writes/day, 10B reads/day (heavily read-biased). Key components: (1) API servers behind a load balancer, (2) a hashing service generating 7-char base62 IDs, (3) NoSQL DB (Cassandra or DynamoDB) for URL mappings with eventual consistency, (4) Redis caching layer with LRU eviction for the hottest 20% of URLs, (5) CDN for global read distribution. Trade-offs: hash collisions vs. counter simplicity for ID generation; eventual vs. strong consistency for URL retrieval. For analytics, use async Kafka streams feeding a data warehouse. Scale read replicas horizontally; shard writes by hash prefix to avoid hotspots.",
    tags: ["System Design", "Scalability", "Architecture"],
  },
  {
    difficulty: "Easy",
    category: "Technical",
    question:
      "Explain the difference between == and === in JavaScript. When would you use one over the other?",
    answer:
      "== is the loose equality operator that performs type coercion before comparison ('5' == 5 returns true). === is strict equality that compares both value AND type without coercion ('5' === 5 returns false). Best practice: always default to === to avoid subtle type coercion bugs. The only defensible use case for == is the null check idiom: value == null, which catches both null and undefined in one expression without coercion.",
    tags: ["JavaScript", "Type System", "Fundamentals"],
  },
  {
    difficulty: "Medium",
    category: "Technical",
    question:
      "What is the event loop in Node.js and how does it differ from traditional multi-threaded server models?",
    answer:
      "Node.js runs on a single thread using an event loop built on libuv. Instead of spawning a new OS thread per request (like Apache's prefork MPM), Node registers callbacks and delegates I/O operations to the OS kernel. The event loop phases: timers (setTimeout/setInterval) → pending callbacks → idle/prepare → poll (fetch new I/O events) → check (setImmediate) → close callbacks. This model excels at I/O-bound workloads (REST APIs, DB queries) but struggles with CPU-bound tasks that block the loop. Worker threads (worker_threads module) address CPU-bound scenarios without abandoning the Node ecosystem.",
    tags: ["Node.js", "Async", "Architecture"],
  },
  {
    difficulty: "Hard",
    category: "Problem Solving",
    question:
      "Given an array of integers, find the maximum product subarray. Write the algorithm and explain the time/space complexity.",
    answer:
      "Track three variables: maxProd (current max), minProd (current min — essential because negative × negative = large positive), and result. For each element: newMax = max(num, maxProd × num, minProd × num); newMin = min(num, maxProd × num, minProd × num); then update result = max(result, newMax). Assign newMax and newMin to maxProd and minProd. Time: O(n) — single pass. Space: O(1). Edge cases: zeros reset both max and min to the current element. Example: [-2, 3, -4] → 24 because -2 × 3 × -4 = 24.",
    tags: ["Dynamic Programming", "Arrays", "O(n)"],
  },
  {
    difficulty: "Medium",
    category: "Behavioral",
    question:
      "Describe a situation where you had to make a critical technical decision with incomplete information. What was your process?",
    answer:
      "Start by acknowledging the ambiguity and explaining how you structured your thinking: (1) Define the decision and its reversibility — reversible decisions should move fast; (2) List the assumptions you were making explicitly; (3) Identify the minimum viable evidence needed before committing; (4) Consult domain experts or run a time-boxed spike; (5) Document the decision and its reasoning (an Architecture Decision Record is ideal). Share a concrete example, the outcome, and what you would change retrospectively — intellectual honesty resonates strongly with senior interviewers.",
    tags: ["Decision Making", "Leadership", "Engineering Process"],
  },
  {
    difficulty: "Hard",
    category: "System Design",
    question:
      "How would you design a distributed rate limiter that works across multiple API server instances?",
    answer:
      "A single-node rate limiter (in-memory counter) breaks when you have multiple instances. Solutions: (1) Centralized Redis with atomic INCR + EXPIRE, using sliding window logs or token bucket stored per client key — simple but Redis becomes a bottleneck; (2) Approximate sliding window with Redis + local in-memory cache to reduce Redis calls at the cost of minor inaccuracy (~0.003%); (3) Gossip-protocol-based distributed counter for extreme scale. For most systems: Redis with Lua scripting for atomic check-and-set, replicated for HA. Include rate limit headers (X-RateLimit-Remaining, X-RateLimit-Reset) in every response. Use consistent hashing if partitioning clients across Redis shards.",
    tags: ["System Design", "Redis", "Distributed Systems"],
  },
  {
    difficulty: "Easy",
    category: "Behavioral",
    question:
      "Where do you see yourself in five years, and how does this role align with that vision?",
    answer:
      "Be specific, honest, and connect your answer to what this role actually offers. A strong answer structure: (1) State a concrete professional goal (e.g., lead a product team, become a staff engineer, build my own startup); (2) Explain the skills and experiences you still need to reach it; (3) Directly connect those needs to what this company and role uniquely provides. Avoid clichés like 'I want to be in your position' or vague platitudes. Interviewers want to see genuine ambition paired with self-awareness about your current gaps.",
    tags: ["Career Development", "Self-Awareness", "Motivation"],
  },
  {
    difficulty: "Hard",
    category: "Technical",
    question:
      "Explain how React's reconciliation algorithm (Fiber) determines what needs to be re-rendered. What are its key heuristics?",
    answer:
      "React Fiber is a complete rewrite of the reconciliation engine that breaks rendering into interruptible units of work. Key heuristics: (1) Tree diffing assumes different component types produce fundamentally different trees — React tears down and rebuilds subtrees when the root type changes; (2) List reconciliation uses the key prop as a stable identity — missing or unstable keys (like array indices) cause unnecessary re-mounts; (3) Same type, same level — React compares props shallowly and only re-renders if they differ. Fiber introduces priority lanes (18+): user input events get immediate priority; transitions and data fetches are deferred. useMemo, useCallback, and React.memo short-circuit unnecessary subtree renders by preserving referential equality.",
    tags: ["React", "Performance", "Internals"],
  },
  {
    difficulty: "Medium",
    category: "Problem Solving",
    question:
      "Implement a function to detect whether a linked list has a cycle. What is the optimal time and space complexity?",
    answer:
      "Floyd's cycle detection (tortoise and hare) algorithm: initialize two pointers, slow and fast, both at the head. Each step, slow advances one node and fast advances two. If they ever point to the same node, a cycle exists. If fast reaches null, the list is acyclic. Time: O(n). Space: O(1) — no extra data structures needed. The key insight is that if a cycle exists, the fast pointer laps the slow pointer within the cycle. An alternative using a hash set achieves O(n) time with O(n) space — simpler to reason about but suboptimal in space. In interviews, always present both and explain why the optimal choice matters for the given constraints.",
    tags: ["Linked Lists", "Two Pointers", "O(n)"],
  },
];

function makeQuestions(count: number): Question[] {
  const result: Question[] = [];
  for (let i = 0; i < count; i++) {
    const base = BASE_QUESTIONS[i % BASE_QUESTIONS.length];
    result.push({
      ...base,
      id: `q-${Date.now()}-${i}`,
      number: i + 1,
      saved: false,
    });
  }
  return result;
}

const INITIAL_SAVED: Question[] = [
  {
    ...BASE_QUESTIONS[1],
    id: "saved-q1",
    number: 1,
    saved: true,
  },
  {
    ...BASE_QUESTIONS[6],
    id: "saved-q2",
    number: 2,
    saved: true,
  },
];

const MOCK_SESSIONS: Session[] = [
  { id: "s1", role: "Senior Frontend Engineer", level: "Senior", questionCount: 10, date: "Jan 15, 2024", difficulty: "Hard", type: "Mixed" },
  { id: "s2", role: "Full Stack Developer", level: "Mid-Level", questionCount: 5, date: "Jan 12, 2024", difficulty: "Medium", type: "Technical" },
  { id: "s3", role: "DevOps Engineer", level: "Senior", questionCount: 15, date: "Jan 8, 2024", difficulty: "Hard", type: "System Design" },
  { id: "s4", role: "Data Scientist", level: "Junior", questionCount: 10, date: "Jan 5, 2024", difficulty: "Easy", type: "Behavioral" },
  { id: "s5", role: "Product Manager", level: "Mid-Level", questionCount: 10, date: "Jan 2, 2024", difficulty: "Medium", type: "Behavioral" },
  { id: "s6", role: "Backend Engineer", level: "Senior", questionCount: 20, date: "Dec 28, 2023", difficulty: "Hard", type: "Technical" },
];

const MOCK_ACTIVITIES = [
  { id: "a1", icon: "generate", action: "Generated 10 questions", target: "Senior Frontend Engineer", time: "2 hours ago", color: "blue" },
  { id: "a2", icon: "save", action: "Saved question", target: "Design a distributed rate limiter", time: "3 hours ago", color: "purple" },
  { id: "a3", icon: "check", action: "Completed session", target: "Full Stack Developer — Medium", time: "Yesterday", color: "green" },
  { id: "a4", icon: "generate", action: "Generated 15 questions", target: "DevOps Engineer", time: "2 days ago", color: "blue" },
  { id: "a5", icon: "download", action: "Downloaded PDF", target: "Data Scientist session", time: "3 days ago", color: "amber" },
];

const TESTIMONIALS = [
  {
    name: "Sarah Chen",
    role: "Senior Software Engineer at Google",
    avatar: "SC",
    rating: 5,
    text: "InterviewAI completely transformed my preparation. The system design questions were exactly what I faced in my FAANG interviews. I went from rejected to hired in 3 months.",
  },
  {
    name: "Marcus Williams",
    role: "Full Stack Developer at Stripe",
    avatar: "MW",
    rating: 5,
    text: "The AI-generated questions are remarkably accurate. I used this for a week before my Stripe interview and landed the role. The difficulty progression is perfect.",
  },
  {
    name: "Priya Patel",
    role: "Staff Engineer at Notion",
    avatar: "PP",
    rating: 5,
    text: "As a hiring manager, I even use this to build our own question bank. The quality rivals questions from top-tier prep courses at a fraction of the cost.",
  },
];

const FAQS = [
  { q: "How does the AI generate interview questions?", a: "Our AI analyzes thousands of real interview transcripts from top tech companies, combined with the job role, experience level, and difficulty you specify, to generate highly relevant and realistic questions tailored to your preparation needs." },
  { q: "Can I practice with the generated questions?", a: "Yes! Each question comes with a detailed model answer. Use the Expand view to read the full answer, practice out loud, then check your response against the AI-generated reference. You can also bookmark questions for a focused review session later." },
  { q: "How many questions can I generate?", a: "The free plan includes 5 questions per session and 20 per day. Pro users get unlimited question generation plus advanced filters for specific companies, job levels, and interview formats." },
  { q: "Are the questions updated regularly?", a: "Yes. The model is continuously fine-tuned with new interview patterns, company-specific question formats, and emerging technology topics so your preparation stays current with real hiring trends." },
  { q: "Can I export my questions?", a: "Absolutely. Download any session as a formatted PDF for offline practice, or copy individual questions and answers to your preferred note-taking tool. Saved questions can be exported as a batch." },
];

const FEATURES = [
  { icon: Brain, title: "AI-Powered Generation", desc: "Questions crafted by advanced AI trained on thousands of real interviews from top tech companies worldwide.", color: "blue" },
  { icon: Target, title: "Role-Specific Precision", desc: "Tailored depth for any job role — from junior developer to staff engineer — with exactly the right complexity.", color: "purple" },
  { icon: Layers, title: "Multiple Question Types", desc: "Behavioral, technical, system design, and problem-solving — all in one coherent preparation platform.", color: "green" },
  { icon: BarChart3, title: "Progress Tracking", desc: "Track your history, measure improvement week over week, and surface knowledge gaps before they hurt you.", color: "amber" },
  { icon: Bookmark, title: "Smart Bookmarking", desc: "Save your best questions, build a personal library, and revisit them in focused practice sessions.", color: "pink" },
  { icon: Download, title: "PDF Export", desc: "Download complete interview sessions as polished, print-ready PDFs for offline study or sharing with peers.", color: "teal" },
];

// ─────────────────────────────────────────────────────────
// SHARED SMALL COMPONENTS
// ─────────────────────────────────────────────────────────

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const styles: Record<Difficulty, string> = {
    Easy: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    Medium: "bg-amber-50 text-amber-700 border border-amber-200",
    Hard: "bg-red-50 text-red-700 border border-red-200",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold", styles[difficulty])}>
      {difficulty}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    Behavioral: "bg-violet-50 text-violet-700 border border-violet-200",
    Technical: "bg-blue-50 text-blue-700 border border-blue-200",
    "System Design": "bg-cyan-50 text-cyan-700 border border-cyan-200",
    "Problem Solving": "bg-orange-50 text-orange-700 border border-orange-200",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold", colors[category] ?? "bg-gray-50 text-gray-700 border border-gray-200")}>
      {category}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded-full bg-gray-100" />
        <div className="w-14 h-5 rounded-md bg-gray-100" />
        <div className="w-20 h-5 rounded-md bg-gray-100" />
      </div>
      <div className="space-y-2 mb-4">
        <div className="h-4 bg-gray-100 rounded w-full" />
        <div className="h-4 bg-gray-100 rounded w-5/6" />
        <div className="h-4 bg-gray-100 rounded w-3/4" />
      </div>
      <div className="flex gap-2 pt-3 border-t border-gray-50">
        <div className="w-24 h-7 rounded-lg bg-gray-100" />
        <div className="w-24 h-7 rounded-lg bg-gray-100" />
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, trend, color }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  trend?: string;
  color: "blue" | "purple" | "green" | "amber";
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-violet-50 text-violet-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between mb-4">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", colorMap[color])}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span className="flex items-center gap-1 text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
            <TrendingUp className="w-3 h-3" />
            {trend}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-slate-900 mb-0.5">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// LANDING PAGE
// ─────────────────────────────────────────────────────────

function LandingNav({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <nav className={cn(
      "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
      scrolled ? "bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm" : "bg-transparent"
    )}>
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <button onClick={() => onNavigate("landing")} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-slate-900 tracking-tight">InterviewAI</span>
        </button>

        <div className="hidden md:flex items-center gap-8">
          {["Features", "Pricing", "About"].map((link) => (
            <button key={link} className="text-sm text-slate-500 hover:text-slate-900 transition-colors font-medium">
              {link}
            </button>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={() => onNavigate("login")}
            className="text-sm text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg hover:bg-gray-100 transition-all font-medium"
          >
            Sign in
          </button>
          <button
            onClick={() => onNavigate("register")}
            className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-all font-semibold shadow-sm hover:shadow-md"
          >
            Get Started Free
          </button>
        </div>

        <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors">
          {mobileOpen ? <X className="w-5 h-5 text-slate-600" /> : <Menu className="w-5 h-5 text-slate-600" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-6 py-4 space-y-1">
          {["Features", "Pricing", "About"].map((link) => (
            <button key={link} className="block w-full text-left text-sm text-slate-600 py-2.5 hover:text-slate-900">
              {link}
            </button>
          ))}
          <div className="pt-3 space-y-2">
            <button onClick={() => { onNavigate("login"); setMobileOpen(false); }} className="block w-full text-center text-sm border border-gray-200 text-slate-700 py-2.5 rounded-lg hover:bg-gray-50 font-medium">
              Sign in
            </button>
            <button onClick={() => { onNavigate("register"); setMobileOpen(false); }} className="block w-full text-center text-sm bg-blue-600 text-white py-2.5 rounded-lg font-semibold">
              Get Started Free
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}

function Hero({ onNavigate }: { onNavigate: (p: Page) => void }) {
  return (
    <section className="relative pt-28 pb-20 overflow-hidden">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-gradient-to-b from-blue-50/80 via-indigo-50/30 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-20 right-0 w-96 h-96 bg-violet-50/40 rounded-full blur-3xl" />
      </div>

      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-700 px-3 py-1.5 rounded-full text-xs font-semibold mb-6">
            <Sparkles className="w-3 h-3" />
            AI-Powered Interview Preparation
          </div>

          <h1 className="text-5xl md:text-[3.5rem] font-extrabold text-slate-900 leading-[1.1] tracking-tight mb-6">
            Ace Your Next<br />
            <span className="text-blue-600">Technical Interview</span>
          </h1>

          <p className="text-lg text-slate-500 leading-relaxed mb-10 max-w-2xl mx-auto">
            Generate hyper-relevant interview questions tailored to your role, experience,
            and target company. Practice smarter with AI-generated answers and structured guidance.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => onNavigate("register")}
              className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold text-base transition-all duration-200 shadow-sm hover:shadow-lg hover:-translate-y-px"
            >
              Start Preparing Free
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate("login")}
              className="inline-flex items-center justify-center gap-2 bg-white border border-gray-200 hover:border-gray-300 text-slate-700 px-6 py-3 rounded-xl font-semibold text-base transition-all duration-200 hover:bg-gray-50"
            >
              Sign In
            </button>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-5 text-sm text-slate-400">
            {["No credit card required", "5 free questions daily", "Cancel anytime"].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-500" />
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* App preview */}
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl shadow-blue-100/30 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-emerald-400" />
              <span className="text-xs text-slate-400 ml-3">Generated for: Senior Frontend Engineer · 10 questions · Hard</span>
            </div>
            <div className="p-5 space-y-2.5">
              {[
                { n: 1, d: "Medium" as Difficulty, c: "Technical", q: "Explain the Virtual DOM and how React's Fiber reconciliation algorithm works." },
                { n: 2, d: "Hard" as Difficulty, c: "System Design", q: "Design a real-time collaborative document editor supporting 10,000 concurrent users." },
                { n: 3, d: "Easy" as Difficulty, c: "Behavioral", q: "Tell me about a challenging project that pushed you beyond your comfort zone." },
              ].map((item) => (
                <div key={item.n} className="flex items-start gap-3 p-3.5 rounded-xl bg-gray-50 hover:bg-blue-50/60 transition-colors cursor-pointer group border border-transparent hover:border-blue-100">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {item.n}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      <DifficultyBadge difficulty={item.d} />
                      <CategoryBadge category={item.c} />
                    </div>
                    <p className="text-sm text-slate-700 leading-snug">{item.q}</p>
                  </div>
                  <Eye className="w-4 h-4 text-slate-300 group-hover:text-blue-400 transition-colors flex-shrink-0 mt-0.5" />
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <span className="text-xs text-slate-400">Showing 3 of 10 questions</span>
                <button onClick={() => onNavigate("register")} className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  Generate yours <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-violet-50 text-violet-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    pink: "bg-pink-50 text-pink-600",
    teal: "bg-teal-50 text-teal-600",
  };

  return (
    <section className="py-20 bg-slate-50">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-3 tracking-tight">Everything you need to prepare</h2>
          <p className="text-slate-500 max-w-xl mx-auto">A complete interview preparation platform built for modern engineering roles at top-tier companies.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-default">
              <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center mb-4", colorMap[f.color])}>
                <f.icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">{f.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhyChooseUs() {
  const points = [
    { icon: Zap, title: "Sub-3s Generation", desc: "Questions ready in under 3 seconds, tailored to your exact role and target difficulty." },
    { icon: Shield, title: "Quality Validated", desc: "Every question is benchmarked against real patterns from FAANG and top startups." },
    { icon: Globe, title: "Any Role, Any Stack", desc: "Frontend, backend, DevOps, ML, PM — we cover every engineering discipline comprehensively." },
    { icon: Award, title: "Proven Results", desc: "93% of users report feeling significantly more confident heading into technical interviews." },
  ];

  return (
    <section className="py-20">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-blue-600 text-sm font-semibold mb-4">
              <Target className="w-4 h-4" />
              Why InterviewAI
            </div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-4">Built for engineers who take preparation seriously</h2>
            <p className="text-slate-500 mb-8 leading-relaxed">
              We built InterviewAI because we know how stressful technical interviews are.
              Spending 40 hours grinding LeetCode doesn&apos;t guarantee readiness for
              behavioral and system design rounds. We fix that.
            </p>
            <div className="space-y-5">
              {points.map((p, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <p.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-0.5">{p.title}</h4>
                    <p className="text-sm text-slate-500 leading-relaxed">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-7 text-white shadow-xl shadow-blue-200/40">
            <div className="grid grid-cols-2 gap-4 mb-6">
              {[
                { value: "50K+", label: "Questions Generated" },
                { value: "12K+", label: "Engineers Prepared" },
                { value: "93%", label: "Confidence Boost" },
                { value: "4.9★", label: "Average Rating" },
              ].map((s, i) => (
                <div key={i} className="bg-white/10 rounded-xl p-5 text-center border border-white/10">
                  <div className="text-3xl font-extrabold mb-1">{s.value}</div>
                  <div className="text-sm text-blue-100">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="bg-white/10 border border-white/10 rounded-xl p-4">
              <p className="text-sm text-blue-100 leading-relaxed italic">
                &ldquo;I generated 50 targeted questions, practiced for two weeks, and landed
                my dream job at a Series B startup. The system design questions were spot-on.&rdquo;
              </p>
              <div className="mt-3 flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">AK</div>
                <span className="text-xs text-blue-200">Alex Kim — Backend Engineer at Vercel</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section className="py-20 bg-slate-50">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-3">Loved by engineers everywhere</h2>
          <p className="text-slate-500">Trusted by 12,000+ software engineers at top companies</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-md transition-shadow duration-200">
              <div className="flex items-center gap-1 mb-4">
                {Array.from({ length: t.rating }).map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm text-slate-600 leading-relaxed mb-5">&ldquo;{t.text}&rdquo;</p>
              <div className="flex items-center gap-3 pt-4 border-t border-gray-50">
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
                  {t.avatar}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{t.name}</div>
                  <div className="text-xs text-slate-500">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <section className="py-20">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-3">Frequently asked questions</h2>
          <p className="text-slate-500">Everything you need to know about InterviewAI.</p>
        </div>
        <div className="space-y-2.5">
          {FAQS.map((faq, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl overflow-hidden hover:border-gray-200 transition-colors">
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-slate-900 text-sm pr-4">{faq.q}</span>
                <ChevronDown className={cn("w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-200", openIndex === i && "rotate-180")} />
              </button>
              {openIndex === i && (
                <div className="px-5 pb-5">
                  <p className="text-sm text-slate-500 leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}



export function LandingFooter({ onNavigate }: { onNavigate: (p: Page) => void }) {
  // Track which legal link content is open
  const [openSection, setOpenSection] = useState<string | null>(null);

  // Define the legal links and their corresponding content details
  const legalSections = [
    {
      title: "Privacy Policy",
      content: "Your privacy is important to us. We secure your personal information, optimize AI processing logs, and never sell your data to third parties."
    },
    {
      title: "Terms of Service",
      content: "By using InterviewAI, you agree to use our automated question generation workspace responsibly. Reverse engineering or scraping platform data is prohibited."
    },
    {
      title: "Security",
      content: "We implement industry-standard end-to-end encryption (AES-256) for secure storage of your data, session handling, and credential management."
    },
    {
      title: "Cookie Policy",
      content: "We use standard tracking cookies to maintain your authentication state and analyze user platform interactions to improve generation context quality."
    }
  ];

  return (
    <footer className="bg-slate-900 text-white py-16">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10">
          
          {/* Brand & Socials Column */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold">InterviewAI</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed mb-5">
              AI-powered interview preparation for modern software engineers.
            </p>
            <div className="flex gap-2">
  {[
    { Icon: Github, href: "https://github.com/vinaysingh-05" },
    { Icon: Twitter, href: "https://x.com/vinaykumar18005" }
  ].map(({ Icon, href }, i) => (
    <a 
      key={i} 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer"
      className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors"
    >
      <Icon className="w-4 h-4 text-slate-400" />
    </a>
  ))}
</div>
          </div>

          {/* Newly formatted Interactive Legal Column */}
          <div>
            <h4 className="text-sm font-semibold mb-4 text-white">Legal Documents</h4>
            <ul className="space-y-3">
              {legalSections.map((item) => (
                <li key={item.title} className="border-b border-slate-800 pb-3 last:border-0">
                  <button 
                    onClick={() => setOpenSection(openSection === item.title ? null : item.title)}
                    className="w-full text-left text-sm text-slate-400 hover:text-white transition-colors font-medium flex justify-between items-center"
                  >
                    <span>{item.title}</span>
                    <span className="text-xs text-slate-600 select-none">
                      {openSection === item.title ? '▲ Hide' : '▼ View Details'}
                    </span>
                  </button>
                  
                  {/* Conditionally rendered details text */}
                  {openSection === item.title && (
                    <div className="mt-2 text-xs text-slate-400 leading-relaxed bg-slate-950 p-3 rounded border border-slate-800">
                      {item.content}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-500">© 2026 InterviewAI, Inc. All rights reserved.</p>
          <p className="text-xs text-slate-500">Made with ♥ for engineers everywhere</p>
        </div>
      </div>
    </footer>
  );
}

function LandingPage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  return (
    <div className="bg-white">
      <LandingNav onNavigate={onNavigate} />
      <Hero onNavigate={onNavigate} />
      <FeaturesSection />
      <WhyChooseUs />
      <TestimonialsSection />
      <FAQSection />
      <LandingFooter onNavigate={onNavigate} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// AUTH PAGES
// ─────────────────────────────────────────────────────────

function LoginPage({ onNavigate, onLogin }: { onNavigate: (p: Page) => void; onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Email is required."); return; }
    if (!password) { setError("Password is required."); return; }
    setLoading(true);
    try {
      await login(email.trim(), password, remember);
      onLogin();
      toast.success("Welcome back!");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      setError(getAuthErrorMessage(code));
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) { toast.error("Enter your email address."); return; }
    setForgotLoading(true);
    try {
      await resetPassword(forgotEmail.trim());
      toast.success("Password reset email sent! Check your inbox.");
      setShowForgot(false);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      toast.error(getAuthErrorMessage(code));
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <>
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <button onClick={() => onNavigate("landing")} className="inline-flex items-center gap-2.5 mb-6 hover:opacity-80 transition-opacity">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900">InterviewAI</span>
          </button>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome back</h1>
          <p className="text-slate-500 text-sm mt-1">Sign in to continue your preparation</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-7">
          {error && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                  placeholder="you@company.com"
                  autoComplete="email"
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-semibold text-slate-700">Password</label>
                <button type="button" onClick={() => setShowForgot(true)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Forgot password?</button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="w-4 h-4 rounded border-gray-300 accent-blue-600" />
              <span className="text-sm text-slate-600">Remember me</span>
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 mt-2 shadow-sm hover:shadow-md"
            >
              {loading ? <><RefreshCw className="w-4 h-4 animate-spin" />Signing in...</> : "Sign in"}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-slate-500">
            Don&apos;t have an account?{" "}
            <button onClick={() => onNavigate("register")} className="text-blue-600 font-semibold hover:text-blue-700">
              Sign up free
            </button>
          </p>
        </div>
      </div>
    </div>

    {/* Forgot Password Modal */}
    {showForgot && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xl p-6 max-w-sm w-full">
          <h3 className="font-bold text-slate-900 mb-1.5">Reset password</h3>
          <p className="text-sm text-slate-500 mb-4">Enter your email and we&apos;ll send you a reset link.</p>
          <form onSubmit={handleForgot} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                placeholder="you@company.com"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowForgot(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-slate-600 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={forgotLoading} className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold flex items-center justify-center gap-2">
                {forgotLoading ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Sending...</> : "Send link"}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
  </>
  );
}

function RegisterPage({ onNavigate, onLogin }: { onNavigate: (p: Page) => void; onLogin: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Full name is required."); return; }
    if (!email.trim()) { setError("Email is required."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
      await signUp(name.trim(), email.trim(), password);
      onLogin();
      toast.success("Account created! Welcome to InterviewAI.");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      setError(getAuthErrorMessage(code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <button onClick={() => onNavigate("landing")} className="inline-flex items-center gap-2.5 mb-6 hover:opacity-80 transition-opacity">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900">InterviewAI</span>
          </button>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Create your account</h1>
          <p className="text-slate-500 text-sm mt-1">Start preparing smarter, not harder</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-7">
          {error && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Full name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" placeholder="Jordan Davis" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" placeholder="you@company.com" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-9 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" placeholder="Min. 8 characters" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 mt-2 shadow-sm hover:shadow-md"
            >
              {loading ? <><RefreshCw className="w-4 h-4 animate-spin" />Creating account...</> : "Create account"}
            </button>
            <p className="text-xs text-slate-400 text-center">
              By signing up, you agree to our Terms{" "}
              {" "}and{" "}
            </p>
          </form>
          <p className="mt-4 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <button onClick={() => onNavigate("login")} className="text-blue-600 font-semibold hover:text-blue-700">Sign in</button>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// DASHBOARD LAYOUT
// ─────────────────────────────────────────────────────────

const NAV_ITEMS: { id: Page; icon: React.ElementType; label: string }[] = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { id: "generate", icon: Wand2, label: "Generate Interview" },
  { id: "history", icon: History, label: "History" },
  { id: "saved", icon: Bookmark, label: "Saved Questions" },
  { id: "profile", icon: User, label: "Profile" },
  { id: "settings", icon: Settings, label: "Settings" },
  { id: "about", icon: Info, label: "About" },
];

function Sidebar({
  currentPage, onNavigate, isOpen, onClose, onLogout,
}: {
  currentPage: Page; onNavigate: (p: Page) => void;
  isOpen: boolean; onClose: () => void; onLogout: () => void;
}) {
  const { user } = useAuthContext();
  const displayName = user?.displayName ?? user?.email?.split("@")[0] ?? "User";
  const initials = displayName.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
  const email = user?.email ?? "";

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={onClose} />
      )}
      <aside className={cn(
        "fixed top-0 left-0 bottom-0 z-40 w-60 bg-white border-r border-gray-100 flex flex-col transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="h-16 flex items-center gap-2.5 px-4 border-b border-gray-100 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-900 tracking-tight">InterviewAI</span>
          <button onClick={onClose} className="ml-auto lg:hidden p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => { onNavigate(item.id); onClose(); }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 text-left",
                  currentPage === item.id
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : "text-slate-600 hover:bg-gray-50 hover:text-slate-900"
                )}
              >
                <item.icon className={cn("w-4 h-4 flex-shrink-0", currentPage === item.id ? "text-blue-600" : "text-slate-400")} />
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="p-3 border-t border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3 px-3 py-2.5 mb-1">
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{initials}</div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-800 truncate">{displayName}</div>
              <div className="text-xs text-slate-400 truncate">{email}</div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all duration-150"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      </aside>
    </>
  );
}

function TopNav({ currentPage, onMenuToggle, onNavigate }: {
  currentPage: Page; onMenuToggle: () => void; onNavigate: (p: Page) => void;
}) {
  const { user } = useAuthContext();
  const displayName = user?.displayName ?? user?.email?.split("@")[0] ?? "User";
  const initials = displayName.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const pageTitles: Partial<Record<Page, string>> = {
    dashboard: "Dashboard", generate: "Generate Interview",
    history: "History", saved: "Saved Questions",
    profile: "Profile", settings: "Settings", about: "About",
  };

  return (
    <header className="sticky top-0 z-20 h-16 bg-white border-b border-gray-100 flex items-center px-4 gap-3">
      <button onClick={onMenuToggle} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0">
        <Menu className="w-5 h-5 text-slate-500" />
      </button>

      <h1 className="text-base font-semibold text-slate-900 hidden sm:block flex-shrink-0">
        {pageTitles[currentPage] ?? ""}
      </h1>

      <div className="flex-1 max-w-xs ml-1 hidden md:block">
  
      </div>

      <div className="ml-auto flex items-center gap-1">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false); }}
            className="relative w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <Bell className="w-4 h-4 text-slate-500" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full border-2 border-white" />
          </button>
          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">Notifications</span>
                <button className="text-xs text-blue-600 font-medium hover:text-blue-700">Mark all read</button>
              </div>
              <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                {[
                  { title: "New feature: PDF export", desc: "Download any session as a PDF", time: "5m ago", unread: true },
                  { title: "Practice streak: 7 days!", desc: "You're on a roll — keep it up", time: "1h ago", unread: true },
                  { title: "Weekly summary ready", desc: "You generated 23 questions this week", time: "2h ago", unread: false },
                ].map((n, i) => (
                  <div key={i} className={cn("px-4 py-3 hover:bg-gray-50 cursor-pointer", n.unread && "bg-blue-50/50")}>
                    <div className="flex items-start gap-2.5">
                      <div className={cn("w-2 h-2 rounded-full flex-shrink-0 mt-1.5", n.unread ? "bg-blue-500" : "bg-transparent")} />
                      <div>
                        <div className="text-sm font-medium text-slate-900">{n.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{n.desc}</div>
                        <div className="text-xs text-slate-400 mt-1">{n.time}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowNotifications(false)} className="w-full p-3 text-xs text-blue-600 hover:bg-gray-50 text-center border-t border-gray-100 font-medium">
                View all notifications
              </button>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false); }}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">{initials}</div>
            <span className="text-sm font-medium text-slate-700 hidden sm:block">{displayName}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 overflow-hidden">
              <div className="p-3.5 border-b border-gray-100">
                <div className="text-sm font-semibold text-slate-900">{displayName}</div>
                <div className="text-xs text-slate-500 mt-0.5">{user?.email ?? ""}</div>
              </div>
              {[
                { label: "Profile", page: "profile" as Page },
                { label: "Settings", page: "settings" as Page },
                { label: "About", page: "about" as Page },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => { onNavigate(item.page); setShowUserMenu(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-gray-50 transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function DashboardLayout({
  children, currentPage, onNavigate, onLogout,
}: {
  children: React.ReactNode; currentPage: Page;
  onNavigate: (p: Page) => void; onLogout: () => void;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={onLogout}
      />
      <div className="lg:pl-60 min-h-screen flex flex-col">
        <TopNav currentPage={currentPage} onMenuToggle={() => setSidebarOpen(true)} onNavigate={onNavigate} />
        <main className="flex-1 p-5 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// DASHBOARD HOME
// ─────────────────────────────────────────────────────────

function DashboardHome({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const { user } = useAuthContext();
  const firstName = (user?.displayName ?? user?.email ?? "there").split(" ")[0];

  const activityIconMap: Record<string, React.ElementType> = {
    generate: Wand2, save: Bookmark, check: CheckCircle, download: Download,
  };
  const activityColorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-violet-50 text-violet-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-md shadow-blue-200/30">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold mb-1">Welcome back, {firstName}! 👋</h2>
            <p className="text-blue-100 text-sm">You&apos;ve generated 47 questions this week. Keep the momentum going.</p>
          </div>
          <button
            onClick={() => onNavigate("generate")}
            className="flex items-center gap-2 bg-white text-blue-600 hover:bg-blue-50 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex-shrink-0 shadow-sm"
          >
            <Wand2 className="w-4 h-4" />
            Generate Questions
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Interviews" value="24" icon={BarChart3} trend="+12%" color="blue" />
        <StatCard label="Saved Questions" value="87" icon={Bookmark} trend="+8%" color="purple" />
        <StatCard label="Practice Sessions" value="156" icon={Activity} trend="+23%" color="green" />
        <StatCard label="Success Rate" value="91%" icon={Award} trend="+4%" color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-slate-900">Recent Activity</h3>
            <button onClick={() => onNavigate("history")} className="text-xs text-blue-600 hover:text-blue-700 font-semibold">
              View all
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {MOCK_ACTIVITIES.map((a) => {
              const Icon = activityIconMap[a.icon] ?? Activity;
              return (
                <div key={a.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", activityColorMap[a.color] ?? "bg-gray-50 text-gray-600")}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900">{a.action}</div>
                    <div className="text-xs text-slate-500 truncate">{a.target}</div>
                  </div>
                  <div className="text-xs text-slate-400 whitespace-nowrap">{a.time}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-slate-900 mb-3.5">Quick Actions</h3>
            <div className="space-y-2">
              {[
                { icon: Wand2, label: "Generate new interview", page: "generate" as Page, color: "text-blue-600" },
                { icon: History, label: "View history", page: "history" as Page, color: "text-violet-600" },
                { icon: Bookmark, label: "Saved questions", page: "saved" as Page, color: "text-amber-600" },
              ].map((action) => (
                <button
                  key={action.label}
                  onClick={() => onNavigate(action.page)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all text-left group"
                >
                  <action.icon className={cn("w-4 h-4 flex-shrink-0", action.color)} />
                  <span className="text-sm text-slate-700 font-medium group-hover:text-slate-900">{action.label}</span>
                  <ChevronRight className="w-4 h-4 text-slate-300 ml-auto group-hover:text-blue-400 transition-colors" />
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-slate-900 mb-3.5">Recent Sessions</h3>
            <div className="space-y-3.5">
              {MOCK_SESSIONS.slice(0, 3).map((s) => (
                <div key={s.id} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Briefcase className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{s.role}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <DifficultyBadge difficulty={s.difficulty as Difficulty} />
                      <span className="text-xs text-slate-400">{s.date}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// QUESTION CARD
// ─────────────────────────────────────────────────────────

function QuestionCard({ question, onToggleSave }: {
  question: Question; onToggleSave: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [copiedQ, setCopiedQ] = useState(false);
  const [copiedA, setCopiedA] = useState(false);

  const copyText = (text: string, setCopied: (v: boolean) => void, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={cn(
      "bg-white rounded-xl border shadow-sm hover:shadow-md transition-all duration-200",
      expanded ? "border-blue-200" : "border-gray-100"
    )}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
              {question.number}
            </span>
            <DifficultyBadge difficulty={question.difficulty} />
            <CategoryBadge category={question.category} />
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={() => {
                onToggleSave(question.id);
                toast[question.saved ? "info" : "success"](question.saved ? "Removed from saved" : "Question saved!");
              }}
              className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                question.saved ? "bg-amber-50 text-amber-500 hover:bg-amber-100" : "hover:bg-gray-100 text-slate-400")}
              title="Bookmark"
            >
              <Bookmark className={cn("w-4 h-4", question.saved && "fill-amber-400")} />
            </button>
            <button onClick={() => toast.success("Share link copied!")} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-slate-400 flex items-center justify-center transition-colors" title="Share">
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-colors", expanded ? "bg-blue-50 text-blue-600" : "hover:bg-gray-100 text-slate-400")}
              title="Expand"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className={cn("text-sm text-slate-800 leading-relaxed", !expanded && "line-clamp-3")}>
          {question.question}
        </p>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {question.tags.map((tag) => (
            <span key={tag} className="text-xs text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-gray-100">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Action bar */}
      <div className="px-5 py-3 border-t border-gray-50 flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setShowAnswer(!showAnswer)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
            showAnswer ? "bg-blue-100 text-blue-700" : "bg-gray-50 text-slate-600 hover:bg-gray-100"
          )}
        >
          <Eye className="w-3.5 h-3.5" />
          {showAnswer ? "Hide Answer" : "Show Answer"}
        </button>
        <button
          onClick={() => copyText(question.question, setCopiedQ, "Question")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-50 text-slate-600 hover:bg-gray-100 transition-colors"
        >
          {copiedQ ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          Copy Question
        </button>
        {showAnswer && (
          <button
            onClick={() => copyText(question.answer, setCopiedA, "Answer")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-50 text-slate-600 hover:bg-gray-100 transition-colors"
          >
            {copiedA ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            Copy Answer
          </button>
        )}
      </div>

      {/* Answer panel */}
      {showAnswer && (
        <div className="px-5 pb-5">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <Brain className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Model Answer</span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{question.answer}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// GENERATE PAGE
// ─────────────────────────────────────────────────────────

function GeneratePage() {
  const { add: addToHistory } = useHistory();
  const graniteReady = isGraniteConfigured();
  const [form, setForm] = useState({
    jobRole: "",
    experienceLevel: "Mid-Level",
    difficulty: "Mixed",
    questionType: "All",
    programmingLanguage: "JavaScript",
    numberOfQuestions: "5",
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [genError, setGenError] = useState("");

  const updateQ = (id: string) => setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, saved: !q.saved } : q));

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenError("");
    if (!form.jobRole.trim()) { toast.error("Please enter a job role"); return; }
    setIsGenerating(true);
    setHasGenerated(false);
    try {
      const result = await generateQuestions({
        jobRole: form.jobRole.trim(),
        experienceLevel: form.experienceLevel,
        difficulty: form.difficulty,
        questionType: form.questionType,
        programmingLanguage: form.programmingLanguage,
        numberOfQuestions: parseInt(form.numberOfQuestions),
      });
      const mapped: Question[] = result.questions.map((q, i) => ({
        id: `q-${Date.now()}-${i}`,
        number: i + 1,
        difficulty: (["Easy", "Medium", "Hard"].includes(q.difficulty) ? q.difficulty : "Medium") as Difficulty,
        category: q.category || "General",
        question: q.question,
        answer: q.answer,
        tags: [q.category || "General", form.difficulty, form.questionType].filter(Boolean),
        saved: false,
      }));
      setQuestions(mapped);
      setHasGenerated(true);
      toast.success(`Generated ${mapped.length} interview questions!`);
      // Save to localStorage history
      const session: HistorySession = {
        id: `session-${Date.now()}`,
        role: form.jobRole.trim(),
        level: form.experienceLevel,
        difficulty: form.difficulty,
        type: form.questionType,
        questionCount: mapped.length,
        date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        questions: mapped.map((q) => ({ question: q.question, answer: q.answer, difficulty: q.difficulty, category: q.category })),
      };
      addToHistory(session);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate questions.";
      setGenError(msg);
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPDF = useCallback(() => {
    if (!questions.length) return;
    generatePDF({
      title: `Interview Questions — ${form.jobRole}`,
      role: form.jobRole,
      level: form.experienceLevel,
      difficulty: form.difficulty,
      type: form.questionType,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      questions: questions.map((q) => ({ number: q.number, question: q.question, answer: q.answer, difficulty: q.difficulty, category: q.category })),
    });
  }, [questions, form]);

  const inputCls = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-all";
  const selectCls = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-all appearance-none cursor-pointer";

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm lg:sticky lg:top-6">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-0.5">
                <Wand2 className="w-4 h-4 text-blue-600" />
                <h2 className="font-semibold text-slate-900">Configure Interview</h2>
              </div>
              <p className="text-xs text-slate-500">Fill in the details below to generate tailored questions</p>
            </div>

            {!graniteReady && (
              <div className="mx-5 mt-4 flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                <span>
                  Gemini API key not set. Add{" "}
                  <code className="font-mono bg-amber-100 px-1 rounded">VITE_GEMINI_API_KEY</code> to your{" "}
                  <code className="font-mono bg-amber-100 px-1 rounded">.env</code> file, then restart the dev server.
                </span>
              </div>
            )}

            <form onSubmit={handleGenerate} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Job Role <span className="text-red-400">*</span></label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={form.jobRole}
                    onChange={(e) => setForm((f) => ({ ...f, jobRole: e.target.value }))}
                    className={cn(inputCls, "pl-9")}
                    placeholder="e.g. Senior Frontend Engineer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Experience Level</label>
                <div className="relative">
                  <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <select value={form.experienceLevel} onChange={(e) => setForm((f) => ({ ...f, experienceLevel: e.target.value }))} className={cn(selectCls, "pl-9")}>
                    {["Junior (0-2 yrs)", "Mid-Level (2-5 yrs)", "Senior (5-8 yrs)", "Lead (8+ yrs)", "Staff / Principal"].map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Difficulty</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {["Easy", "Medium", "Hard", "Mixed"].map((d) => (
                    <button
                      key={d} type="button"
                      onClick={() => setForm((f) => ({ ...f, difficulty: d }))}
                      className={cn(
                        "py-2 rounded-lg text-xs font-semibold border transition-all",
                        form.difficulty === d ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "border-gray-200 text-slate-600 hover:border-blue-200 hover:bg-blue-50"
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Question Type</label>
                <div className="relative">
                  <List className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <select value={form.questionType} onChange={(e) => setForm((f) => ({ ...f, questionType: e.target.value }))} className={cn(selectCls, "pl-9")}>
                    {["All", "Technical", "Behavioral", "System Design", "Problem Solving"].map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Programming Language</label>
                <div className="relative">
                  <Code2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <select value={form.programmingLanguage} onChange={(e) => setForm((f) => ({ ...f, programmingLanguage: e.target.value }))} className={cn(selectCls, "pl-9")}>
                    {["JavaScript", "TypeScript", "Python", "Java", "Go", "Rust", "C++", "Not Applicable"].map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Number of Questions</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {["5", "10", "15", "20"].map((n) => (
                    <button
                      key={n} type="button"
                      onClick={() => setForm((f) => ({ ...f, numberOfQuestions: n }))}
                      className={cn(
                        "py-2 rounded-lg text-xs font-semibold border transition-all",
                        form.numberOfQuestions === n ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "border-gray-200 text-slate-600 hover:border-blue-200 hover:bg-blue-50"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isGenerating}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white py-3 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 shadow-sm hover:shadow-md hover:-translate-y-px"
              >
                {isGenerating ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" />Generating questions...</>
                ) : (
                  <><Sparkles className="w-4 h-4" />Generate Questions</>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Results panel */}
        <div className="lg:col-span-3 space-y-4">
          {isGenerating && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <RefreshCw className="w-4 h-4 text-blue-600 animate-spin flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-blue-900">Generating your interview questions...</div>
                  <div className="text-xs text-blue-600 mt-0.5">Analyzing role requirements and calibrating difficulty</div>
                </div>
              </div>
              {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
            </div>
          )}

          {!isGenerating && genError && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{genError}</span>
            </div>
          )}

          {!isGenerating && !hasGenerated && !genError && (
            <div className="flex flex-col items-center justify-center py-28 text-center bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                <Wand2 className="w-7 h-7 text-blue-500" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-2">Ready to generate</h3>
              <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
                Configure your interview settings on the left and click &ldquo;Generate Questions&rdquo; to get started.
              </p>
            </div>
          )}

          {!isGenerating && hasGenerated && questions.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">Generated Questions</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {questions.length} questions · {form.jobRole} · {form.difficulty}
                  </p>
                </div>
                <button
                  onClick={handleExportPDF}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-slate-600 hover:bg-gray-50 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export PDF
                </button>
              </div>
              <div className="space-y-4">
                {questions.map((q) => <QuestionCard key={q.id} question={q} onToggleSave={updateQ} />)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// HISTORY PAGE
// ─────────────────────────────────────────────────────────

function HistoryPage() {
  const { sessions, remove } = useHistory();
  const [search, setSearch] = useState("");
  const [filterDiff, setFilterDiff] = useState("All");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewSession, setViewSession] = useState<string | null>(null);

  const filtered = sessions.filter(
    (s) => s.role.toLowerCase().includes(search.toLowerCase()) && (filterDiff === "All" || s.difficulty === filterDiff)
  );

  const handleDelete = (id: string) => {
    remove(id);
    setDeleteId(null);
    toast.success("Session deleted");
  };

  const handleDownloadPDF = (s: HistorySession) => {
    generatePDF({
      title: `Interview Questions — ${s.role}`,
      role: s.role,
      level: s.level,
      difficulty: s.difficulty,
      type: s.type,
      date: s.date,
      questions: s.questions.map((q, i) => ({ number: i + 1, question: q.question, answer: q.answer, difficulty: q.difficulty, category: q.category })),
    });
  };

  const viewingSession = viewSession ? sessions.find((s) => s.id === viewSession) : null;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">Interview History</h2>
          <p className="text-xs text-slate-500 mt-0.5">{sessions.length} sessions total</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sessions..."
              className="pl-8 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-44"
            />
          </div>
          <select
            value={filterDiff} onChange={(e) => setFilterDiff(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
          >
            {["All", "Easy", "Medium", "Hard"].map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl p-6 max-w-sm w-full">
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-4">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="font-bold text-slate-900 mb-1.5">Delete session?</h3>
            <p className="text-sm text-slate-500 mb-5 leading-relaxed">
              This action cannot be undone. The session and all its questions will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-slate-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-100 shadow-sm">
          <AlertCircle className="w-10 h-10 text-slate-200 mb-3" />
          <h3 className="font-semibold text-slate-700 mb-1">No sessions found</h3>
          <p className="text-sm text-slate-400">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-slate-50/70">
                  <th className="text-left text-xs font-semibold text-slate-500 px-5 py-3.5 uppercase tracking-wide">Role</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3.5 uppercase tracking-wide hidden sm:table-cell">Level</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3.5 uppercase tracking-wide hidden md:table-cell">Difficulty</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3.5 uppercase tracking-wide hidden md:table-cell">Questions</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3.5 uppercase tracking-wide hidden lg:table-cell">Date</th>
                  <th className="text-right text-xs font-semibold text-slate-500 px-5 py-3.5 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                          <Briefcase className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <span className="text-sm font-semibold text-slate-900">{s.role}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <span className="text-sm text-slate-600">{s.level}</span>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <DifficultyBadge difficulty={s.difficulty as Difficulty} />
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <span className="text-sm text-slate-600">{s.questionCount} questions</span>
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <span className="text-sm text-slate-500">{s.date}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-0.5">
                        <button onClick={() => setViewSession(s.id)} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors" title="View">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDownloadPDF(s)} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors" title="Download PDF">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteId(s.id)} className="w-8 h-8 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100">
            <span className="text-xs text-slate-500">Showing {filtered.length} of {sessions.length} sessions</span>
            <div className="flex items-center gap-1">
              <button className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-slate-400 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button className="w-8 h-8 rounded-lg bg-blue-600 text-white text-xs font-semibold flex items-center justify-center">1</button>
              <button className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-slate-600 text-xs font-medium transition-colors">2</button>
              <button className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-slate-400 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View session modal */}
      {viewingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl p-6 max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900">{viewingSession.role}</h3>
                <p className="text-xs text-slate-500">{viewingSession.date} · {viewingSession.questionCount} questions · {viewingSession.difficulty}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleDownloadPDF(viewingSession)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-slate-600 hover:bg-gray-50">
                  <Download className="w-3.5 h-3.5" />PDF
                </button>
                <button onClick={() => setViewSession(null)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto space-y-3 flex-1">
              {viewingSession.questions.map((q, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                    <DifficultyBadge difficulty={(["Easy","Medium","Hard"].includes(q.difficulty) ? q.difficulty : "Medium") as Difficulty} />
                    <CategoryBadge category={q.category} />
                  </div>
                  <p className="text-sm font-medium text-slate-800 mb-2">{q.question}</p>
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                    <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1">Answer</p>
                    <p className="text-sm text-slate-700">{q.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// SAVED QUESTIONS PAGE
// ─────────────────────────────────────────────────────────

function SavedPage() {
  const [saved, setSaved] = useState<Question[]>(INITIAL_SAVED);
  const [search, setSearch] = useState("");

  const handleToggle = (id: string) => {
    setSaved((prev) => prev.filter((q) => q.id !== id));
    toast.info("Removed from saved");
  };

  const filtered = saved.filter((q) => q.question.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">Saved Questions</h2>
          <p className="text-xs text-slate-500 mt-0.5">{saved.length} bookmarked questions</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved..."
            className="pl-8 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-44"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-gray-100 shadow-sm text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
            <Bookmark className="w-6 h-6 text-amber-500" />
          </div>
          <h3 className="font-semibold text-slate-800 mb-1">
            {search ? "No matching questions" : "No saved questions yet"}
          </h3>
          <p className="text-sm text-slate-400">
            {search ? "Try a different search term" : "Bookmark questions while generating to see them here"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((q) => <QuestionCard key={q.id} question={q} onToggleSave={handleToggle} />)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// PROFILE PAGE
// ─────────────────────────────────────────────────────────

// Local-storage keys for fields Firebase Auth doesn't store
const LS_PROFILE_KEY = "interviewai_profile_extra";

function loadProfileExtra(): { role: string; company: string; location: string; bio: string } {
  try {
    const raw = localStorage.getItem(LS_PROFILE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { role: "", company: "", location: "", bio: "" };
}

function saveProfileExtra(data: { role: string; company: string; location: string; bio: string }) {
  localStorage.setItem(LS_PROFILE_KEY, JSON.stringify(data));
}

function ProfilePage() {
  const { user, refreshUser } = useAuthContext();
  const extra = loadProfileExtra();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    name: user?.displayName ?? "",
    email: user?.email ?? "",
    role: extra.role,
    company: extra.company,
    location: extra.location,
    bio: extra.bio,
  });

  // Keep local state in sync when auth user changes externally
  useEffect(() => {
    setProfile((prev) => ({
      ...prev,
      name: user?.displayName ?? prev.name,
      email: user?.email ?? prev.email,
    }));
  }, [user?.displayName, user?.email]);

  const initials = (profile.name || profile.email || "?")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const achievements = [
    { icon: Zap, label: "Fast Learner", desc: "Generated 10+ sessions", earned: true },
    { icon: Star, label: "Star Preparer", desc: "Saved 50+ questions", earned: true },
    { icon: Award, label: "Consistent", desc: "7-day streak", earned: true },
    { icon: Target, label: "Perfectionist", desc: "90%+ success rate", earned: false },
  ];

  const saveProfile = async () => {
    if (!profile.name.trim()) { toast.error("Name cannot be empty."); return; }
    setSaving(true);
    try {
      // Persist displayName to Firebase Auth
      await updateUserProfile(profile.name);
      // Force AuthContext to re-read the updated user object
      await refreshUser();
      // Persist extra fields to localStorage
      saveProfileExtra({
        role: profile.role,
        company: profile.company,
        location: profile.location,
        bio: profile.bio,
      });
      setEditing(false);
      toast.success("Profile updated successfully!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update profile.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-28 bg-gradient-to-r from-blue-600 to-blue-700" />
        <div className="px-6 pb-6">
          <div className="flex items-end justify-between -mt-10 mb-5">
            <div className="w-20 h-20 rounded-2xl bg-blue-100 text-blue-700 text-2xl font-extrabold flex items-center justify-center border-4 border-white shadow-lg">
              {initials}
            </div>
            <button
              onClick={() => editing ? saveProfile() : setEditing(true)}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-slate-600 hover:bg-gray-50 transition-all disabled:opacity-60"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Edit3 className="w-3.5 h-3.5" />}
              {saving ? "Saving..." : editing ? "Save Changes" : "Edit Profile"}
            </button>
          </div>

          {editing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(Object.entries(profile) as [keyof typeof profile, string][]).map(([key, val]) => (
                <div key={key} className={key === "bio" ? "sm:col-span-2" : ""}>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 capitalize">{key}</label>
                  {key === "bio" ? (
                    <textarea
                      value={val}
                      onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  ) : (
                    <input
                      type={key === "email" ? "email" : "text"}
                      value={val}
                      readOnly={key === "email"}
                      onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))}
                      className={cn(
                        "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500",
                        key === "email" && "bg-slate-50 cursor-not-allowed text-slate-400"
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">{profile.name || profile.email}</h2>
              {(profile.role || profile.company) && (
                <p className="text-sm text-slate-600 font-medium mt-0.5">
                  {[profile.role, profile.company].filter(Boolean).join(" at ")}
                </p>
              )}
              {profile.location && <p className="text-xs text-slate-400 mt-0.5">{profile.location}</p>}
              {profile.bio && <p className="text-sm text-slate-600 mt-3 leading-relaxed max-w-lg">{profile.bio}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Sessions" value="24" icon={BarChart3} color="blue" />
        <StatCard label="Generated" value="247" icon={Wand2} color="purple" />
        <StatCard label="Saved" value="87" icon={Bookmark} color="amber" />
        <StatCard label="Success Rate" value="91%" icon={Award} color="green" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-slate-900 mb-4">Achievements</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {achievements.map((a, i) => (
            <div
              key={i}
              className={cn(
                "flex flex-col items-center text-center p-4 rounded-xl border transition-all cursor-default",
                a.earned ? "border-blue-100 bg-blue-50/60" : "border-gray-100 bg-gray-50 opacity-50"
              )}
            >
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-2.5", a.earned ? "bg-blue-100 text-blue-600" : "bg-gray-200 text-gray-400")}>
                <a.icon className="w-5 h-5" />
              </div>
              <div className="text-xs font-bold text-slate-800">{a.label}</div>
              <div className="text-xs text-slate-400 mt-0.5">{a.desc}</div>
              {a.earned && <div className="mt-1.5 text-xs text-blue-600 font-semibold">Earned</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// SETTINGS PAGE
// ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{ minWidth: "2.5rem", width: "2.5rem", height: "1.5rem" }}
      className={cn(
        "relative rounded-full transition-colors duration-200 flex-shrink-0",
        checked ? "bg-blue-600" : "bg-gray-200"
      )}
    >
      <span
        className={cn(
          "absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 block",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

function SettingsPage() {
  const [activeTab, setActiveTab] = useState("notifications");
  const [notifs, setNotifs] = useState({ email: true, push: true, weekly: true, marketing: false });
  const [privacy, setPrivacy] = useState({ publicProfile: false, shareHistory: false, analytics: true });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const tabs = [
    { id: "notifications", label: "Notifications" },
    { id: "privacy", label: "Privacy" },
    { id: "appearance", label: "Appearance" },
    { id: "danger", label: "Danger Zone" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-5 py-4 text-sm font-semibold whitespace-nowrap transition-all border-b-2 -mb-px flex-shrink-0",
                activeTab === tab.id
                  ? "border-blue-600 text-blue-700 bg-blue-50/30"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-gray-50",
                tab.id === "danger" && activeTab === tab.id && "text-red-600 border-red-500"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === "notifications" && (
            <div>
              <p className="text-sm text-slate-500 mb-5">Manage how and when you receive notifications from InterviewAI.</p>
              <div className="space-y-1">
                {[
                  { key: "email" as const, label: "Email notifications", desc: "Receive session summaries and interview tips via email" },
                  { key: "push" as const, label: "Push notifications", desc: "Browser notifications for reminders and product updates" },
                  { key: "weekly" as const, label: "Weekly digest", desc: "A weekly summary of your preparation progress and stats" },
                  { key: "marketing" as const, label: "Product announcements", desc: "News about new features, improvements, and company updates" },
                ].map((item) => (
                  <div key={item.key} className="flex items-start justify-between gap-4 py-4 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{item.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{item.desc}</div>
                    </div>
                    <Toggle checked={notifs[item.key]} onChange={() => { setNotifs((n) => ({ ...n, [item.key]: !n[item.key] })); toast.success("Preference updated"); }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "privacy" && (
            <div>
              <p className="text-sm text-slate-500 mb-5">Control your privacy settings and data sharing preferences.</p>
              <div className="space-y-1">
                {[
                  { key: "publicProfile" as const, label: "Public profile", desc: "Allow other users to view your public profile and statistics" },
                  { key: "shareHistory" as const, label: "Share history anonymously", desc: "Contribute your session data to anonymous benchmarking" },
                  { key: "analytics" as const, label: "Usage analytics", desc: "Help us improve the product by sharing anonymous usage data" },
                ].map((item) => (
                  <div key={item.key} className="flex items-start justify-between gap-4 py-4 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{item.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{item.desc}</div>
                    </div>
                    <Toggle checked={privacy[item.key]} onChange={() => { setPrivacy((p) => ({ ...p, [item.key]: !p[item.key] })); toast.success("Preference updated"); }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "appearance" && (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-3">Theme</h4>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: "light", label: "Light", bg: "bg-white border-2 border-blue-500", active: true },
                  ].map((t) => (
                    <div key={t.id} className={cn("rounded-xl p-4 cursor-pointer border transition-all text-center", t.active ? "border-blue-300 bg-blue-50/30 shadow-sm" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50")}>
                      <div className={cn("w-full h-12 rounded-lg mb-2.5", t.bg)} />
                      <span className="text-xs font-semibold text-slate-700">{t.label}</span>
                      {t.active && <span className="ml-1 text-xs text-blue-600"> · Active</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-3">Language</h4>
                <select className="w-full max-w-xs px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer">
                  {["English (US)", "English (UK)", "Spanish", "French", "German", "Japanese"].map((l) => <option key={l}>{l}</option>)}
                </select>
              </div>
            </div>
          )}

          {activeTab === "danger" && (
            <div>
              <p className="text-sm text-slate-500 mb-5">These actions are permanent and cannot be undone. Proceed with extreme caution.</p>
              <div className="border border-red-100 rounded-xl p-5 bg-red-50/30">
                <h4 className="font-semibold text-slate-900 mb-1.5">Delete Account</h4>
                <p className="text-sm text-slate-500 mb-4 leading-relaxed">
                  Permanently delete your account and all associated data — sessions, saved questions, profile, and preferences. This action is irreversible.
                </p>
                <button onClick={() => setShowDeleteConfirm(true)} className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors">
                  Delete my account
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl p-6 max-w-sm w-full">
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-4">
              <AlertCircle className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="font-bold text-slate-900 mb-1.5">Delete your account?</h3>
            <p className="text-sm text-slate-500 mb-5 leading-relaxed">
              Your account, 24 sessions, and 87 saved questions will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-slate-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => { setShowDeleteConfirm(false); toast.error("Account deletion requested — check your email to confirm."); }} className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors">
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ABOUT PAGE
// ─────────────────────────────────────────────────────────

function AboutPage() {
  const stack = [
    { name: "React 18", desc: "UI Framework", color: "bg-blue-50 text-blue-700", abbr: "Re" },
    { name: "TypeScript", desc: "Type Safety", color: "bg-sky-50 text-sky-700", abbr: "TS" },
    { name: "Tailwind CSS", desc: "Styling", color: "bg-teal-50 text-teal-700", abbr: "Tw" },
    { name: "Vite", desc: "Build Tool", color: "bg-violet-50 text-violet-700", abbr: "Vi" },
    { name: "GPT-4o", desc: "AI Model", color: "bg-emerald-50 text-emerald-700", abbr: "AI" },
    { name: "Node.js", desc: "Backend Runtime", color: "bg-green-50 text-green-700", abbr: "No" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-sm flex-shrink-0">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">InterviewAI</h2>
            <p className="text-sm text-slate-500">AI-Powered Interview Question Generator</p>
            <span className="inline-flex items-center gap-1.5 mt-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Version 2.4.1 — Stable
            </span>
          </div>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed mb-5">
          InterviewAI is a production-grade interview preparation platform that leverages large language models
          to generate high-quality, role-specific interview questions. Built for software engineers who want
          to prepare efficiently for technical interviews at top-tier companies. Our AI is continuously trained
          on real interview patterns from FAANG, unicorn startups, and leading tech organizations.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-slate-900 mb-4">Tech Stack</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {stack.map((tech) => (
            <div key={tech.name} className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all cursor-default">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-xs font-extrabold flex-shrink-0", tech.color)}>
                {tech.abbr}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">{tech.name}</div>
                <div className="text-xs text-slate-400">{tech.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-slate-900 mb-4">Developer</h3>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-sm font-extrabold flex-shrink-0">
            VK
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900">VINAY KUMAR</div>
            <div className="text-sm text-slate-500"> AI_ML & Full Stack Engineer · Delhi </div>
          </div>
         <div className="flex gap-2">
  {[
    { Icon: Github, href: "https://github.com/vinaysingh-05" },
    { Icon: Twitter, href: "https://x.com/vinaykumar18005" }
  ].map(({ Icon, href }, i) => (
    <a 
      key={i} 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer"
      className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-slate-400 hover:text-slate-600 transition-colors"
    >
      <Icon className="w-3.5 h-3.5" />
    </a>
  ))}
</div>
        </div>
      </div>

      <div className="text-center text-xs text-slate-400 pb-2">
        © 2026 InterviewAI, Inc. · Made with ♥ for engineers everywhere · v2.4.1
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────

const PROTECTED_PAGES: Page[] = ["dashboard", "generate", "history", "saved", "profile", "settings", "about"];

export default function App() {
  const { user, loading: authLoading } = useAuthContext();
  const [page, setPage] = useState<Page>("landing");

  // Sync page with auth state
  useEffect(() => {
    if (!authLoading) {
      if (user && (page === "login" || page === "register")) {
        setPage("dashboard");
      }
    }
  }, [user, authLoading]);

  const navigate = (p: Page) => {
    if (PROTECTED_PAGES.includes(p) && !user) {
      setPage("login");
      return;
    }
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleLogin = () => {
    setPage("dashboard");
  };

  const handleLogout = async () => {
    try {
      await firebaseLogout();
      setPage("landing");
      toast.success("You have been signed out.");
    } catch {
      toast.error("Failed to sign out.");
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  const dashboardPages: Partial<Record<Page, React.ReactNode>> = {
    dashboard: <DashboardHome onNavigate={setPage} />,
    generate: <GeneratePage />,
    history: <HistoryPage />,
    saved: <SavedPage />,
    profile: <ProfilePage />,
    settings: <SettingsPage />,
    about: <AboutPage />,
  };

  if (page === "landing") {
    return (
      <>
        <Toaster position="top-right" richColors closeButton />
        <LandingPage onNavigate={navigate} />
      </>
    );
  }

  if (page === "login") {
    return (
      <>
        <Toaster position="top-right" richColors closeButton />
        <LoginPage onNavigate={navigate} onLogin={handleLogin} />
      </>
    );
  }

  if (page === "register") {
    return (
      <>
        <Toaster position="top-right" richColors closeButton />
        <RegisterPage onNavigate={navigate} onLogin={handleLogin} />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Toaster position="top-right" richColors closeButton />
        <LoginPage onNavigate={navigate} onLogin={handleLogin} />
      </>
    );
  }

  return (
    <>
      <Toaster position="top-right" richColors closeButton />
      <DashboardLayout currentPage={page} onNavigate={setPage} onLogout={handleLogout}>
        {dashboardPages[page] ?? <DashboardHome onNavigate={setPage} />}
      </DashboardLayout>
    </>
  );
}
