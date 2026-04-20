import { useState, useCallback } from 'react';
import { PixelButton } from '~/components/PixelButton';
import { FormInput } from '~/components/FormInput';
import { ImageCropInput } from '~/components/wiki/characters/ImageCropInput';
import { SectionHeader } from '~/components/SectionHeader';
import { uploadToR2 } from '~/utils/uploadToR2';
import { compressImage } from '~/utils/compressImage';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { WizardCharacter } from './JoinWizard';

interface StepRelatedCharactersProps {
  characters: WizardCharacter[];
  onUpdate: (characters: WizardCharacter[]) => void;
  onNext: () => void;
  onBack: () => void;
}

function emptyCharacter(): WizardCharacter {
  return {
    firstName: '',
    lastName: '',
    race: '',
    characterClass: '',
    age: null,
    location: '',
    link: '',
    picture: '',
    pictureCrop: null,
    notes: '',
    isPublic: true,
    relationship: { descriptor: '', isPublic: true },
  };
}

export function StepRelatedCharacters({
  characters,
  onUpdate,
  onNext,
  onBack,
}: StepRelatedCharactersProps) {
  const [editing, setEditing] = useState<{ index: number | null; char: WizardCharacter } | null>(
    null
  );

  const handleUpload = useCallback(async (file: File): Promise<string> => {
    const compressed = await compressImage(file);
    const { publicUrl } = await uploadToR2(compressed, 'uploads/characters');
    return publicUrl;
  }, []);

  function handleAdd() {
    setEditing({ index: null, char: emptyCharacter() });
  }

  function handleEdit(index: number) {
    setEditing({ index, char: { ...characters[index] } });
  }

  function handleRemove(index: number) {
    onUpdate(characters.filter((_, i) => i !== index));
  }

  function handleSave() {
    if (!editing) return;
    if (!editing.char.firstName.trim()) return;

    if (editing.index !== null) {
      const updated = [...characters];
      updated[editing.index] = editing.char;
      onUpdate(updated);
    } else {
      onUpdate([...characters, editing.char]);
    }
    setEditing(null);
  }

  function handleCancel() {
    setEditing(null);
  }

  function updateEditing(partial: Partial<WizardCharacter>) {
    if (!editing) return;
    setEditing({ ...editing, char: { ...editing.char, ...partial } });
  }

  function updateRelationship(partial: Partial<WizardCharacter['relationship']>) {
    if (!editing) return;
    setEditing({
      ...editing,
      char: {
        ...editing.char,
        relationship: { ...editing.char.relationship, ...partial },
      },
    });
  }

  return (
    <div className="bg-[#0D1117] border border-white/[0.07] rounded-2xl overflow-hidden">
      <div className="p-8 pb-6 space-y-5">
        <SectionHeader size="xs" tracking="tracking-[3px]" className="mb-7">
          RELATED CHARACTERS
        </SectionHeader>

        <p className="text-xs text-slate-500 leading-relaxed">
          Add NPCs or other characters related to your player. These are optional and can be added
          later.
        </p>

        {/* Character list */}
        {characters.length > 0 && !editing && (
          <div className="space-y-3">
            {characters.map((char, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.07] rounded-xl"
              >
                {char.picture ? (
                  <img
                    src={char.picture}
                    alt={char.firstName}
                    className="w-10 h-10 rounded-full object-cover border border-white/10"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-xs text-slate-500 font-bold">
                    {char.firstName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">
                    {char.firstName} {char.lastName}
                  </p>
                  {char.relationship.descriptor && (
                    <p className="text-xs text-slate-500 truncate">
                      {char.relationship.descriptor}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEdit(i)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-white/[0.05] transition-colors"
                    aria-label={`Edit ${char.firstName}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(i)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-white/[0.05] transition-colors"
                    aria-label={`Remove ${char.firstName}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Inline form */}
        {editing && (
          <div className="p-5 bg-white/[0.02] border border-white/[0.1] rounded-xl space-y-4">
            <SectionHeader size="xs" color="muted" tracking="tracking-widest" className="mb-4">
              {editing.index !== null ? 'EDIT CHARACTER' : 'NEW CHARACTER'}
            </SectionHeader>

            <ImageCropInput
              imageUrl={editing.char.picture}
              crop={editing.char.pictureCrop}
              onImageChange={(url) => updateEditing({ picture: url })}
              onCropChange={(crop) => updateEditing({ pictureCrop: crop })}
              onUpload={handleUpload}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormInput
                label="First Name"
                value={editing.char.firstName}
                onChange={(e) => updateEditing({ firstName: e.target.value })}
                required
                placeholder="First name"
              />
              <FormInput
                label="Last Name"
                value={editing.char.lastName}
                onChange={(e) => updateEditing({ lastName: e.target.value })}
                placeholder="Last name"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormInput
                label="Race"
                value={editing.char.race}
                onChange={(e) => updateEditing({ race: e.target.value })}
                placeholder="e.g. Human"
              />
              <FormInput
                label="Class"
                value={editing.char.characterClass}
                onChange={(e) => updateEditing({ characterClass: e.target.value })}
                placeholder="e.g. Merchant"
              />
              <FormInput
                label="Age"
                type="number"
                value={editing.char.age != null ? String(editing.char.age) : ''}
                onChange={(e) =>
                  updateEditing({ age: e.target.value ? parseInt(e.target.value, 10) : null })
                }
                placeholder="Age"
              />
            </div>

            <FormInput
              label="Location"
              value={editing.char.location}
              onChange={(e) => updateEditing({ location: e.target.value })}
              placeholder="Where can this character be found?"
            />

            <FormInput
              label="Notes"
              value={editing.char.notes}
              onChange={(e) => updateEditing({ notes: e.target.value })}
              placeholder="Any notes about this character..."
            />

            <div className="border-t border-white/[0.06] pt-4 space-y-4">
              <FormInput
                label="Relationship to your player"
                value={editing.char.relationship.descriptor}
                onChange={(e) => updateRelationship({ descriptor: e.target.value })}
                placeholder="e.g. Childhood friend, Mentor, Rival..."
              />

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editing.char.relationship.isPublic}
                  onChange={(e) => updateRelationship({ isPublic: e.target.checked })}
                  className="rounded border-white/20 bg-white/[0.05] text-blue-500 focus:ring-blue-500/30"
                />
                <span className="text-xs text-slate-400">
                  Make this relationship visible to other players
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editing.char.isPublic}
                  onChange={(e) => updateEditing({ isPublic: e.target.checked })}
                  className="rounded border-white/20 bg-white/[0.05] text-blue-500 focus:ring-blue-500/30"
                />
                <span className="text-xs text-slate-400">
                  Make this character visible to other players
                </span>
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <PixelButton variant="secondary" size="sm" onClick={handleCancel} type="button">
                Cancel
              </PixelButton>
              <PixelButton
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={!editing.char.firstName.trim()}
                type="button"
              >
                {editing.index !== null ? 'Update Character' : 'Save Character'}
              </PixelButton>
            </div>
          </div>
        )}

        {/* Add button */}
        {!editing && (
          <PixelButton
            variant="secondary"
            size="md"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={handleAdd}
            type="button"
          >
            Add a Character
          </PixelButton>
        )}
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between px-8 py-5 border-t border-white/[0.06]">
        <PixelButton variant="secondary" size="sm" onClick={onBack} type="button">
          &larr; Back
        </PixelButton>
        <PixelButton
          variant="primary"
          size="sm"
          onClick={onNext}
          disabled={!!editing}
          type="button"
        >
          Continue &rarr;
        </PixelButton>
      </div>
    </div>
  );
}
