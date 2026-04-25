import React from 'react';
import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="min-h-screen relative font-sans flex flex-col">
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{ 
          backgroundImage: `url('/bg.png')`,
          filter: 'brightness(0.6)'
        }}
      ></div>

      {/* Top Navbar */}
      <nav className="relative z-10 bg-green-800/90 backdrop-blur-sm shadow-md py-4 px-8 flex justify-between items-center text-white">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-white text-green-800 rounded-full flex items-center justify-center font-bold text-lg">A</div>
          <h1 className="text-xl font-bold tracking-wide">ATLAS</h1>
        </div>
        <div className="space-x-6 text-sm font-medium">
          <Link to="/login" state={{ mode: 'login' }} className="hover:text-yellow-400 transition-colors">Login</Link>
          <Link to="/login" state={{ mode: 'register' }} className="hover:text-yellow-400 transition-colors">Register</Link>
        </div>
      </nav>

      {/* Center Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6">
        <div className="bg-green-800/80 backdrop-blur-md rounded-2xl p-10 max-w-3xl text-center shadow-2xl border border-green-700/50 transform transition-all hover:scale-[1.02]">
          <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-4 drop-shadow-md">
            DLSAU ATLAS
          </h2>
          <h3 className="text-xl md:text-2xl font-bold text-yellow-400 mb-6 uppercase tracking-widest">
            Tertiary Education Program Chair Portal
          </h3>
          <p className="text-green-50 text-lg md:text-xl mb-10 leading-relaxed font-light">
            An automated timtabling system strictly for Program Chairs of De La Salle Araneta University. Intelligently plan department schedules, eliminate room conflicts, and optimize faculty loading.
          </p>
          <Link 
            to="/login"
            className="inline-block bg-yellow-400 hover:bg-yellow-500 text-green-900 font-black px-10 py-4 rounded-full shadow-lg transform transition hover:-translate-y-1 hover:shadow-xl text-lg uppercase tracking-tighter"
          >
            Access Portal
          </Link>
        </div>
      </div>

      {/* Feature Cards Bottom */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 px-8 md:px-24 pb-12">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl p-6 shadow-xl border-t-4 border-yellow-400">
          <h3 className="text-green-800 font-bold text-lg mb-3">Smart Scheduling</h3>
          <p className="text-gray-600 text-sm leading-relaxed">
            Our algorithm automatically creates conflict-free schedules based on your preferences and constraints.
          </p>
        </div>
        <div className="bg-white/95 backdrop-blur-sm rounded-xl p-6 shadow-xl border-t-4 border-yellow-400">
          <h3 className="text-green-800 font-bold text-lg mb-3">Real-time Updates</h3>
          <p className="text-gray-600 text-sm leading-relaxed">
            Get instant notifications about schedule changes and room assignments.
          </p>
        </div>
        <div className="bg-white/95 backdrop-blur-sm rounded-xl p-6 shadow-xl border-t-4 border-yellow-400">
          <h3 className="text-green-800 font-bold text-lg mb-3">Easy Management</h3>
          <p className="text-gray-600 text-sm leading-relaxed">
            Simple interface for administrators to manage courses, rooms, and faculty assignments.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 bg-green-900 text-green-100/60 py-3 text-center text-xs">
        © 2026 De La Salle Araneta University - ATLAS. All rights reserved.
      </div>
    </div>
  );
}
