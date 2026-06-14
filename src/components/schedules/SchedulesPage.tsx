import React, { useState } from 'react';
import KPICard from '../shared/KPICard';
import StatusBadge from '../shared/StatusBadge';
import FilterChip from '../shared/FilterChip';
import { Plus, Play, Pause, MoreVertical, Search, Calendar, Clock, AlertCircle, User } from 'lucide-react';
import { TaskTemplate } from '../../types';

interface SchedulesPageProps {
  blueprints: TaskTemplate[];
  onCreateBlueprint?: () => void;
  onBlueprintClick?: (blueprintId: string) => void;
}

export default function SchedulesPage({
  blueprints,
  onCreateBlueprint,
  onBlueprintClick,
}: SchedulesPageProps) {
  const [selectedBlueprint, setSelectedBlueprint] = useState<TaskTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [frequencyFilter, setFrequencyFilter] = useState<'all' | 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Half-yearly'>('all');

  // Calculate KPI metrics
  const activeBlueprints = blueprints.filter(b => b.Active).length;
  const nextRunsToday = blueprints.filter(b => {
    const today = new Date().toISOString().split('T')[0];
    return b.NextGenerationDate === today && b.Active;
  }).length;
  const failedRuns = 0; // Would come from actual data
  const pausedBlueprints = blueprints.filter(b => !b.Active).length;

  // Filter blueprints
  const filteredBlueprints = blueprints.filter(blueprint => {
    if (searchQuery && !blueprint.Title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (statusFilter === 'active' && !blueprint.Active) return false;
    if (statusFilter === 'paused' && blueprint.Active) return false;
    if (frequencyFilter !== 'all' && blueprint.RecurrenceType !== frequencyFilter) return false;
    return true;
  });

  const handleBlueprintClick = (blueprint: TaskTemplate) => {
    setSelectedBlueprint(blueprint);
    onBlueprintClick?.(blueprint.TemplateID);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#0f172a]">Schedules</h1>
          <p className="text-sm text-muted mt-1">Manage recurring work generation</p>
        </div>
        <div className="flex items-center gap-2">
          {onCreateBlueprint && (
            <button
              onClick={onCreateBlueprint}
              className="flex items-center gap-2 px-3 py-2 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              <Plus size={16} />
              <span>Create blueprint</span>
            </button>
          )}
        </div>
      </div>

      {/* Scheduler KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Active blueprints"
          value={activeBlueprints}
          note="Currently generating tasks"
        />
        <KPICard
          label="Next runs today"
          value={nextRunsToday}
          note="Scheduled for today"
        />
        <KPICard
          label="Failed runs"
          value={failedRuns}
          note="Require attention"
        />
        <KPICard
          label="Paused blueprints"
          value={pausedBlueprints}
          note="Not generating tasks"
        />
      </div>

      {/* Main Split Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel: Blueprint List */}
        <div className="bg-surface rounded-lg border border-[var(--color-border)]">
          <div className="px-6 py-4 border-b border-[var(--color-border)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#0f172a]">Blueprints</h2>
              <span className="text-sm text-muted">{filteredBlueprints.length} total</span>
            </div>
            
            {/* Search */}
            <div className="relative mb-4">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Search blueprints..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <FilterChip
                label="All"
                active={statusFilter === 'all'}
                onClick={() => setStatusFilter('all')}
              />
              <FilterChip
                label="Active"
                active={statusFilter === 'active'}
                onClick={() => setStatusFilter('active')}
              />
              <FilterChip
                label="Paused"
                active={statusFilter === 'paused'}
                onClick={() => setStatusFilter('paused')}
              />
            </div>

            <div className="flex flex-wrap gap-2 mt-2">
              <FilterChip
                label="Daily"
                active={frequencyFilter === 'Daily'}
                onClick={() => setFrequencyFilter('Daily')}
              />
              <FilterChip
                label="Weekly"
                active={frequencyFilter === 'Weekly'}
                onClick={() => setFrequencyFilter('Weekly')}
              />
              <FilterChip
                label="Monthly"
                active={frequencyFilter === 'Monthly'}
                onClick={() => setFrequencyFilter('Monthly')}
              />
              <FilterChip
                label="Quarterly"
                active={frequencyFilter === 'Quarterly'}
                onClick={() => setFrequencyFilter('Quarterly')}
              />
            </div>
          </div>

          {/* Blueprint List */}
          <div className="divide-y divide-[var(--color-border)] max-h-[600px] overflow-y-auto">
            {filteredBlueprints.length === 0 ? (
              <div className="p-8 text-center">
                <Calendar size={48} className="text-muted mx-auto mb-3" />
                <p className="text-sm text-muted">No blueprints found</p>
              </div>
            ) : (
              filteredBlueprints.map((blueprint) => (
                <div
                  key={blueprint.TemplateID}
                  onClick={() => handleBlueprintClick(blueprint)}
                  className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                    selectedBlueprint?.TemplateID === blueprint.TemplateID ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-medium text-[#0f172a] truncate">{blueprint.Title}</h3>
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-muted">
                          {blueprint.RecurrenceType}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted">
                        <span className="flex items-center gap-1">
                          <User size={12} />
                          {blueprint.AssignedToEmail}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {new Date(blueprint.NextGenerationDate).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`w-2 h-2 rounded-full ${blueprint.Active ? 'bg-[var(--color-success)]' : 'bg-gray-300'}`} />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        <MoreVertical size={16} className="text-muted" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Blueprint Detail */}
        <div className="bg-surface rounded-lg border border-[var(--color-border)]">
          {selectedBlueprint ? (
            <div className="h-full flex flex-col">
              <div className="px-6 py-4 border-b border-[var(--color-border)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[#0f172a] mb-1">{selectedBlueprint.Title}</h2>
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <span>ID: {selectedBlueprint.TemplateID}</span>
                      <span>•</span>
                      <span className={`px-2 py-0.5 rounded ${selectedBlueprint.Active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                        {selectedBlueprint.Active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="p-2 hover:bg-gray-100 rounded-md transition-colors">
                      <Pause size={16} className="text-muted" />
                    </button>
                    <button className="p-2 hover:bg-gray-100 rounded-md transition-colors">
                      <Play size={16} className="text-muted" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Description */}
                <div>
                  <h3 className="text-sm font-medium text-[#0f172a] mb-2">Description</h3>
                  <p className="text-sm text-muted">{selectedBlueprint.Description}</p>
                </div>

                {/* Assignment Target */}
                <div>
                  <h3 className="text-sm font-medium text-[#0f172a] mb-2">Assignment Target</h3>
                  <div className="p-3 bg-gray-50 rounded-md">
                    <div className="text-sm text-[#0f172a]">{selectedBlueprint.AssignedToEmail}</div>
                    <div className="text-xs text-muted mt-1">Role: {selectedBlueprint.AssignedToRole}</div>
                  </div>
                </div>

                {/* Generated Task Preview */}
                <div>
                  <h3 className="text-sm font-medium text-[#0f172a] mb-2">Generated Task Preview</h3>
                  <div className="p-3 bg-gray-50 rounded-md">
                    <div className="text-sm font-medium text-[#0f172a]">{selectedBlueprint.Title}</div>
                    <div className="text-xs text-muted mt-1">Category: {selectedBlueprint.Category}</div>
                    <div className="text-xs text-muted">Priority: Medium</div>
                  </div>
                </div>

                {/* Last Run Summary */}
                <div>
                  <h3 className="text-sm font-medium text-[#0f172a] mb-2">Last Run Summary</h3>
                  {selectedBlueprint.LastGeneratedDate ? (
                    <div className="p-3 bg-green-50 rounded-md">
                      <div className="flex items-center gap-2 text-sm text-green-700">
                        <Clock size={14} />
                        <span>Last run: {new Date(selectedBlueprint.LastGeneratedDate).toLocaleString()}</span>
                      </div>
                      <div className="text-xs text-green-600 mt-1">Successfully generated task</div>
                    </div>
                  ) : (
                    <div className="p-3 bg-gray-50 rounded-md">
                      <div className="text-sm text-muted">No runs yet</div>
                    </div>
                  )}
                </div>

                {/* Upcoming Run Timeline */}
                <div>
                  <h3 className="text-sm font-medium text-[#0f172a] mb-2">Upcoming Run</h3>
                  <div className="p-3 bg-blue-50 rounded-md">
                    <div className="flex items-center gap-2 text-sm text-blue-700">
                      <Calendar size={14} />
                      <span>{new Date(selectedBlueprint.NextGenerationDate).toLocaleString()}</span>
                    </div>
                    <div className="text-xs text-blue-600 mt-1">Next scheduled generation</div>
                  </div>
                </div>

                {/* Failure States */}
                <div>
                  <h3 className="text-sm font-medium text-[#0f172a] mb-2">Status</h3>
                  <div className="p-3 bg-gray-50 rounded-md">
                    <div className="flex items-center gap-2 text-sm text-[#0f172a]">
                      <span className={`w-2 h-2 rounded-full ${selectedBlueprint.Active ? 'bg-[var(--color-success)]' : 'bg-gray-300'}`} />
                      <span>{selectedBlueprint.Active ? 'Running normally' : 'Paused'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
                <button className="px-4 py-2 border border-[var(--color-border)] rounded-md text-sm text-[#0f172a] hover:bg-gray-50 transition-colors">
                  Edit
                </button>
                <button className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
                  Run now
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-8">
              <div className="text-center">
                <Calendar size={48} className="text-muted mx-auto mb-3" />
                <p className="text-sm text-muted">Select a blueprint to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
