import React from 'react';

interface DashboardSkeletonProps {
  isDarkMode?: boolean;
}

export default function DashboardSkeleton({ isDarkMode = false }: DashboardSkeletonProps) {
  const shimmerClass = isDarkMode 
    ? 'bg-gradient-to-r from-[#1E293B] via-[#334155] to-[#1E293B]' 
    : 'bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200';

  const cardBg = isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200';
  const textBg = isDarkMode ? 'bg-[#1E293B]' : 'bg-slate-200';

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-[#0F172A]' : 'bg-slate-50'} flex`}>
      {/* Sidebar Skeleton */}
      <div className={`w-64 border-r hidden lg:block ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
        <div className="p-4 space-y-4">
          {/* Logo area */}
          <div className={`h-10 rounded-lg ${shimmerClass} animate-pulse`} />
          
          {/* Navigation items */}
          <div className="space-y-2 pt-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className={`h-10 rounded-lg ${shimmerClass} animate-pulse`} />
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 space-y-8">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className={`h-8 w-48 rounded-lg ${shimmerClass} animate-pulse`} />
            <div className={`h-4 w-64 rounded ${shimmerClass} animate-pulse`} />
          </div>
          <div className="flex items-center space-x-3">
            <div className={`h-10 w-32 rounded-lg ${shimmerClass} animate-pulse`} />
            <div className={`h-10 w-10 rounded-full ${shimmerClass} animate-pulse`} />
          </div>
        </div>

        {/* Summary Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={`border rounded-xl p-4 ${cardBg}`}>
              <div className="flex items-center justify-between mb-3">
                <div className={`h-8 w-8 rounded-lg ${shimmerClass} animate-pulse`} />
                <div className={`h-4 w-20 rounded ${shimmerClass} animate-pulse`} />
              </div>
              <div className={`h-8 w-16 rounded ${shimmerClass} animate-pulse mb-2`} />
              <div className={`h-4 w-24 rounded ${shimmerClass} animate-pulse`} />
            </div>
          ))}
        </div>

        {/* Needs Attention Section Skeleton */}
        <div className={`border rounded-xl ${cardBg}`}>
          <div className={`p-6 border-b flex items-center justify-between ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'}`}>
            <div className="flex items-center space-x-3">
              <div className={`h-5 w-5 rounded ${shimmerClass} animate-pulse`} />
              <div className={`h-6 w-40 rounded ${shimmerClass} animate-pulse`} />
              <div className={`h-6 w-16 rounded-full ${shimmerClass} animate-pulse`} />
            </div>
            <div className={`h-5 w-20 rounded ${shimmerClass} animate-pulse`} />
          </div>
          <div className={`p-6 space-y-4 ${isDarkMode ? 'divide-[#1E293B]' : 'divide-slate-200'}`}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 space-y-3">
                <div className="flex items-center space-x-2">
                  <div className={`h-5 w-16 rounded ${shimmerClass} animate-pulse`} />
                  <div className={`h-5 w-16 rounded ${shimmerClass} animate-pulse`} />
                </div>
                <div className={`h-5 w-3/4 rounded ${shimmerClass} animate-pulse`} />
                <div className="flex items-center space-x-4">
                  <div className={`h-4 w-32 rounded ${shimmerClass} animate-pulse`} />
                  <div className={`h-4 w-32 rounded ${shimmerClass} animate-pulse`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts and Recent Activity Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Alerts */}
          <div className={`border rounded-xl ${cardBg}`}>
            <div className={`p-6 border-b ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'}`}>
              <div className="flex items-center space-x-3">
                <div className={`h-5 w-5 rounded ${shimmerClass} animate-pulse`} />
                <div className={`h-6 w-24 rounded ${shimmerClass} animate-pulse`} />
              </div>
            </div>
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`border rounded-lg p-4 ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'}`}>
                  <div className="flex items-start space-x-3">
                    <div className={`h-5 w-5 rounded ${shimmerClass} animate-pulse flex-shrink-0`} />
                    <div className="flex-1 space-y-2">
                      <div className={`h-4 w-40 rounded ${shimmerClass} animate-pulse`} />
                      <div className={`h-4 w-full rounded ${shimmerClass} animate-pulse`} />
                      <div className={`h-4 w-48 rounded ${shimmerClass} animate-pulse`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className={`border rounded-xl ${cardBg}`}>
            <div className={`p-6 border-b ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'}`}>
              <div className="flex items-center space-x-3">
                <div className={`h-5 w-5 rounded ${shimmerClass} animate-pulse`} />
                <div className={`h-6 w-32 rounded ${shimmerClass} animate-pulse`} />
              </div>
            </div>
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-start space-x-3">
                  <div className={`h-8 w-8 rounded-full ${shimmerClass} animate-pulse flex-shrink-0`} />
                  <div className="flex-1 space-y-2">
                    <div className={`h-4 w-48 rounded ${shimmerClass} animate-pulse`} />
                    <div className={`h-4 w-32 rounded ${shimmerClass} animate-pulse`} />
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
