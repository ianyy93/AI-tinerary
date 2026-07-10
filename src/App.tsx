/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { auth, googleProvider, signInWithPopup, signInAnonymously, signOut } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { UserSession } from './types';
import TripHub from './components/hub/TripHub';
import TripView from './components/trip/TripView';
import { Compass, Globe, Sparkles, MapPin, CheckCircle2, Shield, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. Listen to Auth State Changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: User | null) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || 'Sandboxed Guest',
          isAnonymous: firebaseUser.isAnonymous,
        });
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    }, (err) => {
      console.error("Auth state observation error:", err);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Google sign in handler
  const handleGoogleSignIn = async () => {
    try {
      setAuthLoading(true);
      setErrorMsg('');
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      console.error("Google sign in failure:", e);
      setErrorMsg(e.message || 'Failed to sign in with Google. Check popup privileges or connection.');
      setAuthLoading(false);
    }
  };

  // 3. Anonymous login sandbox handler
  const handleAnonymousSandbox = async () => {
    try {
      setAuthLoading(true);
      setErrorMsg('');
      await signInAnonymously(auth);
    } catch (e: any) {
      console.error("Anonymous sandbox failure:", e);
      setErrorMsg(e.message || 'Failed to initialize Sandbox mode.');
      setAuthLoading(false);
    }
  };

  // 4. Logout handler
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setActiveTripId(null);
    } catch (e) {
      console.error("Logout failure:", e);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-slate-500 font-medium font-sans">Connecting to travel satellite...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50" id="app-root">
      <AnimatePresence mode="wait">
        {!user ? (
          /* LOGIN LANDING SCREEN */
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            key="login"
            className="min-h-screen flex items-center justify-center p-6 bg-slate-50/70"
            style={{ backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.03) 0%, transparent 60%)' }}
          >
            <div className="max-w-md w-full flex flex-col gap-8 bg-white border border-slate-100 p-8 rounded-3xl shadow-xl shadow-slate-100">
              
              {/* App Brand Header */}
              <div className="text-center flex flex-col items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-150 animate-bounce">
                  <Compass className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight">AI-tinerary</h1>
                  <p className="text-sm text-slate-500 mt-1 font-medium">Your Travel Command Center</p>
                </div>
              </div>

              {errorMsg && (
                <div className="bg-red-50 border border-red-100 text-red-700 p-3.5 rounded-xl text-xs font-semibold flex items-start gap-2">
                  <AlertTriangle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Functional benefits highlights */}
              <div className="flex flex-col gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="flex items-start gap-3 text-xs text-slate-600">
                  <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-800">Unlimited Multi-Trips:</span> Manage flights, drives, and city breaks from one responsive dashboard.
                  </div>
                </div>
                <div className="flex items-start gap-3 text-xs text-slate-600">
                  <CheckCircle2 className="h-4.5 w-4.5 text-indigo-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-800">Real-Time Leaflet Mapping:</span> Automatically bound and path-connect same-day stops.
                  </div>
                </div>
                <div className="flex items-start gap-3 text-xs text-slate-600">
                  <CheckCircle2 className="h-4.5 w-4.5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-800">Multi-Step Gemini Copilot:</span> Progress through 6 micro-cached steps for robust results.
                  </div>
                </div>
              </div>

              {/* Login Actions */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleGoogleSignIn}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Globe className="h-4 w-4" />
                  Continue with Google Sign-In
                </button>

                <div className="flex items-center justify-between text-slate-300 text-[10px] uppercase font-bold tracking-widest my-1">
                  <div className="h-px bg-slate-100 flex-1" />
                  <span className="px-3">or</span>
                  <div className="h-px bg-slate-100 flex-1" />
                </div>

                <button
                  onClick={handleAnonymousSandbox}
                  className="w-full py-3 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-600 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="h-4 w-4 text-indigo-500 animate-pulse" />
                  Enter Sandbox (Anonymous Guest)
                </button>
              </div>

              <div className="text-center text-[10px] text-slate-400 font-medium">
                By entering Sandbox, you agree to access transient sessions.
              </div>

            </div>
          </motion.div>
        ) : (
          /* ACTIVE USER WORKSPACE */
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            key="workspace"
            className="h-screen flex flex-col"
          >
            {activeTripId ? (
              <TripView 
                tripId={activeTripId}
                user={user}
                onBackToHub={() => setActiveTripId(null)}
              />
            ) : (
              <TripHub 
                user={user}
                onSelectTrip={setActiveTripId}
                onLogout={handleLogout}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
