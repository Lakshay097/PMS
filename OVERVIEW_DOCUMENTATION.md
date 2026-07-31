# Overview Dashboard Documentation

## Overview

The Overview dashboard is the main landing page for users in the PMS TaskFlow system. It provides a summary of task metrics, alerts, and recent activity tailored to each user's role and permissions.

**Component Location**: `src/components/features/dashboard/Dashboard.tsx` (lines 1031-1400)

---

## What the Overview Shows

### 1. Summary Cards (KPIs)

The overview displays 5 summary cards at the top:

- **All Tasks**: Total count of all tasks visible to the user
- **Active Tasks**: Tasks with status "In Progress" or "Submitted" (excluding Closed/Reviewed)
- **Overdue**: Tasks that are past their due date (DueDate < today, excluding Closed/Reviewed)
- **Due Today**: Tasks due on the current date (excluding Closed/Reviewed)
- **Completed This Week**: Tasks closed/reviewed in the last 7 days

Each card is clickable and navigates to the Tasks view with appropriate filters applied.

---

### 2. Priority Tasks Section

**Location**: Lines 1190-1268 in Dashboard.tsx

#### What it shows:
Tasks that require immediate attention, displayed as a list with left accent bars:
- Task title (truncated with ellipsis if long)
- Priority badge (Critical, High, Medium, Low) with color coding
- Status badge
- Overdue badge (red) for tasks past their due date
- Due date and days until due (or "Overdue" if past due)
- Assigned to email (username portion only)
- Task ID
- **Left accent bar**: 3px solid border on left side (red for overdue, amber for high-priority-not-overdue)
- **Soft tinted background**: Red/amber tint matching the accent bar

#### Calculation Logic:
```typescript
const priorityTasks = visibleTasksForOverview
  .filter(t => {
    if (t.Status === 'Closed' || t.Status === 'Reviewed') return false;
    const isOverdue = t.DueDate < today;
    const isHighPriority = t.Priority === 'High' || t.Priority === 'Critical';
    return isOverdue || isHighPriority;
  })
  .slice(0, 5);
```

**Criteria**:
- Task status is NOT 'Closed' or 'Reviewed'
- AND (Task is overdue OR Task has High/Critical priority)

**Why 5 items?**
The list is limited to 5 items using `.slice(0, 5)` to:
- Keep the overview clean and scannable
- Provide a broader view of urgent items than the previous 3-item limit
- Encourage users to click "View all" to see the complete list
- Maintain a consistent UI layout

**View More Functionality**:
- Clicking "View all" button navigates to the Tasks view
- This shows ALL active tasks (not just the 5 priority ones)
- Users can then apply filters to see all overdue/high-priority tasks

**Visual Indicators**:
- **Left accent bar**: 3px solid border (red for overdue, amber for high-priority-not-overdue)
- **Tinted background**: Soft red/amber background matching the accent bar
- **Rounded right corners**: Only right side rounded (left side has accent bar)
- **Explicit "Overdue" badge**: Red badge for overdue tasks
- **Color-coded priority badges**: Critical (red), High (orange), Medium (yellow), Low (green)
- **Color-coded status badges**: Matches task status colors
- **Sentence case**: Header and badges use sentence case (not Title Case)
- **Medium font weight**: Headers and badges use font-medium (500), not bold

---

### 3. Task Insights Section

**Location**: Lines 1270-1400 in Dashboard.tsx

#### What it shows:
Two charts providing visual insights into task completion and user activity:

**Chart 1 — Completion status donut** (left column on desktop, stacked above chart 2 on mobile)
- Donut chart of the user's visible tasks by status: Completed, In progress, Overdue
- Colors: Completed = green (#22c55e), In progress = blue (#3b82f6), Overdue = red (#ef4444)
- Legend above the chart as colored squares + percentage per status
- Custom tooltip on hover
- Empty state: Inbox icon + "No task data yet" message when no data available

**Chart 2 — Assigned vs completed by user** (right column on desktop)
- Horizontal grouped bar chart, one row per team member, two series: Assigned and Completed
- Colors: Assigned = blue (#3b82f6), Completed = green (#22c55e)
- Bars sorted by total activity (assigned + completed) descending
- Only shows for roles that see more than one person's tasks (Admin, Team Leader, Sub-Team Leader, Stakeholder)
- Sub-Stakeholders see a single row for themselves
- Custom tooltip on hover
- Empty state: Inbox icon + contextual message ("No task data yet" for multi-user roles, "Your task activity will show up here" for sub-stakeholders)

#### Layout:
- **Full-width section**: Takes up the entire width below Priority Tasks
- **Two-column grid on desktop**: Charts side by side in equal-width columns
- **Stacked on mobile**: Charts stacked vertically on smaller screens
- **Responsive grid:
  - 1 column on mobile
  - 2 columns on large screens (lg)

#### Calculation Logic:

**Completion Status Data**:
```typescript
const completionStatusData = useMemo(() => {
  const completed = visibleTasksForOverview.filter(t => t.Status === 'Closed' || t.Status === 'Reviewed').length;
  const inProgress = visibleTasksForOverview.filter(t => t.Status === 'In Progress' || t.Status === 'Submitted').length;
  const overdue = visibleTasksForOverview.filter(t => {
    if (t.Status === 'Closed' || t.Status === 'Reviewed') return false;
    return t.DueDate < today;
  }).length;
  
  return [
    { name: 'Completed', value: completed, color: '#22c55e' },
    { name: 'In progress', value: inProgress, color: '#3b82f6' },
    { name: 'Overdue', value: overdue, color: '#ef4444' },
  ].filter(d => d.value > 0);
}, [visibleTasksForOverview, today]);
```

**User Activity Data**:
```typescript
const userActivityData = useMemo(() => {
  // Role-based visibility check
  const canSeeMultipleUsers = isAdminLevel(currentUser.Role) || 
    isTeamLeader(currentUser.Email, teams) || 
    isSubTeamLeader(currentUser.Email, subTeams) ||
    userRoles.some(r => r.type === 'Stakeholder');
  
  if (!canSeeMultipleUsers) {
    // For sub-stakeholders, show only their own data
    const userEmail = currentUser.Email.toLowerCase();
    const assigned = visibleTasksForOverview.filter(t => 
      splitEmails(t.AssignedToEmail).some(e => e.toLowerCase() === userEmail)
    ).length;
    const completed = visibleTasksForOverview.filter(t => 
      splitEmails(t.AssignedToEmail).some(e => e.toLowerCase() === userEmail) &&
      (t.Status === 'Closed' || t.Status === 'Reviewed')
    ).length;
    return [{ name: currentUser.Email.split('@')[0], assigned, completed }];
  }

  // For other roles, aggregate by user
  const userMap = new Map<string, { assigned: number; completed: number }>();
  visibleTasksForOverview.forEach(task => {
    const assignees = splitEmails(task.AssignedToEmail);
    assignees.forEach(email => {
      const key = email.toLowerCase();
      if (!userMap.has(key)) {
        userMap.set(key, { assigned: 0, completed: 0 });
      }
      const data = userMap.get(key)!;
      data.assigned++;
      if (task.Status === 'Closed' || task.Status === 'Reviewed') {
        data.completed++;
      }
    });
  });

  return Array.from(userMap.entries())
    .map(([email, counts]) => ({
      name: email.split('@')[0],
      assigned: counts.assigned,
      completed: counts.completed,
    }))
    .filter(d => d.assigned > 0 || d.completed > 0)
    .sort((a, b) => (b.assigned + b.completed) - (a.assigned + a.completed))
    .slice(0, 10); // Limit to top 10 users
}, [visibleTasksForOverview, currentUser, teams, subTeams, userRoles]);
```

**Styling Rules**:
- Flat surfaces only — no gradients, no drop shadows
- Corner radius: 12px for cards
- Borders: hairline (0.5px) on cards
- Legend as small colored squares + labels above each chart
- Bars: 4px rounded corners at the data end, 24px height, 2px gap between segments
- Gridlines muted/recessive, single y-axis per chart, no vertical gridlines
- Empty states show centered icon + muted message
- Sentence case for headers and labels
- Medium font weight (500) for titles/headers

---

## User Visibility & Permissions

### Role-Based Task Visibility

The Overview uses a **union-based visibility model** where users see tasks from ALL their roles combined.

**Implementation**: `visibleTasksForOverview` (lines 647-675)

```typescript
const visibleTasksForOverview = useMemo(() => {
  const userEmail = currentUser.Email?.toLowerCase() || '';
  const teamTasksFilter = getTeamTasksScope(currentUser, userRoles, users || []);

  return (tasks || []).filter(task => {
    // Admin sees all tasks
    if (userRoles.some(r => r.type === 'Admin')) {
      return true;
    }

    // Union of all role-based visibility:
    const assignedToMe = splitEmails(task.AssignedToEmail).some(email => 
      email.toLowerCase() === userEmail
    );
    const assignedByMe = task.AssignedByEmail?.toLowerCase() === userEmail;
    const inTeamScope = teamTasksFilter(task);

    return assignedToMe || assignedByMe || inTeamScope;
  });
}, [tasks, currentUser, users, userRoles]);
```

### Role Types

**Computed in**: `src/utils/roleUtils.ts` (getUserRoles function)

1. **Admin**: 
   - Sees ALL tasks in the system
   - Sees ALL audit logs in Recent Activity

2. **Team Leader**:
   - Sees tasks assigned to team members
   - Sees tasks assigned directly to their team (via AssignedToTeamIDs)
   - Sees tasks assigned to themselves
   - Sees tasks they assigned

3. **Sub-Team Leader**:
   - Sees tasks assigned to sub-team members
   - Sees tasks assigned to themselves
   - Sees tasks they assigned

4. **Stakeholder**:
   - Sees tasks assigned to themselves
   - Sees tasks they assigned
   - Sees tasks assigned to all hierarchical subordinates

5. **Sub-Stakeholder**:
   - Sees only tasks assigned to themselves
   - Sees tasks they assigned

### Task Scope Calculation

**Function**: `getTeamTasksScope` in `src/utils/roleUtils.ts` (lines 171-226)

- **Admin**: Returns filter that accepts all tasks
- **Team Leader**: Returns tasks assigned to team members OR tasks assigned to team
- **Sub-Team Leader**: Returns tasks assigned to sub-team members
- **No team scope**: Returns filter that rejects all tasks

---

## Summary of Item Limits

| Section | Item Limit | Reason |
|---------|-----------|--------|
| Priority Tasks | 5 items | Keep overview clean, provide broader view of urgent items, encourage navigation to full list |
| Task Insights | 10 users max | Bar chart limited to top 10 busiest users to maintain readability |

All limits are implemented using JavaScript's `.slice()` method on filtered arrays.

---

## Key Files

- **Main Dashboard Component**: `src/components/features/dashboard/Dashboard.tsx`
- **Role Utilities**: `src/utils/roleUtils.ts`
- **Types**: `src/types/index.ts` (Task, User, Team, SubTeam, AuditLog, etc.)
