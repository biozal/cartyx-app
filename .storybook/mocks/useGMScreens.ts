// Mock useGMScreens hooks for Storybook
import type { GMScreenData, GMScreenDetailData } from '../../app/server/functions/gmscreens'

const MOCK_SCREENS: GMScreenData[] = [
  { id: 'screen-1', campaignId: 'camp-1', name: 'Combat Tracker', tabOrder: 0, createdBy: 'user-1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'screen-2', campaignId: 'camp-1', name: 'NPC Notes', tabOrder: 1, createdBy: 'user-1', createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
  { id: 'screen-3', campaignId: 'camp-1', name: 'World Map', tabOrder: 2, createdBy: 'user-1', createdAt: '2026-01-03T00:00:00Z', updatedAt: '2026-01-03T00:00:00Z' },
]

const MOCK_DETAIL: GMScreenDetailData = {
  ...MOCK_SCREENS[0],
  windows: [
    { id: 'w-1', collection: 'note', documentId: 'doc-1', state: 'open', x: 80, y: 60, width: 400, height: 300, zIndex: 1 },
    { id: 'w-2', collection: 'note', documentId: 'doc-2', state: 'open', x: 320, y: 120, width: 350, height: 280, zIndex: 2 },
  ],
  stacks: [
    {
      id: 'st-1', name: 'Initiative Order', x: 620, y: 60,
      items: [
        { id: 'si-1', collection: 'note', documentId: 'doc-3', label: 'Aster Vane' },
        { id: 'si-2', collection: 'note', documentId: 'doc-4', label: 'Ser Caldus' },
        { id: 'si-3', collection: 'note', documentId: 'doc-5', label: 'Goblin Skirmisher' },
      ],
    },
  ],
  hydrated: {
    'note:doc-1': { id: 'doc-1', collection: 'note', title: 'Ruined Observatory' },
    'note:doc-2': { id: 'doc-2', collection: 'note', title: 'The Clocktower Mystery' },
    'note:doc-3': { id: 'doc-3', collection: 'note', title: 'Aster Vane' },
    'note:doc-4': { id: 'doc-4', collection: 'note', title: 'Ser Caldus' },
    'note:doc-5': { id: 'doc-5', collection: 'note', title: 'Goblin Skirmisher' },
  },
}

const noop = () => {}
const noopAsync = async () => ({})

const mockMutation = {
  mutate: noop,
  mutateAsync: noopAsync,
  isPending: false,
  error: null as Error | null,
}

export function useGMScreenList(_campaignId: string) {
  return { screens: MOCK_SCREENS, isLoading: false, error: null }
}

export function useGMScreenDetail(_campaignId: string, _screenId: string | null) {
  return { screen: MOCK_DETAIL, isLoading: false, error: null }
}

export function useGMScreenMutations(_campaignId: string) {
  return {
    createScreen: { ...mockMutation },
    renameScreen: { ...mockMutation },
    deleteScreen: { ...mockMutation },
    reorderScreens: { ...mockMutation },
    openWindow: { ...mockMutation },
    updateWindow: { ...mockMutation },
    closeWindow: { ...mockMutation },
    createStack: { ...mockMutation },
    renameStack: { ...mockMutation },
    moveStack: { ...mockMutation },
    deleteStack: { ...mockMutation },
    addStackItem: { ...mockMutation },
    removeStackItem: { ...mockMutation },
    invalidateList: noopAsync,
    invalidateDetail: noop,
  }
}

export type { GMScreenData, GMScreenDetailData }
