import { useCallback } from 'react';
import { TaskTemplate } from '../types';
import { dbService } from '../lib/dbService';

interface UseTemplateOperationsProps {
  templates: TaskTemplate[];
  syncDatabase: () => Promise<void>;
  silentSync: () => Promise<void>;
  logAudit: (entity: string, id: string, action: string, oldValue: string, newValue: string) => Promise<void>;
}

export function useTemplateOperations({
  templates,
  syncDatabase,
  silentSync,
  logAudit,
}: UseTemplateOperationsProps) {
  const handleAddTemplate = useCallback(async (newTemplate: TaskTemplate) => {
    await dbService.saveTemplate(newTemplate);
    await logAudit('Template', newTemplate.TemplateID, 'Template Structured', '', JSON.stringify(newTemplate));
  }, [logAudit]);

  const handleToggleTemplateStatus = useCallback(async (tempId: string) => {
    const found = templates.find(t => t.TemplateID === tempId);
    if (found) {
      const updated = { ...found, Active: !found.Active, UpdatedAt: new Date().toISOString() };
      await dbService.saveTemplate(updated);
      await logAudit('Template', found.TemplateID, `Toggle Schedule Active State : ${updated.Active}`, `Active: ${found.Active}`, `Active: ${updated.Active}`);
    }
  }, [templates, logAudit]);

  return {
    handleAddTemplate,
    handleToggleTemplateStatus,
  };
}
