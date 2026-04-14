import React from 'react';
import type { GMScreenData } from '~/types/gmscreen';
import { ScreenNameDialog } from './ScreenNameDialog';
import { ReorderDialog } from './ReorderDialog';
import { ConfirmDialog } from './ConfirmDialog';

export type DialogState =
  | { type: 'none' }
  | { type: 'create-screen' }
  | { type: 'rename-screen'; screenId: string; currentName: string }
  | { type: 'delete-screen'; screenId: string; screenName: string }
  | { type: 'reorder' }
  | { type: 'create-stack' };

export interface GMScreenDialogsProps {
  dialog: DialogState;
  screens: GMScreenData[];
  onDismiss: () => void;
  onCreateScreen: (name: string) => Promise<void>;
  onRenameScreen: (name: string) => Promise<void>;
  onDeleteScreen: () => Promise<void>;
  onReorder: (screenIds: string[]) => Promise<void>;
  onCreateStack: (name: string) => Promise<void>;
  mutations: {
    createScreen: { isPending: boolean; error: { message: string } | null };
    renameScreen: { isPending: boolean; error: { message: string } | null };
    deleteScreen: { isPending: boolean };
    reorderScreens: { isPending: boolean };
    createStack: { isPending: boolean; error: { message: string } | null };
  };
}

export function GMScreenDialogs({
  dialog,
  screens,
  onDismiss,
  onCreateScreen,
  onRenameScreen,
  onDeleteScreen,
  onReorder,
  onCreateStack,
  mutations,
}: GMScreenDialogsProps) {
  return (
    <>
      {dialog.type === 'create-screen' && (
        <ScreenNameDialog
          title="New Screen"
          initialName=""
          onSubmit={onCreateScreen}
          onCancel={onDismiss}
          isLoading={mutations.createScreen.isPending}
          error={mutations.createScreen.error?.message ?? null}
        />
      )}

      {dialog.type === 'rename-screen' && (
        <ScreenNameDialog
          title="Rename Screen"
          initialName={dialog.currentName}
          onSubmit={onRenameScreen}
          onCancel={onDismiss}
          isLoading={mutations.renameScreen.isPending}
          error={mutations.renameScreen.error?.message ?? null}
        />
      )}

      {dialog.type === 'delete-screen' && (
        <ConfirmDialog
          title="Delete Screen"
          message={`Are you sure you want to delete "${dialog.screenName}"? This will remove all windows and stacks on this screen.`}
          confirmLabel="Delete"
          danger
          onConfirm={onDeleteScreen}
          onCancel={onDismiss}
          isLoading={mutations.deleteScreen.isPending}
        />
      )}

      {dialog.type === 'reorder' && (
        <ReorderDialog
          screens={screens}
          onSubmit={onReorder}
          onCancel={onDismiss}
          isLoading={mutations.reorderScreens.isPending}
        />
      )}

      {dialog.type === 'create-stack' && (
        <ScreenNameDialog
          title="New Stack"
          initialName=""
          onSubmit={onCreateStack}
          onCancel={onDismiss}
          isLoading={mutations.createStack.isPending}
          error={mutations.createStack.error?.message ?? null}
        />
      )}
    </>
  );
}
