import React, { useState, useRef, useEffect } from 'react';
import { Filter, X, ChevronDown, Search } from 'lucide-react';

export interface MultiselectOption {
  value: string;
  label: string;
}

interface MultiselectDropdownProps {
  label: string;
  options: MultiselectOption[];
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  isDarkMode?: boolean;
  showSearch?: boolean;
  placeholder?: string;
  badgeColor?: 'blue' | 'emerald' | 'purple' | 'orange';
}

export default function MultiselectDropdown({
  label,
  options,
  selectedValues,
  onSelectionChange,
  isDarkMode = false,
  showSearch = false,
  placeholder = 'Search...',
  badgeColor = 'blue',
}: MultiselectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options based on search
  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    option.value.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleValue = (value: string) => {
    if (selectedValues.includes(value)) {
      onSelectionChange(selectedValues.filter(v => v !== value));
    } else {
      onSelectionChange([...selectedValues, value]);
    }
  };

  const clearAll = () => {
    onSelectionChange([]);
    setSearchQuery('');
  };

  const getBadgeColorClass = () => {
    switch (badgeColor) {
      case 'emerald':
        return isDarkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700';
      case 'purple':
        return isDarkMode ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700';
      case 'orange':
        return isDarkMode ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-700';
      default:
        return isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          isDarkMode 
            ? 'bg-[#1E293B] border-[#334155] text-white' 
            : 'bg-slate-50 border-[#E5E7EB] text-slate-900'
        }`}
      >
        <Filter size={16} />
        <span>{label}</span>
        {selectedValues.length > 0 && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getBadgeColorClass()}`}>
            {selectedValues.length}
          </span>
        )}
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className={`absolute top-full left-0 mt-2 w-72 rounded-lg shadow-lg z-50 ${
          isDarkMode ? 'bg-[#1E293B] border border-[#334155]' : 'bg-white border border-[#E5E7EB]'
        }`}>
          {showSearch && (
            <div className="p-3 border-b border-[#E5E7EB] dark:border-[#334155]">
              <div className="relative">
                <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                <input
                  type="text"
                  placeholder={placeholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-9 pr-4 py-2 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode 
                      ? 'bg-[#0F141F] border border-[#334155] text-white placeholder-slate-500' 
                      : 'bg-slate-50 border border-[#E5E7EB] text-slate-900 placeholder-slate-500'
                  }`}
                />
              </div>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto p-2">
            {filteredOptions.length === 0 ? (
              <div className={`text-center py-4 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                No options found
              </div>
            ) : (
              filteredOptions.map(option => (
                <label
                  key={option.value}
                  className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-slate-100 dark:hover:bg-[#334155]/50 transition-colors ${
                    isDarkMode ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(option.value)}
                    onChange={() => toggleValue(option.value)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="flex-1 text-sm">{option.label}</span>
                </label>
              ))
            )}
          </div>

          {selectedValues.length > 0 && (
            <div className="p-2 border-t border-[#E5E7EB] dark:border-[#334155]">
              <button
                onClick={clearAll}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                  isDarkMode 
                    ? 'text-slate-400 hover:text-white hover:bg-[#334155]/50' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <X size={14} />
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
