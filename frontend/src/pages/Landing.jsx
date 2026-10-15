import { Link } from 'react-router-dom';
import { LogIn, UserPlus, Calendar, ShieldCheck, Layers } from 'lucide-react';

/**
 * The timetable class blocks in the backdrop, matching the authentic scheduling aesthetic.
 */
const SCENE_BLOCKS = [
  { left: '3%',  top: '12%', w: '10%', h: '5%',  tone: 'var(--dept-cast)',  delay: '0s'    },
  { left: '14%', top: '24%', w: '8%',  h: '7%',  tone: 'var(--dept-cvmas)', delay: '2.1s'  },
  { left: '5%',  top: '38%', w: '11%', h: '6%',  tone: 'var(--dept-coed)',  delay: '5.4s'  },
  { left: '17%', top: '53%', w: '7%',  h: '8%',  tone: 'var(--dept-cbma)',  delay: '8.2s'  },
  { left: '2%',  top: '66%', w: '9%',  h: '5%',  tone: 'var(--dept-cast)',  delay: '3.6s'  },
  { left: '12%', top: '79%', w: '10%', h: '6%',  tone: 'var(--dept-cvmas)', delay: '10.5s' },
  { left: '80%', top: '10%', w: '9%',  h: '6%',  tone: 'var(--dept-cbma)',  delay: '1.2s'  },
  { left: '88%', top: '25%', w: '8%',  h: '8%',  tone: 'var(--dept-cast)',  delay: '6.8s'  },
  { left: '76%', top: '41%', w: '11%', h: '5%',  tone: 'var(--dept-coed)',  delay: '4.3s'  },
  { left: '86%', top: '56%', w: '9%',  h: '7%',  tone: 'var(--dept-cvmas)', delay: '9.1s'  },
  { left: '78%', top: '71%', w: '8%',  h: '6%',  tone: 'var(--dept-cbma)',  delay: '12.4s' },
  { left: '90%', top: '84%', w: '7%',  h: '5%',  tone: 'var(--dept-coed)',  delay: '7.5s'  },
];

const SEGOE_FONT = "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, sans-serif";

export default function Landing() {
  return (
    <div
      style={{ fontFamily: SEGOE_FONT }}
      className="min-h-screen relative flex flex-col justify-between overflow-x-hidden selection:bg-emerald-600 selection:text-white"
    >
      {/* ---------------------------------------------------------------
          The backdrop: timetable blueprint grid, atmospheric emerald & gold
          lighting, campus photo drift, and vignette.
         --------------------------------------------------------------- */}
      <div className="auth-scene" aria-hidden="true">
        <div className="auth-photo" style={{ backgroundImage: `url('/dlsau_bg.jpg')` }} />
        <div className="auth-blob auth-blob-1" />
        <div className="auth-blob auth-blob-2" />
        <div className="auth-blob auth-blob-3" />
        <div className="auth-grid" />
        {SCENE_BLOCKS.map((b, i) => (
          <div
            key={i}
            className="auth-block"
            style={{
              left: b.left,
              top: b.top,
              width: b.w,
              height: b.h,
              color: b.tone,
              animationDelay: b.delay,
            }}
          />
        ))}
        <div className="auth-vignette" />
      </div>

      {/* Top Navigation Bar */}
      <header className="relative z-20 w-full px-6 sm:px-12 py-3.5 flex justify-between items-center border-b border-white/10 backdrop-blur-md bg-emerald-950/40">
        <div className="flex items-center gap-3">
          <img
            src="/atlas_logo.png"
            alt="ATLAS Logo"
            className="w-8 h-8 object-contain drop-shadow-md"
          />
          <span className="text-xl font-bold tracking-tight text-white">ATLAS</span>
        </div>
        
        <div className="flex items-center gap-3 sm:gap-5 text-sm">
          <span className="hidden md:inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-900/50 border border-emerald-400/30 text-emerald-100 text-xs font-semibold tracking-wide">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            AY 2026–2027 Portal
          </span>
          <Link
            to="/login"
            state={{ mode: 'login' }}
            className="text-white hover:text-emerald-200 px-3.5 py-1.5 rounded-full hover:bg-white/10 transition-colors font-semibold text-xs sm:text-sm"
          >
            Sign in
          </Link>
          <Link
            to="/login"
            state={{ mode: 'register' }}
            className="auth-sweep inline-flex items-center gap-1.5 bg-emerald-800 hover:bg-emerald-700 text-white border border-emerald-400/30 hover:border-emerald-300/60 px-4 py-1.5 rounded-full shadow-sm transition-all text-xs sm:text-sm font-bold tracking-wide"
          >
            <UserPlus className="w-3.5 h-3.5 text-emerald-200" aria-hidden="true" />
            <span>Register</span>
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-6 sm:py-8 max-w-5xl mx-auto w-full">
        {/* Unified Portal Card (Dark, Eye-Friendly Emerald Glass) */}
        <div className="w-full max-w-2xl mx-auto">
          <div className="relative auth-card-in">
            <div className="auth-rim" aria-hidden="true" />

            <div className="landing-glass-card p-8 sm:p-10 text-center">
              <div className="auth-shine" aria-hidden="true" />

              {/* Medallion Logo */}
              <div className="auth-mark w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-4">
                <img
                  src="/atlas_logo.png"
                  alt=""
                  aria-hidden="true"
                  className="w-full h-full object-contain drop-shadow-xl"
                />
              </div>

              {/* Institutional Eyebrow & Title */}
              <p className="text-xs font-bold tracking-[0.2em] text-emerald-800 uppercase mb-1.5">
                De La Salle Araneta University
              </p>
              <h1 className="text-3xl sm:text-4xl lg:text-[2.65rem] leading-tight text-emerald-950 tracking-tight font-extrabold">
                DLSAU ATLAS
              </h1>

              {/* Scope Subtitle Badge */}
              <div className="mt-3.5 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-900/10 border border-emerald-800/20 text-emerald-900 text-xs sm:text-sm font-semibold tracking-wide shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-700"></span>
                <span>Tertiary Education</span>
              </div>

              {/* Purpose Description */}
              <p className="mt-4 text-sm sm:text-base text-slate-700 max-w-xl mx-auto leading-relaxed font-normal">
                An automated academic scheduling platform for De La Salle Araneta University. Plan departmental schedules, verify teaching loads, and coordinate official term timetables.
              </p>

              {/* Dual Action Cluster */}
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3.5">
                <Link
                  to="/login"
                  state={{ mode: 'login' }}
                  className="auth-sweep inline-flex items-center justify-center gap-2.5 py-3.5 px-8 rounded-full text-base font-bold text-white bg-emerald-900 hover:bg-emerald-800 shadow-md shadow-emerald-950/20 active:scale-[0.99] transition-all"
                >
                  <LogIn className="w-5 h-5 text-white stroke-[2.5]" aria-hidden="true" />
                  <span>Access Portal</span>
                </Link>
                <Link
                  to="/login"
                  state={{ mode: 'register' }}
                  className="inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-full text-base font-semibold text-emerald-900 hover:text-emerald-950 bg-white/70 hover:bg-white border border-emerald-800/20 hover:border-emerald-800/40 transition-all shadow-xs"
                >
                  <UserPlus className="w-5 h-5 text-emerald-700" aria-hidden="true" />
                  <span>Register Account</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* System Capabilities Dock */}
        <div className="w-full max-w-4xl mx-auto mt-6 sm:mt-8">
          <div className="bg-emerald-950/60 backdrop-blur-md border border-emerald-500/25 rounded-2xl p-4 sm:p-5 grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-0 md:divide-x divide-emerald-500/20 shadow-2xl">
            
            {/* Capability 1 */}
            <div className="flex items-start gap-3.5 px-0 md:px-5 first:pl-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-800/70 border border-emerald-400/40 text-amber-300 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                <Calendar className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-normal">Clash-Free Timetabling</h3>
                <p className="text-xs sm:text-sm text-emerald-100 leading-relaxed mt-1 font-normal">
                  Automated slot plotting aligned with DLSAU MW, TTh, and FS day-pair grids.
                </p>
              </div>
            </div>

            {/* Capability 2 */}
            <div className="flex items-start gap-3.5 px-0 md:px-5">
              <div className="w-9 h-9 rounded-lg bg-emerald-800/70 border border-emerald-400/40 text-amber-300 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                <ShieldCheck className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-normal">Workload Compliance</h3>
                <p className="text-xs sm:text-sm text-emerald-100 leading-relaxed mt-1 font-normal">
                  Built-in limits for regular teaching loads, overload thresholds, and part-time ceilings.
                </p>
              </div>
            </div>

            {/* Capability 3 */}
            <div className="flex items-start gap-3.5 px-0 md:px-5 last:pr-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-800/70 border border-emerald-400/40 text-amber-300 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                <Layers className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-normal">Conflict Lens</h3>
                <p className="text-xs sm:text-sm text-emerald-100 leading-relaxed mt-1 font-normal">
                  Clear oversight of laboratory rooms and cross-department conflict resolution.
                </p>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-4 text-center text-xs text-emerald-200/80 tracking-wider uppercase font-medium">
        &copy; 2026 ATLAS Academic Timetabling System &middot; De La Salle Araneta University
      </footer>
    </div>
  );
}
