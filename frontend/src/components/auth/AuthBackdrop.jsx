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

/**
 * Decorative timetable grid and college-toned blocks anchored behind the auth card.
 * Purely ambient — hidden from assistive technology.
 */
export default function AuthBackdrop() {
  return (
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
  );
}

