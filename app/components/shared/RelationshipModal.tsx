import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Globe, Lock, Search } from 'lucide-react';
import { useCharacters } from '~/hooks/useCharacters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RelationshipModalProps {
  campaignId: string;
  mode: 'add' | 'edit';
  showReciprocal: boolean;
  existingRelationship?: { characterId: string; descriptor: string; isPublic: boolean };
  excludeCharacterIds?: string[];
  onSave: (data: {
    characterId: string;
    descriptor: string;
    reciprocalDescriptor?: string;
    isPublic: boolean;
  }) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RelationshipModal({
  campaignId,
  mode,
  showReciprocal,
  existingRelationship,
  excludeCharacterIds = [],
  onSave,
  onClose,
}: RelationshipModalProps) {
  const { characters } = useCharacters(campaignId);

  const [selectedCharacterId, setSelectedCharacterId] = useState(
    existingRelationship?.characterId ?? ''
  );
  const [descriptor, setDescriptor] = useState(existingRelationship?.descriptor ?? '');
  const [reciprocalDescriptor, setReciprocalDescriptor] = useState('');
  const [isPublic, setIsPublic] = useState(existingRelationship?.isPublic ?? false);
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Characters available for selection (exclude already-related + self)
  const excludeSet = useMemo(() => new Set(excludeCharacterIds), [excludeCharacterIds]);

  const availableCharacters = useMemo(() => {
    return characters.filter((c) => !excludeSet.has(c.id));
  }, [characters, excludeSet]);

  const filteredCharacters = useMemo(() => {
    if (!search.trim()) return availableCharacters;
    const q = search.toLowerCase();
    return availableCharacters.filter(
      (c) =>
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q)
    );
  }, [availableCharacters, search]);

  // Resolve selected character name for display
  const selectedCharacter = useMemo(
    () => characters.find((c) => c.id === selectedCharacterId),
    [characters, selectedCharacterId]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCharacterId || !descriptor.trim()) return;
    onSave({
      characterId: selectedCharacterId,
      descriptor: descriptor.trim(),
      reciprocalDescriptor: showReciprocal ? reciprocalDescriptor.trim() || undefined : undefined,
      isPublic,
    });
  };

  const isValid = !!selectedCharacterId && !!descriptor.trim();

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-2 sm:p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="relationship-modal-title"
        className="w-full max-w-md bg-[#0D1117] border border-white/[0.07] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Header */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/[0.07] shrink-0">
          <h2
            id="relationship-modal-title"
            className="font-sans font-bold text-sm text-blue-400 uppercase tracking-widest"
          >
            {mode === 'add' ? 'Add Relationship' : 'Edit Relationship'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 min-h-0">
          {/* Character Selector */}
          <div>
            <label
              htmlFor="rel-character-selector"
              className="block text-xs font-semibold text-slate-400 mb-2 tracking-wide"
            >
              Character
            </label>
            {mode === 'edit' && selectedCharacter ? (
              <div
                id="rel-character-selector"
                className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-slate-300"
              >
                {selectedCharacter.firstName} {selectedCharacter.lastName}
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                  <input
                    id="rel-character-selector"
                    type="text"
                    value={
                      selectedCharacter && !showDropdown
                        ? `${selectedCharacter.firstName} ${selectedCharacter.lastName}`.trim()
                        : search
                    }
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setSelectedCharacterId('');
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="Search characters..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none transition-colors"
                  />
                </div>
                {showDropdown && (
                  <div className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-lg bg-[#161B22] border border-white/[0.08] shadow-xl">
                    {filteredCharacters.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-slate-500">No characters found.</p>
                    ) : (
                      filteredCharacters.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedCharacterId(c.id);
                            setSearch('');
                            setShowDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.06] transition-colors"
                        >
                          {c.firstName} {c.lastName}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Descriptor */}
          <div>
            <label
              htmlFor="rel-descriptor"
              className="block text-xs font-semibold text-slate-400 mb-2 tracking-wide"
            >
              Relationship Descriptor
            </label>
            <input
              id="rel-descriptor"
              type="text"
              value={descriptor}
              onChange={(e) => setDescriptor(e.target.value)}
              placeholder="e.g. Ally, Rival, Mentor..."
              className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none transition-colors"
            />
          </div>

          {/* Reciprocal Descriptor */}
          {showReciprocal && (
            <div>
              <label
                htmlFor="rel-reciprocal-descriptor"
                className="block text-xs font-semibold text-slate-400 mb-2 tracking-wide"
              >
                Reciprocal Descriptor
              </label>
              <input
                id="rel-reciprocal-descriptor"
                type="text"
                value={reciprocalDescriptor}
                onChange={(e) => setReciprocalDescriptor(e.target.value)}
                placeholder="How the other character sees this relationship..."
                className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none transition-colors"
              />
              <p className="text-[10px] text-slate-600 mt-1">
                Optional: describes the reverse side of the relationship.
              </p>
            </div>
          )}

          {/* Public/Private toggle */}
          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="rel-visibility"
                checked={!isPublic}
                onChange={() => setIsPublic(false)}
                className="sr-only"
              />
              <div
                className={`h-8 px-3 rounded-lg border flex items-center gap-2 transition-all text-xs ${
                  !isPublic
                    ? 'bg-blue-600/10 border-blue-500/50 text-blue-300 shadow-sm shadow-blue-500/10'
                    : 'bg-white/[0.03] border-white/[0.07] text-slate-500 hover:border-white/20'
                }`}
              >
                <Lock className="h-3 w-3" />
                <span className="font-bold">Private</span>
              </div>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="rel-visibility"
                checked={isPublic}
                onChange={() => setIsPublic(true)}
                className="sr-only"
              />
              <div
                className={`h-8 px-3 rounded-lg border flex items-center gap-2 transition-all text-xs ${
                  isPublic
                    ? 'bg-emerald-600/10 border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-500/10'
                    : 'bg-white/[0.03] border-white/[0.07] text-slate-500 hover:border-white/20'
                }`}
              >
                <Globe className="h-3 w-3" />
                <span className="font-bold">Public</span>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-white/[0.07] bg-white/[0.01] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isValid}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {mode === 'add' ? 'Add Relationship' : 'Save Changes'}
          </button>
        </footer>
      </form>
    </div>,
    document.body
  );
}
