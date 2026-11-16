import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header.js';
import { ReviewsPage } from './pages/ReviewsPage.js';
import { ReviewDetailPage } from './pages/ReviewDetailPage.js';
import { RepositoriesPage } from './pages/RepositoriesPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal.js';

export function App() {
  const [currentTab, setCurrentTab] = useState<'reviews' | 'repos' | 'settings'>('reviews');
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [theme, setTheme] = useState<'paper' | 'charcoal'>(() => {
    return (localStorage.getItem('redline_theme') as 'paper' | 'charcoal') || 'paper';
  });

  const filterInputRef = useRef<HTMLInputElement>(null);

  // Apply theme to html element
  useEffect(() => {
    if (theme === 'charcoal') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('redline_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'paper' ? 'charcoal' : 'paper'));
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs/textareas
      const isInput =
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT';

      if (e.key === '?' && !isInput) {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
      } else if (e.key === 't' && !isInput) {
        e.preventDefault();
        toggleTheme();
      } else if (e.key === '/' && !isInput) {
        if (currentTab === 'reviews' && !selectedReviewId) {
          e.preventDefault();
          filterInputRef.current?.focus();
        }
      } else if (e.key === 'Escape') {
        if (shortcutsOpen) {
          setShortcutsOpen(false);
        } else if (selectedReviewId) {
          setSelectedReviewId(null);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [shortcutsOpen, selectedReviewId, currentTab]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-paper)] text-[var(--ink)]">
      {/* Top Header */}
      <Header
        currentTab={currentTab}
        onSelectTab={tab => {
          setCurrentTab(tab);
          setSelectedReviewId(null);
        }}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {currentTab === 'reviews' && (
          selectedReviewId ? (
            <ReviewDetailPage
              reviewId={selectedReviewId}
              onBack={() => setSelectedReviewId(null)}
            />
          ) : (
            <ReviewsPage
              onSelectReview={id => setSelectedReviewId(id)}
              filterInputRef={filterInputRef}
            />
          )
        )}

        {currentTab === 'repos' && <RepositoriesPage />}

        {currentTab === 'settings' && <SettingsPage />}
      </main>

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}
export default App;
