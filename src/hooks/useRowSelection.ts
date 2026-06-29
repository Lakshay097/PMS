import { useState, useEffect, useCallback } from 'react';

interface UseRowSelectionProps<T> {
  items: T[];
  getItemId: (item: T) => string;
  onSelectionChange?: (selectedIds: string[]) => void;
}

export function useRowSelection<T>({ items, getItemId, onSelectionChange }: UseRowSelectionProps<T>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // Clear selection when items change (filter change)
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAll(false);
  }, [items]);

  const toggleSelection = useCallback((itemId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      onSelectionChange?.(Array.from(newSet) as string[]);
      return newSet;
    });
  }, [onSelectionChange]);

  const toggleSelectAll = useCallback(() => {
    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);
    
    if (newSelectAll) {
      const allIds = new Set(items.map(getItemId));
      setSelectedIds(allIds);
      onSelectionChange?.(Array.from(allIds) as string[]);
    } else {
      setSelectedIds(new Set());
      onSelectionChange?.([]);
    }
  }, [selectAll, items, getItemId, onSelectionChange]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectAll(false);
    onSelectionChange?.([]);
  }, [onSelectionChange]);

  const isSelected = useCallback((itemId: string) => selectedIds.has(itemId), [selectedIds]);

  const selectedCount = selectedIds.size;
  const allSelected = selectedCount > 0 && selectedCount === items.length;
  const someSelected = selectedCount > 0 && selectedCount < items.length;

  return {
    selectedIds: Array.from(selectedIds),
    selectedCount,
    allSelected,
    someSelected,
    selectAll,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    isSelected,
  };
}
