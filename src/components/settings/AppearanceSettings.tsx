import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * Appearance section for SettingsPage.
 *
 * Fixes vs previous version:
 * - Removed the local `useState(false)` for isDarkMode. It never synced with
 *   App.tsx, so this toggle either did nothing or showed the wrong state.
 *   The buttons now read/write the single global ThemeContext.
 * - Selected-state styling used light-only colors (bg-blue-50,
 *   hover:bg-gray-50) that looked broken in dark mode; replaced with tokens.
 *
 * Drop this into SettingsPage where the old appearance block was:
 *   {activeSection === 'appearance' && <AppearanceSettings />}
 */
export default function AppearanceSettings() {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
  ];

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-primary mb-2">Theme</label>
        <div className="flex gap-2" role="radiogroup" aria-label="Theme">
          {options.map(({ value, label, icon: Icon }) => {
            const selected = theme === value;
            return (
              <button
                key={value}
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(value)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md border transition-colors ${
                  selected
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                    : 'border-token text-secondary hover-surface'
                }`}
              >
                <Icon size={16} />
                <span className="text-sm font-medium">{label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted mt-2">
          Applies everywhere and is remembered on this device.
        </p>
      </div>
    </div>
  );
}