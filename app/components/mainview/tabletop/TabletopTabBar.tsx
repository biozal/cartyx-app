import { useEffect, useRef, useState } from 'react';
import { Plus, Focus } from 'lucide-react';
import { TabBar, type Tab } from '~/components/shared/TabBar';
import type { TabletopScreenData } from '~/types/tabletop';

interface TabletopTabBarProps {
  screens: TabletopScreenData[];
  activeScreenId: string | null;
  onScreenChange: (screenId: string) => void;
  onCreateScreen: (name: string) => void;
  onFocusAll: () => void;
  isGM: boolean;
  badgeScreenIds: Set<string>;
}

export function TabletopTabBar({
  screens,
  activeScreenId,
  onScreenChange,
  onCreateScreen,
  onFocusAll,
  isGM,
  badgeScreenIds,
}: TabletopTabBarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus();
    }
  }, [isCreating]);

  const tabs: Tab[] = screens.map((s) => ({
    id: s.id,
    label: s.name,
    badge: badgeScreenIds.has(s.id),
  }));

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreateScreen(trimmed);
    setNewName('');
    setIsCreating(false);
  };

  return (
    <div className="flex items-center" data-testid="tabletop-tab-bar">
      <TabBar
        tabs={tabs}
        activeTab={activeScreenId ?? ''}
        onTabChange={onScreenChange}
        accentColor="#2563EB"
      />

      {isGM && (
        <div className="flex items-center gap-1 ml-2">
          {isCreating ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreate();
              }}
              className="flex items-center gap-1"
            >
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tab name..."
                ref={inputRef}
                className="bg-[#161B22] border border-white/10 rounded px-2 py-1 text-xs text-slate-200 w-28"
                onBlur={() => {
                  if (!newName.trim()) setIsCreating(false);
                }}
              />
              <button type="submit" className="text-xs text-[#2563EB] hover:text-blue-400 px-1">
                Add
              </button>
            </form>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="text-slate-500 hover:text-slate-300 p-1"
              title="Add tab"
            >
              <Plus size={14} />
            </button>
          )}

          <button
            onClick={onFocusAll}
            className="text-slate-500 hover:text-slate-300 p-1"
            title="Focus all players to this tab"
          >
            <Focus size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
